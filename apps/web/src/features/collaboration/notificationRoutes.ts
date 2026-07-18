import type { AppNotification } from './types'

const COLLABORATION_NOTIFICATION_TYPES = new Set<AppNotification['type']>([
  'comment_added',
  'mention',
  'member_joined',
  'member_removed',
  'member_role_changed',
  'ownership_transferred',
])

export function notificationTarget(notification: AppNotification): string | null {
  if (!notification.taskId) return null
  const taskPath = `/tasks/${encodeURIComponent(notification.taskId)}`
  return COLLABORATION_NOTIFICATION_TYPES.has(notification.type)
    ? `${taskPath}/collaboration?notification=${encodeURIComponent(notification.id)}`
    : taskPath
}
