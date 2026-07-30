import {
  findSupersededIds,
  splitDeltas,
  validateRecommendation,
  RESOLUTION_LABEL,
  RESOLUTION_REASONS,
  type ValidationContext,
} from './recommendation-validation.logic';
import { buildDeltas, type PreviewSnapshot } from './recommendation-preview.logic';
import type { RecommendationAffectedItem } from './recommendation-detail.logic';
import type { PlanChange } from './recommendation-changes';

const NOW = '2026-07-27T12:00:00.000Z';
const START = '2026-07-28T09:00:00.000Z';
const DUE = '2026-07-30T09:00:00.000Z';

type SnapshotOptions = {
  delayDays?: number;
  shortfall?: number;
  unscheduled?: number;
  overall?: number;
  overloaded?: number;
  balance?: number;
  blockedItems?: number;
  blockedCritical?: number;
  cpStatus?: 'available' | 'unavailable';
  cpDuration?: number | null;
  forecastStatus?: 'available' | 'partial' | 'unavailable';
};

function snapshot(over: SnapshotOptions = {}): PreviewSnapshot {
  return {
    forecast: {
      status: over.forecastStatus ?? 'available',
      projectedCompletion: NOW,
      deadline: NOW,
      delayMinutes: (over.delayDays ?? 0) * 1440,
      delayDays: over.delayDays ?? 0,
      capacityShortfallMinutes: over.shortfall ?? 0,
      unscheduledItemCount: over.unscheduled ?? 0,
      bottleneck: null,
    },
    health: {
      overallScore: over.overall ?? 70,
      overallStatus: 'balanced',
      scheduleScore: 70,
      capacityScore: 70,
      dependencyScore: 90,
      executionScore: 60,
      collaborationScore: 80,
    },
    capacity: {
      balancePercent: over.balance ?? 50,
      overloadedCount: over.overloaded ?? 1,
      availableCount: 1,
      memberCount: 2,
      remainingMinutes: 240,
      availableMinutes: 480,
      members: [],
    },
    criticalWork: {
      status: over.cpStatus ?? 'available',
      itemCount: 2,
      blockedCount: over.blockedCritical ?? 0,
      durationMinutes: over.cpDuration === undefined ? 180 : over.cpDuration,
      projectedCompletion: NOW,
    },
    work: {
      blockedItemCount: over.blockedItems ?? 0,
      readyItemCount: 3,
      openItemCount: 3 + (over.blockedItems ?? 0),
    },
  };
}

function item(over: Partial<RecommendationAffectedItem> = {}): RecommendationAffectedItem {
  return {
    subtaskId: 'sub-1',
    title: 'Write the intro',
    status: 'todo',
    isComplete: false,
    assignee: { userId: 'u1', displayName: 'Alice' },
    estimatedDurationMinutes: 60,
    startDate: null,
    dueDate: DUE,
    ...over,
  };
}

const REASSIGN: PlanChange = {
  kind: 'reassign',
  subtaskId: 'sub-1',
  assigneeUserId: 'u2',
  fromUserId: 'u1',
};
const RESCHEDULE: PlanChange = { kind: 'reschedule', subtaskId: 'sub-1', startDate: START };

/** A context that passes every rule, so each test perturbs exactly one thing. */
function context(over: Partial<ValidationContext> = {}): ValidationContext {
  const baseline = over.baseline ?? snapshot({ delayDays: 3, overloaded: 1, balance: 50 });
  const projected = over.projected ?? snapshot({ delayDays: 1, overloaded: 0, balance: 90 });
  return {
    kind: 'workload_imbalance',
    targetUserId: 'u1',
    changes: [REASSIGN],
    items: [item()],
    taskComplete: false,
    acceptedMemberIds: new Set(['u1', 'u2']),
    targetOpenItemCount: 2,
    baseline,
    projected,
    deltas: buildDeltas(baseline, projected),
    ...over,
  };
}

const expectRejected = (result: ReturnType<typeof validateRecommendation>, reason: string) => {
  expect(result.valid).toBe(false);
  if (!result.valid) expect(result.reason).toBe(reason);
};

describe('validateRecommendation — a healthy recommendation survives', () => {
  it('passes when everything still holds', () => {
    expect(validateRecommendation(context())).toEqual({ valid: true });
  });
});

describe('validateRecommendation — stale data', () => {
  it('rejects when the parent task is complete', () => {
    expectRejected(validateRecommendation(context({ taskComplete: true })), 'completed');
  });

  it('rejects when the target subtask is complete', () => {
    expectRejected(
      validateRecommendation(context({ items: [item({ isComplete: true })] })),
      'completed',
    );
  });

  it('rejects when the target subtask was deleted', () => {
    expectRejected(validateRecommendation(context({ items: [] })), 'not_applicable');
  });

  it('rejects when the recommendation no longer maps to any change', () => {
    expectRejected(validateRecommendation(context({ changes: [] })), 'not_applicable');
  });

  it('rejects when the receiving member has left the collaboration', () => {
    expectRejected(
      validateRecommendation(context({ acceptedMemberIds: new Set(['u1']) })),
      'not_applicable',
    );
  });

  it('rejects when the member the finding is ABOUT has left', () => {
    expectRejected(
      validateRecommendation(
        context({
          changes: [RESCHEDULE],
          kind: 'ahead_of_pace',
          targetUserId: 'gone',
          targetOpenItemCount: 0,
          acceptedMemberIds: new Set(['u1', 'u2']),
        }),
      ),
      'not_applicable',
    );
  });
});

describe('validateRecommendation — already applied', () => {
  it('rejects a reassign to the member who already owns the item', () => {
    expectRejected(
      validateRecommendation(
        context({
          changes: [{ kind: 'reassign', subtaskId: 'sub-1', assigneeUserId: 'u1' }],
        }),
      ),
      'already_applied',
    );
  });

  it('rejects a reschedule to the dates the item already has', () => {
    expectRejected(
      validateRecommendation(
        context({
          kind: 'ahead_of_pace',
          targetOpenItemCount: 0,
          changes: [RESCHEDULE],
          items: [item({ startDate: START, dueDate: null })],
        }),
      ),
      'already_applied',
    );
  });

  it('does not treat a matching start with a DIFFERENT due date as applied', () => {
    const result = validateRecommendation(
      context({
        kind: 'ahead_of_pace',
        targetOpenItemCount: 0,
        changes: [{ kind: 'reschedule', subtaskId: 'sub-1', startDate: START, dueDate: DUE }],
        items: [item({ startDate: START, dueDate: '2026-08-05T00:00:00.000Z' })],
      }),
    );
    expect(result.valid).toBe(true);
  });
});

describe('validateRecommendation — missing estimates', () => {
  it.each(['deadline_risk', 'workload_imbalance'])(
    'rejects %s when an affected item has no estimate',
    (kind) => {
      expectRejected(
        validateRecommendation(
          context({
            kind,
            changes: [REASSIGN],
            items: [item({ estimatedDurationMinutes: null })],
            baseline: snapshot({ delayDays: 3, overloaded: 1 }),
          }),
        ),
        'missing_estimate',
      );
    },
  );

  // Activity-based kinds do not claim a schedule effect, so a missing estimate
  // lowers confidence rather than invalidating the finding.
  it('tolerates a missing estimate for an activity-based kind', () => {
    const result = validateRecommendation(
      context({
        kind: 'inactive_member',
        items: [item({ estimatedDurationMinutes: null })],
      }),
    );
    expect(result.valid).toBe(true);
  });
});

describe('validateRecommendation — engine consistency', () => {
  // The heart of the phase: the crude detector says "late", the real forecast
  // says "on time", so the card must not appear at all.
  it('rejects a deadline warning the resource forecast contradicts', () => {
    const baseline = snapshot({ delayDays: 0, shortfall: 0, unscheduled: 0 });
    expectRejected(
      validateRecommendation(
        context({ kind: 'deadline_risk', targetUserId: null, baseline, deltas: buildDeltas(baseline, snapshot({ delayDays: 0, overall: 90 })) }),
      ),
      'forecast_conflict',
    );
  });

  it('keeps a deadline warning the forecast agrees with', () => {
    const baseline = snapshot({ delayDays: 4 });
    const projected = snapshot({ delayDays: 1 });
    const result = validateRecommendation(
      context({
        kind: 'deadline_risk',
        targetUserId: null,
        baseline,
        projected,
        deltas: buildDeltas(baseline, projected),
      }),
    );
    expect(result.valid).toBe(true);
  });

  it('keeps a deadline warning justified by a capacity shortfall alone', () => {
    const baseline = snapshot({ delayDays: 0, shortfall: 120 });
    const projected = snapshot({ delayDays: 0, shortfall: 0 });
    const result = validateRecommendation(
      context({
        kind: 'deadline_risk',
        targetUserId: null,
        baseline,
        projected,
        deltas: buildDeltas(baseline, projected),
      }),
    );
    expect(result.valid).toBe(true);
  });

  it('rejects an imbalance warning when capacity health says the team is balanced', () => {
    const baseline = snapshot({ overloaded: 0, balance: 95 });
    const projected = snapshot({ overloaded: 0, balance: 99 });
    expectRejected(
      validateRecommendation(
        context({ kind: 'workload_imbalance', baseline, projected, deltas: buildDeltas(baseline, projected) }),
      ),
      'health_conflict',
    );
  });

  it('rejects an ahead-of-pace finding once the member has work again', () => {
    expectRejected(
      validateRecommendation(
        context({ kind: 'ahead_of_pace', changes: [RESCHEDULE], targetOpenItemCount: 3 }),
      ),
      'not_applicable',
    );
  });
});

describe('validateRecommendation — critical path', () => {
  it('rejects a change that would leave the critical path uncomputable', () => {
    const baseline = snapshot({ delayDays: 3 });
    const projected = snapshot({ delayDays: 1, cpStatus: 'unavailable' });
    expectRejected(
      validateRecommendation(context({ baseline, projected, deltas: buildDeltas(baseline, projected) })),
      'critical_path_conflict',
    );
  });

  it('rejects a change that blocks more critical work', () => {
    const baseline = snapshot({ delayDays: 3, blockedCritical: 0 });
    const projected = snapshot({ delayDays: 1, blockedCritical: 2 });
    expectRejected(
      validateRecommendation(context({ baseline, projected, deltas: buildDeltas(baseline, projected) })),
      'critical_path_conflict',
    );
  });

  it('rejects a change that lengthens the critical path', () => {
    const baseline = snapshot({ delayDays: 3, cpDuration: 180 });
    const projected = snapshot({ delayDays: 1, cpDuration: 300 });
    expectRejected(
      validateRecommendation(context({ baseline, projected, deltas: buildDeltas(baseline, projected) })),
      'critical_path_conflict',
    );
  });

  it('accepts a change that shortens the critical path', () => {
    const baseline = snapshot({ delayDays: 3, cpDuration: 300 });
    const projected = snapshot({ delayDays: 1, cpDuration: 180 });
    expect(
      validateRecommendation(context({ baseline, projected, deltas: buildDeltas(baseline, projected) })).valid,
    ).toBe(true);
  });
});

describe('validateRecommendation — zero impact and regression', () => {
  it('rejects a recommendation that moves nothing at all', () => {
    const same = snapshot({ delayDays: 2, overloaded: 1, balance: 50 });
    expectRejected(
      validateRecommendation(context({ baseline: same, projected: same, deltas: buildDeltas(same, same) })),
      'no_impact',
    );
  });

  it.each([
    ['forecast', { delayDays: 3 }, { delayDays: 1 }],
    ['health', { overall: 50 }, { overall: 70 }],
    ['capacity', { overloaded: 2 }, { overloaded: 0 }],
    ['critical path', { blockedCritical: 3 }, { blockedCritical: 1 }],
    ['blocked work', { blockedItems: 7 }, { blockedItems: 2 }],
    ['team balance', { balance: 40 }, { balance: 85 }],
  ])('accepts a recommendation that improves %s alone', (_label, beforeOver, afterOver) => {
    const baseline = snapshot({ delayDays: 2, overloaded: 1, balance: 50, ...beforeOver });
    const projected = snapshot({ delayDays: 2, overloaded: 1, balance: 50, ...afterOver });
    const result = validateRecommendation(
      context({ baseline, projected, deltas: buildDeltas(baseline, projected) }),
    );
    expect(result.valid).toBe(true);
  });

  it('rejects a recommendation that only makes things worse', () => {
    const baseline = snapshot({ delayDays: 1, overloaded: 1 });
    const projected = snapshot({ delayDays: 5, overloaded: 1 });
    expectRejected(
      validateRecommendation(context({ baseline, projected, deltas: buildDeltas(baseline, projected) })),
      'regression',
    );
  });

  it('accepts a genuine trade-off where something improves', () => {
    const baseline = snapshot({ delayDays: 4, balance: 90 });
    const projected = snapshot({ delayDays: 1, balance: 70 });
    expect(
      validateRecommendation(context({ baseline, projected, deltas: buildDeltas(baseline, projected) })).valid,
    ).toBe(true);
  });
});

describe('validateRecommendation — rule ordering', () => {
  // A deleted item must be reported as such, never as "no measurable effect".
  it('reports the most definitive failure first', () => {
    const same = snapshot();
    const result = validateRecommendation(
      context({ items: [], baseline: same, projected: same, deltas: buildDeltas(same, same) }),
    );
    expectRejected(result, 'not_applicable');
  });

  it('gives every rejection a human explanation', () => {
    const result = validateRecommendation(context({ taskComplete: true }));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.explanation.length).toBeGreaterThan(10);
  });
});

describe('splitDeltas', () => {
  it('separates improvements from regressions and ignores unchanged metrics', () => {
    const baseline = snapshot({ delayDays: 4, balance: 90 });
    const projected = snapshot({ delayDays: 1, balance: 70 });
    const { improved, worsened } = splitDeltas(buildDeltas(baseline, projected));
    expect(improved.map((d) => d.key)).toContain('forecastDelayDays');
    expect(worsened.map((d) => d.key)).toContain('workloadBalance');
    expect([...improved, ...worsened].every((d) => d.direction !== 'unchanged')).toBe(true);
  });
});

describe('findSupersededIds', () => {
  const candidate = (over: Partial<{ id: string; subtaskIds: string[]; improvedCount: number; createdAt: string }>) => ({
    id: 'a',
    subtaskIds: ['sub-1'],
    improvedCount: 1,
    createdAt: '2026-07-27T10:00:00.000Z',
    ...over,
  });

  it('leaves unrelated recommendations alone', () => {
    const superseded = findSupersededIds([
      candidate({ id: 'a', subtaskIds: ['sub-1'] }),
      candidate({ id: 'b', subtaskIds: ['sub-2'] }),
    ]);
    expect(superseded.size).toBe(0);
  });

  it('keeps the stronger of two recommendations touching the same item', () => {
    const superseded = findSupersededIds([
      candidate({ id: 'weak', improvedCount: 1 }),
      candidate({ id: 'strong', improvedCount: 3 }),
    ]);
    expect([...superseded.keys()]).toEqual(['weak']);
    expect(superseded.get('weak')).toBe('strong');
  });

  it('breaks an equal-strength tie by recency', () => {
    const superseded = findSupersededIds([
      candidate({ id: 'older', createdAt: '2026-07-20T10:00:00.000Z' }),
      candidate({ id: 'newer', createdAt: '2026-07-26T10:00:00.000Z' }),
    ]);
    expect([...superseded.keys()]).toEqual(['older']);
  });

  it('supersedes every loser when three collide', () => {
    const superseded = findSupersededIds([
      candidate({ id: 'a', improvedCount: 1 }),
      candidate({ id: 'b', improvedCount: 2 }),
      candidate({ id: 'c', improvedCount: 4 }),
    ]);
    expect([...superseded.keys()].sort()).toEqual(['a', 'b']);
  });

  it('is deterministic for identical candidates', () => {
    const input = [candidate({ id: 'x' }), candidate({ id: 'y' })];
    expect([...findSupersededIds(input).keys()]).toEqual([...findSupersededIds(input).keys()]);
  });
});

describe('RESOLUTION_LABEL', () => {
  it('gives every reason a human label', () => {
    for (const reason of RESOLUTION_REASONS) {
      expect(RESOLUTION_LABEL[reason]).toBeTruthy();
    }
  });

  it('uses the wording the product asked for', () => {
    expect(RESOLUTION_LABEL.completed).toBe('Completed automatically');
    expect(RESOLUTION_LABEL.already_applied).toBe('Already fixed');
    expect(RESOLUTION_LABEL.not_applicable).toBe('No longer applicable');
    expect(RESOLUTION_LABEL.superseded).toBe('Superseded by a newer recommendation');
  });
});
