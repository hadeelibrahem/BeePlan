/**
 * Pure, deterministic selection of the next best executable subtask for a Focus
 * session. No DB/IO: the caller hydrates candidates (including each subtask's
 * computed dependency readiness) so this stays trivially unit-testable.
 *
 * Pipeline: filter to eligible subtasks, then rank by an ordered list of
 * deterministic signals. A future AI signal plugs into RANKERS without touching
 * the filter or the caller.
 */

export type FocusSubtaskCandidate = {
  id: string;
  title: string;
  isDone: boolean;
  isFocusTask: boolean;
  // todo | in_progress | done | blocked | missed
  status: string;
  priority: string;
  dueDate: Date | null;
  estimatedDurationMinutes: number | null;
  orderIndex: number;
  // True when at least one of this subtask's dependencies is not yet done.
  hasOpenDependencies: boolean;
};

export type FocusSubtaskSelection = {
  subtaskId: string;
  subtaskTitle: string;
  estimatedMinutes: number | null;
  reason: string;
};

const PRIORITY_RANK: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * A subtask is eligible for a Focus session when it is incomplete, explicitly
 * flagged as a focus task, not blocked, and has no unfinished dependencies.
 * Eligibility is never inferred from duration, title, or AI.
 */
export function isFocusEligible(subtask: FocusSubtaskCandidate): boolean {
  const incomplete =
    !subtask.isDone &&
    subtask.status !== 'done' &&
    subtask.status !== 'missed';
  return (
    incomplete &&
    subtask.isFocusTask === true &&
    subtask.status !== 'blocked' &&
    !subtask.hasOpenDependencies
  );
}

/**
 * A ranker returns < 0 when `a` should come before `b`, > 0 when after, 0 when
 * indistinguishable (defer to the next ranker). RANKERS are applied in order,
 * so earlier signals dominate later ones.
 */
type Ranker = (
  a: FocusSubtaskCandidate,
  b: FocusSubtaskCandidate,
  now: Date,
) => number;

// Ordered, most-decisive signal first. To add an AI ranking hook later, insert
// it into this array — no other code needs to change.
const RANKERS: Ranker[] = [
  byDependencyReadiness,
  byDueDate,
  byPriority,
  byEstimatedDuration,
  byOrderIndex,
];

/**
 * Picks the single next best executable subtask, or null when none are
 * eligible (caller then falls back to a task-level recommendation).
 */
export function selectFocusSubtask(
  candidates: FocusSubtaskCandidate[],
  now: Date = new Date(),
): FocusSubtaskSelection | null {
  const best = rankFocusSubtasks(candidates, now)[0];
  if (!best) return null;

  return {
    subtaskId: best.id,
    subtaskTitle: best.title,
    estimatedMinutes: best.estimatedDurationMinutes ?? null,
    reason: buildSubtaskReason(best, now),
  };
}

/** Returns every eligible subtask in the deterministic Focus ordering. */
export function rankFocusSubtasks(
  candidates: FocusSubtaskCandidate[],
  now: Date = new Date(),
): FocusSubtaskCandidate[] {
  const eligible = candidates.filter(isFocusEligible);
  if (eligible.length === 0) return [];

  return [...eligible].sort((a, b) => {
    for (const rank of RANKERS) {
      const delta = rank(a, b, now);
      if (delta !== 0) return delta;
    }
    // Stable final tie-break so the pick is fully deterministic.
    return a.id.localeCompare(b.id);
  });
}

// --- rankers ---------------------------------------------------------------

// Ready subtasks (no open dependencies) rank first. All post-filter candidates
// are ready, so this is a safety net + the documented first-class signal slot.
function byDependencyReadiness(
  a: FocusSubtaskCandidate,
  b: FocusSubtaskCandidate,
): number {
  return Number(a.hasOpenDependencies) - Number(b.hasOpenDependencies);
}

// Earlier due date first; subtasks with no due date sort last. Uses a sign
// comparison (not subtraction) so two missing dates compare equal instead of
// yielding NaN (Infinity - Infinity).
function byDueDate(a: FocusSubtaskCandidate, b: FocusSubtaskCandidate): number {
  const at = a.dueDate ? a.dueDate.getTime() : Number.POSITIVE_INFINITY;
  const bt = b.dueDate ? b.dueDate.getTime() : Number.POSITIVE_INFINITY;
  if (at === bt) return 0;
  return at < bt ? -1 : 1;
}

// Higher priority first.
function byPriority(a: FocusSubtaskCandidate, b: FocusSubtaskCandidate): number {
  return (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0);
}

// Shorter estimate first (quicker executable win); unknown estimates sort last.
// Sign comparison so two unknown estimates compare equal (avoids NaN).
function byEstimatedDuration(
  a: FocusSubtaskCandidate,
  b: FocusSubtaskCandidate,
): number {
  const ae = a.estimatedDurationMinutes ?? Number.POSITIVE_INFINITY;
  const be = b.estimatedDurationMinutes ?? Number.POSITIVE_INFINITY;
  if (ae === be) return 0;
  return ae < be ? -1 : 1;
}

// Manual order (lower orderIndex first).
function byOrderIndex(
  a: FocusSubtaskCandidate,
  b: FocusSubtaskCandidate,
): number {
  return a.orderIndex - b.orderIndex;
}

// --- reason ----------------------------------------------------------------

function buildSubtaskReason(
  subtask: FocusSubtaskCandidate,
  now: Date,
): string {
  const reasons: string[] = [];

  if (subtask.dueDate) {
    const hoursUntilDue =
      (subtask.dueDate.getTime() - now.getTime()) / 3_600_000;
    if (hoursUntilDue < 0) reasons.push('overdue');
    else if (hoursUntilDue <= 24) reasons.push('due soon');
    else if (hoursUntilDue <= 72) reasons.push('due this week');
  }

  if (subtask.priority === 'urgent' || subtask.priority === 'high') {
    reasons.push('high priority');
  }

  if (subtask.status === 'in_progress') {
    reasons.push('already in progress');
  }

  if (reasons.length === 0) reasons.push('next up in your plan');

  const top = [...new Set(reasons)].slice(0, 2);
  const sentence = top.length === 1 ? top[0] : `${top[0]} and ${top[1]}`;
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}
