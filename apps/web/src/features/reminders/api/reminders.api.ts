import type { Reminder, ReminderFormValues } from '../types/reminders.types'

let mockReminders: Reminder[] = [
  {
    id: 'rem-1',
    title: 'Submit project update',
    description: 'Send the final progress note before the evening check-in.',
    type: 'time',
    status: 'active',
    priority: 'high',
    remindAt: new Date(Date.now() + 1000 * 60 * 60 * 3).toISOString(),
    reminderBeforeMinutes: 30,
    repeatRule: { frequency: 'weekly', interval: 1, daysOfWeek: ['Thu'] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'rem-2',
    title: 'Pick up notebooks',
    description: 'Stationery stop after class.',
    type: 'location',
    status: 'active',
    priority: 'medium',
    location: { name: 'Campus bookstore', radiusMeters: 120, triggerType: 'arrive' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'rem-3',
    title: 'Weekend reset checklist',
    type: 'checklist',
    status: 'active',
    priority: 'low',
    checklistItems: [
      { id: 'item-1', title: 'Review missed tasks', isDone: true },
      { id: 'item-2', title: 'Plan next week', isDone: false },
      { id: 'item-3', title: 'Clean desk', isDone: false },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
]

const wait = () => new Promise((resolve) => setTimeout(resolve, 250))

export async function getReminders() {
  await wait()
  return [...mockReminders]
}

export async function fetchReminders() {
  return getReminders()
}

export async function createReminder(values: ReminderFormValues) {
  await wait()
  const now = new Date().toISOString()
  const reminder: Reminder = {
    ...values,
    id: `rem-${Date.now()}`,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }
  mockReminders = [reminder, ...mockReminders]
  return reminder
}

export async function updateReminder(id: string, values: ReminderFormValues) {
  await wait()
  const now = new Date().toISOString()
  mockReminders = mockReminders.map((reminder) =>
    reminder.id === id ? { ...reminder, ...values, updatedAt: now } : reminder,
  )
  return mockReminders.find((reminder) => reminder.id === id) ?? null
}

export async function deleteReminder(id: string) {
  await wait()
  mockReminders = mockReminders.filter((reminder) => reminder.id !== id)
}

export async function toggleReminderStatus(id: string) {
  await wait()
  mockReminders = mockReminders.map((reminder) =>
    reminder.id === id
      ? {
          ...reminder,
          status: reminder.status === 'done' ? 'active' : 'done',
          updatedAt: new Date().toISOString(),
        }
      : reminder,
  )
  return mockReminders.find((reminder) => reminder.id === id) ?? null
}
