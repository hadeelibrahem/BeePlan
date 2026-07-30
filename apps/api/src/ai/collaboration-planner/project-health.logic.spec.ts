import {
  buildProjectHealth,
  statusForScore,
  type FocusAggregate,
  type HealthInputs,
} from './project-health.logic';

const NOW = new Date('2026-07-27T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function inputs(over: Partial<HealthInputs> = {}): HealthInputs {
  return {
    now: NOW,
    forecastStatus: 'available',
    delayMinutes: 0,
    delayDays: 0,
    projectedCompletionMs: NOW.getTime() + 2 * DAY,
    deadlineMs: NOW.getTime() + 6 * DAY,
    criticalPathAvailable: true,
    criticalItemCount: 2,
    lateCriticalCount: 0,
    totalItems: 10,
    completedItems: 5,
    blockedItems: 0,
    readyItems: 5,
    startedItems: 3,
    scheduledItems: 5,
    unscheduledItems: 0,
    criticalBlockedItems: 0,
    remainingMinutes: 600,
    maxLayer: 2,
    cyclePresent: false,
    capacityShortfallMinutes: 0,
    overloadedCount: 0,
    availableCount: 1,
    memberCount: 3,
    balancePercent: 90,
    membersWithWork: 3,
    totalAvailableMinutes: 2400,
    assignedItems: 10,
    unassignedItems: 0,
    unassignedMinutes: 0,
    ownerHasWork: true,
    editorCount: 2,
    editorsWithWork: 2,
    focus: focus(),
    ...over,
  };
}

function focus(over: Partial<FocusAggregate> = {}): FocusAggregate {
  return {
    totalSessions: 8,
    completedSessions: 7,
    cancelledSessions: 1,
    focusMinutes: 320,
    actualMinutesCompleted: 300,
    plannedMinutesCompleted: 300,
    avgSessionMinutes: 43,
    ...over,
  };
}

describe('statusForScore thresholds', () => {
  it.each([
    [100, 'healthy'],
    [85, 'healthy'],
    [84, 'balanced'],
    [70, 'balanced'],
    [69, 'warning'],
    [55, 'warning'],
    [54, 'at_risk'],
    [40, 'at_risk'],
    [39, 'critical'],
    [0, 'critical'],
  ] as const)('%i → %s', (score, status) => {
    expect(statusForScore(score)).toBe(status);
  });
});

describe('buildProjectHealth (deterministic)', () => {
  it('a healthy project scores high across every dimension', () => {
    const health = buildProjectHealth(inputs());
    expect(health.overall.score).toBeGreaterThanOrEqual(85);
    expect(health.overall.status).toBe('healthy');
    expect(health.schedule.status).toBe('healthy');
    expect(health.contributors.positive.length).toBeGreaterThan(0);
    expect(health.warnings).toHaveLength(0);
    expect(health.formulaVersion).toBe('project-health-v1');
  });

  it('produces identical output for identical input', () => {
    expect(buildProjectHealth(inputs())).toEqual(buildProjectHealth(inputs()));
  });

  it('a late project tanks Schedule health and warns on forecast', () => {
    const health = buildProjectHealth(inputs({ delayMinutes: 3 * 1440, delayDays: 3, projectedCompletionMs: NOW.getTime() + 9 * DAY }));
    expect(health.schedule.score).toBeLessThan(inputs().deadlineMs ? 70 : 100);
    expect(health.schedule.status === 'warning' || health.schedule.status === 'at_risk' || health.schedule.status === 'critical').toBe(true);
    expect(health.warnings.some((w) => w.group === 'Forecast')).toBe(true);
    expect(health.contributors.negative.some((c) => /late/i.test(c.text))).toBe(true);
  });

  it('a blocked project tanks Dependency health', () => {
    const health = buildProjectHealth(inputs({ blockedItems: 4, criticalBlockedItems: 2, readyItems: 1, scheduledItems: 3 }));
    expect(health.dependency.score).toBeLessThan(70);
    expect(health.warnings.some((w) => w.group === 'Critical' || w.group === 'Blocked')).toBe(true);
    expect(health.dependency.details.criticalBlockedItems).toBe(2);
  });

  it('a capacity shortage tanks Capacity health', () => {
    const health = buildProjectHealth(inputs({ capacityShortfallMinutes: 480, overloadedCount: 2, balancePercent: 30 }));
    expect(health.capacity.score).toBeLessThan(60);
    expect(health.warnings.some((w) => w.group === 'Capacity' && w.link === 'team')).toBe(true);
  });

  it('an overloaded member surfaces as a negative contributor', () => {
    const health = buildProjectHealth(inputs({ overloadedCount: 1, balancePercent: 55 }));
    expect(health.contributors.negative.some((c) => /over capacity/i.test(c.text))).toBe(true);
  });

  it('a balanced team surfaces as a positive contributor', () => {
    const health = buildProjectHealth(inputs({ balancePercent: 92, overloadedCount: 0 }));
    expect(health.contributors.positive.some((c) => /balanced/i.test(c.text))).toBe(true);
  });

  it('reports "not enough focus history" and drops Focus from the overall weighting', () => {
    const withData = buildProjectHealth(inputs()).overall.score!;
    const health = buildProjectHealth(inputs({ focus: null }));
    expect(health.focus.status).toBe('no_data');
    expect(health.focus.score).toBeNull();
    expect(health.focus.reason).toMatch(/not enough focus history/i);
    // Overall still computes from the remaining dimensions.
    expect(typeof health.overall.score).toBe('number');
    expect(health.overall.score).not.toBeNaN();
    expect(withData).toBeGreaterThan(0);
  });

  it('many interrupted sessions lower Focus health and raise a Focus warning', () => {
    const health = buildProjectHealth(inputs({ focus: focus({ totalSessions: 10, completedSessions: 3, cancelledSessions: 7, actualMinutesCompleted: 90, plannedMinutesCompleted: 150 }) }));
    expect(health.focus.score).toBeLessThan(70);
    expect(health.warnings.some((w) => w.group === 'Focus')).toBe(true);
  });

  it('no assignments tanks Collaboration health and warns on assignments', () => {
    const health = buildProjectHealth(inputs({ assignedItems: 0, unassignedItems: 5, unassignedMinutes: 300, membersWithWork: 0 }));
    expect(health.collaboration.score).toBeLessThan(60);
    expect(health.warnings.some((w) => w.group === 'Assignments')).toBe(true);
    expect(health.contributors.negative.some((c) => /unassigned/i.test(c.text))).toBe(true);
  });

  it('an unavailable critical path zeroes the critical-path term and warns', () => {
    const health = buildProjectHealth(inputs({ criticalPathAvailable: false }));
    expect(health.schedule.details.criticalPathScore).toBe(0);
    expect(health.warnings.some((w) => w.group === 'Critical' && /unavailable/i.test(w.message))).toBe(true);
  });

  it('a dependency cycle drops Dependency health hard and warns', () => {
    const health = buildProjectHealth(inputs({ cyclePresent: true }));
    expect(health.dependency.score).toBeLessThanOrEqual(40);
    expect(health.warnings.some((w) => w.group === 'Dependency')).toBe(true);
    expect(health.contributors.negative.some((c) => /cycle/i.test(c.text))).toBe(true);
  });

  it('never invents a trend when history is unavailable', () => {
    const health = buildProjectHealth(inputs());
    expect(health.trend.available).toBe(false);
    expect(health.trend.points).toEqual([]);
  });

  it('separates positive and negative contributors', () => {
    const health = buildProjectHealth(inputs({ capacityShortfallMinutes: 120, unassignedItems: 7, blockedItems: 0 }));
    expect(health.contributors.negative.some((c) => /capacity shortfall/i.test(c.text))).toBe(true);
    expect(health.contributors.negative.some((c) => /unassigned/i.test(c.text))).toBe(true);
    expect(health.contributors.positive.length).toBeGreaterThan(0);
  });
});
