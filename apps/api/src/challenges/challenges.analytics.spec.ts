import { calculateChallengeAnalytics } from './challenges.service';

const analytics = (overrides: Partial<Parameters<typeof calculateChallengeAnalytics>[0]> = {}) => calculateChallengeAnalytics({ challengeId: 'c1', target: 100, metricType: 'focus_minutes', startAt: '2026-01-01T00:00:00Z', endAt: '2026-01-02T00:00:00Z', status: 'active', participants: 0, madeProgress: 0, completed: 0, notStarted: 0, inProgress: 0, averageProgressPercent: 0, ...overrides });

describe('calculateChallengeAnalytics', () => {
  it('handles zero participants without NaN or Infinity', () => {
    expect(analytics()).toMatchObject({ participants: 0, completionRate: 0, engagementRate: 0, averageProgressPercent: 0 });
  });
  it('preserves the participation status breakdown', () => {
    expect(analytics({ participants: 3, madeProgress: 2, completed: 1, notStarted: 1, inProgress: 1 })).toMatchObject({ participants: 3, madeProgress: 2, completed: 1, notStarted: 1, inProgress: 1 });
  });
  it('calculates completion and engagement percentages', () => {
    expect(analytics({ participants: 4, madeProgress: 3, completed: 2 })).toMatchObject({ completionRate: 50, engagementRate: 75 });
  });
  it('clamps average progress to 100 and handles zero target', () => {
    expect(analytics({ participants: 1, averageProgressPercent: 250 }).averageProgressPercent).toBe(100);
    expect(analytics({ participants: 1, target: 0, averageProgressPercent: 0 }).averageProgressPercent).toBe(0);
  });
  it('keeps completed users out of in-progress counts', () => {
    const result = analytics({ participants: 2, madeProgress: 2, completed: 1, notStarted: 0, inProgress: 1 });
    expect(result.completed + result.inProgress + result.notStarted).toBe(result.participants);
  });
  it('retains historical cancelled challenge results', () => {
    expect(analytics({ status: 'cancelled', participants: 1, completed: 1 })).toMatchObject({ status: 'cancelled', participants: 1, completed: 1 });
  });
});
