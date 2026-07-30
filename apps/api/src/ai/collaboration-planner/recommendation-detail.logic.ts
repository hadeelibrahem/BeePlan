// Pure enrichment for the AI decision loop: turns a stored recommendation row
// into everything the UI needs to answer "why?", "how was this detected?" and
// "what changes if I approve?" — with no AI and no new detection logic.
//
// Every field here is either (a) verbatim from the recommendation the existing
// deterministic detectors produced (title / message / reason), (b) a fixed
// human explanation of the detector's documented rule, or (c) a fact read off
// the affected subtask rows. Nothing is inferred or invented, and no
// recommendation is created here — this module only explains what already exists.

import { affectedSubtaskIds, type PlanChange } from './recommendation-changes';
import type { RecommendationImpact } from './recommendation-impact.logic';
import { RESOLUTION_LABEL, type ResolutionReason } from './recommendation-validation.logic';

export type RecommendationPerson = { userId: string; displayName: string };

export type RecommendationAffectedItem = {
  subtaskId: string;
  title: string;
  status: string;
  isComplete: boolean;
  assignee: RecommendationPerson | null;
  estimatedDurationMinutes: number | null;
  startDate: string | null;
  dueDate: string | null;
};

/** Why a person is listed on a recommendation. */
export type AffectedMemberRelation = 'subject' | 'from' | 'to';
export type RecommendationAffectedMember = RecommendationPerson & {
  relation: AffectedMemberRelation;
};

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unavailable';
export type RecommendationConfidence = {
  level: ConfidenceLevel;
  /**
   * The one-line justification for the level. Always populated — a confidence
   * without a stated reason is not something a user can act on.
   */
  reason: string;
  /** The plain-English data facts behind the level. */
  basis: string[];
};

export type PlanFocus = {
  itemIds?: string[];
  memberId?: string;
  blockedOnly?: boolean;
  status?: string;
};

export type RecommendationNavigation = {
  tab: 'plan' | 'team' | 'health';
  label: string;
  focus: PlanFocus;
};

export type RecommendationExplanation = {
  problem: string;
  detection: string;
  expectedImprovement: string;
  /** Concrete, checkable statements drawn from the recommendation + its items. */
  evidence: string[];
};

export type PlanChangeDescription = {
  subtaskId: string;
  subtaskTitle: string;
  kind: PlanChange['kind'];
  summary: string;
};

export type RecommendationBase = {
  id: string;
  kind: string;
  status: string;
  targetUserId: string | null;
  title: string;
  message: string;
  reason: string;
  createdAt: string;
  resolvedAt: string | null;
  /** Why it left "pending" without a user acting (null for approve/dismiss). */
  resolutionReason: ResolutionReason | null;
};

export type DetailedRecommendation = RecommendationBase & {
  kindLabel: string;
  /** Human label for `resolutionReason`, e.g. "Already fixed". */
  resolutionLabel: string | null;
  target: RecommendationPerson | null;
  explanation: RecommendationExplanation;
  confidence: RecommendationConfidence;
  /**
   * Measured before/after for the metrics that actually change, from the shared
   * simulation. Null only for resolved cards, which are no longer simulated.
   */
  impact: RecommendationImpact | null;
  affectedItems: RecommendationAffectedItem[];
  affectedMembers: RecommendationAffectedMember[];
  changes: PlanChangeDescription[];
  navigation: RecommendationNavigation;
  /** Reasons this recommendation cannot be applied right now (empty = applicable). */
  blockers: string[];
  canApprove: boolean;
  canDismiss: boolean;
  canPreview: boolean;
};

// --- Detector documentation -------------------------------------------------
// One entry per kind in RECOMMENDATION_KINDS. These strings describe the rule
// the existing detector in ai-recommendations.service.ts already implements —
// they must be kept in step with it, which is why the thresholds are named.

type KindMeta = {
  label: string;
  problem: string;
  detection: string;
  expectedImprovement: string;
  tab: RecommendationNavigation['tab'];
  navLabel: string;
};

const KIND_META: Record<string, KindMeta> = {
  ahead_of_pace: {
    label: 'Ahead of pace',
    problem: 'A contributor has finished everything assigned to them while later work sits idle.',
    detection:
      'Every item assigned to this member is complete, and another open item is scheduled to start within the next 7 days.',
    expectedImprovement:
      'Starting the later item now pulls its finish date earlier and buys back slack before the deadline.',
    tab: 'plan',
    navLabel: 'Open in Plan',
  },
  inactive_member: {
    label: 'Quiet member',
    problem: 'Open work has sat untouched, with no activity from the person who owns it.',
    detection:
      'No task activity was logged by this member for 3 or more days, while an item they own had already been due to start.',
    expectedImprovement:
      'Moving the item to the member with the most room gets it progressing again instead of waiting.',
    tab: 'team',
    navLabel: 'Open in Team',
  },
  deadline_risk: {
    label: 'Deadline risk',
    problem: 'The remaining work is larger than the time left before the deadline.',
    detection:
      'Open estimated minutes exceed what the team can absorb in the days remaining, counting a deliberately conservative 2 hours per member per day toward this task.',
    expectedImprovement:
      'Pulling the next item forward starts the backlog sooner and reduces the projected overrun.',
    tab: 'plan',
    navLabel: 'Open in Plan',
  },
  workload_imbalance: {
    label: 'Workload imbalance',
    problem: 'One member is carrying substantially more remaining work than another.',
    detection:
      'The busiest member holds at least 1.5× the remaining minutes of the least-loaded member, with a gap of at least 1 hour.',
    expectedImprovement:
      'Reassigning the largest not-yet-started item evens out utilisation and removes a single-person bottleneck.',
    tab: 'team',
    navLabel: 'Open in Team',
  },
};

const UNKNOWN_KIND: KindMeta = {
  label: 'Recommendation',
  problem: 'The project planner flagged something worth a decision.',
  detection: 'Raised by a deterministic project-planner check.',
  expectedImprovement: 'Approving applies the change described below.',
  tab: 'plan',
  navLabel: 'Open in Plan',
};

export function metaForKind(kind: string): KindMeta {
  return KIND_META[kind] ?? UNKNOWN_KIND;
}

const DONE_STATUSES = new Set(['done', 'missed']);

// --- Confidence -------------------------------------------------------------

/**
 * How much the deterministic engines actually knew when they measured this
 * recommendation's effect. NOT a probability that the advice is correct — the
 * detectors and the forecast are deterministic, so the only real uncertainty is
 * missing input (an item with no estimate cannot move the schedule).
 *
 *   high        — complete scheduling data; the measured impact is exact.
 *   medium      — minor uncertainty; the impact holds but some detail is assumed.
 *   low         — several assumptions required; treat the impact as indicative.
 *   unavailable — not enough project data to say anything.
 *
 * Deliberately expressed as a level with a reason and never as a percentage: a
 * number invites precision the underlying data does not support, and "0%" told
 * the user nothing except that something was wrong.
 */
export function confidenceFor(input: {
  changes: PlanChange[];
  items: RecommendationAffectedItem[];
  /** Forecast quality from the shared simulation baseline, when one exists. */
  forecastStatus?: 'available' | 'partial' | 'unavailable';
}): RecommendationConfidence {
  const { changes, items, forecastStatus } = input;

  if (!items.length || !changes.length) {
    return {
      level: 'unavailable',
      reason: 'Insufficient project data',
      basis: ['The work behind this recommendation could not be resolved.'],
    };
  }
  if (forecastStatus === 'unavailable') {
    return {
      level: 'unavailable',
      reason: 'Insufficient project data',
      basis: [
        'The resource-aware forecast cannot run for this project yet, so the effect of this change cannot be measured.',
      ],
    };
  }

  const basis: string[] = [];
  const withoutEstimate = items.filter((item) => item.estimatedDurationMinutes == null);
  const unassigned = items.filter((item) => !item.assignee);
  const reschedulingIds = new Set(
    changes.filter((change) => change.kind === 'reschedule').map((change) => change.subtaskId),
  );
  const rescheduledWithoutDue = items.filter(
    (item) => reschedulingIds.has(item.subtaskId) && !item.dueDate,
  );

  if (withoutEstimate.length) {
    basis.push(
      `${withoutEstimate.length} affected item${withoutEstimate.length === 1 ? ' has' : 's have'} no time estimate, so the schedule effect is assumed rather than measured.`,
    );
  } else {
    basis.push('Every affected item has a time estimate.');
  }
  if (unassigned.length) {
    basis.push(
      `${unassigned.length} affected item${unassigned.length === 1 ? ' has' : 's have'} no assignee, so the forecast cannot place ${unassigned.length === 1 ? 'it' : 'them'} against real availability.`,
    );
  }
  if (rescheduledWithoutDue.length) {
    basis.push(
      `${rescheduledWithoutDue.length} item${rescheduledWithoutDue.length === 1 ? '' : 's'} being rescheduled ${rescheduledWithoutDue.length === 1 ? 'has' : 'have'} no due date, so only the start date moves.`,
    );
  }
  if (forecastStatus === 'partial') {
    basis.push('Part of the project could not be scheduled, so the forecast is partial.');
  }

  // Missing estimates or assignees force real assumptions; a partial forecast or
  // a start-only reschedule is a smaller, well-understood gap.
  const assumptionCount = withoutEstimate.length + unassigned.length;
  if (assumptionCount > 1) {
    return { level: 'low', reason: 'Several assumptions required', basis };
  }
  if (assumptionCount === 1 || rescheduledWithoutDue.length || forecastStatus === 'partial') {
    return { level: 'medium', reason: 'Minor estimate uncertainty', basis };
  }
  return { level: 'high', reason: 'Complete scheduling data', basis };
}

// --- Applicability ----------------------------------------------------------

/**
 * Why this recommendation can't be applied. Checked against live rows, so a card
 * that went stale between detection and the user's click explains itself instead
 * of failing on approve.
 */
export function blockersFor(input: {
  changes: PlanChange[];
  items: RecommendationAffectedItem[];
  status: string;
}): string[] {
  const { changes, items, status } = input;
  if (status !== 'pending') return [];

  const blockers: string[] = [];
  if (!changes.length) {
    blockers.push('This recommendation no longer describes a change that can be applied.');
    return blockers;
  }

  const byId = new Map(items.map((item) => [item.subtaskId, item]));
  for (const change of changes) {
    const item = byId.get(change.subtaskId);
    if (!item) {
      blockers.push('The item this recommendation refers to no longer exists.');
      continue;
    }
    if (item.isComplete) {
      blockers.push(`"${item.title}" is already complete.`);
      continue;
    }
    if (
      change.kind === 'reassign' &&
      change.assigneeUserId &&
      item.assignee?.userId === change.assigneeUserId
    ) {
      blockers.push(`"${item.title}" is already assigned to ${item.assignee.displayName}.`);
    }
  }
  return [...new Set(blockers)];
}

// --- Evidence ---------------------------------------------------------------

function minutesLabel(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
}

/**
 * Checkable facts: the (forecast-aligned) reason plus the state of each affected
 * item.
 *
 * Completed work is deliberately EXCLUDED. Evidence is the case for acting, and
 * a finished item is not something anyone can act on — listing it invites a user
 * to reason from work that is already done. Validation normally resolves a
 * recommendation whose target completed, so this is the second line of defence
 * for a multi-item recommendation where only some work finished.
 */
export function evidenceFor(input: {
  reason: string;
  items: RecommendationAffectedItem[];
  target: RecommendationPerson | null;
}): string[] {
  const evidence: string[] = [input.reason];

  for (const item of input.items) {
    if (item.isComplete) continue;
    const parts: string[] = [];
    parts.push(item.assignee ? `assigned to ${item.assignee.displayName}` : 'unassigned');
    parts.push(
      item.estimatedDurationMinutes != null
        ? `estimated ${minutesLabel(item.estimatedDurationMinutes)}`
        : 'no estimate',
    );
    parts.push(`status ${item.status}`);
    evidence.push(`"${item.title}" — ${parts.join(', ')}.`);
  }

  if (input.target) {
    evidence.push(`Subject of the finding: ${input.target.displayName}.`);
  }
  return evidence;
}

// --- Change descriptions ----------------------------------------------------

/** One human sentence per concrete edit approving this recommendation performs. */
export function describeChanges(input: {
  changes: PlanChange[];
  items: RecommendationAffectedItem[];
  peopleById: Map<string, string>;
}): PlanChangeDescription[] {
  const byId = new Map(input.items.map((item) => [item.subtaskId, item]));
  const name = (userId: string | undefined | null) =>
    (userId ? input.peopleById.get(userId) : null) ?? 'another member';

  return input.changes.map((change) => {
    const item = byId.get(change.subtaskId);
    const subtaskTitle = item?.title ?? 'Unknown item';

    if (change.kind === 'reassign') {
      const from = item?.assignee?.displayName ?? name(change.fromUserId);
      return {
        subtaskId: change.subtaskId,
        subtaskTitle,
        kind: change.kind,
        summary: `Reassign "${subtaskTitle}" from ${from} to ${name(change.assigneeUserId)}.`,
      };
    }

    const summary = change.dueDate
      ? `Move "${subtaskTitle}" to start ${change.startDate} and finish by ${change.dueDate}.`
      : `Move "${subtaskTitle}" to start ${change.startDate}.`;
    return { subtaskId: change.subtaskId, subtaskTitle, kind: change.kind, summary };
  });
}

// --- Assembly ---------------------------------------------------------------

/**
 * Assemble the full detail payload for one recommendation. `viewerRole` decides
 * only what the CLIENT may offer — the server still re-checks editor+ on
 * approve/dismiss, so this is a UI affordance, never the security boundary.
 */
export function buildDetailedRecommendation(input: {
  recommendation: RecommendationBase;
  changes: PlanChange[];
  items: RecommendationAffectedItem[];
  peopleById: Map<string, string>;
  viewerRole: 'owner' | 'editor' | 'viewer';
  /** Measured effect from the shared simulation; absent for resolved cards. */
  impact?: RecommendationImpact | null;
  /** Forecast quality from the shared simulation baseline. */
  forecastStatus?: 'available' | 'partial' | 'unavailable';
  /**
   * Text with every quantitative claim restated from the deterministic engines.
   * When absent (resolved cards, which are not simulated) the stored text stands.
   */
  alignedText?: { title: string; message: string; reason: string };
}): DetailedRecommendation {
  const { recommendation, changes, items, peopleById, viewerRole } = input;
  const meta = metaForKind(recommendation.kind);
  const isPending = recommendation.status === 'pending';
  const text = input.alignedText ?? recommendation;

  const target: RecommendationPerson | null = recommendation.targetUserId
    ? {
        userId: recommendation.targetUserId,
        displayName: peopleById.get(recommendation.targetUserId) ?? 'Member',
      }
    : null;

  const blockers = blockersFor({ changes, items, status: recommendation.status });
  const confidence = confidenceFor({ changes, items, forecastStatus: input.forecastStatus });

  const affectedMembers = buildAffectedMembers({ changes, items, target, peopleById });
  const canAct = isPending && viewerRole !== 'viewer';

  return {
    ...recommendation,
    // Forecast-aligned text replaces the detector's guessed numbers.
    title: text.title,
    message: text.message,
    reason: text.reason,
    kindLabel: meta.label,
    resolutionLabel: recommendation.resolutionReason
      ? RESOLUTION_LABEL[recommendation.resolutionReason]
      : null,
    target,
    explanation: {
      problem: meta.problem,
      detection: meta.detection,
      expectedImprovement: meta.expectedImprovement,
      evidence: evidenceFor({ reason: text.reason, items, target }),
    },
    confidence,
    impact: input.impact ?? null,
    affectedItems: items,
    affectedMembers,
    changes: describeChanges({ changes, items, peopleById }),
    navigation: {
      tab: meta.tab,
      label: meta.navLabel,
      focus:
        meta.tab === 'team'
          ? { memberId: target?.userId ?? affectedMembers[0]?.userId }
          : { itemIds: affectedSubtaskIds(changes) },
    },
    blockers,
    canApprove: canAct && blockers.length === 0,
    canDismiss: canAct,
    // Viewers may always inspect a pending recommendation — they just can't act.
    canPreview: isPending && changes.length > 0,
  };
}

function buildAffectedMembers(input: {
  changes: PlanChange[];
  items: RecommendationAffectedItem[];
  target: RecommendationPerson | null;
  peopleById: Map<string, string>;
}): RecommendationAffectedMember[] {
  const { changes, items, target, peopleById } = input;
  const byRelation = new Map<string, RecommendationAffectedMember>();
  const add = (userId: string | undefined | null, relation: AffectedMemberRelation) => {
    if (!userId || byRelation.has(userId)) return;
    byRelation.set(userId, {
      userId,
      displayName: peopleById.get(userId) ?? 'Member',
      relation,
    });
  };

  // Subject first (the member the finding is about), then who work moves between.
  add(target?.userId, 'subject');
  const byId = new Map(items.map((item) => [item.subtaskId, item]));
  for (const change of changes) {
    add(change.fromUserId ?? byId.get(change.subtaskId)?.assignee?.userId, 'from');
    add(change.assigneeUserId, 'to');
  }
  return [...byRelation.values()];
}

/** Map a live subtask row onto the affected-item shape (status drives completeness). */
export function toAffectedItem(row: {
  id: string;
  title: string;
  status: string;
  isDone: boolean;
  assigneeUserId: string | null;
  estimatedDurationMinutes: number | null;
  startDate: Date | null;
  dueDate: Date | null;
}, peopleById: Map<string, string>): RecommendationAffectedItem {
  return {
    subtaskId: row.id,
    title: row.title,
    status: row.status,
    isComplete: row.isDone || DONE_STATUSES.has(row.status),
    assignee: row.assigneeUserId
      ? {
          userId: row.assigneeUserId,
          displayName: peopleById.get(row.assigneeUserId) ?? 'Member',
        }
      : null,
    estimatedDurationMinutes: row.estimatedDurationMinutes,
    startDate: row.startDate ? row.startDate.toISOString() : null,
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
  };
}
