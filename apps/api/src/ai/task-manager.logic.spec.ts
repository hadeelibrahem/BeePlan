import { taskManagerCandidates } from './task-manager.logic';

const now = new Date('2026-08-03T10:00:00.000Z');
const base = { id: 'task-1', title: 'Team project', userId: 'owner-1', status: 'in_progress', dueDate: new Date('2026-08-04T10:00:00.000Z'), updatedAt: new Date('2026-08-03T09:00:00.000Z') };

describe('taskManagerCandidates', () => {
  it('detects approaching deadlines and overdue work', () => {
    const upcoming = taskManagerCandidates({ task: base, subtasks: [], dependencies: [], now });
    expect(upcoming.some((item) => item.type === 'ai_upcoming_deadline')).toBe(true);
    const overdue = taskManagerCandidates({ task: { ...base, dueDate: new Date('2026-08-02T10:00:00.000Z') }, subtasks: [], dependencies: [], now });
    expect(overdue.some((item) => item.type === 'task_overdue' && item.severity === 'critical')).toBe(true);
  });

  it('detects inactivity, blocked dependencies, and missing planning data', () => {
    const candidates = taskManagerCandidates({ task: { ...base, dueDate: null }, subtasks: [{ id: 'sub-1', title: 'Write', status: 'todo', assigneeUserId: null, estimatedDurationMinutes: null, dueDate: null, updatedAt: new Date('2026-07-29T10:00:00.000Z') }], dependencies: [{ subtaskId: 'sub-1', dependsOnSubtaskId: 'sub-0', completed: false }], now });
    expect(candidates.map((item) => item.type)).toEqual(expect.arrayContaining(['ai_inactivity', 'ai_missing_assignment', 'ai_blocked_dependency']));
    expect(candidates.find((item) => item.type === 'ai_inactivity')?.explanation).toContain('not a performance judgment');
  });

  it('does not flag a completed dependency as blocking', () => {
    const candidates = taskManagerCandidates({ task: { ...base, dueDate: null }, subtasks: [{ id: 'sub-1', title: 'Write', status: 'todo', assigneeUserId: 'user-1', estimatedDurationMinutes: 30, dueDate: null, updatedAt: now }], dependencies: [{ subtaskId: 'sub-1', dependsOnSubtaskId: 'sub-0', completed: true }], now });
    expect(candidates.some((item) => item.type === 'ai_blocked_dependency')).toBe(false);
  });
});
