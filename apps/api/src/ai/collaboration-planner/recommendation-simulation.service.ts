import { Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { DatabaseService } from '../../db/database.service';
import { subtasks, taskMembers, tasks } from '../../db/schema';
import { ProjectHealthService } from './project-health.service';
import { ProjectPlanService } from './project-plan/project-plan.service';
import { TeamInsightsService } from './team-insights.service';
import { planChangesFor, subtaskOverridesFor, type PlanChange } from './recommendation-changes';
import {
  buildDeltas,
  buildSnapshot,
  type PreviewDelta,
  type PreviewSnapshot,
} from './recommendation-preview.logic';

export type RecommendationSimulation = {
  recommendationId: string;
  changes: PlanChange[];
  projected: PreviewSnapshot;
  deltas: PreviewDelta[];
};

export type TaskSimulation = {
  /** Identity of the underlying data this simulation was computed from. */
  fingerprint: string;
  generatedAt: string;
  /** Deterministic project state as it is right now — shared by every card. */
  baseline: PreviewSnapshot;
  byRecommendation: Map<string, RecommendationSimulation>;
  // --- Live facts the validation rules need, loaded alongside the plan -------
  acceptedMemberIds: Set<string>;
  taskComplete: boolean;
  /** Open (not done/missed) subtask count per assignee. */
  openItemsByAssignee: Map<string, number>;
};

export type SimulationInput = { id: string; kind: string; payload: unknown; createdAt: Date };

/**
 * Cost guard. Each simulated recommendation costs one extra full plan build, and
 * the four detectors produce at most a handful of pending cards, so this ceiling
 * is never reached in practice — it only stops a pathological backlog from
 * turning one list request into dozens of scheduler runs.
 */
const MAX_SIMULATED = 8;

/** How long a fingerprinted simulation may be reused (ms). */
const CACHE_TTL_MS = 60_000;
const MAX_CACHED_TASKS = 200;

type CacheEntry = { simulation: TaskSimulation; expiresAt: number };

/**
 * THE single source of truth for "what would this recommendation do?".
 *
 * The list endpoint (to validate and to show measurable impact), the preview
 * endpoint, and approve all read from here, so the numbers on a card, the
 * numbers in its preview, and the change that actually gets applied are the same
 * computation — not three that merely ought to agree.
 *
 * Consistency is enforced by a FINGERPRINT of the underlying rows rather than by
 * a timer: if nothing relevant changed, every caller gets the byte-identical
 * cached result; if something did change, every caller recomputes and gets the
 * same new truth. A stale read is therefore impossible in either direction.
 * (The cache is per-process; another instance simply recomputes the same values
 * from the same fingerprinted inputs.)
 */
@Injectable()
export class RecommendationSimulationService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly projectPlan: ProjectPlanService,
    private readonly team: TeamInsightsService,
    private readonly health: ProjectHealthService,
  ) {}

  private get db() {
    return this.databaseService.db;
  }

  /**
   * Simulate every supplied recommendation against one shared baseline.
   * `userId` is only used to satisfy the engines' own access checks — it never
   * affects the result, which is why the cache is keyed by task alone.
   */
  async simulate(
    userId: string,
    taskId: string,
    recommendations: SimulationInput[],
  ): Promise<TaskSimulation> {
    const facts = await this.loadFacts(taskId);
    const simulated = recommendations.slice(0, MAX_SIMULATED);
    const fingerprint = fingerprintOf(facts, simulated);

    const cached = this.cache.get(taskId);
    if (cached && cached.simulation.fingerprint === fingerprint && cached.expiresAt > Date.now()) {
      return cached.simulation;
    }

    const baseline = await this.snapshot(userId, taskId);
    const byRecommendation = new Map<string, RecommendationSimulation>();

    for (const recommendation of simulated) {
      const changes = planChangesFor(recommendation);
      if (!changes.length) continue; // nothing to simulate; validation rejects it
      const projected = await this.snapshot(userId, taskId, changes);
      byRecommendation.set(recommendation.id, {
        recommendationId: recommendation.id,
        changes,
        projected,
        deltas: buildDeltas(baseline, projected),
      });
    }

    const simulation: TaskSimulation = {
      fingerprint,
      generatedAt: new Date().toISOString(),
      baseline,
      byRecommendation,
      ...facts,
    };

    this.remember(taskId, simulation);
    return simulation;
  }

  /** Drop a task's cached simulation after a write that invalidates it. */
  invalidate(taskId: string) {
    this.cache.delete(taskId);
  }

  private remember(taskId: string, simulation: TaskSimulation) {
    if (this.cache.size >= MAX_CACHED_TASKS) {
      // Cheap bounded eviction: drop the oldest inserted entry.
      const oldest = this.cache.keys().next();
      if (!oldest.done) this.cache.delete(oldest.value);
    }
    this.cache.set(taskId, { simulation, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  /** One coherent read of every engine over the same (optionally hypothetical) plan. */
  private async snapshot(
    userId: string,
    taskId: string,
    changes?: PlanChange[],
  ): Promise<PreviewSnapshot> {
    const plan = await this.projectPlan.getProjectPlan(userId, taskId, {
      overrides: changes ? subtaskOverridesFor(changes) : undefined,
    });
    const team = await this.team.get(userId, taskId, plan);
    const health = await this.health.get(userId, taskId, { plan, team });
    return buildSnapshot({ plan, team, health });
  }

  /**
   * The live facts validation needs that the plan does not expose: who is still
   * an accepted collaborator, whether the task itself is finished, and how much
   * open work each member still holds. Also the fingerprint's raw material.
   */
  private async loadFacts(taskId: string): Promise<{
    acceptedMemberIds: Set<string>;
    taskComplete: boolean;
    openItemsByAssignee: Map<string, number>;
    subtaskStamp: string;
  }> {
    const [task] = await this.db
      .select({ id: tasks.id, status: tasks.status, userId: tasks.userId, dueDate: tasks.dueDate })
      .from(tasks)
      .where(eq(tasks.id, taskId));

    const memberRows = await this.db
      .select({ userId: taskMembers.userId })
      .from(taskMembers)
      .where(and(eq(taskMembers.taskId, taskId), eq(taskMembers.status, 'accepted')));

    const subtaskRows = await this.db
      .select({
        id: subtasks.id,
        status: subtasks.status,
        isDone: subtasks.isDone,
        assigneeUserId: subtasks.assigneeUserId,
        startDate: subtasks.startDate,
        dueDate: subtasks.dueDate,
        estimatedDurationMinutes: subtasks.estimatedDurationMinutes,
        actualDurationMinutes: subtasks.actualDurationMinutes,
      })
      .from(subtasks)
      .where(eq(subtasks.taskId, taskId));

    // The owner is always a collaborator even without a task_members row.
    const acceptedMemberIds = new Set(memberRows.map((row) => row.userId));
    if (task?.userId) acceptedMemberIds.add(task.userId);

    const openItemsByAssignee = new Map<string, number>();
    for (const row of subtaskRows) {
      if (!row.assigneeUserId) continue;
      if (row.isDone || row.status === 'done' || row.status === 'missed') continue;
      openItemsByAssignee.set(
        row.assigneeUserId,
        (openItemsByAssignee.get(row.assigneeUserId) ?? 0) + 1,
      );
    }

    return {
      acceptedMemberIds,
      taskComplete: task?.status === 'done',
      openItemsByAssignee,
      subtaskStamp: [
        `${task?.status ?? ''}|${task?.dueDate?.toISOString() ?? ''}`,
        [...acceptedMemberIds].sort().join(','),
        ...subtaskRows
          .map((row) =>
            [
              row.id,
              row.status,
              row.isDone ? 1 : 0,
              row.assigneeUserId ?? '',
              row.startDate?.toISOString() ?? '',
              row.dueDate?.toISOString() ?? '',
              row.estimatedDurationMinutes ?? '',
              row.actualDurationMinutes ?? '',
            ].join(':'),
          )
          .sort(),
      ].join('~'),
    };
  }

  /** Load open-item counts for a single member without a full simulation. */
  async openItemCountFor(taskId: string, userId: string | null): Promise<number> {
    if (!userId) return 0;
    const facts = await this.loadFacts(taskId);
    return facts.openItemsByAssignee.get(userId) ?? 0;
  }
}

/**
 * Identity of everything a simulation depends on. Any edit to the scheduling
 * fields, the member roster, the task itself, or the set of recommendations
 * being simulated produces a different fingerprint and forces a recompute.
 */
function fingerprintOf(
  facts: { subtaskStamp: string },
  recommendations: SimulationInput[],
): string {
  const recStamp = recommendations
    .map((rec) => `${rec.id}:${rec.kind}:${JSON.stringify(rec.payload ?? {})}`)
    .sort()
    .join('~');
  return `${facts.subtaskStamp}##${recStamp}`;
}

/** Test seam: the number of recommendations a single request will simulate. */
export const SIMULATION_LIMIT = MAX_SIMULATED;

/** Convenience for callers that only need the ids that were actually simulated. */
export function simulatedIds(simulation: TaskSimulation): string[] {
  return [...simulation.byRecommendation.keys()];
}

export { CACHE_TTL_MS as SIMULATION_CACHE_TTL_MS };

/** Re-exported so callers don't need a second import for the delta shape. */
export type { PreviewDelta, PreviewSnapshot };
