import {
  getEligibleRandomStartCandidates,
  getEligibleRandomStartTasks,
  getRandomStartWeight,
  selectWeightedRandomStart,
} from './random-start.logic';
import { PlannerRuleEngine } from '../ai/planner/planner-rule-engine';

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

  it('keeps active subtasks regardless of dependency completion', () => {
    const subtasks = [
      { ...task('design'), taskId: 'parent', dependencyIds: [] },
      { ...task('connect'), taskId: 'parent', dependencyIds: ['design'] },
      { ...task('tests'), taskId: 'parent', dependencyIds: ['connect'] },
    ];
    const candidates = getEligibleRandomStartCandidates([{ ...task('parent'), subtasks }]);
    expect(candidates.map((item) => item.id)).toEqual(['design', 'connect', 'tests']);
    expect(candidates.find((item) => item.id === 'connect')).toMatchObject({ incompleteDependencyCount: 1, dependencyTitles: ['design'] });
    subtasks[0].status = 'done';
    expect(getEligibleRandomStartCandidates([{ ...task('parent'), subtasks }]).map((item) => item.id)).toEqual(['connect', 'tests']);
  });

  it('keeps blocked and waiting subtasks as user-selectable candidates', () => {
    const candidates = getEligibleRandomStartCandidates([{ ...task('parent'), subtasks: [
      { ...task('blocked', { status: 'blocked' }), taskId: 'parent', dependencyIds: [] },
      { ...task('waiting'), taskId: 'parent', dependencyIds: ['blocked'] },
    ] }]);
    expect(candidates.map((item) => item.id)).toEqual(['blocked', 'waiting']);
  });

  it('mixes standalone tasks and subtasks and excludes by candidate key', () => {
    const candidates = getEligibleRandomStartCandidates([
      task('task-a'),
      { ...task('parent'), subtasks: [{ ...task('subtask-a'), taskId: 'parent', dependencyIds: [] }] },
    ]);
    expect(selectWeightedRandomStart(candidates, { excludeId: 'subtask:subtask-a', random: () => 0 })?.id).toBe('task-a');
  });

  it('excludes only completed tasks and keeps blocked, dependent, and view-only active tasks', () => {
    expect(getEligibleRandomStartTasks([
      task('done', { status: 'done' }), task('viewer', { canEdit: false }),
      task('blocked', { isBlocked: true }), task('dependency', { dependenciesComplete: false }), task('missed', { status: 'missed' }), task('ready'),
    ]).map((item) => item.id)).toEqual(['viewer', 'blocked', 'dependency', 'missed', 'ready']);
  });

  it('includes active tasks with completed or incomplete dependencies and exposes informational metadata', () => {
    const candidates = getEligibleRandomStartCandidates([
      task('plain'),
      task('completed-dependency', { dependencies: [{ id: 'a', title: 'Finished', status: 'done' }] }),
      task('incomplete-dependency', { dependencies: [{ id: 'b', title: 'Finish API', status: 'todo' }], isBlocked: true, dependenciesComplete: false }),
    ]);
    expect(candidates.map((item) => item.id)).toEqual(['plain', 'completed-dependency', 'incomplete-dependency']);
    expect(candidates[2]).toMatchObject({ dependencyCount: 1, incompleteDependencyCount: 1, dependencyTitles: ['Finish API'] });
  });

  it('can select an incomplete dependent task without replacing it', () => {
    const dependent = task('dependent', { dependenciesComplete: false, isBlocked: true });
    expect(selectWeightedRandomStart([task('plain'), dependent], { random: () => 0.999999 })?.id).toBe('dependent');
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

  it('does not weaken the planner dependency constraint', () => {
    const planner = new PlannerRuleEngine();
    const plannerTask = (id: string, dependencyTaskIds: string[] = []) => ({ id, taskId: id, title: id, priority: 'medium', status: 'todo', estimatedMinutes: 30, durationEstimated: false, durationConfidence: 'high', durationReason: 'user', taskType: 'deep', spentMinutes: 0, progress: 0, isFocusTask: false, updatedAt: '2026-08-10T00:00:00Z', dependencyTaskIds });
    const constraints = planner.prepareConstraints({
      userId: 'user', date: '2026-08-11', currentTime: '09:00', timezone: 'UTC', workingHours: { start: '09:00', end: '17:00' }, breaks: [], lockedItems: [], reminders: [], commitments: [], activeTaskIds: new Set(['dependency', 'dependent']),
      tasks: [plannerTask('dependency'), plannerTask('dependent', ['dependency'])],
      preferences: { focusStartTime: '09:00', focusEndTime: '12:00', workBlockMinutes: 30, breakMinutes: 5, energy: { morning: 'high', afternoon: 'medium', evening: 'low', night: 'low' }, scheduleHardTasksInFocus: true, finishStartedFirst: true, groupSimilarTasks: false, bufferBeforeMeetings: false, bufferMinutes: 0, maxDailyWorkMinutes: 480, emergencyBufferMinutes: 0, sleep: { start: '23:00', end: '07:00' }, lunch: { start: '12:00', end: '13:00' }, unavailableHours: [], note: '' },
    } as never);
    expect(constraints.blockedTasks).toEqual(expect.arrayContaining([expect.objectContaining({ task: expect.objectContaining({ id: 'dependent' }), reasonCode: 'dependency_not_completed' })]));
    expect(constraints.schedulableTasks.map((item) => item.id)).toContain('dependency');
  });
});
