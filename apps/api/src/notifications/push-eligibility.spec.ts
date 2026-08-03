import { isPushEligible, pushPriorityFor } from './push-eligibility';

describe('push eligibility', () => {
  it('pushes urgent task, collaboration, focus, and risk alerts', () => {
    expect(pushPriorityFor('task_overdue')).toBe('high');
    expect(pushPriorityFor('mention')).toBe('high');
    expect(pushPriorityFor('deadline_risk')).toBe('high');
    expect(isPushEligible('focus_session_completed')).toBe(false);
  });

  it('keeps routine status and background notifications in-app only', () => {
    expect(pushPriorityFor('task_status_changed')).toBeNull();
    expect(pushPriorityFor('weather_travel')).toBe('high');
  });
});
