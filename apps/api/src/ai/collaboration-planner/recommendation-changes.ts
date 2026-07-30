// The single source of truth for "what does approving this recommendation
// actually change?".
//
// Both AiRecommendationsService.approve() (which writes to `subtasks`) and the
// recommendation preview (which simulates against an in-memory plan) derive
// their mutations from `planChangesFor`. Because there is exactly one
// translation from a stored recommendation payload to a concrete edit, a
// preview can never promise something different from what approving performs.
//
// Pure and IO-free. Deliberately typed against a loose `{ kind, payload }` so it
// does not import the service (avoiding a cycle) and so an unrecognised or
// incomplete payload yields NO changes rather than a half-applied edit.

export type PlanChangeKind = 'reassign' | 'reschedule';

export type PlanChange = {
  kind: PlanChangeKind;
  subtaskId: string;
  /** Target assignee — only on 'reassign'. */
  assigneeUserId?: string;
  /** New start — only on 'reschedule' (ISO 8601). */
  startDate?: string;
  /** New due date — only on 'reschedule' when the payload carries one (ISO 8601). */
  dueDate?: string;
  /** The member the work moves away from, when the payload records it. */
  fromUserId?: string;
};

/** The in-memory edit shape consumed by ProjectPlanService for a hypothetical plan. */
export type PlanSubtaskOverride = {
  subtaskId: string;
  assigneeUserId?: string | null;
  startDate?: Date | null;
  dueDate?: Date | null;
};

export type RecommendationChangeSource = { kind: string; payload: unknown };

/** A non-empty string, or null — payloads are stored as free-form JSON. */
function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/** A parseable ISO date string, or null. Rejects garbage before it reaches the DB. */
function isoDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  return Number.isNaN(Date.parse(raw)) ? null : raw;
}

/**
 * Translate one stored recommendation into the concrete edits approving it makes.
 * Returns `[]` when the payload is incomplete, references nothing actionable, or
 * the kind is unknown — callers treat that as "not applicable" rather than
 * silently approving a no-op.
 */
export function planChangesFor(source: RecommendationChangeSource): PlanChange[] {
  const payload = (source.payload ?? {}) as Record<string, unknown>;

  switch (source.kind) {
    case 'ahead_of_pace': {
      const subtaskId = text(payload.subtaskId);
      const startDate = isoDate(payload.newStartDate);
      if (!subtaskId || !startDate) return [];
      return [{ kind: 'reschedule', subtaskId, startDate }];
    }

    case 'deadline_risk': {
      const subtaskId = text(payload.moveSubtaskId);
      const startDate = isoDate(payload.newStartDate);
      if (!subtaskId || !startDate) return [];
      const dueDate = isoDate(payload.newDueDate);
      return [{ kind: 'reschedule', subtaskId, startDate, ...(dueDate ? { dueDate } : {}) }];
    }

    case 'inactive_member':
    case 'workload_imbalance': {
      const subtaskId = text(payload.subtaskId);
      const assigneeUserId = text(payload.toUserId);
      if (!subtaskId || !assigneeUserId) return [];
      const fromUserId = text(payload.fromUserId);
      return [
        { kind: 'reassign', subtaskId, assigneeUserId, ...(fromUserId ? { fromUserId } : {}) },
      ];
    }

    default:
      return [];
  }
}

/** Subtask ids a recommendation touches — deduped, input order preserved. */
export function affectedSubtaskIds(changes: PlanChange[]): string[] {
  return [...new Set(changes.map((change) => change.subtaskId))];
}

/** Every user id a recommendation moves work between, plus its subject. */
export function affectedUserIds(changes: PlanChange[], targetUserId: string | null): string[] {
  const ids = changes.flatMap((change) =>
    [change.assigneeUserId, change.fromUserId].filter((id): id is string => Boolean(id)),
  );
  if (targetUserId) ids.push(targetUserId);
  return [...new Set(ids)];
}

/**
 * The hypothetical plan edits equivalent to `changes`. Dates become `Date`s so
 * the plan builder receives exactly the shape it would have loaded from the DB
 * had the change already been applied.
 */
export function subtaskOverridesFor(changes: PlanChange[]): PlanSubtaskOverride[] {
  return changes.map((change) =>
    change.kind === 'reassign'
      ? { subtaskId: change.subtaskId, assigneeUserId: change.assigneeUserId ?? null }
      : {
          subtaskId: change.subtaskId,
          startDate: change.startDate ? new Date(change.startDate) : null,
          ...(change.dueDate ? { dueDate: new Date(change.dueDate) } : {}),
        },
  );
}
