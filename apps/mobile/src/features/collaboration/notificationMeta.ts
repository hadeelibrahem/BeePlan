import type { MobileIconName } from '../../components/layout/MobileIcon';
import type { NotificationType } from './types';

export type NotificationCategory = 'tasks' | 'reminders' | 'collaboration' | 'ai' | 'calendar' | 'focus' | 'planning';
export type NotificationPriority = 'low' | 'normal' | 'high';
export type NotificationMeta = { icon: MobileIconName; category: NotificationCategory; priority: NotificationPriority };
const task: NotificationMeta = { icon: 'tasks', category: 'tasks', priority: 'normal' };
const collaboration: NotificationMeta = { icon: 'people', category: 'collaboration', priority: 'normal' };
const calendar: NotificationMeta = { icon: 'calendar', category: 'calendar', priority: 'normal' };
const focus: NotificationMeta = { icon: 'focus', category: 'focus', priority: 'normal' };
const ai: NotificationMeta = { icon: 'planner', category: 'ai', priority: 'normal' };

export const NOTIFICATION_META: Record<NotificationType, NotificationMeta> = {
  reminder: { icon: 'reminders', category: 'reminders', priority: 'high' }, task_invite: collaboration, invite_accepted: collaboration, invite_declined: collaboration, member_joined: collaboration, member_removed: collaboration, member_role_changed: collaboration, ownership_transferred: collaboration,
  task_updated: task, task_completed: { ...task, priority: 'high' }, due_date_changed: calendar, priority_changed: task, reminder_updated: { icon: 'reminders', category: 'reminders', priority: 'normal' }, subtask_completed: task, attachment_added: { ...collaboration, icon: 'folder' }, comment_added: collaboration, mention: { ...collaboration, priority: 'high' },
  ai_plan_applied: ai, ai_recommendation_ready: ai, weather_travel: { icon: 'calendar', category: 'planning', priority: 'normal' }, task_overdue: { ...task, priority: 'high' }, task_created: task, task_reopened: task, task_assigned: { ...task, icon: 'people' }, task_status_changed: task,
  calendar_event_created: calendar, calendar_event_updated: calendar, calendar_event_cancelled: { ...calendar, priority: 'high' }, calendar_conflict: { ...calendar, priority: 'high' }, schedule_changed: calendar, deadline_changed: { ...calendar, priority: 'high' }, focus_session_scheduled: focus, focus_session_completed: focus, focus_session_cancelled: focus, focus_reminder: { ...focus, priority: 'high' }, focus_session_missed: { ...focus, priority: 'high' }, deadline_risk: { ...ai, priority: 'high' }, workload_warning: { ...ai, priority: 'high' }, planner_suggestion: ai,
};

export function notificationMeta(type: NotificationType): NotificationMeta { return NOTIFICATION_META[type] ?? task; }
