export type ReminderType = 'time' | 'location' | 'context' | 'checklist'

export type ReminderStatus = 'active' | 'done' | 'missed' | 'snoozed'

export type ReminderPriority = 'low' | 'medium' | 'high' | 'urgent'

export type TriggerType = 'arrive' | 'leave'

export type RepeatFrequency = 'none' | 'daily' | 'weekly' | 'monthly'

export type ChecklistItem = {
  id: string
  title: string
  isDone: boolean
}

export type RepeatRule = {
  frequency: RepeatFrequency
  interval: number
  daysOfWeek?: string[]
  endDate?: string
}

export type Reminder = {
  id: string
  title: string
  description?: string
  type: ReminderType
  status: ReminderStatus
  priority: ReminderPriority
  remindAt?: string
  reminderBeforeMinutes?: number
  repeatRule?: RepeatRule
  location?: {
    name: string
    radiusMeters: number
    triggerType: TriggerType
  }
  context?: {
    condition: string
    detail?: string
  }
  checklistItems?: ChecklistItem[]
  createdAt: string
  updatedAt: string
}

export type ReminderFormValues = Omit<Reminder, 'id' | 'createdAt' | 'updatedAt' | 'status'>
