import type { NotificationType } from './notification-types';

export type NotificationCategory =
  | 'task'
  | 'calendar'
  | 'focus'
  | 'collaboration'
  | 'ai'
  | 'system';

const CATEGORY_BY_TYPE: Record<NotificationType, NotificationCategory> = {
  reminder: 'task',
  task_overdue: 'task',
  task_invite: 'collaboration',
  invite_accepted: 'collaboration',
  invite_declined: 'collaboration',
  member_joined: 'collaboration',
  member_removed: 'collaboration',
  member_role_changed: 'collaboration',
  ownership_transferred: 'system',
  task_updated: 'task',
  task_completed: 'task',
  due_date_changed: 'calendar',
  priority_changed: 'task',
  reminder_updated: 'task',
  subtask_completed: 'task',
  attachment_added: 'collaboration',
  comment_added: 'collaboration',
  mention: 'collaboration',
  ai_plan_applied: 'ai',
  ai_recommendation_ready: 'ai',
  weather_travel: 'ai',
  task_assistant: 'ai',
  task_created: 'task',
  task_reopened: 'task',
  task_assigned: 'task',
  task_status_changed: 'task',
  calendar_event_created: 'calendar',
  calendar_event_updated: 'calendar',
  calendar_event_cancelled: 'calendar',
  calendar_conflict: 'calendar',
  schedule_changed: 'calendar',
  deadline_changed: 'calendar',
  focus_session_scheduled: 'focus',
  focus_session_completed: 'focus',
  focus_session_cancelled: 'focus',
  focus_reminder: 'focus',
  focus_session_missed: 'focus',
  deadline_risk: 'ai',
  workload_warning: 'ai',
  planner_suggestion: 'ai',
};

export function getNotificationCategory(
  type: NotificationType,
): NotificationCategory {
  return CATEGORY_BY_TYPE[type] ?? 'system';
}

export function isPreferenceBypass(type: NotificationType): boolean {
  return getNotificationCategory(type) === 'system';
}
