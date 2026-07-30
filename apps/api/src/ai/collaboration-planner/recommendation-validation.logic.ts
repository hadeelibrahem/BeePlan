// The final gate every recommendation passes immediately before it reaches a
// client. Pure and IO-free: the caller supplies live rows plus the deterministic
// simulation, and this module decides whether the card is still worth showing.
//
// The rules exist because the DETECTORS are cheap heuristics while the FORECAST
// is a real scheduler. `detectDeadlineRisk`, for example, assumes a flat 2h per
// member per day; the Resource-Aware Forecast uses each member's actual
// availability. When those two disagree, the detector is wrong and the card must
// not appear — otherwise a user reads "finishes 8 days late" on a card whose own
// preview says the delay is 0. That specific contradiction is what
// `forecast_conflict` makes impossible.
//
// Nothing here re-implements scheduling, forecasting or health scoring: every
// number consulted was produced by the existing engines and handed in.

import type { PlanChange } from './recommendation-changes';
import type { RecommendationAffectedItem } from './recommendation-detail.logic';
import type { PreviewDelta, PreviewSnapshot } from './recommendation-preview.logic';

/** Why a recommendation left "pending" without a user acting on it. */
export const RESOLUTION_REASONS = [
  'completed',
  'already_applied',
  'not_applicable',
  'missing_estimate',
  'no_impact',
  'forecast_conflict',
  'health_conflict',
  'critical_path_conflict',
  'regression',
  'superseded',
] as const;
export type ResolutionReason = (typeof RESOLUTION_REASONS)[number];

/** Short human label shown against a resolved card. */
export const RESOLUTION_LABEL: Record<ResolutionReason, string> = {
  completed: 'Completed automatically',
  already_applied: 'Already fixed',
  not_applicable: 'No longer applicable',
  missing_estimate: 'Not enough scheduling data',
  no_impact: 'No measurable effect',
  forecast_conflict: 'Contradicted by the forecast',
  health_conflict: 'Contradicted by project health',
  critical_path_conflict: 'Would harm the critical path',
  regression: 'Would make the project worse',
  superseded: 'Superseded by a newer recommendation',
};

export type ValidationVerdict =
  | { valid: true }
  | { valid: false; reason: ResolutionReason; explanation: string };

const VALID: ValidationVerdict = { valid: true };

const reject = (reason: ResolutionReason, explanation: string): ValidationVerdict => ({
  valid: false,
  reason,
  explanation,
});

export type ValidationContext = {
  kind: string;
  targetUserId: string | null;
  changes: PlanChange[];
  /** Live rows for every subtask the change touches (missing = deleted). */
  items: RecommendationAffectedItem[];
  /** True when the parent task itself is finished. */
  taskComplete: boolean;
  /** Accepted collaborators right now — a member who left is not in here. */
  acceptedMemberIds: Set<string>;
  /** Every open subtask currently assigned to `targetUserId`. */
  targetOpenItemCount: number;
  /** Deterministic project state BEFORE the change. */
  baseline: PreviewSnapshot;
  /** Deterministic project state AFTER the change (same engines, hypothetical rows). */
  projected: PreviewSnapshot;
  /** Metric-by-metric comparison of the two snapshots above. */
  deltas: PreviewDelta[];
};

// --- Per-kind premise checks ------------------------------------------------
// A detector fires on a heuristic; these confirm the deterministic engines still
// agree with the claim the card makes.

/** Kinds whose whole premise is "there is not enough time" — a forecast claim. */
const FORECAST_CLAIM_KINDS = new Set(['deadline_risk']);
/** Kinds whose premise is "the load is uneven" — a capacity/health claim. */
const CAPACITY_CLAIM_KINDS = new Set(['workload_imbalance']);
/** Kinds that reschedule work and therefore need estimates to mean anything. */
const ESTIMATE_DEPENDENT_KINDS = new Set(['deadline_risk', 'workload_imbalance']);

function premiseVerdict(context: ValidationContext): ValidationVerdict {
  const { kind, baseline } = context;

  if (FORECAST_CLAIM_KINDS.has(kind)) {
    const late =
      baseline.forecast.delayMinutes > 0 ||
      baseline.forecast.capacityShortfallMinutes > 0 ||
      baseline.forecast.unscheduledItemCount > 0;
    if (!late) {
      return reject(
        'forecast_conflict',
        'The resource-aware forecast shows this project finishing on time, so the deadline warning no longer holds.',
      );
    }
  }

  if (CAPACITY_CLAIM_KINDS.has(kind)) {
    const strained = baseline.capacity.overloadedCount > 0 || baseline.capacity.balancePercent < 70;
    if (!strained) {
      return reject(
        'health_conflict',
        'Team capacity is balanced and nobody is over capacity, so there is no imbalance to correct.',
      );
    }
  }

  // "Ahead of pace" only means anything while the member really has nothing left.
  if (kind === 'ahead_of_pace' && context.targetOpenItemCount > 0) {
    return reject(
      'not_applicable',
      'This member has open work again, so they are no longer ahead of pace.',
    );
  }

  return VALID;
}

// --- Critical path ----------------------------------------------------------

function criticalPathVerdict(context: ValidationContext): ValidationVerdict {
  const before = context.baseline.criticalWork;
  const after = context.projected.criticalWork;

  if (before.status === 'available' && after.status === 'unavailable') {
    return reject(
      'critical_path_conflict',
      'Applying this would leave the critical path uncomputable, so the schedule could no longer be validated.',
    );
  }
  if (after.blockedCount > before.blockedCount) {
    return reject(
      'critical_path_conflict',
      `Applying this would block ${after.blockedCount - before.blockedCount} more critical item(s).`,
    );
  }
  if (
    before.durationMinutes != null &&
    after.durationMinutes != null &&
    after.durationMinutes > before.durationMinutes
  ) {
    return reject(
      'critical_path_conflict',
      'Applying this would lengthen the critical path, pushing the earliest possible finish later.',
    );
  }
  return VALID;
}

// --- Impact -----------------------------------------------------------------

/** Metrics that moved, split by whether the move was an improvement. */
export function splitDeltas(deltas: PreviewDelta[]): {
  improved: PreviewDelta[];
  worsened: PreviewDelta[];
} {
  return {
    improved: deltas.filter((delta) => delta.direction === 'better'),
    worsened: deltas.filter((delta) => delta.direction === 'worse'),
  };
}

function impactVerdict(context: ValidationContext): ValidationVerdict {
  const { improved, worsened } = splitDeltas(context.deltas);

  if (!improved.length && !worsened.length) {
    return reject(
      'no_impact',
      'Applying this changes no tracked forecast, health, capacity, critical-path, blocked-work or team-balance figure.',
    );
  }
  if (!improved.length) {
    return reject(
      'regression',
      `Applying this would only make things worse (${worsened.map((delta) => delta.label.toLowerCase()).join(', ')}).`,
    );
  }
  return VALID;
}

// --- Applicability against live rows ---------------------------------------

function applicabilityVerdict(context: ValidationContext): ValidationVerdict {
  const { changes, items, taskComplete, acceptedMemberIds, targetUserId, kind } = context;

  if (!changes.length) {
    return reject(
      'not_applicable',
      'This recommendation references work that no longer exists.',
    );
  }
  if (taskComplete) {
    return reject('completed', 'This project is already complete.');
  }

  const byId = new Map(items.map((item) => [item.subtaskId, item]));

  for (const change of changes) {
    const item = byId.get(change.subtaskId);
    if (!item) {
      return reject('not_applicable', 'The work this recommendation refers to has been deleted.');
    }
    if (item.isComplete) {
      return reject('completed', `"${item.title}" is already complete.`);
    }

    if (change.kind === 'reassign') {
      const target = change.assigneeUserId;
      if (!target || !acceptedMemberIds.has(target)) {
        return reject(
          'not_applicable',
          'The member this work would move to is no longer part of this project.',
        );
      }
      if (item.assignee?.userId === target) {
        return reject('already_applied', `"${item.title}" is already assigned to that member.`);
      }
    } else if (isSameInstant(item.startDate, change.startDate) && dueMatches(item, change)) {
      return reject('already_applied', `"${item.title}" is already scheduled for those dates.`);
    }

    if (ESTIMATE_DEPENDENT_KINDS.has(kind) && item.estimatedDurationMinutes == null) {
      return reject(
        'missing_estimate',
        `"${item.title}" has no time estimate, so this recommendation's effect on the schedule cannot be established.`,
      );
    }
  }

  // The subject of the finding must still be on the project for it to make sense.
  if (targetUserId && !acceptedMemberIds.has(targetUserId)) {
    return reject(
      'not_applicable',
      'The member this recommendation is about has left the project.',
    );
  }

  return VALID;
}

function isSameInstant(stored: string | null, proposed: string | undefined): boolean {
  if (!stored || !proposed) return false;
  const a = Date.parse(stored);
  const b = Date.parse(proposed);
  return !Number.isNaN(a) && !Number.isNaN(b) && a === b;
}

/** A reschedule with no new due date only claims to move the start. */
function dueMatches(item: RecommendationAffectedItem, change: PlanChange): boolean {
  return change.dueDate ? isSameInstant(item.dueDate, change.dueDate) : true;
}

// --- Entry point ------------------------------------------------------------

/**
 * The full gate, cheapest and most definitive checks first so a deleted item is
 * never reported as "no measurable effect". Returns the FIRST failure, which is
 * the one the user is told about.
 */
export function validateRecommendation(context: ValidationContext): ValidationVerdict {
  for (const check of [applicabilityVerdict, premiseVerdict, criticalPathVerdict, impactVerdict]) {
    const verdict = check(context);
    if (!verdict.valid) return verdict;
  }
  return VALID;
}

// --- Supersession (cross-recommendation) ------------------------------------

export type SupersessionCandidate = {
  id: string;
  subtaskIds: string[];
  /** How many tracked metrics the change improves. */
  improvedCount: number;
  /** Newest first ordering input — ISO timestamp. */
  createdAt: string;
};

/**
 * Two pending recommendations that edit the SAME subtask cannot both be right —
 * approving one invalidates the other's simulation. Keep the one with the
 * stronger measured improvement (newest wins a tie) and report the rest as
 * superseded. Runs only over recommendations that already passed validation.
 */
export function findSupersededIds(candidates: SupersessionCandidate[]): Map<string, string> {
  const superseded = new Map<string, string>();
  const bySubtask = new Map<string, SupersessionCandidate[]>();

  for (const candidate of candidates) {
    for (const subtaskId of candidate.subtaskIds) {
      const group = bySubtask.get(subtaskId) ?? [];
      group.push(candidate);
      bySubtask.set(subtaskId, group);
    }
  }

  for (const group of bySubtask.values()) {
    if (group.length < 2) continue;
    const [winner] = [...group].sort(
      (a, b) =>
        b.improvedCount - a.improvedCount ||
        Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
        (a.id < b.id ? -1 : 1),
    );
    for (const candidate of group) {
      if (candidate.id !== winner.id && !superseded.has(candidate.id)) {
        superseded.set(candidate.id, winner.id);
      }
    }
  }

  return superseded;
}
