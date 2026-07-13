// Every in-app notification kind the collaboration system can raise. Kept as a
// const tuple so both the service and the client DTOs share one source of
// truth. Reminder-driven notifications reuse the legacy 'reminder' type.
export const NOTIFICATION_TYPES = [
  'reminder',
  'task_invite',
  'invite_accepted',
  'invite_declined',
  'member_joined',
  'member_removed',
  'member_role_changed',
  'ownership_transferred',
  'task_updated',
  'task_completed',
  'due_date_changed',
  'priority_changed',
  'reminder_updated',
  'subtask_completed',
  'attachment_added',
  'comment_added',
  'mention',
  'ai_plan_applied',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
