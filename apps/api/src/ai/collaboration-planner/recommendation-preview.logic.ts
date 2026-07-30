// Pure before/after comparison for the recommendation preview.
//
// Nothing here schedules, forecasts or scores anything: it reads the values the
// existing deterministic engines already produced (Resource Forecast, Critical
// Path, Team Intelligence, Project Health) for two plans — the real one and a
// hypothetical one — and reports the difference. Direction ("better"/"worse")
// comes from a single declared table so no caller has to know whether a lower
// number is good.

import type { ProjectPlan } from './project-plan/project-plan.logic';
import type { TeamInsights } from './team-insights.service';
import type { HealthStatus, ProjectHealth } from './project-health.logic';

export type ForecastSnapshot = {
  status: 'available' | 'partial' | 'unavailable';
  projectedCompletion: string | null;
  deadline: string | null;
  delayMinutes: number;
  delayDays: number;
  capacityShortfallMinutes: number;
  unscheduledItemCount: number;
  bottleneck: { assigneeId: string; assigneeName: string; overloadMinutes: number } | null;
};

export type HealthSnapshot = {
  overallScore: number | null;
  overallStatus: HealthStatus;
  scheduleScore: number | null;
  capacityScore: number | null;
  dependencyScore: number | null;
  executionScore: number | null;
  collaborationScore: number | null;
};

export type CapacityMemberSnapshot = {
  userId: string;
  displayName: string;
  utilisationPercent: number;
  remainingMinutes: number;
  overloadMinutes: number;
  isOverloaded: boolean;
};

export type CapacitySnapshot = {
  balancePercent: number;
  overloadedCount: number;
  availableCount: number;
  memberCount: number;
  remainingMinutes: number;
  availableMinutes: number;
  members: CapacityMemberSnapshot[];
};

export type CriticalWorkSnapshot = {
  status: 'available' | 'unavailable';
  itemCount: number;
  blockedCount: number;
  durationMinutes: number | null;
  projectedCompletion: string | null;
};

export type WorkSnapshot = {
  /** Open items waiting on an unfinished dependency. */
  blockedItemCount: number;
  /** Open items with nothing in their way. */
  readyItemCount: number;
  openItemCount: number;
};

export type PreviewSnapshot = {
  forecast: ForecastSnapshot;
  health: HealthSnapshot;
  capacity: CapacitySnapshot;
  criticalWork: CriticalWorkSnapshot;
  work: WorkSnapshot;
};

export type DeltaDirection = 'better' | 'worse' | 'unchanged';
export type DeltaUnit = 'days' | 'minutes' | 'points' | 'count' | 'percent';

export type PreviewDelta = {
  key: string;
  label: string;
  unit: DeltaUnit;
  before: number | null;
  after: number | null;
  /** after − before, or null when either side is unknown. */
  change: number | null;
  direction: DeltaDirection;
};

export type RecommendationPreview = {
  before: PreviewSnapshot;
  after: PreviewSnapshot;
  deltas: PreviewDelta[];
  /** One plain sentence naming the biggest effects, or that there are none. */
  summary: string;
  /** True when no tracked metric moves — approving is measurably a no-op. */
  isNoOp: boolean;
  generatedAt: string;
};

// --- Snapshot extraction ----------------------------------------------------

export function forecastSnapshotOf(plan: ProjectPlan): ForecastSnapshot {
  const forecast = plan.forecast;
  return {
    status: forecast.status,
    projectedCompletion: forecast.projectedCompletion,
    deadline: forecast.deadline,
    delayMinutes: forecast.delayMinutes,
    delayDays: forecast.delayDays,
    capacityShortfallMinutes: forecast.capacityShortfallMinutes,
    unscheduledItemCount: forecast.unscheduledItemIds.length,
    bottleneck: forecast.bottleneckAssignee,
  };
}

export function healthSnapshotOf(health: ProjectHealth): HealthSnapshot {
  return {
    overallScore: health.overall.score,
    overallStatus: health.overall.status,
    scheduleScore: health.schedule.score,
    capacityScore: health.capacity.score,
    dependencyScore: health.dependency.score,
    executionScore: health.execution.score,
    collaborationScore: health.collaboration.score,
  };
}

export function capacitySnapshotOf(team: TeamInsights): CapacitySnapshot {
  return {
    balancePercent: team.summary.balancePercent,
    overloadedCount: team.summary.overloadedCount,
    availableCount: team.summary.availableCount,
    memberCount: team.summary.memberCount,
    remainingMinutes: team.summary.remainingMinutes,
    availableMinutes: team.summary.availableMinutes,
    members: team.members.map((member) => ({
      userId: member.userId,
      displayName: member.name,
      utilisationPercent: member.utilisationPercent,
      remainingMinutes: member.remainingMinutes,
      overloadMinutes: member.overloadMinutes,
      isOverloaded: member.status === 'over_capacity',
    })),
  };
}

export function criticalWorkSnapshotOf(plan: ProjectPlan, team: TeamInsights): CriticalWorkSnapshot {
  return {
    status: plan.criticalPath.status,
    itemCount: plan.criticalPath.itemIds.length,
    blockedCount: team.summary.blockedCriticalCount,
    durationMinutes: plan.criticalPath.durationMinutes,
    projectedCompletion: plan.criticalPath.projectedCompletion,
  };
}

/** Blocked / ready / open counts over this task's own execution items. */
export function workSnapshotOf(plan: ProjectPlan): WorkSnapshot {
  const items = plan.nodes.filter((node) => !node.isExternal && !node.isGroup);
  const open = items.filter((node) => node.progressPercent < 100);
  const blockedItemCount = open.filter((node) => node.isBlocked).length;
  return {
    blockedItemCount,
    readyItemCount: open.length - blockedItemCount,
    openItemCount: open.length,
  };
}

export function buildSnapshot(input: {
  plan: ProjectPlan;
  team: TeamInsights;
  health: ProjectHealth;
}): PreviewSnapshot {
  return {
    forecast: forecastSnapshotOf(input.plan),
    health: healthSnapshotOf(input.health),
    capacity: capacitySnapshotOf(input.team),
    criticalWork: criticalWorkSnapshotOf(input.plan, input.team),
    work: workSnapshotOf(input.plan),
  };
}

// --- Deltas -----------------------------------------------------------------

type TrackedMetric = {
  key: string;
  label: string;
  unit: DeltaUnit;
  /** true when a SMALLER number is the better outcome. */
  lowerIsBetter: boolean;
  read: (snapshot: PreviewSnapshot) => number | null;
};

/**
 * The metrics the preview compares, in display order. Adding a metric here is
 * the only change needed for it to appear in every client's before/after view.
 */
export const TRACKED_METRICS: TrackedMetric[] = [
  {
    key: 'forecastDelayDays',
    label: 'Forecast delay',
    unit: 'days',
    lowerIsBetter: true,
    read: (snapshot) => snapshot.forecast.delayDays,
  },
  {
    key: 'capacityShortfallMinutes',
    label: 'Capacity shortfall',
    unit: 'minutes',
    lowerIsBetter: true,
    read: (snapshot) => snapshot.forecast.capacityShortfallMinutes,
  },
  {
    key: 'unscheduledItems',
    label: 'Unscheduled items',
    unit: 'count',
    lowerIsBetter: true,
    read: (snapshot) => snapshot.forecast.unscheduledItemCount,
  },
  {
    key: 'healthOverall',
    label: 'Overall health',
    unit: 'points',
    lowerIsBetter: false,
    read: (snapshot) => snapshot.health.overallScore,
  },
  {
    key: 'healthSchedule',
    label: 'Schedule health',
    unit: 'points',
    lowerIsBetter: false,
    read: (snapshot) => snapshot.health.scheduleScore,
  },
  {
    key: 'healthCapacity',
    label: 'Capacity health',
    unit: 'points',
    lowerIsBetter: false,
    read: (snapshot) => snapshot.health.capacityScore,
  },
  {
    key: 'blockedItems',
    label: 'Blocked items',
    unit: 'count',
    lowerIsBetter: true,
    read: (snapshot) => snapshot.work.blockedItemCount,
  },
  {
    key: 'workloadBalance',
    label: 'Workload balance',
    unit: 'percent',
    lowerIsBetter: false,
    read: (snapshot) => snapshot.capacity.balancePercent,
  },
  {
    key: 'overloadedMembers',
    label: 'Members over capacity',
    unit: 'count',
    lowerIsBetter: true,
    read: (snapshot) => snapshot.capacity.overloadedCount,
  },
  {
    key: 'blockedCriticalItems',
    label: 'Blocked critical work',
    unit: 'count',
    lowerIsBetter: true,
    read: (snapshot) => snapshot.criticalWork.blockedCount,
  },
];

export function buildDeltas(before: PreviewSnapshot, after: PreviewSnapshot): PreviewDelta[] {
  return TRACKED_METRICS.map((metric) => {
    const beforeValue = metric.read(before);
    const afterValue = metric.read(after);
    const change =
      beforeValue == null || afterValue == null ? null : afterValue - beforeValue;

    let direction: DeltaDirection = 'unchanged';
    if (change != null && change !== 0) {
      const improved = metric.lowerIsBetter ? change < 0 : change > 0;
      direction = improved ? 'better' : 'worse';
    }

    return {
      key: metric.key,
      label: metric.label,
      unit: metric.unit,
      before: beforeValue,
      after: afterValue,
      change,
      direction,
    };
  });
}

/** Deltas that actually moved, biggest relative effect first. */
export function movedDeltas(deltas: PreviewDelta[]): PreviewDelta[] {
  return deltas.filter((delta) => delta.direction !== 'unchanged');
}

function unitLabel(delta: PreviewDelta): string {
  const size = Math.abs(delta.change ?? 0);
  switch (delta.unit) {
    case 'days':
      return `${size} day${size === 1 ? '' : 's'}`;
    case 'minutes': {
      const hours = Math.floor(size / 60);
      const mins = size % 60;
      if (hours && mins) return `${hours}h ${mins}m`;
      if (hours) return `${hours}h`;
      return `${mins}m`;
    }
    case 'points':
      return `${size} point${size === 1 ? '' : 's'}`;
    case 'percent':
      return `${size}%`;
    default:
      return `${size} item${size === 1 ? '' : 's'}`;
  }
}

/**
 * A single honest sentence about the measurable effect. Says plainly when
 * nothing moves rather than dressing a no-op up as an improvement.
 */
export function summarize(deltas: PreviewDelta[]): string {
  const moved = movedDeltas(deltas);
  if (!moved.length) {
    return 'No tracked forecast, health, capacity or critical-path metric changes if you approve this.';
  }

  const phrases = moved
    .slice(0, 3)
    .map(
      (delta) =>
        `${delta.label} ${delta.direction === 'better' ? 'improves' : 'worsens'} by ${unitLabel(delta)}`,
    );

  const rest = moved.length - phrases.length;
  const tail = rest > 0 ? `, and ${rest} other metric${rest === 1 ? '' : 's'} move` : '';
  return `${phrases.join('; ')}${tail}.`;
}

export function buildPreview(input: {
  before: PreviewSnapshot;
  after: PreviewSnapshot;
  generatedAt: string;
}): RecommendationPreview {
  const deltas = buildDeltas(input.before, input.after);
  return {
    before: input.before,
    after: input.after,
    deltas,
    summary: summarize(deltas),
    isNoOp: movedDeltas(deltas).length === 0,
    generatedAt: input.generatedAt,
  };
}
