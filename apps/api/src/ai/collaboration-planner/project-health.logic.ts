// Deterministic Project Health scoring. NO AI, NO client formulas — every score
// is a pure function of values already derived by the Critical Path, the
// Resource-Aware Forecast, the Resource Lanes, Team Intelligence, and Focus
// sessions. This module never re-derives scheduling/forecast/capacity; it only
// blends the numbers those systems already produced into 0–100 health metrics
// with a status + a plain-English reason. Same input ⇒ identical output.
//
// Weight documentation (all weights sum to 1 within each metric):
//   Overall        = 0.25 Schedule + 0.20 Capacity + 0.20 Dependency
//                  + 0.20 Execution + 0.10 Collaboration + 0.05 Focus
//                    (Focus weight is redistributed pro-rata when it has no data)
//   Schedule       = 0.40 Forecast + 0.30 CriticalPath + 0.20 Deadline + 0.10 Progress
//   Capacity       = 0.50 Shortfall + 0.30 Overload + 0.20 Utilisation
//   Dependency     = 100 − cycle − blocked − criticalBlocked − longChain penalties
//   Execution      = 0.35 Completion + 0.25 Confidence + 0.25 Ready + 0.15 Started
//   Focus          = 0.60 Completion + 0.40 Efficiency (no_data when < 1 finished session)
//   Collaboration  = 0.40 Coverage + 0.30 Balance + 0.30 Participation

export type HealthStatus = 'healthy' | 'balanced' | 'warning' | 'at_risk' | 'critical' | 'no_data';

export type MetricHealth = {
  score: number | null;
  status: HealthStatus;
  reason: string;
  details: Record<string, number | string | boolean | null>;
};

export type HealthContributor = { tone: 'positive' | 'negative'; text: string };
export type HealthWarningGroup = 'Critical' | 'Blocked' | 'Capacity' | 'Forecast' | 'Focus' | 'Assignments' | 'Dependency';
export type HealthWarning = { group: HealthWarningGroup; severity: 'critical' | 'warning'; message: string; link: 'plan' | 'team' | 'health' };

export type ProjectHealth = {
  overall: MetricHealth;
  schedule: MetricHealth;
  capacity: MetricHealth;
  dependency: MetricHealth;
  execution: MetricHealth;
  focus: MetricHealth;
  collaboration: MetricHealth;
  contributors: { positive: HealthContributor[]; negative: HealthContributor[] };
  warnings: HealthWarning[];
  trend: { available: boolean; points: { label: string; score: number }[]; reason: string | null };
  generatedAt: string;
  formulaVersion: string;
};

export type FocusAggregate = {
  totalSessions: number;
  completedSessions: number;
  cancelledSessions: number;
  focusMinutes: number; // sum of actual minutes across all sessions
  actualMinutesCompleted: number;
  plannedMinutesCompleted: number;
  avgSessionMinutes: number;
};

export type HealthInputs = {
  now: Date;
  // Schedule signals (from the Resource Forecast + Critical Path)
  forecastStatus: 'available' | 'partial' | 'unavailable';
  delayMinutes: number;
  delayDays: number;
  projectedCompletionMs: number | null;
  deadlineMs: number | null;
  criticalPathAvailable: boolean;
  criticalItemCount: number;
  lateCriticalCount: number;
  // Item roll-ups (from the Project Plan nodes + scheduling)
  totalItems: number;
  completedItems: number;
  blockedItems: number;
  readyItems: number;
  startedItems: number;
  scheduledItems: number;
  unscheduledItems: number;
  criticalBlockedItems: number;
  remainingMinutes: number;
  maxLayer: number;
  cyclePresent: boolean;
  // Capacity / team (from Resource Lanes + Team Intelligence)
  capacityShortfallMinutes: number;
  overloadedCount: number;
  availableCount: number;
  memberCount: number;
  balancePercent: number;
  membersWithWork: number;
  totalAvailableMinutes: number;
  // Assignment
  assignedItems: number;
  unassignedItems: number;
  unassignedMinutes: number;
  ownerHasWork: boolean;
  editorCount: number;
  editorsWithWork: number;
  // Focus
  focus: FocusAggregate | null;
};

export const HEALTH_FORMULA_VERSION = 'project-health-v1';

// --- Helpers ----------------------------------------------------------------

const clamp = (value: number, min = 0, max = 100): number => Math.max(min, Math.min(max, value));
const pct = (part: number, whole: number): number => (whole > 0 ? clamp(Math.round((part / whole) * 100)) : 0);

/** Five-level status from a 0–100 score. Shared by every metric and the overall. */
export function statusForScore(score: number): HealthStatus {
  if (score >= 85) return 'healthy';
  if (score >= 70) return 'balanced';
  if (score >= 55) return 'warning';
  if (score >= 40) return 'at_risk';
  return 'critical';
}

const round = (value: number): number => Math.round(value);

// --- Section 3: Schedule Health ---------------------------------------------

export function scheduleHealth(input: HealthInputs): MetricHealth {
  const { now, delayDays, projectedCompletionMs, deadlineMs } = input;
  const nowMs = now.getTime();

  // Forecast (40%): on-time = 100, each late day costs 20 points.
  const forecastScore =
    input.forecastStatus === 'unavailable' ? 40 : clamp(100 - delayDays * 20);

  // Critical Path (30%): unavailable path is a schedule failure; else penalise late critical work.
  const criticalPathScore = input.criticalPathAvailable ? clamp(100 - input.lateCriticalCount * 25) : 0;

  // Deadline (20%): buffer between the projected finish and the deadline.
  let deadlineScore: number;
  if (deadlineMs == null) deadlineScore = 100; // no deadline pressure (documented)
  else if (projectedCompletionMs == null) deadlineScore = 50;
  else if (nowMs > deadlineMs && input.completedItems < input.totalItems) deadlineScore = 0;
  else {
    const window = deadlineMs - nowMs;
    const buffer = deadlineMs - projectedCompletionMs;
    deadlineScore = window > 0 ? clamp(round((buffer / window) * 100)) : projectedCompletionMs <= deadlineMs ? 100 : 0;
  }

  // Completed progress (10%).
  const progressScore = pct(input.completedItems, input.totalItems);

  const score = round(0.4 * forecastScore + 0.3 * criticalPathScore + 0.2 * deadlineScore + 0.1 * progressScore);
  const reason = !input.criticalPathAvailable
    ? 'Critical Path is unavailable, so the schedule cannot be validated.'
    : delayDays > 0
      ? `Forecast finishes ${delayDays} day${delayDays === 1 ? '' : 's'} past the deadline.`
      : input.lateCriticalCount > 0
        ? `${input.lateCriticalCount} critical item(s) are running late.`
        : 'Forecast completes within the deadline.';
  return {
    score,
    status: statusForScore(score),
    reason,
    details: { forecastScore, criticalPathScore, deadlineScore, progressScore, delayDays, lateCriticalCount: input.lateCriticalCount },
  };
}

// --- Section 4: Capacity Health ---------------------------------------------

export function capacityHealth(input: HealthInputs): MetricHealth {
  // Shortfall (50%): unscheduled minutes as a share of the remaining work.
  const shortfallScore =
    input.remainingMinutes > 0
      ? clamp(100 - round((input.capacityShortfallMinutes / input.remainingMinutes) * 100))
      : input.capacityShortfallMinutes > 0
        ? 0
        : 100;
  // Overload (30%): share of members over capacity.
  const overloadScore = input.memberCount > 0 ? clamp(100 - round((input.overloadedCount / input.memberCount) * 100)) : 100;
  // Utilisation balance (20%): reuse Team Intelligence balance.
  const utilisationScore = clamp(input.balancePercent);

  const score = round(0.5 * shortfallScore + 0.3 * overloadScore + 0.2 * utilisationScore);
  const reason =
    input.capacityShortfallMinutes > 0
      ? `Capacity shortfall of ${input.capacityShortfallMinutes} min across the team.`
      : input.overloadedCount > 0
        ? `${input.overloadedCount} member(s) are over capacity.`
        : 'The team has enough capacity for the remaining work.';
  return {
    score,
    status: statusForScore(score),
    reason,
    details: { shortfallScore, overloadScore, utilisationScore, capacityShortfallMinutes: input.capacityShortfallMinutes, overloadedCount: input.overloadedCount },
  };
}

// --- Section 5: Dependency Health -------------------------------------------

export function dependencyHealth(input: HealthInputs): MetricHealth {
  const incomplete = input.totalItems - input.completedItems;
  const blockedFraction = incomplete > 0 ? input.blockedItems / incomplete : 0;
  const cyclePenalty = input.cyclePresent ? 60 : 0;
  const blockedPenalty = round(blockedFraction * 40);
  const criticalBlockedPenalty = Math.min(30, input.criticalBlockedItems * 15);
  const longChainPenalty = input.maxLayer >= 5 ? Math.min(15, (input.maxLayer - 4) * 5) : 0;

  const score = clamp(100 - cyclePenalty - blockedPenalty - criticalBlockedPenalty - longChainPenalty);
  const reason = input.cyclePresent
    ? 'A circular dependency is breaking the plan.'
    : input.criticalBlockedItems > 0
      ? `${input.criticalBlockedItems} critical item(s) are blocked.`
      : input.blockedItems > 0
        ? `${input.blockedItems} item(s) are blocked by unfinished dependencies.`
        : 'Dependencies are healthy — nothing is blocked.';
  return {
    score,
    status: statusForScore(score),
    reason,
    details: { cyclePresent: input.cyclePresent, blockedItems: input.blockedItems, criticalBlockedItems: input.criticalBlockedItems, longestChain: input.maxLayer + 1, criticalPathAvailable: input.criticalPathAvailable },
  };
}

// --- Section 6: Execution Health --------------------------------------------

export function executionHealth(input: HealthInputs): MetricHealth {
  const incomplete = input.totalItems - input.completedItems;
  const completionScore = pct(input.completedItems, input.totalItems);
  const confidenceScore = incomplete > 0 ? pct(input.scheduledItems, incomplete) : 100;
  const readyScore = incomplete > 0 ? pct(input.readyItems, incomplete) : 100;
  const startedScore = incomplete > 0 ? pct(input.startedItems, incomplete) : 100;

  const score = round(0.35 * completionScore + 0.25 * confidenceScore + 0.25 * readyScore + 0.15 * startedScore);
  const reason =
    input.totalItems === 0
      ? 'No execution items yet.'
      : input.unscheduledItems > 0
        ? `${input.unscheduledItems} item(s) cannot be forecast (unassigned, unestimated, or blocked).`
        : input.readyItems > 0
          ? `${input.readyItems} item(s) are ready to work now.`
          : 'Execution is progressing steadily.';
  return {
    score,
    status: statusForScore(score),
    reason,
    details: { completionScore, confidenceScore, readyScore, startedScore, readyItems: input.readyItems, blockedItems: input.blockedItems, scheduledItems: input.scheduledItems },
  };
}

// --- Section 7: Focus Health ------------------------------------------------

export function focusHealth(input: HealthInputs): MetricHealth {
  const focus = input.focus;
  const finished = focus ? focus.completedSessions + focus.cancelledSessions : 0;
  if (!focus || finished < 1) {
    return {
      score: null,
      status: 'no_data',
      reason: 'Not enough focus history to score focus health.',
      details: { totalSessions: focus?.totalSessions ?? 0 },
    };
  }
  const completionRate = focus.totalSessions > 0 ? focus.completedSessions / focus.totalSessions : 0;
  const efficiency = focus.plannedMinutesCompleted > 0 ? clamp((focus.actualMinutesCompleted / focus.plannedMinutesCompleted) * 100) / 100 : completionRate;
  const score = round(100 * (0.6 * completionRate + 0.4 * efficiency));
  const reason =
    focus.cancelledSessions > 0
      ? `${focus.cancelledSessions} of ${focus.totalSessions} focus sessions were interrupted.`
      : `${focus.completedSessions} focus session(s) completed cleanly.`;
  return {
    score,
    status: statusForScore(score),
    reason,
    details: {
      focusMinutes: focus.focusMinutes,
      completedSessions: focus.completedSessions,
      cancelledSessions: focus.cancelledSessions,
      avgSessionMinutes: focus.avgSessionMinutes,
      efficiencyPercent: round(efficiency * 100),
      completionPercent: round(completionRate * 100),
    },
  };
}

// --- Section 8: Collaboration Health ----------------------------------------

export function collaborationHealth(input: HealthInputs): MetricHealth {
  const coverageScore = pct(input.assignedItems, input.totalItems);
  const balanceScore = clamp(input.balancePercent);
  const participationScore = input.memberCount > 0 ? pct(input.membersWithWork, input.memberCount) : 100;

  const score = round(0.4 * coverageScore + 0.3 * balanceScore + 0.3 * participationScore);
  const reason =
    input.unassignedItems > 0
      ? `${input.unassignedItems} item(s) are unassigned.`
      : input.membersWithWork < input.memberCount
        ? 'Some members have no assigned work.'
        : 'Work is assigned and shared across the team.';
  return {
    score,
    status: statusForScore(score),
    reason,
    details: { coverageScore, balanceScore, participationScore, unassignedItems: input.unassignedItems, membersWithWork: input.membersWithWork, memberCount: input.memberCount },
  };
}

// --- Section 1: Overall Health ----------------------------------------------

const BASE_WEIGHTS = { schedule: 0.25, capacity: 0.2, dependency: 0.2, execution: 0.2, collaboration: 0.1, focus: 0.05 } as const;

export function overallHealth(metrics: {
  schedule: MetricHealth;
  capacity: MetricHealth;
  dependency: MetricHealth;
  execution: MetricHealth;
  collaboration: MetricHealth;
  focus: MetricHealth;
}): MetricHealth {
  const entries: { key: keyof typeof BASE_WEIGHTS; metric: MetricHealth }[] = [
    { key: 'schedule', metric: metrics.schedule },
    { key: 'capacity', metric: metrics.capacity },
    { key: 'dependency', metric: metrics.dependency },
    { key: 'execution', metric: metrics.execution },
    { key: 'collaboration', metric: metrics.collaboration },
    { key: 'focus', metric: metrics.focus },
  ];
  // Drop metrics with no score (e.g. Focus with no history) and re-normalise weights.
  const scored = entries.filter((entry) => entry.metric.score != null);
  const totalWeight = scored.reduce((sum, entry) => sum + BASE_WEIGHTS[entry.key], 0) || 1;
  const score = round(scored.reduce((sum, entry) => sum + BASE_WEIGHTS[entry.key] * (entry.metric.score as number), 0) / totalWeight);

  const status = statusForScore(score);
  const weakest = [...scored].sort((a, b) => (a.metric.score as number) - (b.metric.score as number))[0];
  const reason =
    status === 'healthy'
      ? 'The project is healthy across every tracked dimension.'
      : weakest
        ? `${labelFor(weakest.key)} needs attention first (${weakest.metric.score}%).`
        : 'Not enough data to assess project health.';
  return { score, status, reason, details: { weakestArea: weakest ? labelFor(weakest.key) : null, scoredDimensions: scored.length } };
}

function labelFor(key: keyof typeof BASE_WEIGHTS): string {
  return { schedule: 'Schedule', capacity: 'Capacity', dependency: 'Dependency', execution: 'Execution', collaboration: 'Collaboration', focus: 'Focus' }[key];
}

// --- Section 9 & 11: Contributors + grouped warnings ------------------------

export function buildContributors(input: HealthInputs, metrics: { focus: MetricHealth }): { positive: HealthContributor[]; negative: HealthContributor[] } {
  const positive: HealthContributor[] = [];
  const negative: HealthContributor[] = [];

  if (input.delayMinutes === 0 && input.forecastStatus !== 'unavailable') positive.push({ tone: 'positive', text: 'Forecast is on time' });
  else if (input.delayDays > 0) negative.push({ tone: 'negative', text: `Forecast is ${input.delayDays} day${input.delayDays === 1 ? '' : 's'} late` });

  if (input.memberCount >= 2 && input.balancePercent >= 70) positive.push({ tone: 'positive', text: 'Team workload balanced' });
  else if (input.overloadedCount > 0) negative.push({ tone: 'negative', text: `${input.overloadedCount} member(s) over capacity` });

  if (input.criticalBlockedItems > 0) negative.push({ tone: 'negative', text: `${input.criticalBlockedItems} blocked critical task(s)` });
  else if (input.blockedItems === 0 && input.totalItems > 0) positive.push({ tone: 'positive', text: 'No blocked work' });

  if (input.capacityShortfallMinutes > 0) negative.push({ tone: 'negative', text: `Capacity shortfall ${formatMinutes(input.capacityShortfallMinutes)}` });
  if (input.unassignedItems > 0) negative.push({ tone: 'negative', text: `${input.unassignedItems} item(s) unassigned` });
  else if (input.totalItems > 0) positive.push({ tone: 'positive', text: 'All work is assigned' });

  if (input.cyclePresent) negative.push({ tone: 'negative', text: 'A dependency cycle is blocking the plan' });
  if (input.totalItems > 0 && input.completedItems === input.totalItems) positive.push({ tone: 'positive', text: 'All work completed' });
  if (metrics.focus.status === 'no_data') negative.push({ tone: 'negative', text: 'Not enough focus history' });
  else if (metrics.focus.score != null && metrics.focus.score >= 70) positive.push({ tone: 'positive', text: 'Focus sessions are effective' });

  return { positive, negative };
}

export function buildWarnings(input: HealthInputs): HealthWarning[] {
  const warnings: HealthWarning[] = [];
  if (input.cyclePresent) warnings.push({ group: 'Dependency', severity: 'critical', message: 'A circular dependency prevents scheduling. Fix the loop in Plan.', link: 'plan' });
  if (!input.criticalPathAvailable) warnings.push({ group: 'Critical', severity: 'critical', message: 'Critical Path is unavailable — add missing estimates in Plan.', link: 'plan' });
  if (input.criticalBlockedItems > 0) warnings.push({ group: 'Critical', severity: 'critical', message: `${input.criticalBlockedItems} critical item(s) are blocked.`, link: 'plan' });
  if (input.blockedItems > 0) warnings.push({ group: 'Blocked', severity: 'warning', message: `${input.blockedItems} item(s) are blocked by unfinished dependencies.`, link: 'plan' });
  if (input.delayDays > 0) warnings.push({ group: 'Forecast', severity: 'warning', message: `Forecast finishes ${input.delayDays} day(s) after the deadline.`, link: 'plan' });
  if (input.capacityShortfallMinutes > 0) warnings.push({ group: 'Capacity', severity: 'warning', message: `Capacity shortfall of ${formatMinutes(input.capacityShortfallMinutes)}.`, link: 'team' });
  if (input.overloadedCount > 0) warnings.push({ group: 'Capacity', severity: 'warning', message: `${input.overloadedCount} member(s) are over capacity.`, link: 'team' });
  if (input.unassignedItems > 0) warnings.push({ group: 'Assignments', severity: 'warning', message: `${input.unassignedItems} item(s) have no assignee.`, link: 'team' });
  if (input.focus && input.focus.cancelledSessions > 0 && input.focus.cancelledSessions >= input.focus.completedSessions)
    warnings.push({ group: 'Focus', severity: 'warning', message: `${input.focus.cancelledSessions} focus session(s) were interrupted.`, link: 'health' });
  return warnings;
}

function formatMinutes(value: number): string {
  const total = Math.max(0, Math.round(value));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
}

// --- Assembly ---------------------------------------------------------------

export function buildProjectHealth(input: HealthInputs): ProjectHealth {
  const schedule = scheduleHealth(input);
  const capacity = capacityHealth(input);
  const dependency = dependencyHealth(input);
  const execution = executionHealth(input);
  const focus = focusHealth(input);
  const collaboration = collaborationHealth(input);
  const overall = overallHealth({ schedule, capacity, dependency, execution, collaboration, focus });

  return {
    overall,
    schedule,
    capacity,
    dependency,
    execution,
    focus,
    collaboration,
    contributors: buildContributors(input, { focus }),
    warnings: buildWarnings(input),
    // Historical health is not persisted, so a trend is never invented.
    trend: { available: false, points: [], reason: 'No historical health snapshots yet.' },
    generatedAt: input.now.toISOString(),
    formulaVersion: HEALTH_FORMULA_VERSION,
  };
}
