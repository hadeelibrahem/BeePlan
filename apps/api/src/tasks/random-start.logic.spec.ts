import {
  getEligibleRandomStartCandidates,
  getEligibleRandomStartTasks,
  getRandomStartWeight,
  selectWeightedRandomStart,
} from './random-start.logic';

const task = (id: string, extra = {}) => ({ id, title: id, status: 'todo', priority: 'medium', ...extra });

describe('random start selection', () => {
  it('keeps standalone tasks and replaces parents with actionable subtasks', () => {
    const candidates = getEligibleRandomStartCandidates([
      task('standalone'),
      { ...task('parent'), subtasks: [
        { ...task('child', { priority: 'high' }), taskId: 'parent', dependencyIds: [] },
        { ...task('done-child', { status: 'done' }), taskId: 'parent', dependencyIds: [] },
      ] },
    ]);
    expect(candidates.map((item) => item.id)).toEqual(['standalone', 'child']);
    expect(candidates.find((item) => item.id === 'child')).toMatchObject({ itemType: 'subtask', taskId: 'parent', parentTitle: 'parent' });
  });

  it('does not let the zero-dependency parent flag block a child', () => {
    const candidates = getEligibleRandomStartCandidates([{
      ...task('parent', { dependenciesComplete: false }),
      // This mirrors the assembled entity before the service normalizes its
      // zero-dependency parent state.
      dependencies: [],
      subtasks: [{ ...task('child'), taskId: 'parent', dependencyIds: [] }],
    }]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ itemType: 'subtask', id: 'child' });
  });

  it('excludes blocked subtasks until every dependency is complete', () => {
    const subtasks = [
      { ...task('design'), taskId: 'parent', dependencyIds: [] },
      { ...task('connect'), taskId: 'parent', dependencyIds: ['design'] },
      { ...task('tests'), taskId: 'parent', dependencyIds: ['connect'] },
    ];
    expect(getEligibleRandomStartCandidates([{ ...task('parent'), subtasks }]).map((item) => item.id)).toEqual(['design']);
    subtasks[0].status = 'done';
    expect(getEligibleRandomStartCandidates([{ ...task('parent'), subtasks }]).map((item) => item.id)).toEqual(['connect']);
  });

  it('returns no parent or child when all subtasks are blocked', () => {
    const candidates = getEligibleRandomStartCandidates([{ ...task('parent'), subtasks: [
      { ...task('blocked', { status: 'blocked' }), taskId: 'parent', dependencyIds: [] },
      { ...task('waiting'), taskId: 'parent', dependencyIds: ['blocked'] },
    ] }]);
    expect(candidates).toEqual([]);
  });

  it('mixes standalone tasks and subtasks and excludes by candidate key', () => {
    const candidates = getEligibleRandomStartCandidates([
      task('task-a'),
      { ...task('parent'), subtasks: [{ ...task('subtask-a'), taskId: 'parent', dependencyIds: [] }] },
    ]);
    expect(selectWeightedRandomStart(candidates, { excludeId: 'subtask:subtask-a', random: () => 0 })?.id).toBe('task-a');
  });

  it('excludes completed, inaccessible, blocked, and unavailable tasks', () => {
    expect(getEligibleRandomStartTasks([
      task('done', { status: 'done' }), task('viewer', { canEdit: false }),
      task('blocked', { isBlocked: true }), task('dependency', { dependenciesComplete: false }), task('ready'),
    ]).map((item) => item.id)).toEqual(['ready']);
  });

  it('gives urgent and overdue tasks more weight', () => {
    const now = new Date('2026-08-07T12:00:00Z');
    expect(getRandomStartWeight(task('urgent', { priority: 'urgent', dueDate: '2026-08-06T12:00:00Z' }), 'anything', now))
      .toBeGreaterThan(getRandomStartWeight(task('normal'), 'anything', now));
  });

  it('supports weighted selection, exclusion, one task, and empty pools', () => {
    expect(selectWeightedRandomStart([task('one')], { random: () => 0.5 })?.id).toBe('one');
    expect(selectWeightedRandomStart([], { random: () => 0 }) ).toBeNull();
    expect(selectWeightedRandomStart([task('a'), task('b')], { excludeId: 'a', random: () => 0 })?.id).toBe('b');
  });

  it('does not break on malformed optional metadata', () => {
    expect(selectWeightedRandomStart([task('safe', { dueDate: 'not-a-date', estimatedTimeMinutes: null })], { mode: 'quick_win' })?.id).toBe('safe');
  });
});
