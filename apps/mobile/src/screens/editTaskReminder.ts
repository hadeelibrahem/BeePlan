export const TASK_REMINDER_OPTIONS = [10, 30, 60, 1440] as const

export function canScheduleTaskReminder(dueDate?: Date, dueTime = '') {
  return Boolean(dueDate && /^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime))
}

export function validateTaskReminder(enabled: boolean, dueDate?: Date, dueTime = '') {
  return enabled && !canScheduleTaskReminder(dueDate, dueTime) ? 'Set both a due date and time before enabling a task reminder.' : ''
}
