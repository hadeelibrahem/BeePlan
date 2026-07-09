import {
  computeFocusStats,
  recommendFocusTask,
  type FocusCandidate,
  type FocusSessionForStats,
} from './focus.logic';

const NOW = new Date('2026-07-08T12:00:00.000Z'); // Wednesday

function session(
  overrides: Partial<FocusSessionForStats>,
): FocusSessionForStats {
  return {
    taskId: null,
    startedAt: NOW,
    plannedMinutes: 25,
    actualMinutes: 25,
    status: 'completed',
    ...overrides,
  };
}

describe('computeFocusStats', () => {
  it('aggregates today, week, streak, and top task', () => {
    const sessions: FocusSessionForStats[] = [
      session({ taskId: 'a', startedAt: new Date('2026-07-08T09:00:00Z'), actualMinutes: 25 }),
      session({ taskId: 'a', startedAt: new Date('2026-07-08T10:00:00Z'), actualMinutes: 50 }),
      session({ taskId: 'b', startedAt: new Date('2026-07-07T09:00:00Z'), actualMinutes: 25 }),
      session({ taskId: 'c', startedAt: new Date('2026-07-01T09:00:00Z'), actualMinutes: 25 }),
    ];
    const titles = new Map([
      ['a', 'Backend API'],
      ['b', 'Study'],
      ['c', 'Old task'],
    ]);

    const stats = computeFocusStats(sessions, titles, NOW);

    expect(stats.focusMinutesToday).toBe(75);
    expect(stats.sessionsToday).toBe(2);
    expect(stats.completedSessionsToday).toBe(2);
    expect(stats.totalFocusMinutesThisWeek).toBe(100); // 07-06 week start (Mon)
    expect(stats.currentStreak).toBe(2); // 07-08 and 07-07
    expect(stats.topFocusTask).toEqual({ taskId: 'a', title: 'Backend API', minutes: 75 });
  });

  it('returns zeroed stats when there are no sessions', () => {
    const stats = computeFocusStats([], new Map(), NOW);
    expect(stats).toEqual({
      focusMinutesToday: 0,
      sessionsToday: 0,
      completedSessionsToday: 0,
      currentStreak: 0,
      totalFocusMinutesThisWeek: 0,
      topFocusTask: null,
    });
  });

  it('does not count non-completed sessions toward the streak', () => {
    const sessions = [
      session({ startedAt: new Date('2026-07-08T09:00:00Z'), status: 'cancelled' }),
    ];
    expect(computeFocusStats(sessions, new Map(), NOW).currentStreak).toBe(0);
  });
});

function candidate(overrides: Partial<FocusCandidate>): FocusCandidate {
  return {
    id: overrides.id ?? 'task',
    title: overrides.title ?? 'Task',
    priority: 'medium',
    status: 'todo',
    dueDate: null,
    estimatedMinutes: 0,
    progress: 0,
    isFocusTask: false,
    totalSubtasks: 0,
    incompleteSubtasks: 0,
    ...overrides,
  };
}

describe('recommendFocusTask', () => {
  it('returns null when there are no actionable tasks', () => {
    expect(recommendFocusTask([], NOW)).toBeNull();
    expect(
      recommendFocusTask([candidate({ status: 'done' })], NOW),
    ).toBeNull();
  });

  it('prefers a high-priority, due-soon focus task', () => {
    const recommendation = recommendFocusTask(
      [
        candidate({ id: 'low', title: 'Low task', priority: 'low' }),
        candidate({
          id: 'best',
          title: 'Backend API',
          priority: 'high',
          isFocusTask: true,
          dueDate: new Date('2026-07-08T18:00:00Z'),
          estimatedMinutes: 90,
        }),
      ],
      NOW,
    );

    expect(recommendation?.taskId).toBe('best');
    expect(recommendation?.reason).toMatch(/high priority/i);
  });

  it('boosts tasks already in progress with unfinished steps', () => {
    const recommendation = recommendFocusTask(
      [
        candidate({ id: 'a', priority: 'medium' }),
        candidate({
          id: 'b',
          priority: 'medium',
          status: 'in_progress',
          progress: 40,
          totalSubtasks: 4,
          incompleteSubtasks: 3,
        }),
      ],
      NOW,
    );

    expect(recommendation?.taskId).toBe('b');
  });
});
