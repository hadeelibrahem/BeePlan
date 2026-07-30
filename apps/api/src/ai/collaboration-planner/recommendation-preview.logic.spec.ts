import {
  buildDeltas,
  buildPreview,
  buildSnapshot,
  capacitySnapshotOf,
  criticalWorkSnapshotOf,
  forecastSnapshotOf,
  healthSnapshotOf,
  movedDeltas,
  summarize,
  workSnapshotOf,
  type PreviewSnapshot,
} from './recommendation-preview.logic';
import type { ProjectPlan } from './project-plan/project-plan.logic';
import type { TeamInsights } from './team-insights.service';
import type { ProjectHealth } from './project-health.logic';

const NOW = '2026-07-27T12:00:00.000Z';

function snapshot(over: {
  delayDays?: number;
  shortfall?: number;
  unscheduled?: number;
  overall?: number | null;
  schedule?: number | null;
  capacityScore?: number | null;
  balance?: number;
  overloaded?: number;
  blockedCritical?: number;
  blockedItems?: number;
} = {}): PreviewSnapshot {
  return {
    forecast: {
      status: 'available',
      projectedCompletion: NOW,
      deadline: NOW,
      delayMinutes: (over.delayDays ?? 0) * 1440,
      delayDays: over.delayDays ?? 0,
      capacityShortfallMinutes: over.shortfall ?? 0,
      unscheduledItemCount: over.unscheduled ?? 0,
      bottleneck: null,
    },
    health: {
      // `in` rather than `??` so a deliberate null (a no-data metric) survives.
      overallScore: 'overall' in over ? (over.overall as number | null) : 70,
      overallStatus: 'balanced',
      scheduleScore: 'schedule' in over ? (over.schedule as number | null) : 70,
      capacityScore: 'capacityScore' in over ? (over.capacityScore as number | null) : 70,
      dependencyScore: 90,
      executionScore: 60,
      collaborationScore: 80,
    },
    capacity: {
      balancePercent: over.balance ?? 80,
      overloadedCount: over.overloaded ?? 0,
      availableCount: 1,
      memberCount: 2,
      remainingMinutes: 240,
      availableMinutes: 480,
      members: [],
    },
    criticalWork: {
      status: 'available',
      itemCount: 3,
      blockedCount: over.blockedCritical ?? 0,
      durationMinutes: 180,
      projectedCompletion: NOW,
    },
    work: {
      blockedItemCount: over.blockedItems ?? 0,
      readyItemCount: 4,
      openItemCount: 4 + (over.blockedItems ?? 0),
    },
  };
}

const find = (deltas: ReturnType<typeof buildDeltas>, key: string) =>
  deltas.find((delta) => delta.key === key)!;

describe('buildDeltas — direction', () => {
  it('treats a shrinking forecast delay as better', () => {
    const deltas = buildDeltas(snapshot({ delayDays: 3 }), snapshot({ delayDays: 1 }));
    const delta = find(deltas, 'forecastDelayDays');
    expect(delta.direction).toBe('better');
    expect(delta.change).toBe(-2);
  });

  it('treats a growing forecast delay as worse', () => {
    const delta = find(buildDeltas(snapshot({ delayDays: 1 }), snapshot({ delayDays: 4 })), 'forecastDelayDays');
    expect(delta.direction).toBe('worse');
    expect(delta.change).toBe(3);
  });

  it('treats a rising health score as better (higher is better)', () => {
    const delta = find(buildDeltas(snapshot({ overall: 60 }), snapshot({ overall: 74 })), 'healthOverall');
    expect(delta.direction).toBe('better');
    expect(delta.change).toBe(14);
  });

  it('treats a falling health score as worse', () => {
    const delta = find(buildDeltas(snapshot({ overall: 80 }), snapshot({ overall: 65 })), 'healthOverall');
    expect(delta.direction).toBe('worse');
  });

  it('treats fewer overloaded members as better', () => {
    const delta = find(buildDeltas(snapshot({ overloaded: 2 }), snapshot({ overloaded: 0 })), 'overloadedMembers');
    expect(delta.direction).toBe('better');
  });

  it('reports unchanged when a metric does not move', () => {
    const delta = find(buildDeltas(snapshot(), snapshot()), 'forecastDelayDays');
    expect(delta.direction).toBe('unchanged');
    expect(delta.change).toBe(0);
  });

  it('reports no direction when either side is unknown rather than guessing', () => {
    const delta = find(buildDeltas(snapshot({ overall: null }), snapshot({ overall: 80 })), 'healthOverall');
    expect(delta.change).toBeNull();
    expect(delta.direction).toBe('unchanged');
  });

  it('treats fewer blocked items as better', () => {
    const delta = find(buildDeltas(snapshot({ blockedItems: 7 }), snapshot({ blockedItems: 2 })), 'blockedItems');
    expect(delta.direction).toBe('better');
    expect(delta.change).toBe(-5);
  });

  // Every dimension the zero-impact rule must consider: forecast, health,
  // capacity, critical path, blocked work and team balance.
  it('covers all six tracked dimensions in one comparison', () => {
    const keys = buildDeltas(snapshot(), snapshot()).map((delta) => delta.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'forecastDelayDays',
        'capacityShortfallMinutes',
        'healthOverall',
        'healthSchedule',
        'healthCapacity',
        'workloadBalance',
        'overloadedMembers',
        'blockedCriticalItems',
        'blockedItems',
      ]),
    );
  });
});

describe('summarize / isNoOp', () => {
  it('says plainly that nothing changes rather than implying a win', () => {
    const deltas = buildDeltas(snapshot(), snapshot());
    expect(movedDeltas(deltas)).toHaveLength(0);
    expect(summarize(deltas)).toContain('No tracked forecast, health, capacity or critical-path metric changes');
  });

  it('names an improvement with its unit', () => {
    const deltas = buildDeltas(snapshot({ delayDays: 3 }), snapshot({ delayDays: 1 }));
    expect(summarize(deltas)).toContain('Forecast delay improves by 2 days');
  });

  it('names a regression too — a preview must be able to warn', () => {
    const deltas = buildDeltas(snapshot({ overall: 80 }), snapshot({ overall: 60 }));
    expect(summarize(deltas)).toContain('Overall health worsens by 20 points');
  });

  it('formats a minute-based metric as hours and minutes', () => {
    const deltas = buildDeltas(snapshot({ shortfall: 150 }), snapshot({ shortfall: 60 }));
    expect(summarize(deltas)).toContain('1h 30m');
  });

  it('caps the sentence at three effects and counts the rest', () => {
    const before = snapshot({ delayDays: 5, shortfall: 120, overall: 40, schedule: 40, capacityScore: 40, balance: 40 });
    const after = snapshot({ delayDays: 0, shortfall: 0, overall: 90, schedule: 90, capacityScore: 90, balance: 90 });
    const summary = summarize(buildDeltas(before, after));
    expect(summary).toMatch(/and \d+ other metrics? move\.$/);
  });

  it('flags a no-op preview so the UI can warn before approving', () => {
    const preview = buildPreview({ before: snapshot(), after: snapshot(), generatedAt: NOW });
    expect(preview.isNoOp).toBe(true);
  });

  it('is not a no-op when something real moves', () => {
    const preview = buildPreview({
      before: snapshot({ delayDays: 2 }),
      after: snapshot({ delayDays: 0 }),
      generatedAt: NOW,
    });
    expect(preview.isNoOp).toBe(false);
    expect(preview.generatedAt).toBe(NOW);
  });
});

describe('snapshot extraction reads engine output verbatim', () => {
  const plan = {
    criticalPath: {
      status: 'available',
      itemIds: ['a', 'b'],
      durationMinutes: 300,
      projectedCompletion: NOW,
      reason: null,
    },
    forecast: {
      status: 'partial',
      generatedAt: NOW,
      projectedCompletion: '2026-08-02T12:00:00.000Z',
      deadline: NOW,
      delayMinutes: 2880,
      delayDays: 2,
      capacityShortfallMinutes: 90,
      unscheduledItemIds: ['c'],
      bottleneckAssignee: { assigneeId: 'u1', assigneeName: 'Alice', overloadMinutes: 120 },
      fallbackPolicy: null,
      reasons: [],
    },
  } as unknown as ProjectPlan;

  const team = {
    summary: {
      balancePercent: 55,
      overloadedCount: 1,
      availableCount: 0,
      memberCount: 2,
      remainingMinutes: 600,
      availableMinutes: 400,
      blockedCriticalCount: 2,
    },
    members: [
      {
        userId: 'u1',
        name: 'Alice',
        utilisationPercent: 150,
        remainingMinutes: 600,
        overloadMinutes: 200,
        status: 'over_capacity',
      },
    ],
  } as unknown as TeamInsights;

  const health = {
    overall: { score: 48, status: 'at_risk', reason: '', details: {} },
    schedule: { score: 30, status: 'critical', reason: '', details: {} },
    capacity: { score: 40, status: 'at_risk', reason: '', details: {} },
    dependency: { score: 70, status: 'balanced', reason: '', details: {} },
    execution: { score: 55, status: 'warning', reason: '', details: {} },
    focus: { score: null, status: 'no_data', reason: '', details: {} },
    collaboration: { score: 80, status: 'balanced', reason: '', details: {} },
  } as unknown as ProjectHealth;

  it('maps the resource forecast without recomputing it', () => {
    expect(forecastSnapshotOf(plan)).toEqual({
      status: 'partial',
      projectedCompletion: '2026-08-02T12:00:00.000Z',
      deadline: NOW,
      delayMinutes: 2880,
      delayDays: 2,
      capacityShortfallMinutes: 90,
      unscheduledItemCount: 1,
      bottleneck: { assigneeId: 'u1', assigneeName: 'Alice', overloadMinutes: 120 },
    });
  });

  it('maps health scores including a null (no-data) metric', () => {
    const snap = healthSnapshotOf(health);
    expect(snap.overallScore).toBe(48);
    expect(snap.scheduleScore).toBe(30);
    expect(snap.capacityScore).toBe(40);
  });

  it('maps team capacity roll-ups and per-member overload', () => {
    const snap = capacitySnapshotOf(team);
    expect(snap.balancePercent).toBe(55);
    expect(snap.overloadedCount).toBe(1);
    expect(snap.members[0]).toEqual({
      userId: 'u1',
      displayName: 'Alice',
      utilisationPercent: 150,
      remainingMinutes: 600,
      overloadMinutes: 200,
      isOverloaded: true,
    });
  });

  it('maps critical work from the critical path plus the team blocked count', () => {
    expect(criticalWorkSnapshotOf(plan, team)).toEqual({
      status: 'available',
      itemCount: 2,
      blockedCount: 2,
      durationMinutes: 300,
      projectedCompletion: NOW,
    });
  });

  it('assembles every section into one snapshot', () => {
    const withNodes = { ...plan, nodes: [], warnings: [] } as unknown as ProjectPlan;
    const snap = buildSnapshot({ plan: withNodes, team, health });
    expect(Object.keys(snap)).toEqual(['forecast', 'health', 'capacity', 'criticalWork', 'work']);
  });

  it('counts blocked, ready and open work from the plan nodes only', () => {
    const node = (over: Record<string, unknown>) => ({
      isExternal: false,
      isGroup: false,
      progressPercent: 0,
      isBlocked: false,
      ...over,
    });
    const withNodes = {
      ...plan,
      nodes: [
        node({ id: 'a', isBlocked: true }),
        node({ id: 'b' }),
        node({ id: 'c', progressPercent: 100 }), // done: not open
        node({ id: 'd', isExternal: true, isBlocked: true }), // other task: excluded
        node({ id: 'e', isGroup: true }), // grouping anchor: excluded
      ],
    } as unknown as ProjectPlan;

    expect(workSnapshotOf(withNodes)).toEqual({
      blockedItemCount: 1,
      readyItemCount: 1,
      openItemCount: 2,
    });
  });
});
