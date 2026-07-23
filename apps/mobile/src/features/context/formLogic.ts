import type { RecurringCommitmentInput, SavedPlaceInput } from './types'

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const YMD = /^\d{4}-\d{2}-\d{2}$/

export function parseAliases(value: string): string[] {
  return Array.from(new Set(value.split(',').map((alias) => alias.trim()).filter(Boolean)))
}

export function validateSavedPlace(input: SavedPlaceInput): string | null {
  if (!input.name.trim()) return 'Please give this place a name.'
  if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90) return 'Pick a valid location.'
  if (!Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) return 'Pick a valid location.'
  if (!Number.isInteger(input.radiusMeters) || (input.radiusMeters ?? 0) < 1) return 'Radius must be a whole number of meters.'
  if ((input.aliases?.length ?? 0) > 20) return 'Use no more than 20 aliases.'
  return null
}

export function validateCommitment(input: RecurringCommitmentInput): string | null {
  if (!input.title.trim()) return 'Give this commitment a title.'
  if (input.daysOfWeek.length === 0) return 'Select at least one day.'
  if (!HHMM.test(input.startTime) || !HHMM.test(input.endTime)) return 'Times must be HH:mm (24h).'
  if (input.endTime <= input.startTime) return 'End time must be after start time.'
  if (input.startDate && !YMD.test(input.startDate)) return 'Start date must be YYYY-MM-DD.'
  if (input.endDate && !YMD.test(input.endDate)) return 'End date must be YYYY-MM-DD.'
  if (input.startDate && input.endDate && input.endDate < input.startDate) return 'End date must be on or after start date.'
  return null
}
