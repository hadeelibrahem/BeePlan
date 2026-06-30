export type ReminderType = 'time' | 'location' | 'context' | 'checklist'

export type ReminderStatus = 'active' | 'done' | 'missed' | 'snoozed'

export type ReminderPriority = 'low' | 'medium' | 'high' | 'urgent'

export type TriggerType = 'arrive' | 'leave'

export type LocationMode = 'specific' | 'category'

export type PlaceCategory =
  | 'pharmacy'
  | 'supermarket'
  | 'hospital'
  | 'gym'
  | 'gas_station'
  | 'restaurant'
  | 'cafe'
  | 'university'
  | 'school'
  | 'bank'
  | 'atm'

export type RepeatFrequency = 'none' | 'daily' | 'weekly' | 'monthly'

export type ChecklistItem = {
  id: string
  title: string
  isDone: boolean
}

export type TimeTriggerType = 'none' | 'general_time' | 'specific_time'

export type GeneralTimeCategory =
  | 'morning'
  | 'afternoon'
  | 'evening'
  | 'night'
  | 'weekdays'
  | 'weekends'
  | 'custom'

export type SpecificTimeRepeat = RepeatFrequency | 'custom'

export type ReminderTimeTrigger = {
  type: TimeTriggerType
  generalTime?: {
    category: GeneralTimeCategory
    customLabel?: string
  }
  specificTime?: {
    date: string
    time: string
    repeat: SpecificTimeRepeat
  }
}

export type LocationTriggerType = 'none' | 'general_location' | 'specific_location'

export type GeneralLocationCategory =
  | 'home'
  | 'work'
  | 'university'
  | 'school'
  | 'gym'
  | 'pharmacy'
  | 'grocery_store'
  | 'airport'
  | 'hospital'
  | 'custom'

export type GeoapifyPlaceSelection = {
  placeName: string
  address: string
  city?: string
  latitude: number
  longitude: number
  geoapifyPlaceId: string
}

export type ReminderLocationTrigger = {
  type: LocationTriggerType
  generalLocation?: {
    category: GeneralLocationCategory
    customLabel?: string
  }
  specificLocation?: GeoapifyPlaceSelection & {
    trigger: TriggerType
    radius: number
  }
}

export type ChecklistReminderTrigger = {
  time: ReminderTimeTrigger
  location: ReminderLocationTrigger
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
    mode: LocationMode
    placeName?: string
    address?: string
    latitude?: number
    longitude?: number
    category?: PlaceCategory
    radiusMeters: number
    triggerType: TriggerType
  }
  context?: {
    condition: string
    detail?: string
  }
  checklistItems?: ChecklistItem[]
  checklistReminderTrigger?: ChecklistReminderTrigger
  createdAt: string
  updatedAt: string
}

export type ReminderFormValues = Omit<Reminder, 'id' | 'createdAt' | 'updatedAt' | 'status'>
