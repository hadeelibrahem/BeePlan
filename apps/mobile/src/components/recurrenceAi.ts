import type { AiRecurrenceParseResponse } from '../lib/tasksApi'

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export type RecurrenceAiParser = (
  message: string,
) => Promise<AiRecurrenceParseResponse>

export type AiRecurrenceDraft = {
  frequency: 'Never' | 'Daily' | 'Weekly' | 'Monthly' | 'Yearly' | 'Custom'
  weekdays: string[]
  monthlyMode: 'sameDay' | 'lastDay' | 'firstWeekday'
  customInterval: number
  customUnit: 'days' | 'weeks' | 'months'
  endType: 'never' | 'onDate' | 'after'
  endDate: string
  occurrences: number
}

export function validateAiRecurrenceMessage(message: string) {
  const trimmed = message.trim()
  if (!trimmed) return 'Describe how this task should repeat.'
  if (trimmed.length > 1000) return 'Keep the recurrence description to 1000 characters or fewer.'
  return ''
}

export async function parseAiRecurrence(message: string, parse: RecurrenceAiParser) {
  const validationError = validateAiRecurrenceMessage(message)
  if (validationError) throw new Error(validationError)
  return parse(message.trim())
}

export function isUsableAiRecurrence(result: AiRecurrenceParseResponse) {
  return (
    ['daily', 'weekly', 'monthly', 'yearly', 'custom', 'never'].includes(result.repeat) &&
    Number.isFinite(result.interval) &&
    result.interval >= 1 &&
    Array.isArray(result.daysOfWeek) &&
    ['never', 'onDate', 'afterOccurrences'].includes(result.endCondition) &&
    (!result.time || /^([01]\d|2[0-3]):[0-5]\d$/.test(result.time))
  )
}

export function applyAiRecurrence(
  result: AiRecurrenceParseResponse,
  current: AiRecurrenceDraft,
): AiRecurrenceDraft | null {
  if (!isUsableAiRecurrence(result)) return null

  const selectedWeekdays = result.daysOfWeek.filter((day) => weekdays.includes(day))
  const endPatch = toEndPatch(result)
  if (!endPatch) return null

  if (result.repeat === 'never') {
    return {
      frequency: 'Never', weekdays: [], monthlyMode: 'sameDay', customInterval: 1,
      customUnit: 'weeks', endType: 'never', endDate: '', occurrences: 1,
    }
  }
  if (result.repeat === 'daily') {
    return { ...current, ...endPatch, frequency: result.interval === 1 ? 'Daily' : 'Custom', weekdays: [], customInterval: result.interval, customUnit: 'days' }
  }
  if (result.repeat === 'weekly') {
    if (!selectedWeekdays.length) return null
    return { ...current, ...endPatch, frequency: result.interval === 1 ? 'Weekly' : 'Custom', weekdays: selectedWeekdays, customInterval: result.interval, customUnit: 'weeks' }
  }
  if (result.repeat === 'monthly') {
    return {
      ...current,
      ...endPatch,
      frequency: result.interval === 1 ? 'Monthly' : 'Custom',
      weekdays: selectedWeekdays,
      monthlyMode: selectedWeekdays.length && !result.dayOfMonth ? 'firstWeekday' : 'sameDay',
      customInterval: result.interval,
      customUnit: 'months',
    }
  }
  if (result.repeat === 'yearly') {
    return { ...current, ...endPatch, frequency: result.interval === 1 ? 'Yearly' : 'Custom', weekdays: [], customInterval: result.interval, customUnit: 'months' }
  }
  return { ...current, ...endPatch, frequency: 'Custom', weekdays: selectedWeekdays, customInterval: result.interval, customUnit: current.customUnit }
}

function toEndPatch(result: AiRecurrenceParseResponse): Pick<AiRecurrenceDraft, 'endType' | 'endDate' | 'occurrences'> | null {
  if (result.endCondition === 'never') return { endType: 'never', endDate: '', occurrences: 1 }
  if (result.endCondition === 'afterOccurrences') {
    if (!result.occurrences || result.occurrences < 1) return null
    return { endType: 'after', endDate: '', occurrences: Math.round(result.occurrences) }
  }

  const endDate = normalizeDate(result.endDate)
  return endDate ? { endType: 'onDate', endDate, occurrences: 1 } : null
}

function normalizeDate(value: string | null) {
  if (!value) return null
  const match = value.match(/^\d{4}-\d{2}-\d{2}/)
  if (match) return match[0]
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}
