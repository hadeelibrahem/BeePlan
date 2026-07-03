import type { ReminderDraft } from '../types/aiAssistant.types'
import type {
  ChecklistReminderTrigger,
  GeneralLocationCategory,
  LocationReminderConfig,
  Reminder,
  ReminderLocationTrigger,
  ReminderTimeTrigger,
} from '../types/reminders.types'

const GENERAL_LOCATION_CATEGORIES: GeneralLocationCategory[] = [
  'home',
  'work',
  'university',
  'school',
  'gym',
  'pharmacy',
  'grocery_store',
  'coffee_shop',
  'restaurant',
  'hospital',
  'airport',
  'bank',
  'atm',
  'parking',
  'gas_station',
  'mosque',
  'library',
]

function matchGeneralCategory(rawCategory: string): { category: GeneralLocationCategory; customLabel?: string } {
  const normalized = rawCategory.trim().toLowerCase().replaceAll(' ', '_')
  const match = GENERAL_LOCATION_CATEGORIES.find((category) => category === normalized)
  if (match) return { category: match }
  return { category: 'custom', customLabel: rawCategory.trim() || undefined }
}

function buildRemindAt(date: string, time: string): string | undefined {
  if (!date.trim() || !time.trim()) return undefined
  return `${date}T${time}`
}

function buildLocationConfig(draft: ReminderDraft): LocationReminderConfig {
  const { location } = draft

  if (location.mode === 'general') {
    return {
      mode: 'general_category',
      generalCategory: matchGeneralCategory(location.category || location.name),
      trigger: location.trigger,
      radiusMeters: location.radius || 100,
    }
  }

  // 'specific' (and 'none') modes need a geocoded place (lat/lng) that free-form
  // AI text can't provide — seed the search field with the extracted name so the
  // user only has to pick the matching suggestion, without guessing coordinates.
  return {
    mode: 'specific_place',
    trigger: location.trigger,
    radiusMeters: location.radius || 100,
    pendingPlaceName: location.name.trim() || undefined,
  }
}

function buildChecklistTrigger(draft: ReminderDraft): ChecklistReminderTrigger {
  const hasTime = Boolean(draft.time.date.trim() && draft.time.time.trim())
  const hasLocation = draft.location.mode !== 'none' && Boolean(draft.location.name || draft.location.category)

  const time: ReminderTimeTrigger = hasTime
    ? { type: 'specific_time', specificTime: { date: draft.time.date, time: draft.time.time, repeat: draft.time.repeat } }
    : { type: 'none' }

  const location: ReminderLocationTrigger = !hasLocation
    ? { type: 'none' }
    : draft.location.mode === 'general'
      ? { type: 'general_location', generalLocation: matchGeneralCategory(draft.location.category || draft.location.name) }
      : { type: 'specific_location', pendingPlaceName: draft.location.name.trim() || undefined }

  return { time, location }
}

/**
 * Converts a backend AI reminder draft into a `Reminder`-shaped object that
 * can be handed to `ReminderForm`'s `initialReminder` prop to prefill it.
 * Fields the AI left empty, or that need geocoding we can't do from text
 * alone, are simply omitted so the form falls back to its own defaults.
 */
export function mapDraftToReminder(draft: ReminderDraft): Reminder {
  const now = new Date().toISOString()

  const reminder: Reminder = {
    id: 'ai-draft',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    title: draft.title.trim(),
    description: draft.description.trim() || undefined,
    type: draft.reminderType,
    priority: draft.priority,
  }

  if (draft.reminderType === 'time') {
    reminder.remindAt = buildRemindAt(draft.time.date, draft.time.time)
    if (reminder.remindAt) {
      reminder.repeatRule = { frequency: draft.time.repeat, interval: 1 }
    }
  }

  if (draft.reminderType === 'location') {
    reminder.location = buildLocationConfig(draft)
  }

  if (draft.reminderType === 'context' && draft.context.condition.trim()) {
    reminder.context = { condition: draft.context.condition.trim() }
  }

  if (draft.reminderType === 'checklist') {
    if (draft.checklist.length) {
      reminder.checklistItems = draft.checklist
        .filter((item) => item.trim())
        .map((title, index) => ({ id: `ai-item-${index}`, title, isDone: false }))
    }
    reminder.checklistReminderTrigger = buildChecklistTrigger(draft)
  }

  return reminder
}
