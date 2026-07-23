import {
  isFocusEligible,
  selectFocusSubtask,
  type FocusSubtaskCandidate,
} from './focus-subtask-select';

const NOW = new Date('2026-07-08T12:00:00.000Z');

function sub(
  overrides: Partial<FocusSubtaskCandidate> = {},
): FocusSubtaskCandidate {
  return {
    id: 's',
    title: 'Subtask',
    isDone: false,
    isFocusTask: true,
    status: 'todo',
    priority: 'medium',
    dueDate: null,
    estimatedDurationMinutes: null,
    orderIndex: 0,
    hasOpenDependencies: false,
    ...overrides,
  };
}

describe('isFocusEligible', () => {
  it('accepts an incomplete, unblocked, dependency-free focus subtask', () => {
    expect(isFocusEligible(sub())).toBe(true);
  });

  it.each([
    ['not a focus subtask', { isFocusTask: false }],
    ['already done (isDone)', { isDone: true }],
    ['already done (status)', { status: 'done' }],
    ['missed', { status: 'missed' }],
    ['blocked', { status: 'blocked' }],
    ['has open dependencies', { hasOpenDependencies: true }],
  ])('rejects a subtask that is %s', (_label, overrides) => {
    expect(isFocusEligible(sub(overrides))).toBe(false);
  });
});

describe('selectFocusSubtask', () => {
  it('returns null when the task has no subtasks', () => {
    expect(selectFocusSubtask([], NOW)).toBeNull();
  });

  it('returns null when no subtasks are marked as focus (task fallback)', () => {
    const candidates = [
      sub({ id: 'a', isFocusTask: false }),
      sub({ id: 'b', isFocusTask: false }),
    ];
    expect(selectFocusSubtask(candidates, NOW)).toBeNull();
  });

  it('excludes blocked subtasks', () => {
    const pick = selectFocusSubtask(
      [sub({ id: 'blocked', status: 'blocked' }), sub({ id: 'open' })],
      NOW,
    );
    expect(pick?.subtaskId).toBe('open');
  });

  it('returns null when the only focus subtask is blocked (task fallback)', () => {
    expect(
      selectFocusSubtask([sub({ id: 'x', status: 'blocked' })], NOW),
    ).toBeNull();
  });

  it('excludes subtasks with unfinished dependencies', () => {
    const pick = selectFocusSubtask(
      [
        sub({ id: 'waiting', hasOpenDependencies: true }),
        sub({ id: 'ready', hasOpenDependencies: false }),
      ],
      NOW,
    );
    expect(pick?.subtaskId).toBe('ready');
  });

  it('excludes completed subtasks', () => {
    const pick = selectFocusSubtask(
      [sub({ id: 'done', isDone: true }), sub({ id: 'todo' })],
      NOW,
    );
    expect(pick?.subtaskId).toBe('todo');
  });

  it('orders by due date first — the sooner-due subtask wins even at lower priority', () => {
    const pick = selectFocusSubtask(
      [
        sub({
          id: 'later',
          priority: 'urgent',
          dueDate: new Date('2026-07-11T12:00:00.000Z'), // +72h
        }),
        sub({
          id: 'sooner',
          priority: 'low',
          dueDate: new Date('2026-07-08T17:00:00.000Z'), // +5h
        }),
      ],
      NOW,
    );
    expect(pick?.subtaskId).toBe('sooner');
  });

  it('orders by priority when due dates are equal', () => {
    const pick = selectFocusSubtask(
      [
        sub({ id: 'low', priority: 'low' }),
        sub({ id: 'urgent', priority: 'urgent' }),
        sub({ id: 'medium', priority: 'medium' }),
      ],
      NOW,
    );
    expect(pick?.subtaskId).toBe('urgent');
  });

  it('breaks priority ties by shorter estimated duration', () => {
    const pick = selectFocusSubtask(
      [
        sub({ id: 'long', estimatedDurationMinutes: 90 }),
        sub({ id: 'short', estimatedDurationMinutes: 20 }),
      ],
      NOW,
    );
    expect(pick?.subtaskId).toBe('short');
  });

  it('falls back to manual order (orderIndex) as the final signal', () => {
    const pick = selectFocusSubtask(
      [
        sub({ id: 'second', orderIndex: 2 }),
        sub({ id: 'first', orderIndex: 1 }),
      ],
      NOW,
    );
    expect(pick?.subtaskId).toBe('first');
  });

  it('builds the selection payload from the chosen subtask', () => {
    const pick = selectFocusSubtask(
      [
        sub({
          id: 'chapter-1',
          title: 'Review Chapter 1',
          priority: 'high',
          estimatedDurationMinutes: 40,
          dueDate: new Date('2026-07-09T09:00:00.000Z'), // ~+21h => due soon
        }),
      ],
      NOW,
    );

    expect(pick).toEqual({
      subtaskId: 'chapter-1',
      subtaskTitle: 'Review Chapter 1',
      estimatedMinutes: 40,
      reason: expect.stringMatching(/due soon/i),
    });
  });

  it('gives a generic reason when there are no urgency/priority signals', () => {
    const pick = selectFocusSubtask([sub({ id: 'plain' })], NOW);
    expect(pick?.reason).toMatch(/next up/i);
  });
});
