import { dailyStatusFor, greetingForHour, progressForToday } from './dashboard-today.logic';

describe('dashboard today calculations', () => {
  it('selects a greeting by time of day', () => {
    expect(greetingForHour(9)).toBe('Good morning');
    expect(greetingForHour(14)).toBe('Good afternoon');
    expect(greetingForHour(19)).toBe('Good evening');
  });

  it('calculates task progress and remaining estimated work', () => {
    expect(progressForToday([
      { dueAt: new Date(), status: 'done', estimatedMinutes: 30, spentMinutes: 30, completed: true },
      { dueAt: new Date(), status: 'todo', estimatedMinutes: 45, spentMinutes: 10, completed: false },
    ], 20)).toMatchObject({ percent: 50, completedWorkUnits: 1, totalWorkUnits: 2, remainingEstimatedMinutes: 35, focusMinutes: 20 });
  });

  it('flags overdue work as at risk', () => {
    expect(dailyStatusFor({ totalWorkUnits: 1, completedWorkUnits: 0, overdueCount: 1, remainingEstimatedMinutes: 20, capacityMinutes: 480 }).status).toBe('At risk');
  });
});
