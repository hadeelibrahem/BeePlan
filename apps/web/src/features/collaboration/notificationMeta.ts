import type { NotificationType } from './types'

export const NOTIFICATION_ICON: Record<NotificationType, string> = {
  reminder: '⏰',
  task_invite: '✉️',
  invite_accepted: '🤝',
  invite_declined: '🙅',
  member_joined: '🎉',
  member_removed: '🚪',
  member_role_changed: '🎭',
  ownership_transferred: '👑',
  task_updated: '📝',
  task_completed: '✅',
  due_date_changed: '📅',
  priority_changed: '⚡',
  reminder_updated: '🔔',
  subtask_completed: '☑️',
  attachment_added: '📎',
  comment_added: '💬',
  mention: '📣',
}
