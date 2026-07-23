import { focusParentLabel, focusPrimaryTitle } from './focusDisplay';

describe('Focus display', () => {
  it('puts a selected subtask first and retains parent context', () => {
    const item = { taskTitle: 'AI Midterm Exam Preparation', subtaskId: 'sub-1', subtaskTitle: 'Practice Subject 1 problems' };
    expect(focusPrimaryTitle(item)).toBe('Practice Subject 1 problems');
    expect(focusParentLabel(item)).toBe('Part of: AI Midterm Exam Preparation');
  });

  it('keeps parent recommendations as parent-only items', () => {
    const item = { taskTitle: 'AI Midterm Exam Preparation', subtaskId: null, subtaskTitle: null };
    expect(focusPrimaryTitle(item)).toBe('AI Midterm Exam Preparation');
    expect(focusParentLabel(item)).toBeNull();
  });
});
