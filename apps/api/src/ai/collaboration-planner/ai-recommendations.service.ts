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
import {
  affectedSubtaskIds,
  affectedUserIds,
  planChangesFor,
  type PlanChange,
} from './recommendation-changes';
import {
  buildDetailedRecommendation,
  toAffectedItem,
  type DetailedRecommendation,
} from './recommendation-detail.logic';
import type { TaskRole } from '../../collaboration/task-access.service';
import {
  RecommendationSimulationService,
  type TaskSimulation,
} from './recommendation-simulation.service';
import {
  findSupersededIds,
  splitDeltas,
  validateRecommendation,
  RESOLUTION_LABEL,
  type ResolutionReason,
  type ValidationVerdict,
} from './recommendation-validation.logic';
import { alignTextWithForecast, impactOf } from './recommendation-impact.logic';

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
  resolutionReason: ResolutionReason | null;
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
type RecommendationRow = typeof aiRecommendations.$inferSelect;

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
    private readonly simulations: RecommendationSimulationService,
  ) {}

  private get db() {
    return this.databaseService.db;
  }

  /**
   * Entities only. Runs the SAME validation pipeline as `listDetailed`, so the
   * Overview's "pending actions" count can never disagree with the cards the
   * Recommendations section actually renders.
   */
  async list(taskId: string): Promise<AiRecommendationEntity[]> {
    const { rows, invalid } = await this.runPipeline(taskId);
    return rows.map((row) => {
      const resolvedNow = invalid.get(row.id);
      const entity = toEntity(row);
      return resolvedNow
        ? { ...entity, status: 'auto_resolved' as const, resolutionReason: resolvedNow.reason }
        : entity;
    });
  }

  /**
   * The validated list. This is the pipeline the whole phase exists for:
   *
   *   Generate (reconcile) → Validate → Preview simulation → Compare before/after
   *     → valid   : return, carrying its measured impact
   *     → invalid : auto-resolve with a durable reason, never returned as pending
   *
   * A pending card that reaches a client has therefore just been proven to still
   * exist, still be actionable, still agree with the deterministic forecast and
   * health engines, and still improve at least one tracked metric.
   */
  async listDetailed(taskId: string, viewerRole: TaskRole): Promise<DetailedRecommendation[]> {
    const { rows, simulation, invalid } = await this.runPipeline(taskId);
    return this.enrich(rows, viewerRole, simulation, invalid);
  }

  /** Generate → simulate → validate → auto-resolve. Shared by both list forms. */
  private async runPipeline(taskId: string): Promise<{
    rows: RecommendationRow[];
    simulation: TaskSimulation;
    invalid: Map<string, { reason: ResolutionReason; explanation: string }>;
  }> {
    const ownerId = await this.ownerIdFor(taskId);
    const rows = await this.reconcileAndSelect(taskId);
    const pending = rows.filter((row) => row.status === 'pending');

    const simulation = await this.simulations.simulate(
      ownerId,
      taskId,
      pending.map((row) => ({
        id: row.id,
        kind: row.kind,
        payload: row.payload,
        createdAt: row.createdAt,
      })),
    );

    const invalid = await this.validatePending(pending, simulation);
    if (invalid.size) {
      await this.resolveAutomatically(ownerId, taskId, invalid);
      // The rows just changed status, so the cached simulation's fingerprint is
      // no longer the one a later caller would compute.
      this.simulations.invalidate(taskId);
    }

    return { rows, simulation, invalid };
  }

  /** Re-detect, then read back every recommendation row (payload included). */
  private async reconcileAndSelect(taskId: string): Promise<RecommendationRow[]> {
    await this.reconcile(taskId);
    return this.db
      .select()
      .from(aiRecommendations)
      .where(eq(aiRecommendations.taskId, taskId))
      .orderBy(desc(aiRecommendations.createdAt));
  }

  /**
   * One recommendation with its detail AND the concrete edits approving it would
   * make — the entry point for the preview, which needs both. Reuses the shared
   * simulation, so the preview cannot disagree with the card the user clicked.
   */
  async loadForDecision(
    taskId: string,
    recommendationId: string,
    viewerRole: TaskRole,
  ): Promise<{
    detail: DetailedRecommendation;
    changes: PlanChange[];
    simulation: TaskSimulation;
  }> {
    const [row] = await this.db
      .select()
      .from(aiRecommendations)
      .where(and(eq(aiRecommendations.id, recommendationId), eq(aiRecommendations.taskId, taskId)));
    if (!row) throw new NotFoundException('Recommendation not found.');

    const simulation = await this.simulations.simulate(await this.ownerIdFor(taskId), taskId, [
      { id: row.id, kind: row.kind, payload: row.payload, createdAt: row.createdAt },
    ]);
    const [detail] = await this.enrich([row], viewerRole, simulation, new Map());
    return { detail, changes: planChangesFor(row), simulation };
  }

  /**
   * Run the gate over every pending row. Returns the ones that must not be shown,
   * keyed to the reason they failed. Supersession runs last, over the survivors,
   * because it is only meaningful between two otherwise-valid recommendations.
   */
  private async validatePending(
    pending: RecommendationRow[],
    simulation: TaskSimulation,
  ): Promise<Map<string, { reason: ResolutionReason; explanation: string }>> {
    const invalid = new Map<string, { reason: ResolutionReason; explanation: string }>();
    if (!pending.length) return invalid;

    const items = await this.affectedItemsFor(pending);

    for (const row of pending) {
      const changes = planChangesFor(row);
      const simulated = simulation.byRecommendation.get(row.id);

      if (!simulated) {
        // No simulation means no derivable change (or the batch cap was hit).
        if (!changes.length) {
          invalid.set(row.id, {
            reason: 'not_applicable',
            explanation: 'This recommendation references work that no longer exists.',
          });
        }
        continue;
      }

      const verdict = validateRecommendation({
        kind: row.kind,
        targetUserId: row.targetUserId,
        changes,
        items: affectedSubtaskIds(changes)
          .map((id) => items.get(id))
          .filter((item): item is NonNullable<typeof item> => Boolean(item)),
        taskComplete: simulation.taskComplete,
        acceptedMemberIds: simulation.acceptedMemberIds,
        targetOpenItemCount: row.targetUserId
          ? (simulation.openItemsByAssignee.get(row.targetUserId) ?? 0)
          : 0,
        baseline: simulation.baseline,
        projected: simulated.projected,
        deltas: simulated.deltas,
      });

      if (!verdict.valid) {
        invalid.set(row.id, { reason: verdict.reason, explanation: verdict.explanation });
      }
    }

    // Two survivors editing the same subtask cannot both hold — approving either
    // invalidates the other's simulation, so the weaker one is superseded.
    const survivors = pending.filter((row) => !invalid.has(row.id));
    const superseded = findSupersededIds(
      survivors.map((row) => {
        const simulated = simulation.byRecommendation.get(row.id);
        return {
          id: row.id,
          subtaskIds: affectedSubtaskIds(simulated?.changes ?? planChangesFor(row)),
          improvedCount: simulated ? splitDeltas(simulated.deltas).improved.length : 0,
          createdAt: row.createdAt.toISOString(),
        };
      }),
    );
    for (const [losingId] of superseded) {
      invalid.set(losingId, {
        reason: 'superseded',
        explanation: 'A newer recommendation covers the same work with a stronger effect.',
      });
    }

    return invalid;
  }

  /**
   * Persist the automatic state transition with its reason, and record it on the
   * shared activity timeline. Attributed to the task owner because the timeline
   * requires an actor and the system is acting on the project's behalf.
   */
  private async resolveAutomatically(
    ownerId: string,
    taskId: string,
    invalid: Map<string, { reason: ResolutionReason; explanation: string }>,
  ) {
    for (const [recommendationId, { reason, explanation }] of invalid) {
      await this.db
        .update(aiRecommendations)
        .set({ status: 'auto_resolved', resolvedAt: new Date(), resolutionReason: reason })
        .where(eq(aiRecommendations.id, recommendationId));

      await this.activity.log(
        ownerId,
        taskId,
        'ai_recommendation_auto_resolved',
        `${RESOLUTION_LABEL[reason]} — ${explanation}`,
        { recommendationId, resolutionReason: reason },
      );
    }
  }

  /** Live subtask rows for every recommendation in a batch, keyed by id. */
  private async affectedItemsFor(rows: RecommendationRow[]) {
    const ids = [
      ...new Set(rows.flatMap((row) => affectedSubtaskIds(planChangesFor(row)))),
    ];
    if (!ids.length) return new Map<string, ReturnType<typeof toAffectedItem>>();

    const subtaskRows = await this.db.select().from(subtasks).where(inArray(subtasks.id, ids));
    const assigneeIds = subtaskRows
      .map((row) => row.assigneeUserId)
      .filter((id): id is string => Boolean(id));
    const people = assigneeIds.length
      ? await this.db
          .select({ id: users.id, fullName: users.fullName })
          .from(users)
          .where(inArray(users.id, [...new Set(assigneeIds)]))
      : [];
    const peopleById = new Map(people.map((person) => [person.id, person.fullName]));

    return new Map(subtaskRows.map((row) => [row.id, toAffectedItem(row, peopleById)]));
  }

  /** The task owner — used only to satisfy the engines' own access checks. */
  private async ownerIdFor(taskId: string): Promise<string> {
    const [task] = await this.db
      .select({ userId: tasks.userId })
      .from(tasks)
      .where(eq(tasks.id, taskId));
    if (!task) throw new NotFoundException('Task not found.');
    return task.userId;
  }

  /** Shared enrichment: resolve affected rows/people once for a batch. */
  private async enrich(
    rows: RecommendationRow[],
    viewerRole: TaskRole,
    simulation: TaskSimulation,
    justResolved: Map<string, { reason: ResolutionReason; explanation: string }>,
  ): Promise<DetailedRecommendation[]> {
    if (!rows.length) return [];

    const changesByRec = new Map<string, PlanChange[]>(
      rows.map((row) => [row.id, planChangesFor(row)]),
    );

    const subtaskIds = [
      ...new Set([...changesByRec.values()].flatMap((changes) => affectedSubtaskIds(changes))),
    ];
    const subtaskRows = subtaskIds.length
      ? await this.db.select().from(subtasks).where(inArray(subtasks.id, subtaskIds))
      : [];
    const subtaskById = new Map(subtaskRows.map((row) => [row.id, row]));

    const userIds = [
      ...new Set([
        ...rows.flatMap((row) => affectedUserIds(changesByRec.get(row.id) ?? [], row.targetUserId)),
        ...subtaskRows
          .map((row) => row.assigneeUserId)
          .filter((id): id is string => Boolean(id)),
      ]),
    ];
    const people = userIds.length
      ? await this.db
          .select({ id: users.id, fullName: users.fullName })
          .from(users)
          .where(inArray(users.id, userIds))
      : [];
    const peopleById = new Map(people.map((person) => [person.id, person.fullName]));

    return rows.map((row) => {
      const changes = changesByRec.get(row.id) ?? [];
      const items = affectedSubtaskIds(changes)
        .map((id) => subtaskById.get(id))
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .map((item) => toAffectedItem(item, peopleById));

      const simulated = simulation.byRecommendation.get(row.id);
      const entity = toEntity(row);

      // A card resolved in THIS request reports its fresh reason even though the
      // row we read predates the update.
      const resolvedNow = justResolved.get(row.id);
      const recommendation = resolvedNow
        ? { ...entity, status: 'auto_resolved' as const, resolutionReason: resolvedNow.reason }
        : entity;

      return buildDetailedRecommendation({
        recommendation,
        changes,
        items,
        peopleById,
        viewerRole,
        // Every quantitative claim restated from the deterministic engines.
        alignedText: alignTextWithForecast({
          kind: row.kind,
          title: row.title,
          message: row.message,
          reason: row.reason,
          baseline: simulation.baseline,
        }),
        forecastStatus: simulation.baseline.forecast.status,
        impact:
          simulated && recommendation.status === 'pending'
            ? impactOf({
                deltas: simulated.deltas,
                baseline: simulation.baseline,
                projected: simulated.projected,
              })
            : null,
      });
    });
  }

  async approve(userId: string, taskId: string, recommendationId: string) {
    await this.access.require(userId, taskId, 'editor');
    const rec = await this.getPending(taskId, recommendationId);

    // ONE translation from payload -> edits, shared with the preview, so what the
    // user was shown before approving is exactly what gets written here.
    const changes = planChangesFor(rec);
    if (!changes.length) {
      throw new BadRequestException(
        'This recommendation can no longer be applied — the work it referred to has changed.',
      );
    }

    // Re-validate against the SAME simulation the card and preview used. A card
    // can go stale between render and click (a teammate finishes the item, the
    // forecast catches up); approving then must fail loudly and self-resolve
    // rather than write a change that no longer helps.
    const verdict = await this.revalidate(taskId, rec, changes);
    if (!verdict.valid) {
      await this.resolveAutomatically(await this.ownerIdFor(taskId), taskId, new Map([
        [rec.id, { reason: verdict.reason, explanation: verdict.explanation }],
      ]));
      this.simulations.invalidate(taskId);
      throw new BadRequestException(
        `${RESOLUTION_LABEL[verdict.reason]} — ${verdict.explanation}`,
      );
    }

    for (const change of changes) {
      if (change.kind === 'reassign') {
        await this.reassignSubtask(change.subtaskId, change.assigneeUserId!);
        await this.notifications.create({
          userId: change.assigneeUserId!,
          // Preserve the established AI recommendation notification contract;
          // the payload identifies this specific assignment action.
          type: 'ai_recommendation_ready',
          title: 'A task was reassigned to you',
          body: rec.title,
          taskId,
          priority: 'high',
          data: { kind: rec.kind, recommendationId, entityType: 'subtask', entityId: change.subtaskId, route: `/tasks/${taskId}` },
        });
      } else {
        await this.shiftSubtaskDates(change.subtaskId, change.startDate!, change.dueDate);
      }
    }

    await this.db
      .update(aiRecommendations)
      .set({ status: 'approved', resolvedAt: new Date(), resolvedByUserId: userId })
      .where(eq(aiRecommendations.id, recommendationId));

    await this.activity.log(userId, taskId, 'ai_recommendation_approved', rec.title, {
      kind: rec.kind,
    });

    // The applied edit changed the underlying rows, so every cached simulation
    // for this task is now describing a world that no longer exists.
    this.simulations.invalidate(taskId);
  }

  /**
   * The validation gate for a single recommendation, reusing the shared
   * simulation. Identical rules to the list pipeline — one implementation, so
   * "shown as valid" and "accepted on approve" can never drift apart.
   */
  private async revalidate(
    taskId: string,
    rec: RecommendationRow,
    changes: PlanChange[],
  ): Promise<ValidationVerdict> {
    const simulation = await this.simulations.simulate(await this.ownerIdFor(taskId), taskId, [
      { id: rec.id, kind: rec.kind, payload: rec.payload, createdAt: rec.createdAt },
    ]);
    const simulated = simulation.byRecommendation.get(rec.id);
    if (!simulated) {
      return {
        valid: false,
        reason: 'not_applicable',
        explanation: 'This recommendation references work that no longer exists.',
      };
    }

    const items = await this.affectedItemsFor([rec]);
    return validateRecommendation({
      kind: rec.kind,
      targetUserId: rec.targetUserId,
      changes,
      items: affectedSubtaskIds(changes)
        .map((id) => items.get(id))
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
      taskComplete: simulation.taskComplete,
      acceptedMemberIds: simulation.acceptedMemberIds,
      targetOpenItemCount: rec.targetUserId
        ? (simulation.openItemsByAssignee.get(rec.targetUserId) ?? 0)
        : 0,
      baseline: simulation.baseline,
      projected: simulated.projected,
      deltas: simulated.deltas,
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
          type: candidate.kind === 'deadline_risk' ? 'deadline_risk' : candidate.kind === 'workload_imbalance' ? 'workload_warning' : 'ai_recommendation_ready',
          title: candidate.title,
          body: candidate.message,
          taskId,
          data: { kind: candidate.kind, recommendationId: inserted[0].id, entityType: 'ai_recommendation', entityId: inserted[0].id, route: `/ai-planner/recommendations/${inserted[0].id}` },
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
    resolutionReason: (row.resolutionReason as ResolutionReason | null) ?? null,
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
