import {
  activityFingerprint,
  fallbackMotivation,
  motivationCategory,
  type DailyMotivationSummary,
  validateMotivationMessage,
} from './daily-motivation.logic';

const empty: DailyMotivationSummary = {
  completedTasks: 0, completedSubtasks: 0, focusSessions: 0, focusMinutes: 0,
  highPriorityCompleted: 0, inProgressTasks: 0, remainingPlannedTasks: 0,
  completedReminders: 0, recentCompletedTitles: [], latestActivityTimestamp: null,
};

describe('daily motivation logic', () => {
  it('uses a gentle deterministic fallback when there is no activity', () => {
    expect(motivationCategory(empty)).toBe('noActivity');
    expect(fallbackMotivation(empty, 'en')).toContain('small step');
  });

  it('recognizes one completed subtask as progress', () => {
    expect(motivationCategory({ ...empty, completedSubtasks: 1 })).toBe('moderateProgress');
  });

  it('recognizes multiple completed tasks as strong progress', () => {
    expect(motivationCategory({ ...empty, completedTasks: 3 })).toBe('strongProgress');
  });

  it('recognizes focus-heavy days without completed tasks', () => {
    expect(motivationCategory({ ...empty, focusMinutes: 95, focusSessions: 3 })).toBe('focusHeavy');
  });

  it('selects a localized Arabic fallback', () => {
    expect(fallbackMotivation({ ...empty, completedTasks: 2 }, 'ar')).toMatch(/[\u0600-\u06ff]/u);
  });

  it('accepts concise English and Arabic AI responses but rejects markdown and long output', () => {
    expect(validateMotivationMessage('You completed two tasks today, so let your next focused step stay calm and clear.')).toBe(true);
    expect(validateMotivationMessage('أنجزت مهمتين اليوم، فاجعل خطوتك المركزة التالية هادئة وواضحة ومناسبة لطاقة يومك.')).toBe(true);
    expect(validateMotivationMessage('** Great work today with your tasks and focused effort.')).toBe(false);
    expect(validateMotivationMessage('one two three')).toBe(false);
  });

  it('changes the fingerprint when activity changes', () => {
    expect(activityFingerprint(empty)).not.toBe(activityFingerprint({ ...empty, focusMinutes: 25 }));
  });
});
