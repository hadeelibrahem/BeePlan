import type { Reminder } from './types/reminders.types'

/** Builds a form-only reminder seed for typed Create Reminder navigation. */
export function createReminderInitialState(initialType?: 'task' | 'person' | 'checklist', initialFriendId?: string): Reminder | undefined {
  // Generic task reminders retain the form's normal time-reminder default.
  if (!initialType || initialType === 'task') return undefined
  const now = new Date().toISOString()
  return {
    id: 'navigation-draft',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    title: '',
    type: initialType,
    priority: 'medium',
    ...(initialType === 'person' ? { person: { targetUserId: initialFriendId, radiusMeters: 100, cooldownMinutes: 30, expiration: '1w' as const } } : {}),
  }
}
