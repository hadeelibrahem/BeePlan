import { applySubtaskOverrides } from './project-plan.service';
import type { RawSubtask } from './project-plan.logic';

const START = new Date('2026-07-28T09:00:00.000Z');
const DUE = new Date('2026-07-30T09:00:00.000Z');

function row(over: Partial<RawSubtask> = {}): RawSubtask {
  return {
    id: 'sub-1',
    title: 'Write the intro',
    status: 'todo',
    isDone: false,
    assigneeUserId: 'u1',
    startDate: START,
    dueDate: DUE,
    estimatedDurationMinutes: 60,
    actualDurationMinutes: null,
    priority: 'medium',
    ...over,
  };
}

describe('applySubtaskOverrides', () => {
  it('returns the same rows when there is nothing to override', () => {
    const rows = [row()];
    expect(applySubtaskOverrides(rows, undefined)).toBe(rows);
    expect(applySubtaskOverrides(rows, [])).toBe(rows);
  });

  it('replaces the assignee without disturbing dates', () => {
    const [result] = applySubtaskOverrides([row()], [{ subtaskId: 'sub-1', assigneeUserId: 'u2' }]);
    expect(result.assigneeUserId).toBe('u2');
    expect(result.startDate).toBe(START);
    expect(result.dueDate).toBe(DUE);
  });

  it('replaces dates without disturbing the assignee', () => {
    const newStart = new Date('2026-07-29T09:00:00.000Z');
    const [result] = applySubtaskOverrides([row()], [{ subtaskId: 'sub-1', startDate: newStart }]);
    expect(result.startDate).toBe(newStart);
    expect(result.assigneeUserId).toBe('u1');
  });

  // `undefined` = leave alone, `null` = clear. The distinction matters because a
  // reschedule override sets startDate but must not silently unassign the item.
  it('treats null as an explicit clear and undefined as leave-alone', () => {
    const [cleared] = applySubtaskOverrides([row()], [{ subtaskId: 'sub-1', assigneeUserId: null }]);
    expect(cleared.assigneeUserId).toBeNull();

    const [untouched] = applySubtaskOverrides([row()], [{ subtaskId: 'sub-1', startDate: START }]);
    expect(untouched.assigneeUserId).toBe('u1');
  });

  it('ignores overrides for subtasks that are not in the plan', () => {
    const [result] = applySubtaskOverrides([row()], [{ subtaskId: 'ghost', assigneeUserId: 'u2' }]);
    expect(result.assigneeUserId).toBe('u1');
  });

  it('leaves other rows untouched and does not mutate the input', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b', assigneeUserId: 'u3' })];
    const result = applySubtaskOverrides(rows, [{ subtaskId: 'a', assigneeUserId: 'u2' }]);
    expect(result[1]).toBe(rows[1]);
    expect(rows[0].assigneeUserId).toBe('u1');
    expect(result[0].assigneeUserId).toBe('u2');
  });

  it('applies several overrides in one pass', () => {
    const result = applySubtaskOverrides(
      [row({ id: 'a' }), row({ id: 'b' })],
      [
        { subtaskId: 'a', assigneeUserId: 'u2' },
        { subtaskId: 'b', dueDate: null },
      ],
    );
    expect(result[0].assigneeUserId).toBe('u2');
    expect(result[1].dueDate).toBeNull();
  });
});
