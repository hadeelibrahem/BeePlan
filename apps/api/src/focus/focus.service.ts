import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { and, desc, eq, gte, inArray, or, sql } from 'drizzle-orm';
import { TaskAccessService } from '../collaboration/task-access.service';
import { DatabaseService } from '../db/database.service';
import {
  focusSessions,
  subtaskDependencies,
  subtasks,
  taskActivities,
  taskMembers,
  tasks,
} from '../db/schema';
import { TasksService } from '../tasks/tasks.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FocusRoomsService } from '../focus-rooms/focus-rooms.service';
import { isSubtaskOwnedByUser } from '../tasks/subtask-ownership';
import {
  selectFocusSubtask,
  rankFocusSubtasks,
  type FocusSubtaskCandidate,
  type FocusSubtaskSelection,
} from './focus-subtask-select';
import type {
  CancelFocusSessionDto,
  ExtendFocusSessionDto,
  FinishFocusSessionDto,
  StartFocusSessionDto,
} from './dto/focus.dto';
import {
  computeExtendedEndTime,
  computeFocusStats,
  rankFocusTasks,
  type FocusCandidate,
  type FocusRecommendation,
  type FocusSessionForStats,
  type FocusStats,
} from './focus.logic';

const STATS_WINDOW_DAYS = 60;

type FocusSessionRow = typeof focusSessions.$inferSelect;
type FocusTaskRow = typeof tasks.$inferSelect;
type FocusSubtaskRow = typeof subtasks.$inferSelect;

type FocusReadGraph = {
  candidates: FocusCandidate[];
  subtaskCandidatesByTask: Map<string, FocusSubtaskCandidate[]>;
};

export type FocusSessionEntity = {
  id: string;
  taskId: string | null;
  taskTitle: string | null;
  subtaskId: string | null;
  subtaskTitle: string | null;
  startedAt: string;
  endedAt: string | null;
  // Authoritative scheduled end of the session. Clients derive the countdown
  // from this timestamp, so an extension is reflected the instant it returns.
  endsAt: string;
  plannedMinutes: number;
  actualMinutes: number | null;
  status: string;
  sessionType: string;
  notes: string | null;
  createdAt: string;
};

export type FocusQueueItem = {
  taskId: string;
  taskTitle: string;
  subtaskId: string | null;
  subtaskTitle: string | null;
  priority: string;
  dueDate: string | null;
  estimatedMinutes: number | null;
  status: string;
  hasOpenDependencies: boolean;
};

@Injectable()
export class FocusService {
  private readonly readGraphCache = new Map<
    string,
    { promise: Promise<FocusReadGraph>; expiresAt: number }
  >();

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly tasksService: TasksService,
    private readonly taskAccess: TaskAccessService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly focusRooms?: FocusRoomsService,
  ) {}

  private get db() {
    return this.databaseService.db;
  }

  async start(
    userId: string,
    dto: StartFocusSessionDto,
  ): Promise<FocusSessionEntity> {
    // A subtask session must name the parent task it belongs to.
    if (dto.subtaskId && !dto.taskId) {
      throw new BadRequestException(
        'A subtask focus session requires its parent task.',
      );
    }

    let taskTitle: string | null = null;
    let subtaskTitle: string | null = null;
    if (dto.taskId) {
      // Authorization goes through the canonical task-access policy, not an
      // owner-only lookup, so a non-owner member can focus subtasks assigned to
      // them. `require('editor')` mirrors the subtask write-permission model
      // (updateSubtask also requires editor, so anyone allowed to START a
      // subtask session is also allowed to complete it): missing access → 404,
      // viewers → 403. Owners resolve to the 'owner' role and are unaffected.
      const access = await this.taskAccess.require(
        userId,
        dto.taskId,
        'editor',
      );
      taskTitle = access.task.title;
      if (dto.subtaskId) {
        const subtask = await this.getSubtaskForTask(dto.taskId, dto.subtaskId);
        // Collaboration authorization (server-side, not just picker hiding): on a
        // shared task a member may only focus on subtasks assigned to them. This
        // rejects a stale client or a direct API call that names another
        // member's subtask or an unassigned team-backlog subtask. Never trusts a
        // name/email — only the real assignee user id (isSubtaskOwnedByUser).
        if (!isSubtaskOwnedByUser(subtask, userId, access.isShared)) {
          throw new ForbiddenException(
            'You can only focus on subtasks assigned to you.',
          );
        }
        subtaskTitle = subtask.title;
      } else if (access.isShared && access.role !== 'owner') {
        // Task-level focus on a shared task is a parent-level action reserved for
        // the owner. A member focuses their assigned subtasks, never the whole
        // shared task — membership alone must not make the full task eligible.
        throw new ForbiddenException(
          'Choose one of your assigned subtasks to focus on this shared task.',
        );
      }
    }

    const startedAt = new Date();
    const [row] = await this.db
      .insert(focusSessions)
      .values({
        userId,
        taskId: dto.taskId ?? null,
        subtaskId: dto.subtaskId ?? null,
        plannedMinutes: dto.plannedMinutes,
        sessionType: dto.sessionType ?? 'pomodoro',
        status: 'active',
        startedAt,
        // Authoritative deadline the clients count down to.
        endsAt: new Date(startedAt.getTime() + dto.plannedMinutes * 60_000),
      })
      .returning();

    return this.toEntity(row, taskTitle, subtaskTitle);
  }

  async finish(
    userId: string,
    sessionId: string,
    dto: FinishFocusSessionDto,
  ): Promise<{ session: FocusSessionEntity; taskUpdated: boolean }> {
    const session = await this.getSessionForUser(userId, sessionId);
    const commitmentEndedEarly = Boolean(session.commitmentSessionId);
    const endedAt = new Date();
    const actualMinutes = this.resolveActualMinutes(
      dto.actualMinutes,
      session.startedAt,
      endedAt,
      session.plannedMinutes,
    );

    const [updated] = await this.db
      .update(focusSessions)
      .set({
        endedAt,
        actualMinutes,
        status: 'completed',
        notes: dto.notes ?? session.notes,
      })
      .where(eq(focusSessions.id, sessionId))
      .returning();

    if (session.commitmentSessionId) {
      await this.focusRooms?.terminateFromFocus(
        userId,
        session.commitmentSessionId,
        'participant_left_early',
      );
    }

    let taskUpdated = false;
    let taskTitle: string | null = null;
    let subtaskTitle: string | null = null;

    if (session.subtaskId && session.taskId) {
      // Subtask-scoped: Focus Sessions are the source of truth for actual time.
      // Reconcile the subtask's actual-time cache from its completed sessions
      // (this one is already marked completed above) and never touch the
      // planning estimate. On "done", complete only the subtask via the normal
      // task flow so progress rolls up to the parent automatically.
      const subtask = await this.findSubtask(session.taskId, session.subtaskId);
      if (subtask) {
        subtaskTitle = subtask.title;
        await this.recomputeSubtaskActualMinutes(session.subtaskId);
        if (dto.taskOutcome === 'done' && !commitmentEndedEarly) {
          await this.tasksService.updateSubtask(
            userId,
            session.taskId,
            session.subtaskId,
            { status: 'done', isDone: true },
          );
        }
        taskUpdated = true;
      }
      // Display title only — the session (subtask-scoped) may live on a shared
      // task the current user does not own, so resolve the title by id.
      taskTitle = await this.findTaskTitleById(session.taskId);
    } else if (session.taskId) {
      const task = await this.findTask(userId, session.taskId);
      if (task) {
        taskTitle = task.title;
        if (dto.taskOutcome === 'done' && !commitmentEndedEarly) {
          await this.markTaskDone(userId, task.id);
        }
        taskUpdated = true;
      }
    }

    // Consistency: the parent task's total spent time is re-derived (manual
    // entry + completed Focus Sessions, task-level and subtask-scoped alike).
    // TasksService owns the derivation so focus time never discards manual time.
    if (session.taskId) {
      await this.tasksService.recomputeTaskSpentTime(session.taskId);
    }

    await this.notifications?.createOnce(
      {
        userId,
        type: 'focus_session_completed',
        taskId: updated.taskId,
        title: 'Focus session completed',
        body: 'You completed a focus session.',
        data: {
          entityType: 'focus_session',
          entityId: updated.id,
          route: '/focus',
          event: 'completed',
        },
      },
      {
        entityType: 'focus_session_completed',
        entityId: updated.id,
        triggerAt: updated.endedAt ?? new Date(),
        key: `focus_completed:${userId}:${updated.id}`,
      },
    );
    return {
      session: this.toEntity(updated, taskTitle, subtaskTitle),
      taskUpdated,
    };
  }

  async cancel(
    userId: string,
    sessionId: string,
    dto: CancelFocusSessionDto,
  ): Promise<FocusSessionEntity> {
    const session = await this.getSessionForUser(userId, sessionId);
    const endedAt = new Date();
    const actualMinutes = this.resolveActualMinutes(
      dto.actualMinutes,
      session.startedAt,
      endedAt,
      session.plannedMinutes,
    );

    const [updated] = await this.db
      .update(focusSessions)
      .set({
        endedAt,
        actualMinutes,
        status: 'cancelled',
        notes: dto.notes ?? session.notes,
      })
      .where(eq(focusSessions.id, sessionId))
      .returning();

    if (session.commitmentSessionId) {
      await this.focusRooms?.terminateFromFocus(
        userId,
        session.commitmentSessionId,
        'participant_cancelled_focus',
      );
    }

    const taskTitle = session.taskId
      ? await this.findTaskTitleById(session.taskId)
      : null;
    const subtaskTitle =
      session.subtaskId && session.taskId
        ? ((await this.findSubtask(session.taskId, session.subtaskId))?.title ??
          null)
        : null;

    // A cancelled session is not "completed", so it never contributes to the
    // sums. Recompute anyway to reconcile the derived caches (the just-cancelled
    // session drops out) and keep task/subtask totals authoritative.
    if (session.subtaskId) {
      await this.recomputeSubtaskActualMinutes(session.subtaskId);
    }
    if (session.taskId) {
      await this.tasksService.recomputeTaskSpentTime(session.taskId);
    }

    await this.notifications?.createOnce(
      {
        userId,
        type: 'focus_session_cancelled',
        taskId: updated.taskId,
        title: 'Focus session interrupted',
        body: 'Your focus session was interrupted.',
        data: {
          entityType: 'focus_session',
          entityId: updated.id,
          route: '/focus',
          event: 'cancelled',
        },
      },
      {
        entityType: 'focus_session_cancelled',
        entityId: updated.id,
        triggerAt: updated.endedAt ?? new Date(),
        key: `focus_cancelled:${userId}:${updated.id}`,
      },
    );
    return this.toEntity(updated, taskTitle, subtaskTitle);
  }

  /**
   * "Add More Time": extend an active session by a dynamic number of minutes.
   * The new end time is computed from the LATEST of the current end time and now
   * (so repeated extensions always build on the current deadline and a session
   * whose clock elapsed still gets the full addition). Persists the authoritative
   * `endsAt` and keeps `plannedMinutes` in sync, then returns the updated session
   * so the client can adopt the server's end time verbatim.
   */
  async extend(
    userId: string,
    sessionId: string,
    dto: ExtendFocusSessionDto,
  ): Promise<FocusSessionEntity> {
    const session = await this.getSessionForUser(userId, sessionId);
    const currentEnd = this.resolveEndsAt(session);
    const newEndsAt = computeExtendedEndTime(
      currentEnd,
      dto.additionalMinutes,
      new Date(),
    );
    // Keep plannedMinutes consistent with the new deadline (used for the stats
    // clamp and the progress ring); never below 1 minute.
    const newPlannedMinutes = Math.max(
      1,
      Math.round((newEndsAt.getTime() - session.startedAt.getTime()) / 60_000),
    );

    const [updated] = await this.db
      .update(focusSessions)
      .set({ endsAt: newEndsAt, plannedMinutes: newPlannedMinutes })
      .where(eq(focusSessions.id, sessionId))
      .returning();

    const taskTitle = session.taskId
      ? await this.findTaskTitleById(session.taskId)
      : null;
    const subtaskTitle =
      session.subtaskId && session.taskId
        ? ((await this.findSubtask(session.taskId, session.subtaskId))?.title ??
          null)
        : null;

    return this.toEntity(updated, taskTitle, subtaskTitle);
  }

  async today(userId: string): Promise<FocusSessionEntity[]> {
    const startOfToday = startOfUtcDay(new Date());
    const rows = await this.db
      .select()
      .from(focusSessions)
      .where(
        and(
          eq(focusSessions.userId, userId),
          gte(focusSessions.startedAt, startOfToday),
        ),
      )
      .orderBy(desc(focusSessions.startedAt));

    const titles = await this.taskTitles(rows);
    const subtaskTitleMap = await this.subtaskTitles(rows);
    return rows.map((row) =>
      this.toEntity(
        row,
        row.taskId ? (titles.get(row.taskId) ?? null) : null,
        row.subtaskId ? (subtaskTitleMap.get(row.subtaskId) ?? null) : null,
      ),
    );
  }

  async stats(userId: string): Promise<FocusStats> {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - STATS_WINDOW_DAYS);

    const rows = await this.db
      .select()
      .from(focusSessions)
      .where(
        and(
          eq(focusSessions.userId, userId),
          gte(focusSessions.startedAt, cutoff),
        ),
      );

    const titles = await this.taskTitles(rows);
    const sessionsForStats: FocusSessionForStats[] = rows.map((row) => ({
      taskId: row.taskId,
      startedAt: row.startedAt,
      plannedMinutes: row.plannedMinutes,
      actualMinutes: row.actualMinutes,
      status: row.status,
    }));

    return computeFocusStats(sessionsForStats, titles, new Date());
  }

  async recommendation(userId: string): Promise<FocusRecommendation | null> {
    const now = new Date();
    const graph = await this.getReadGraph(userId);
    const candidates = graph.candidates;
    const ranked = rankFocusTasks(candidates, now);
    const byId = new Map(
      candidates.map((candidate) => [candidate.id, candidate]),
    );

    // Prefer the highest-ranked parent containing an executable (owned) focus
    // subtask.
    let recommendation: FocusRecommendation | null = null;
    for (const candidate of ranked) {
      const subtask = selectFocusSubtask(
        graph.subtaskCandidatesByTask.get(candidate.taskId) ?? [],
        now,
      );
      if (!subtask) continue;
      recommendation = {
        ...candidate,
        subtaskId: subtask.subtaskId,
        subtaskTitle: subtask.subtaskTitle,
        estimatedMinutes: subtask.estimatedMinutes,
        reason: subtask.reason,
        recommendationReason: subtask.reason,
      };
      break;
    }

    // Task-level fallback only when no executable subtask exists anywhere, and
    // only for a parent that may itself be focused (a personal task, or an owned
    // shared task with no incomplete subtasks). A shared parent that still has
    // incomplete subtasks is never used as a fallback.
    if (!recommendation) {
      const base = ranked.find(
        (candidate) =>
          byId.get(candidate.taskId)?.parentFocusEligible !== false,
      );
      if (!base) return null;
      recommendation = base;
    }

    // AI copy polishing is deliberately outside this request path. The
    // deterministic reason is complete, stable, and available immediately.
    return recommendation;
  }

  /** Canonical resumable session: active/paused only, newest start wins if data is corrupt. */
  async active(userId: string): Promise<FocusSessionEntity | null> {
    const [row] = await this.db
      .select()
      .from(focusSessions)
      .where(
        and(
          eq(focusSessions.userId, userId),
          sql`${focusSessions.status} in ('active', 'paused')`,
        ),
      )
      .orderBy(desc(focusSessions.startedAt), desc(focusSessions.createdAt))
      .limit(1);
    if (!row) return null;
    const taskTitle = row.taskId
      ? await this.findTaskTitleById(row.taskId)
      : null;
    const subtaskTitle =
      row.subtaskId && row.taskId
        ? ((await this.findSubtask(row.taskId, row.subtaskId))?.title ?? null)
        : null;
    return this.toEntity(row, taskTitle, subtaskTitle);
  }

  async queue(userId: string): Promise<FocusQueueItem[]> {
    const now = new Date();
    const graph = await this.getReadGraph(userId);
    const candidates = graph.candidates;
    const byId = new Map(
      candidates.map((candidate) => [candidate.id, candidate]),
    );
    const subtasks: FocusQueueItem[] = [];
    const fallbacks: FocusQueueItem[] = [];

    for (const task of rankFocusTasks(candidates, now)) {
      const parent = byId.get(task.taskId)!;
      const rankedSubtasks = rankFocusSubtasks(
        graph.subtaskCandidatesByTask.get(task.taskId) ?? [],
        now,
      );

      if (rankedSubtasks.length) {
        subtasks.push(
          ...rankedSubtasks.map((subtask) => ({
            taskId: task.taskId,
            taskTitle: task.taskTitle,
            subtaskId: subtask.id,
            subtaskTitle: subtask.title,
            priority: subtask.priority,
            dueDate: subtask.dueDate?.toISOString() ?? null,
            estimatedMinutes: subtask.estimatedDurationMinutes,
            status: subtask.status,
            hasOpenDependencies: subtask.hasOpenDependencies,
          })),
        );
      } else if (parent.isFocusTask && parent.parentFocusEligible !== false) {
        // A manual task-level Focus choice remains available only when this
        // parent contributes no executable Focus subtask AND the parent may
        // itself be focused — never for a shared task that still has incomplete
        // subtasks (its parent is not a valid task-level target).
        fallbacks.push({
          taskId: task.taskId,
          taskTitle: task.taskTitle,
          subtaskId: null,
          subtaskTitle: null,
          priority: parent.priority,
          dueDate: parent.dueDate?.toISOString() ?? null,
          estimatedMinutes: parent.estimatedMinutes || null,
          status: parent.status,
          hasOpenDependencies: false,
        });
      }
    }

    // Subtask entries come first, so the queue head matches recommendation.
    return [...subtasks, ...fallbacks];
  }

  /**
   * Loads the chosen task's subtasks, computes each one's dependency readiness
   * from the intra-task dependency edges, and delegates to the pure selector.
   * Returns null when the task has no subtasks or none are focus-eligible.
   */
  private async selectSubtaskForTask(
    taskId: string,
    userId: string,
    now: Date,
  ): Promise<FocusSubtaskSelection | null> {
    return selectFocusSubtask(
      await this.loadFocusSubtaskCandidates(taskId, userId),
      now,
    );
  }

  private async loadFocusSubtaskCandidates(
    taskId: string,
    userId: string,
  ): Promise<FocusSubtaskCandidate[]> {
    const subtaskRows = await this.db
      .select()
      .from(subtasks)
      .where(eq(subtasks.taskId, taskId));
    if (subtaskRows.length === 0) return [];

    const ids = subtaskRows.map((row) => row.id);
    const depLinks = await this.db
      .select()
      .from(subtaskDependencies)
      .where(inArray(subtaskDependencies.subtaskId, ids));

    // A dependency is satisfied when the depended-on subtask is done. Readiness
    // is computed from ALL of the task's subtasks (below, before the ownership
    // filter) so a current-user subtask that depends on another member's
    // unfinished subtask stays blocked — the foreign dependency keeps it
    // ineligible without ever surfacing that foreign subtask as a candidate.
    const isDoneById = new Map(
      subtaskRows.map((row) => [row.id, row.status === 'done' || row.isDone]),
    );
    const hasOpenDeps = new Set<string>();
    for (const link of depLinks) {
      if (!(isDoneById.get(link.dependsOnSubtaskId) ?? false)) {
        hasOpenDeps.add(link.subtaskId);
      }
    }

    // Collaboration ownership: on a shared task only the current user's assigned
    // subtasks are their own focusable work. Foreign and unassigned subtasks are
    // dropped here — before eligibility and ranking — so they can never be
    // selected, recommended, or influence the pick. Personal-task subtasks are
    // all the owner's (isSubtaskOwnedByUser short-circuits on non-shared).
    const shared = await this.isSharedTask(taskId);

    return subtaskRows
      .filter((row) => isSubtaskOwnedByUser(row, userId, shared))
      .map((row) => ({
        id: row.id,
        title: row.title,
        isDone: row.isDone,
        isFocusTask: row.isFocusTask,
        status: row.status,
        priority: row.priority,
        dueDate: row.dueDate ?? null,
        estimatedDurationMinutes: row.estimatedDurationMinutes ?? null,
        orderIndex: row.orderIndex,
        hasOpenDependencies: hasOpenDeps.has(row.id),
      }));
  }

  /**
   * Loads the complete Focus read model in two database rounds:
   * accessible tasks first, then memberships, subtasks, and dependencies in
   * parallel. Recommendation and queue ranking are entirely in-memory after
   * this point, so their cost does not grow by three queries per candidate.
   */
  private async loadReadGraph(userId: string): Promise<FocusReadGraph> {
    const taskRows = await this.db
      .select()
      .from(tasks)
      .where(
        or(
          eq(tasks.userId, userId),
          sql<boolean>`exists (
              select 1
              from ${taskMembers} accepted_member
              where accepted_member.task_id = ${tasks.id}
                and accepted_member.user_id = ${userId}
                and accepted_member.status = 'accepted'
            )`,
        ),
      )
      .orderBy(desc(tasks.updatedAt))
      .limit(200);

    if (taskRows.length === 0) {
      return {
        candidates: [],
        subtaskCandidatesByTask: new Map(),
      };
    }

    const taskIds = taskRows.map((task) => task.id);
    const [sharedRows, subtaskRows, dependencyRows] = await Promise.all([
      this.db
        .select({ taskId: taskMembers.taskId })
        .from(taskMembers)
        .where(inArray(taskMembers.taskId, taskIds)),
      this.db.select().from(subtasks).where(inArray(subtasks.taskId, taskIds)),
      this.db
        .select({
          subtaskId: subtaskDependencies.subtaskId,
          dependsOnSubtaskId: subtaskDependencies.dependsOnSubtaskId,
        })
        .from(subtaskDependencies)
        .where(
          sql<boolean>`exists (
              select 1
              from ${subtasks} dependency_source
              where dependency_source.id = ${subtaskDependencies.subtaskId}
                and dependency_source.task_id in (${sql.join(
                  taskIds.map((taskId) => sql`${taskId}`),
                  sql`, `,
                )})
            )`,
        ),
    ]);

    return this.buildReadGraph(
      userId,
      taskRows,
      subtaskRows,
      sharedRows.map((row) => row.taskId),
      dependencyRows,
    );
  }

  private getReadGraph(userId: string): Promise<FocusReadGraph> {
    const cached = this.readGraphCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.promise;

    const promise = this.loadReadGraph(userId).catch((error) => {
      if (this.readGraphCache.get(userId)?.promise === promise) {
        this.readGraphCache.delete(userId);
      }
      throw error;
    });
    this.readGraphCache.set(userId, {
      promise,
      expiresAt: Date.now() + 1_000,
    });

    const expiryTimer = setTimeout(() => {
      if (this.readGraphCache.get(userId)?.promise === promise) {
        this.readGraphCache.delete(userId);
      }
    }, 1_000);
    expiryTimer.unref();

    return promise;
  }

  private buildReadGraph(
    userId: string,
    taskRows: FocusTaskRow[],
    subtaskRows: FocusSubtaskRow[],
    sharedTaskIdRows: string[],
    dependencyRows: Array<{
      subtaskId: string;
      dependsOnSubtaskId: string;
    }>,
  ): FocusReadGraph {
    const sharedTaskIds = new Set(sharedTaskIdRows);
    const isDoneById = new Map(
      subtaskRows.map((row) => [row.id, row.status === 'done' || row.isDone]),
    );
    const hasOpenDependencies = new Set<string>();
    for (const dependency of dependencyRows) {
      if (!(isDoneById.get(dependency.dependsOnSubtaskId) ?? false)) {
        hasOpenDependencies.add(dependency.subtaskId);
      }
    }

    const allByTask = new Map<string, FocusSubtaskRow[]>();
    for (const subtask of subtaskRows) {
      const existing = allByTask.get(subtask.taskId);
      if (existing) existing.push(subtask);
      else allByTask.set(subtask.taskId, [subtask]);
    }

    const candidates: FocusCandidate[] = [];
    const subtaskCandidatesByTask = new Map<string, FocusSubtaskCandidate[]>();

    for (const task of taskRows) {
      if (task.status === 'done' || task.status === 'missed') continue;

      const taskSubtasks = allByTask.get(task.id) ?? [];
      const shared = sharedTaskIds.has(task.id);
      const incomplete = taskSubtasks.filter(
        (subtask) =>
          !subtask.isDone &&
          subtask.status !== 'done' &&
          subtask.status !== 'missed',
      );
      const ownedIncomplete = incomplete.filter((subtask) =>
        isSubtaskOwnedByUser(subtask, userId, shared),
      );

      if (shared) {
        if (incomplete.length > 0 && ownedIncomplete.length === 0) continue;
        if (incomplete.length === 0 && task.userId !== userId) continue;
      }

      candidates.push({
        id: task.id,
        title: task.title,
        priority: task.priority,
        status: task.status,
        dueDate: task.dueDate ?? null,
        estimatedMinutes: task.estimatedTimeMinutes,
        progress: task.progress,
        isFocusTask: task.isFocusTask,
        totalSubtasks: incomplete.length,
        incompleteSubtasks: ownedIncomplete.length,
        parentFocusEligible: !shared || incomplete.length === 0,
      });

      subtaskCandidatesByTask.set(
        task.id,
        taskSubtasks
          .filter((subtask) => isSubtaskOwnedByUser(subtask, userId, shared))
          .map((subtask) => ({
            id: subtask.id,
            title: subtask.title,
            isDone: subtask.isDone,
            isFocusTask: subtask.isFocusTask,
            status: subtask.status,
            priority: subtask.priority,
            dueDate: subtask.dueDate ?? null,
            estimatedDurationMinutes: subtask.estimatedDurationMinutes ?? null,
            orderIndex: subtask.orderIndex,
            hasOpenDependencies: hasOpenDependencies.has(subtask.id),
          })),
      );
    }

    return { candidates, subtaskCandidatesByTask };
  }

  // --- helpers -------------------------------------------------------------

  /**
   * The session's authoritative end time. Falls back to started_at + planned
   * minutes for legacy rows created before the ends_at column was backfilled.
   */
  private resolveEndsAt(session: FocusSessionRow): Date {
    return (
      session.endsAt ??
      new Date(session.startedAt.getTime() + session.plannedMinutes * 60_000)
    );
  }

  private resolveActualMinutes(
    provided: number | undefined,
    startedAt: Date,
    endedAt: Date,
    plannedMinutes: number,
  ): number {
    if (typeof provided === 'number' && Number.isFinite(provided)) {
      return clamp(Math.round(provided), 0, 1440);
    }
    const elapsedMinutes = Math.round(
      (endedAt.getTime() - startedAt.getTime()) / 60_000,
    );
    // Never record more than the planned duration when we have to infer it.
    return clamp(elapsedMinutes, 0, Math.max(plannedMinutes, 1));
  }

  private async markTaskDone(userId: string, taskId: string): Promise<void> {
    await this.db
      .update(tasks)
      .set({
        status: 'done',
        progress: 100,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));
    await this.db.insert(taskActivities).values({
      userId,
      taskId,
      action: 'status_changed',
      description: 'Marked done from a focus session',
      metadata: { status: 'done', source: 'focus' },
    });
  }

  private async loadCandidates(userId: string): Promise<FocusCandidate[]> {
    // The Focus task universe is every task the user can ACCESS, not just the
    // ones they own: personal/owned tasks PLUS shared tasks they are an accepted
    // member of. A single OR query dedupes naturally, so an owner who also holds
    // a membership row is never returned twice.
    const memberTaskIds = await this.loadMemberTaskIds(userId);
    const accessCondition =
      memberTaskIds.length > 0
        ? or(eq(tasks.userId, userId), inArray(tasks.id, memberTaskIds))
        : eq(tasks.userId, userId);
    const taskRows = await this.db
      .select()
      .from(tasks)
      .where(accessCondition)
      .orderBy(desc(tasks.updatedAt))
      .limit(200);

    const actionable = taskRows.filter(
      (task) => task.status !== 'done' && task.status !== 'missed',
    );
    if (actionable.length === 0) return [];

    const ids = actionable.map((task) => task.id);
    const sharedTaskIds = await this.loadSharedTaskIds(ids);
    const subtaskRows = await this.db
      .select({
        taskId: subtasks.taskId,
        isDone: subtasks.isDone,
        status: subtasks.status,
        assigneeUserId: subtasks.assigneeUserId,
      })
      .from(subtasks)
      .where(inArray(subtasks.taskId, ids));

    // Per-task incomplete-subtask accounting, split two ways:
    //   anyIncompleteByTask   — does the task carry ANY incomplete subtask work?
    //   ownedIncompleteByTask — how much of it is THIS user's own work?
    // On a shared task, foreign/unassigned subtasks count toward "any" but never
    // toward "owned", so they can neither be focused nor inflate ranking.
    const anyIncompleteByTask = new Map<string, number>();
    const ownedIncompleteByTask = new Map<string, number>();
    for (const row of subtaskRows) {
      const incomplete =
        !row.isDone && row.status !== 'done' && row.status !== 'missed';
      if (!incomplete) continue;
      anyIncompleteByTask.set(
        row.taskId,
        (anyIncompleteByTask.get(row.taskId) ?? 0) + 1,
      );
      if (isSubtaskOwnedByUser(row, userId, sharedTaskIds.has(row.taskId))) {
        ownedIncompleteByTask.set(
          row.taskId,
          (ownedIncompleteByTask.get(row.taskId) ?? 0) + 1,
        );
      }
    }

    const candidates: FocusCandidate[] = [];
    for (const task of actionable) {
      const anyIncomplete = anyIncompleteByTask.get(task.id) ?? 0;
      const ownedIncomplete = ownedIncompleteByTask.get(task.id) ?? 0;
      const shared = sharedTaskIds.has(task.id);
      const isOwner = task.userId === userId;

      if (shared) {
        if (anyIncomplete > 0) {
          // Shared task with subtask-level work: only the user's own assigned
          // subtasks are eligible. If they own none, the task contributes
          // nothing (the shared parent is never a fallback) — this covers both a
          // non-owner member with no assignment and an owner whose subtasks all
          // belong to others.
          if (ownedIncomplete === 0) continue;
        } else if (!isOwner) {
          // A shared task with no incomplete subtasks gives a non-owner member
          // nothing to do: membership alone must not make the full task a
          // task-level candidate. The owner may still focus their own parent.
          continue;
        }
      }

      // The parent is a valid task-level Focus target (the "focus the whole
      // task" fallback) only for a personal task, or an owned shared task with
      // no incomplete subtasks. A shared task that still has incomplete subtasks
      // is represented by its subtasks and its parent is never a fallback.
      const parentFocusEligible = !shared || anyIncomplete === 0;

      candidates.push({
        id: task.id,
        title: task.title,
        priority: task.priority,
        status: task.status,
        dueDate: task.dueDate ?? null,
        estimatedMinutes: task.estimatedTimeMinutes,
        progress: task.progress,
        isFocusTask: task.isFocusTask,
        totalSubtasks: anyIncomplete,
        // Ranking counts only the user's own unfinished steps, so another
        // member's subtasks cannot influence the recommendation order.
        incompleteSubtasks: ownedIncomplete,
        parentFocusEligible,
      });
    }
    return candidates;
  }

  /** Task ids the user is an accepted member of (excludes tasks they own). */
  private async loadMemberTaskIds(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ taskId: taskMembers.taskId })
      .from(taskMembers)
      .where(
        and(eq(taskMembers.userId, userId), eq(taskMembers.status, 'accepted')),
      );
    return [...new Set(rows.map((row) => row.taskId))];
  }

  /** Task ids (from the given set) that are shared — have any task_members row. */
  private async loadSharedTaskIds(taskIds: string[]): Promise<Set<string>> {
    if (taskIds.length === 0) return new Set();
    const rows = await this.db
      .select({ taskId: taskMembers.taskId })
      .from(taskMembers)
      .where(inArray(taskMembers.taskId, taskIds));
    return new Set(rows.map((row) => row.taskId));
  }

  /** Whether a single task is shared (collaborative). */
  private async isSharedTask(taskId: string): Promise<boolean> {
    const rows = await this.db
      .select({ taskId: taskMembers.taskId })
      .from(taskMembers)
      .where(eq(taskMembers.taskId, taskId))
      .limit(1);
    return rows.length > 0;
  }

  // Titles for the tasks referenced by the user's own session rows. Not
  // owner-scoped: a member's sessions can reference shared tasks they don't own,
  // and the session rows already prove the user focused them.
  private async taskTitles(
    rows: FocusSessionRow[],
  ): Promise<Map<string, string>> {
    const ids = [
      ...new Set(
        rows.map((row) => row.taskId).filter((id): id is string => Boolean(id)),
      ),
    ];
    if (ids.length === 0) return new Map();

    const taskRows = await this.db
      .select({ id: tasks.id, title: tasks.title })
      .from(tasks)
      .where(inArray(tasks.id, ids));

    return new Map(taskRows.map((task) => [task.id, task.title]));
  }

  private async getSessionForUser(
    userId: string,
    sessionId: string,
  ): Promise<FocusSessionRow> {
    const [row] = await this.db
      .select()
      .from(focusSessions)
      .where(
        and(eq(focusSessions.id, sessionId), eq(focusSessions.userId, userId)),
      )
      .limit(1);

    if (!row) throw new NotFoundException('Focus session not found.');
    if (row.status === 'completed' || row.status === 'cancelled') {
      throw new BadRequestException('This focus session has already ended.');
    }
    return row;
  }

  private async findTask(userId: string, taskId: string) {
    const [task] = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
      .limit(1);
    return task ?? null;
  }

  /**
   * Title lookup for a task the current user has already been authorized to
   * focus (via a session row that belongs to them). Not owner-scoped, so a
   * non-owner member's own shared-task sessions still render their task title.
   */
  private async findTaskTitleById(taskId: string): Promise<string | null> {
    const [task] = await this.db
      .select({ title: tasks.title })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);
    return task?.title ?? null;
  }

  /**
   * Validates that a subtask belongs to the given task. Ownership of the task
   * itself is verified separately by the caller (getTaskForUser), so a subtask
   * matching a user-owned task is transitively owned by the user. Throws when
   * the pairing is invalid (wrong task or missing subtask).
   */
  private async getSubtaskForTask(taskId: string, subtaskId: string) {
    const subtask = await this.findSubtask(taskId, subtaskId);
    if (!subtask) {
      throw new BadRequestException(
        'Subtask does not belong to the specified task.',
      );
    }
    return subtask;
  }

  private async findSubtask(taskId: string, subtaskId: string) {
    const [row] = await this.db
      .select()
      .from(subtasks)
      .where(and(eq(subtasks.id, subtaskId), eq(subtasks.taskId, taskId)))
      .limit(1);
    return row ?? null;
  }

  /**
   * Reconciles a subtask's actual-time cache from its completed Focus Sessions.
   * Focus Sessions are the source of truth; `actualDurationMinutes` is a derived
   * aggregate. Never touches `estimatedDurationMinutes` (the planning estimate).
   */
  private async recomputeSubtaskActualMinutes(
    subtaskId: string,
  ): Promise<void> {
    const rows = await this.db
      .select({
        actualMinutes: focusSessions.actualMinutes,
        status: focusSessions.status,
      })
      .from(focusSessions)
      .where(
        and(
          eq(focusSessions.subtaskId, subtaskId),
          eq(focusSessions.status, 'completed'),
        ),
      );

    const total = rows
      .filter((row) => row.status === 'completed')
      .reduce((sum, row) => sum + Math.max(0, row.actualMinutes ?? 0), 0);

    await this.db
      .update(subtasks)
      .set({ actualDurationMinutes: total, updatedAt: new Date() })
      .where(eq(subtasks.id, subtaskId));
  }

  private async subtaskTitles(
    rows: FocusSessionRow[],
  ): Promise<Map<string, string>> {
    const ids = [
      ...new Set(
        rows
          .map((row) => row.subtaskId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (ids.length === 0) return new Map();

    const subtaskRows = await this.db
      .select({ id: subtasks.id, title: subtasks.title })
      .from(subtasks)
      .where(inArray(subtasks.id, ids));

    return new Map(subtaskRows.map((row) => [row.id, row.title]));
  }

  private toEntity(
    row: FocusSessionRow,
    taskTitle: string | null,
    subtaskTitle: string | null = null,
  ): FocusSessionEntity {
    return {
      id: row.id,
      taskId: row.taskId,
      taskTitle,
      subtaskId: row.subtaskId,
      subtaskTitle,
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt ? row.endedAt.toISOString() : null,
      endsAt: this.resolveEndsAt(row).toISOString(),
      plannedMinutes: row.plannedMinutes,
      actualMinutes: row.actualMinutes,
      status: row.status,
      sessionType: row.sessionType,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}
