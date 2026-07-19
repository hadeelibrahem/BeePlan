import type { TaskPayload } from '../lib/tasksApi'

export type CreateTaskFormValues = {
  title: string
  description: string
  notes: string
  priority: 'Low' | 'Medium' | 'High' | 'Urgent'
  status: 'To Do' | 'In Progress' | 'Done' | 'Missed'
  category: string
  dueDate?: Date
  dueTime: string
  reminderEnabled: boolean
  reminderBeforeMinutes: number
  estimatedHours: string
  labelsText: string
}

const PRIORITY_MAP = { Low: 'low', Medium: 'medium', High: 'high', Urgent: 'urgent' } as const
const STATUS_MAP = { 'To Do': 'todo', 'In Progress': 'in_progress', Done: 'done', Missed: 'missed' } as const

export function validateCreateTask(values: CreateTaskFormValues) {
  if (!values.title.trim()) return 'Task title is required.'
  const estimatedHours = values.estimatedHours.trim() ? Number(values.estimatedHours) : 0
  if (!Number.isFinite(estimatedHours) || estimatedHours < 0) return 'Estimated duration must be a non-negative number.'
  return ''
}

export function createTaskPayload(values: CreateTaskFormValues, recurrence: TaskPayload['recurrence']): TaskPayload {
  const estimatedTimeMinutes = Math.round((values.estimatedHours.trim() ? Number(values.estimatedHours) : 0) * 60)
  return {
    title: values.title.trim(),
    description: values.description.trim(),
    notes: values.notes.trim(),
    priority: PRIORITY_MAP[values.priority],
    status: STATUS_MAP[values.status],
    category: values.category.trim(),
    dueDate: values.dueDate?.toISOString(),
    dueTime: values.dueTime,
    reminderEnabled: values.reminderEnabled,
    reminderBeforeMinutes: values.reminderEnabled ? values.reminderBeforeMinutes : undefined,
    estimatedTimeMinutes,
    remainingTimeMinutes: estimatedTimeMinutes,
    labels: [...new Set(values.labelsText.split(',').map((label) => label.trim()).filter(Boolean))],
    recurrence,
  }
}

export function isCreateTaskDirty(values: CreateTaskFormValues, hasAttachments: boolean, hasRecurrence: boolean) {
  return Boolean(values.title.trim() || values.description.trim() || values.notes.trim() || values.category || values.dueDate || values.dueTime || values.labelsText.trim() || hasAttachments || hasRecurrence || values.priority !== 'Medium' || values.status !== 'To Do' || !values.reminderEnabled || values.reminderBeforeMinutes !== 30 || values.estimatedHours.trim())
}
