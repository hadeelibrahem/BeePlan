import {
  getNotificationCategory,
  isPreferenceBypass,
} from './notification-category';

describe('notification categories', () => {
  it('maps every supported notification type to one category', () => {
    expect(getNotificationCategory('task_completed')).toBe('task');
    expect(getNotificationCategory('due_date_changed')).toBe('calendar');
    expect(getNotificationCategory('focus_reminder')).toBe('focus');
    expect(getNotificationCategory('comment_added')).toBe('collaboration');
    expect(getNotificationCategory('ai_recommendation_ready')).toBe('ai');
    expect(getNotificationCategory('weather_travel')).toBe('ai');
    expect(getNotificationCategory('task_overdue')).toBe('task');
    expect(getNotificationCategory('calendar_event_cancelled')).toBe(
      'calendar',
    );
    expect(getNotificationCategory('focus_session_missed')).toBe('focus');
  });

  it('keeps ownership transfer as a non-suppressible system notification', () => {
    expect(isPreferenceBypass('ownership_transferred')).toBe(true);
  });
});
