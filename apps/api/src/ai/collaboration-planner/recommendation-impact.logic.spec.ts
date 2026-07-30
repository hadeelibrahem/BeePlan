import { alignTextWithForecast, impactOf } from './recommendation-impact.logic';
import { buildDeltas, type PreviewSnapshot } from './recommendation-preview.logic';

const JUL_30 = '2026-07-30T00:00:00.000Z';
const JUL_28 = '2026-07-28T00:00:00.000Z';

function snapshot(over: {
  delayDays?: number;
  shortfall?: number;
  unscheduled?: number;
  overall?: number;
  overloaded?: number;
  balance?: number;
  blockedItems?: number;
  completion?: string | null;
} = {}): PreviewSnapshot {
  return {
    forecast: {
      status: 'available',
      projectedCompletion: over.completion === undefined ? JUL_30 : over.completion,
      deadline: JUL_28,
      delayMinutes: (over.delayDays ?? 0) * 1440,
      delayDays: over.delayDays ?? 0,
      capacityShortfallMinutes: over.shortfall ?? 0,
      unscheduledItemCount: over.unscheduled ?? 0,
      bottleneck: null,
    },
    health: {
      overallScore: over.overall ?? 66,
      overallStatus: 'balanced',
      scheduleScore: 70,
      capacityScore: 70,
      dependencyScore: 90,
      executionScore: 60,
      collaborationScore: 80,
    },
    capacity: {
      balancePercent: over.balance ?? 60,
      overloadedCount: over.overloaded ?? 1,
      availableCount: 1,
      memberCount: 2,
      remainingMinutes: 240,
      availableMinutes: 480,
      members: [],
    },
    criticalWork: {
      status: 'available',
      itemCount: 2,
      blockedCount: 0,
      durationMinutes: 180,
      projectedCompletion: JUL_30,
    },
    work: {
      blockedItemCount: over.blockedItems ?? 0,
      readyItemCount: 3,
      openItemCount: 3 + (over.blockedItems ?? 0),
    },
  };
}

describe('impactOf — only metrics that actually change', () => {
  it('lists a changed metric with its real before and after', () => {
    const baseline = snapshot({ blockedItems: 7 });
    const projected = snapshot({ blockedItems: 2 });
    const impact = impactOf({ deltas: buildDeltas(baseline, projected), baseline, projected });

    const blocked = impact.metrics.find((metric) => metric.key === 'blockedItems')!;
    expect(blocked).toMatchObject({ label: 'Blocked items', before: 7, after: 2, direction: 'better' });
  });

  it('omits every metric that does not move', () => {
    const baseline = snapshot({ overall: 66 });
    const projected = snapshot({ overall: 78 });
    const impact = impactOf({ deltas: buildDeltas(baseline, projected), baseline, projected });

    expect(impact.metrics.map((metric) => metric.key)).toEqual(['healthOverall']);
  });

  it('reports no metrics at all when nothing changes', () => {
    const same = snapshot();
    const impact = impactOf({ deltas: buildDeltas(same, same), baseline: same, projected: same });
    expect(impact.metrics).toEqual([]);
    expect(impact.summary).toContain('changes no tracked project metric');
  });

  it('surfaces the forecast completion date shift when the date moves', () => {
    const baseline = snapshot({ completion: JUL_30, delayDays: 2 });
    const projected = snapshot({ completion: JUL_28, delayDays: 0 });
    const impact = impactOf({ deltas: buildDeltas(baseline, projected), baseline, projected });

    expect(impact.forecastDateBefore).toBe(JUL_30);
    expect(impact.forecastDateAfter).toBe(JUL_28);
  });

  it('leaves the date fields null when the completion date is unchanged', () => {
    const baseline = snapshot({ completion: JUL_30, overall: 60 });
    const projected = snapshot({ completion: JUL_30, overall: 80 });
    const impact = impactOf({ deltas: buildDeltas(baseline, projected), baseline, projected });

    expect(impact.forecastDateBefore).toBeNull();
    expect(impact.forecastDateAfter).toBeNull();
  });

  it('reports a regression as a regression', () => {
    const baseline = snapshot({ delayDays: 1 });
    const projected = snapshot({ delayDays: 4 });
    const impact = impactOf({ deltas: buildDeltas(baseline, projected), baseline, projected });
    expect(impact.summary).toContain('worsens');
  });

  it('formats minute-based metrics readably', () => {
    const baseline = snapshot({ shortfall: 120 });
    const projected = snapshot({ shortfall: 30 });
    const impact = impactOf({ deltas: buildDeltas(baseline, projected), baseline, projected });
    expect(impact.summary).toContain('1h 30m');
  });
});

describe('alignTextWithForecast — the card can never contradict the preview', () => {
  const detectorText = {
    title: 'Deadline risk — pace suggests finishing ~8 days late',
    message: 'Move "Draft" earlier to catch up?',
    reason: '40h of open work remains with 3 day(s) left.',
  };

  it('restates a deadline claim from the resource forecast, not the detector', () => {
    const aligned = alignTextWithForecast({
      kind: 'deadline_risk',
      ...detectorText,
      baseline: snapshot({ delayDays: 2 }),
    });

    // The detector guessed 8; the forecast says 2, so 2 is what the user reads.
    expect(aligned.title).toContain('2 days late');
    expect(aligned.title).not.toContain('8 days');
    expect(aligned.reason).toContain('2 days past the deadline');
  });

  it('describes a capacity shortfall when the delay itself is zero', () => {
    const aligned = alignTextWithForecast({
      kind: 'deadline_risk',
      ...detectorText,
      baseline: snapshot({ delayDays: 0, shortfall: 150 }),
    });
    expect(aligned.title).toContain('2h 30m');
    expect(aligned.reason).toContain('cannot fit');
  });

  it('describes unschedulable work when there is neither delay nor shortfall', () => {
    const aligned = alignTextWithForecast({
      kind: 'deadline_risk',
      ...detectorText,
      baseline: snapshot({ delayDays: 0, shortfall: 0, unscheduled: 3 }),
    });
    expect(aligned.title).toContain('3 items cannot be scheduled');
  });

  it('uses singular wording for a one-day delay', () => {
    const aligned = alignTextWithForecast({
      kind: 'deadline_risk',
      ...detectorText,
      baseline: snapshot({ delayDays: 1 }),
    });
    expect(aligned.title).toContain('1 day late');
  });

  it('restates an imbalance claim from the capacity engine', () => {
    const aligned = alignTextWithForecast({
      kind: 'workload_imbalance',
      title: 'Workload is uneven — rebalance?',
      message: 'Move "Draft" to someone with more room?',
      reason: 'Remaining workload is 9x higher for this member.',
      baseline: snapshot({ overloaded: 2, balance: 40 }),
    });
    expect(aligned.reason).toContain('2 members are over capacity');
    expect(aligned.reason).toContain('40%');
    expect(aligned.reason).not.toContain('9x');
  });

  it('explains a below-threshold balance even with nobody over capacity', () => {
    const aligned = alignTextWithForecast({
      kind: 'workload_imbalance',
      title: 't',
      message: 'm',
      reason: 'r',
      baseline: snapshot({ overloaded: 0, balance: 55 }),
    });
    expect(aligned.reason).toContain('55%');
  });

  it('preserves the item and member names the detector chose', () => {
    const aligned = alignTextWithForecast({
      kind: 'deadline_risk',
      ...detectorText,
      baseline: snapshot({ delayDays: 2 }),
    });
    expect(aligned.message).toBe(detectorText.message);
  });

  it.each(['ahead_of_pace', 'inactive_member'])(
    'leaves activity-based kind %s untouched — it makes no schedule claim',
    (kind) => {
      const input = { kind, title: 'T', message: 'M', reason: 'R', baseline: snapshot({ delayDays: 5 }) };
      expect(alignTextWithForecast(input)).toEqual({ title: 'T', message: 'M', reason: 'R' });
    },
  );

  it('leaves an unrecognised kind untouched', () => {
    const input = { kind: 'brand_new', title: 'T', message: 'M', reason: 'R', baseline: snapshot() };
    expect(alignTextWithForecast(input)).toEqual({ title: 'T', message: 'M', reason: 'R' });
  });
});
