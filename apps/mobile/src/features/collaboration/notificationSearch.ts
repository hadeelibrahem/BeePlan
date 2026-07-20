import type { AppNotification } from './types'

export type NotificationReadFilter = 'all' | 'unread' | 'read'

export function filterNotifications(
  notifications: AppNotification[],
  search: string,
  readFilter: NotificationReadFilter = 'all',
) {
  const query = search.trim().toLocaleLowerCase()
  return notifications.filter((notification) => {
    if (readFilter === 'unread' && notification.isRead) return false
    if (readFilter === 'read' && !notification.isRead) return false
    return !query || notificationSearchText(notification).includes(query)
  })
}

export function notificationSearchText(notification: AppNotification) {
  return [
    notification.title,
    notification.body,
    notification.type,
    notification.taskId,
    notification.actor?.fullName,
    ...relatedEntityText(notification.data),
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLocaleLowerCase()
}

function relatedEntityText(data?: Record<string, unknown>) {
  if (!data) return []
  return Object.values(data).flatMap((value) => {
    if (typeof value === 'string' || typeof value === 'number') return [String(value)]
    if (Array.isArray(value)) return value.filter((item): item is string | number => typeof item === 'string' || typeof item === 'number').map(String)
    return []
  })
}
