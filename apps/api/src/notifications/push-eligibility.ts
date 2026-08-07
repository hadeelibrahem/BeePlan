import type { NotificationType } from './notification-types';

export type PushPriority = 'high' | 'normal' | 'low';

const HIGH = new Set<NotificationType>([
  'reminder',
  'task_overdue',
  'task_assigned',
  'task_invite',
  'mention',
  'calendar_conflict',
  'focus_reminder',
  'focus_session_scheduled',
  'deadline_risk',
  'weather_travel',
]);

const NORMAL = new Set<NotificationType>([
  'calendar_event_updated',
  'calendar_event_cancelled',
  'ai_plan_applied',
  'ai_recommendation_ready',
  'workload_warning',
  'planner_suggestion',
  'due_date_changed',
  'ai_blocked_dependency',
  'ai_upcoming_deadline',
  'ai_inactivity',
  'ai_dependency_completed',
  'ai_missing_assignment',
  'ai_daily_summary',
]);

export function pushPriorityFor(type: NotificationType): PushPriority | null {
  if (type === 'task_assistant') return 'high';
  if (HIGH.has(type)) return 'high';
  if (NORMAL.has(type)) return 'normal';
  return null;
}

export function isPushEligible(
  type: NotificationType,
  priority?: PushPriority,
) {
  return Boolean(priority ?? pushPriorityFor(type));
}
