import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { TaskAccessService } from '../../collaboration/task-access.service';
import { TaskActivityService } from '../../collaboration/task-activity.service';
import { DatabaseService } from '../../db/database.service';
import { aiRecommendations, subtasks, taskActivities, tasks, users } from '../../db/schema';
import {
  NotificationsService,
  type CreateNotificationInput,
} from '../../notifications/notifications.service';
import { WorkloadCapacityService } from './workload-capacity.service';

export const RECOMMENDATION_KINDS = [
  'ahead_of_pace',
  'inactive_member',
  'deadline_risk',
  'workload_imbalance',
] as const;
export type RecommendationKind = (typeof RECOMMENDATION_KINDS)[number];
export type RecommendationStatus = 'pending' | 'approved' | 'dismissed' | 'auto_resolved';

export type AiRecommendationEntity = {
  id: string;
  kind: RecommendationKind;
  status: RecommendationStatus;
  targetUserId: string | null;
  title: string;
  message: string;
  reason: string;
  createdAt: string;
  resolvedAt: string | null;
};

type Candidate = {
  kind: RecommendationKind;
  targetUserId: string | null;
  title: string;
  message: string;
  reason: string;
  payload: Record<string, unknown>;
  dedupeKey: string;
};

type SubtaskRow = typeof subtasks.$inferSelect;

const OPEN_STATUSES = ['todo', 'in_progress'] as const;
const DEFAULT_ESTIMATE_MINUTES = 30;
const INACTIVE_THRESHOLD_DAYS = 3;
const IMBALANCE_RATIO_THRESHOLD = 1.5;
const IMBALANCE_MIN_GAP_MINUTES = 60;
const AHEAD_OF_PACE_WINDOW_DAYS = 7;

/**
 * The standing AI project manager. Detection is stateless/re-derived on every
 * `list()` call (no cron, no background job — see WorkloadCapacityService and
 * AiCollaborationViewsService for the same request-driven pattern); the only
 * persisted state is which situations the owner has already approved or
 * dismissed, via the `ai_recommendations` table. Recommendations never change
 * anything by themselves — `approve()` is the only path that writes to
 * `subtasks`, and it is always an explicit owner/editor action.
 */
@Injectable()
export class AiRecommendationsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly access: TaskAccessService,
    private readonly activity: TaskActivityService,
    private readonly notifications: NotificationsService,
    private readonly capacity: WorkloadCapacityService,
  ) {}

  private get db() {
    return this.databaseService.db;
  }

  async list(taskId: string): Promise<AiRecommendationEntity[]> {
    await this.reconcile(taskId);
    const rows = await this.db
      .select()
      .from(aiRecommendations)
      .where(eq(aiRecommendations.taskId, taskId))
      .orderBy(desc(aiRecommendations.createdAt));
    return rows.map(toEntity);
  }

  async approve(userId: string, taskId: string, recommendationId: string) {
    await this.access.require(userId, taskId, 'editor');
    const rec = await this.getPending(taskId, recommendationId);
    const payload = rec.payload as Record<string, unknown>;

    switch (rec.kind as RecommendationKind) {
      case 'ahead_of_pace': {
        await this.shiftSubtaskDates(payload.subtaskId as string, payload.newStartDate as string);
        break;
      }
      case 'deadline_risk': {
        await this.shiftSubtaskDates(
          payload.moveSubtaskId as string,
          payload.newStartDate as string,
          payload.newDueDate as string,
        );
        break;
      }
      case 'inactive_member':
      case 'workload_imbalance': {
        await this.reassignSubtask(payload.subtaskId as string, payload.toUserId as string);
        if (payload.toUserId) {
          await this.notifications.create({
            userId: payload.toUserId as string,
            type: 'ai_recommendation_ready',
            title: 'A task was reassigned to you',
            body: rec.title,
            taskId,
            data: { kind: rec.kind, recommendationId },
          });
        }
        break;
      }
    }

    await this.db
      .update(aiRecommendations)
      .set({ status: 'approved', resolvedAt: new Date(), resolvedByUserId: userId })
      .where(eq(aiRecommendations.id, recommendationId));

    await this.activity.log(userId, taskId, 'ai_recommendation_approved', rec.title, {
      kind: rec.kind,
    });
  }

  async dismiss(userId: string, taskId: string, recommendationId: string) {
    await this.access.require(userId, taskId, 'editor');
    const rec = await this.getPending(taskId, recommendationId);

    await this.db
      .update(aiRecommendations)
      .set({ status: 'dismissed', resolvedAt: new Date(), resolvedByUserId: userId })
      .where(eq(aiRecommendations.id, recommendationId));

    await this.activity.log(userId, taskId, 'ai_recommendation_dismissed', rec.title, {
      kind: rec.kind,
    });
  }

  private async getPending(taskId: string, recommendationId: string) {
    const [rec] = await this.db
      .select()
      .from(aiRecommendations)
      .where(
        and(eq(aiRecommendations.id, recommendationId), eq(aiRecommendations.taskId, taskId)),
      );
    if (!rec) throw new NotFoundException('Recommendation not found.');
    if (rec.status !== 'pending') {
      throw new BadRequestException('This recommendation was already resolved.');
    }
    return rec;
  }

  private async shiftSubtaskDates(subtaskId: string, newStartDate: string, newDueDate?: string) {
    const set: Record<string, unknown> = { startDate: new Date(newStartDate) };
    if (newDueDate) set.dueDate = new Date(newDueDate);
    await this.db.update(subtasks).set(set).where(eq(subtasks.id, subtaskId));
  }

  private async reassignSubtask(subtaskId: string, toUserId: string) {
    const [person] = await this.db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, toUserId));
    await this.db
      .update(subtasks)
      .set({ assigneeUserId: toUserId, assignee: person?.fullName ?? null })
      .where(eq(subtasks.id, subtaskId));
  }

  /**
   * Recomputes what situations currently hold, retires pending cards whose
   * situation no longer holds ("auto_resolved"), and inserts any genuinely
   * new ones. The partial unique index on (taskId, dedupeKey WHERE
   * status='pending') makes re-detecting an already-pending situation a
   * no-op insert, so this is safe to call on every read.
   */
  private async reconcile(taskId: string) {
    const [task] = await this.db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!task) return;

    const memberIds = await this.access.getRecipientIds(taskId);
    if (memberIds.length < 2) return; // nothing to coordinate solo

    const allSubtasks = await this.db
      .select()
      .from(subtasks)
      .where(eq(subtasks.taskId, taskId));
    const openSubtasks = allSubtasks.filter((row) =>
      (OPEN_STATUSES as readonly string[]).includes(row.status),
    );

    const since = new Date(Date.now() - INACTIVE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
    const recentActivity = await this.db
      .select({ userId: taskActivities.userId, createdAt: taskActivities.createdAt })
      .from(taskActivities)
      .where(and(eq(taskActivities.taskId, taskId), gte(taskActivities.createdAt, since)));
    const activeUserIds = new Set(recentActivity.map((row) => row.userId));

    const memberCapacity = await this.capacity.getCapacityForUsers(memberIds);
    const capacityByUser = new Map(memberCapacity.map((entry) => [entry.userId, entry]));

    const candidates: Candidate[] = [
      ...detectAheadOfPace(memberIds, allSubtasks, openSubtasks),
      ...detectInactiveMembers(memberIds, openSubtasks, activeUserIds, capacityByUser),
      ...detectWorkloadImbalance(openSubtasks, capacityByUser),
      ...detectDeadlineRisk(task, openSubtasks, capacityByUser),
    ];

    const freshKeys = new Set(candidates.map((candidate) => candidate.dedupeKey));

    const pending = await this.db
      .select()
      .from(aiRecommendations)
      .where(and(eq(aiRecommendations.taskId, taskId), eq(aiRecommendations.status, 'pending')));

    const staleIds = pending
      .filter((rec) => !freshKeys.has(rec.dedupeKey))
      .map((rec) => rec.id);
    if (staleIds.length) {
      await this.db
        .update(aiRecommendations)
        .set({ status: 'auto_resolved', resolvedAt: new Date() })
        .where(inArray(aiRecommendations.id, staleIds));
    }

    const notifyInputs: CreateNotificationInput[] = [];
    for (const candidate of candidates) {
      const inserted = await this.db
        .insert(aiRecommendations)
        .values({ taskId, status: 'pending', ...candidate })
        .onConflictDoNothing()
        .returning({ id: aiRecommendations.id });
      if (inserted.length) {
        notifyInputs.push({
          userId: task.userId,
          type: 'ai_recommendation_ready',
          title: candidate.title,
          body: candidate.message,
          taskId,
          data: { kind: candidate.kind },
        });
      }
    }
    if (notifyInputs.length) await this.notifications.createMany(notifyInputs);
  }
}

function toEntity(row: typeof aiRecommendations.$inferSelect): AiRecommendationEntity {
  return {
    id: row.id,
    kind: row.kind as RecommendationKind,
    status: row.status as RecommendationStatus,
    targetUserId: row.targetUserId,
    title: row.title,
    message: row.message,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
  };
}

export function estimateMinutes(row: SubtaskRow): number {
  return row.estimatedDurationMinutes ?? DEFAULT_ESTIMATE_MINUTES;
}

/**
 * A member who has completed every subtask they were ever assigned on this
 * task (so they genuinely finished early, not merely "nothing overdue yet")
 * while another still-open item elsewhere hasn't started. Needs the FULL
 * subtask list, not just the open ones, to tell "finished everything" apart
 * from "hasn't started their one remaining item yet".
 */
export function detectAheadOfPace(
  memberIds: string[],
  allSubtasks: SubtaskRow[],
  openSubtasks: SubtaskRow[],
): Candidate[] {
  const now = new Date();
  const horizon = new Date(now.getTime() + AHEAD_OF_PACE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const candidates: Candidate[] = [];

  for (const memberId of memberIds) {
    const mine = allSubtasks.filter((row) => row.assigneeUserId === memberId && !row.isShared);
    if (!mine.length) continue; // never had work on this task — nothing to be "ahead" of
    const stillOpen = mine.some((row) => row.status !== 'done');
    if (stillOpen) continue; // they have undone work of their own — not ahead

    const upcoming = openSubtasks
      .filter(
        (row) =>
          row.assigneeUserId !== memberId &&
          row.startDate &&
          row.startDate > now &&
          row.startDate <= horizon,
      )
      .sort((a, b) => a.startDate!.getTime() - b.startDate!.getTime())[0];
    if (!upcoming) continue;

    candidates.push({
      kind: 'ahead_of_pace',
      targetUserId: memberId,
      title: `Ahead of pace — move "${upcoming.title}" up?`,
      message: `This member finished their current work early. "${upcoming.title}" isn't due to start yet — bring it forward?`,
      reason: 'Every item assigned to them is done, and a later item is free to start now.',
      payload: { subtaskId: upcoming.id, newStartDate: now.toISOString() },
      dedupeKey: `ahead_of_pace:${memberId}:${upcoming.id}`,
    });
  }
  return candidates;
}

/** Open work sitting untouched for 3+ days with no activity from its owner. */
export function detectInactiveMembers(
  memberIds: string[],
  openSubtasks: SubtaskRow[],
  activeUserIds: Set<string>,
  capacityByUser: Map<string, { loadPercent: number }>,
): Candidate[] {
  const now = new Date();
  const staleCutoff = new Date(now.getTime() - INACTIVE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
  const candidates: Candidate[] = [];

  for (const memberId of memberIds) {
    if (activeUserIds.has(memberId)) continue;
    const stale = openSubtasks
      .filter(
        (row) =>
          row.assigneeUserId === memberId && row.startDate && row.startDate <= staleCutoff,
      )
      .sort((a, b) => a.startDate!.getTime() - b.startDate!.getTime())[0];
    if (!stale) continue;

    const other = pickLeastBusyOther(memberIds, memberId, capacityByUser);
    if (!other) continue;

    candidates.push({
      kind: 'inactive_member',
      targetUserId: memberId,
      title: `No activity for ${INACTIVE_THRESHOLD_DAYS}+ days — redistribute "${stale.title}"?`,
      message: `This member hasn't been active on the task in a while. Move "${stale.title}" to someone with more room?`,
      reason: `No activity logged in the last ${INACTIVE_THRESHOLD_DAYS} days while work is still open.`,
      payload: { subtaskId: stale.id, fromUserId: memberId, toUserId: other },
      dedupeKey: `inactive_member:${memberId}`,
    });
  }
  return candidates;
}

/** One member carrying meaningfully more remaining work than the least-loaded other member. */
export function detectWorkloadImbalance(
  openSubtasks: SubtaskRow[],
  capacityByUser: Map<string, { loadPercent: number }>,
): Candidate[] {
  const remainingByUser = new Map<string, number>();
  for (const row of openSubtasks) {
    if (!row.assigneeUserId) continue;
    remainingByUser.set(
      row.assigneeUserId,
      (remainingByUser.get(row.assigneeUserId) ?? 0) + estimateMinutes(row),
    );
  }
  if (remainingByUser.size < 2) return [];

  const entries = [...remainingByUser.entries()].sort((a, b) => b[1] - a[1]);
  const [busiestId, busiestMinutes] = entries[0];
  const [lightestId, lightestMinutes] = entries[entries.length - 1];
  const gap = busiestMinutes - lightestMinutes;
  const ratio = busiestMinutes / Math.max(lightestMinutes, 1);
  if (ratio < IMBALANCE_RATIO_THRESHOLD || gap < IMBALANCE_MIN_GAP_MINUTES) return [];

  const movable = openSubtasks
    .filter((row) => row.assigneeUserId === busiestId && (!row.startDate || row.startDate > new Date()))
    .sort((a, b) => (b.estimatedDurationMinutes ?? 0) - (a.estimatedDurationMinutes ?? 0))[0];
  if (!movable) return [];

  return [
    {
      kind: 'workload_imbalance',
      targetUserId: busiestId,
      title: 'Workload is uneven — rebalance?',
      message: `One teammate is carrying noticeably more remaining work than another. Move "${movable.title}" to someone with more room?`,
      reason: `Remaining workload is ${Math.round(ratio * 10) / 10}x higher for this member than the least-loaded teammate.`,
      payload: { subtaskId: movable.id, fromUserId: busiestId, toUserId: lightestId },
      dedupeKey: `workload_imbalance:${busiestId}`,
    },
  ];
}

/** Remaining work outpacing the days left before the deadline. */
export function detectDeadlineRisk(
  task: typeof tasks.$inferSelect,
  openSubtasks: SubtaskRow[],
  capacityByUser: Map<string, { loadPercent: number }>,
): Candidate[] {
  if (!task.dueDate) return [];
  const now = new Date();
  const remainingDays = Math.max(
    1,
    Math.ceil((task.dueDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
  );
  const remainingMinutes = openSubtasks.reduce((sum, row) => sum + estimateMinutes(row), 0);
  if (!remainingMinutes) return [];

  // Rough team daily throughput: each member contributes up to ~2h/day toward
  // this one task (a deliberately conservative, task-local share of their
  // overall daily capacity, not their whole day).
  const teamDailyMinutes = Math.max(capacityByUser.size, 1) * 120;
  const projectedDays = remainingMinutes / teamDailyMinutes;
  if (projectedDays <= remainingDays) return [];

  const slipDays = Math.ceil(projectedDays - remainingDays);
  const movable = openSubtasks
    .filter((row) => !row.startDate || row.startDate > now)
    .sort((a, b) => (a.startDate?.getTime() ?? Infinity) - (b.startDate?.getTime() ?? Infinity))[0];
  if (!movable) return [];

  return [
    {
      kind: 'deadline_risk',
      targetUserId: null,
      title: `Deadline risk — pace suggests finishing ~${slipDays} day${slipDays > 1 ? 's' : ''} late`,
      message: `At the current pace, this task will likely miss its deadline. Move "${movable.title}" earlier to catch up?`,
      reason: `${Math.round(remainingMinutes / 60)}h of open work remains with ${remainingDays} day(s) left.`,
      payload: {
        moveSubtaskId: movable.id,
        newStartDate: now.toISOString(),
        newDueDate: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        projectedSlipDays: slipDays,
      },
      dedupeKey: 'deadline_risk',
    },
  ];
}

function pickLeastBusyOther(
  memberIds: string[],
  excludeUserId: string,
  capacityByUser: Map<string, { loadPercent: number }>,
): string | null {
  const others = memberIds.filter((id) => id !== excludeUserId);
  if (!others.length) return null;
  return others.sort(
    (a, b) => (capacityByUser.get(a)?.loadPercent ?? 0) - (capacityByUser.get(b)?.loadPercent ?? 0),
  )[0];
}
