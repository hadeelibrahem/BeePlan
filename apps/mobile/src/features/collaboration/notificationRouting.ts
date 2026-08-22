import type { AppNotification } from './types'

export type NotificationDestination =
  | { screen: 'TaskDetails'; taskId: string; commentId?: string; subtaskId?: string }
  | { screen: 'AiCollaboration'; taskId: string }
  | { screen: 'ReminderDetails'; reminderId: string }
  | { screen: 'Calendar'; date?: string }
  | { screen: 'Focus' }
  | { screen: 'AiDailyPlanner' }
  | { screen: 'Notifications' }
  | { screen: 'Challenges' }
  | { screen: 'ChallengeDetail'; challengeId: string }
  | null

const COLLABORATION_TYPES = new Set<string>(['comment_added', 'mention', 'member_joined', 'member_removed', 'member_role_changed', 'ownership_transferred'])

/** Mirrors the web notification route rules using mobile stack destinations. */
export function notificationDestination(notification: AppNotification): NotificationDestination {
  const data = notification.data ?? {}
  if (notification.type === 'challenge_completed') {
    return typeof data.challengeId === 'string' && data.challengeId ? { screen: 'ChallengeDetail', challengeId: data.challengeId } : { screen: 'Challenges' }
  }
  const reminderId = typeof data.reminderId === 'string' ? data.reminderId : undefined
  if ((notification.type === 'reminder' || notification.type === 'reminder_updated') && reminderId) return { screen: 'ReminderDetails', reminderId }
  const route = typeof data.route === 'string' ? data.route : ''
  if (route.startsWith('/calendar') || notification.type.startsWith('calendar_') || notification.type === 'calendar_conflict') return { screen: 'Calendar', date: typeof data.date === 'string' ? data.date : undefined }
  if (route.startsWith('/focus') || notification.type.startsWith('focus_')) return { screen: 'Focus' }
  if (route.startsWith('/ai-planner') || notification.type === 'ai_recommendation_ready' || notification.type === 'planner_suggestion' || notification.type === 'ai_plan_applied') return { screen: 'AiDailyPlanner' }
  if (notification.taskId && (data.destination === 'ai_collaboration' || data.notificationTarget === 'ai_collaboration' || data.tab === 'ai_collaboration')) return { screen: 'AiCollaboration', taskId: notification.taskId }
  if (notification.taskId && COLLABORATION_TYPES.has(notification.type)) return { screen: 'TaskDetails', taskId: notification.taskId, commentId: typeof data.commentId === 'string' ? data.commentId : undefined }
  if (notification.taskId && typeof data.subtaskId === 'string') return { screen: 'TaskDetails', taskId: notification.taskId, subtaskId: data.subtaskId }
  return notification.taskId ? { screen: 'TaskDetails', taskId: notification.taskId } : { screen: 'Notifications' }
}
