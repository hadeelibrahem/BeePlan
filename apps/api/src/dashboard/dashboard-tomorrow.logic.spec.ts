import {
  dueUnitsForCalendarDate,
  estimatedMinutesForTomorrowWork,
  highPriorityDueUnitCount,
} from './dashboard-tomorrow.logic';

describe('Tomorrow dashboard metrics', () => {
  it('keeps today due work out of Tomorrow and assigns tomorrow due work to Tomorrow', () => {
    const units = [
      { dueDate: new Date('2026-07-20T00:00:00.000Z'), priority: 'medium', status: 'todo' },
      // Date-only task fields are serialized at UTC midnight. This is still
      // July 21 (tomorrow) for a Los Angeles user at 23:30 on July 20.
      { dueDate: new Date('2026-07-21T00:00:00.000Z'), priority: 'medium', status: 'todo' },
    ];

    const today = dueUnitsForCalendarDate(units, '2026-07-20');
    const tomorrow = dueUnitsForCalendarDate(units, '2026-07-21');

    expect(today).toHaveLength(1);
    expect(tomorrow).toHaveLength(1);
    expect(tomorrow[0].dueDate?.toISOString()).toBe('2026-07-21T00:00:00.000Z');
    expect(highPriorityDueUnitCount(tomorrow)).toBe(0);
  });

  it('counts a high-priority tomorrow task while excluding completed and missed work', () => {
    const units = [
      { dueDate: new Date('2026-07-21T00:00:00.000Z'), priority: 'high', status: 'todo' },
      { dueDate: new Date('2026-07-21T00:00:00.000Z'), priority: 'urgent', status: 'done' },
      { dueDate: new Date('2026-07-21T00:00:00.000Z'), priority: 'high', status: 'missed' },
    ];
    const tomorrow = dueUnitsForCalendarDate(units, '2026-07-21');

    expect(tomorrow).toHaveLength(1);
    expect(highPriorityDueUnitCount(tomorrow)).toBe(1);
  });

  it('sums active parent tasks due tomorrow, without a planner plan', () => {
    const tasks = [
      { id: 'a', dueDate: new Date('2026-07-21T00:00:00.000Z'), priority: 'medium', status: 'todo', estimatedMinutes: 30 },
      { id: 'b', dueDate: new Date('2026-07-21T00:00:00.000Z'), priority: 'medium', status: 'todo', estimatedMinutes: 45 },
      { id: 'today', dueDate: new Date('2026-07-20T00:00:00.000Z'), priority: 'medium', status: 'todo', estimatedMinutes: 99 },
      { id: 'later', dueDate: new Date('2026-07-22T00:00:00.000Z'), priority: 'medium', status: 'todo', estimatedMinutes: 99 },
    ];
    expect(estimatedMinutesForTomorrowWork(tasks, [], '2026-07-21')).toBe(75);
  });

  it('counts a single 60-minute task due tomorrow', () => {
    expect(
      estimatedMinutesForTomorrowWork(
        [{ id: 'one', dueDate: new Date('2026-07-21T00:00:00.000Z'), priority: 'medium', status: 'todo', estimatedMinutes: 60 }],
        [],
        '2026-07-21',
      ),
    ).toBe(60);
  });

  it('excludes completed work and treats a missing estimate as zero', () => {
    const tasks = [
      { id: 'done', dueDate: new Date('2026-07-21T00:00:00.000Z'), priority: 'high', status: 'done', estimatedMinutes: 60 },
      { id: 'none', dueDate: new Date('2026-07-21T00:00:00.000Z'), priority: 'medium', status: 'todo', estimatedMinutes: null },
    ];
    expect(estimatedMinutesForTomorrowWork(tasks, [], '2026-07-21')).toBe(0);
  });

  it('uses active subtasks instead of their parent and inherits the parent due date only when a child has none', () => {
    const tasks = [{ id: 'parent', dueDate: new Date('2026-07-21T00:00:00.000Z'), priority: 'medium', status: 'todo', estimatedMinutes: 120 }];
    const subtasks = [
      { taskId: 'parent', dueDate: null, priority: 'medium', status: 'todo', isDone: false, estimatedMinutes: 30 },
      { taskId: 'parent', dueDate: new Date('2026-07-22T00:00:00.000Z'), priority: 'medium', status: 'todo', isDone: false, estimatedMinutes: 45 },
      { taskId: 'parent', dueDate: null, priority: 'medium', status: 'done', isDone: true, estimatedMinutes: 90 },
    ];
    expect(estimatedMinutesForTomorrowWork(tasks, subtasks, '2026-07-21')).toBe(30);
  });
});
