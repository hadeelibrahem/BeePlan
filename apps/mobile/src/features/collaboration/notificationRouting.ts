import type { AppNotification } from './types'

export type NotificationDestination =
  | { screen: 'TaskDetails'; taskId: string }
  | { screen: 'AiCollaboration'; taskId: string }
  | { screen: 'ReminderDetails'; reminderId: string }
  | null

const COLLABORATION_TYPES = new Set<string>(['comment_added', 'mention', 'member_joined', 'member_removed', 'member_role_changed', 'ownership_transferred'])

/** Mirrors the web notification route rules using mobile stack destinations. */
export function notificationDestination(notification: AppNotification): NotificationDestination {
  const data = notification.data ?? {}
  const reminderId = typeof data.reminderId === 'string' ? data.reminderId : undefined
  if ((notification.type === 'reminder' || notification.type === 'reminder_updated') && reminderId) return { screen: 'ReminderDetails', reminderId }
  if (notification.taskId && (data.destination === 'ai_collaboration' || data.notificationTarget === 'ai_collaboration' || data.tab === 'ai_collaboration')) return { screen: 'AiCollaboration', taskId: notification.taskId }
  if (notification.taskId && COLLABORATION_TYPES.has(notification.type)) return { screen: 'TaskDetails', taskId: notification.taskId }
  return notification.taskId ? { screen: 'TaskDetails', taskId: notification.taskId } : null
}
