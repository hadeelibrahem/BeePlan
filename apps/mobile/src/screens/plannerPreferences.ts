import type { EnergyLevel, PlannerPreferences, TimeWindow } from '../lib/plannerApi'

export const ENERGY_LEVELS: EnergyLevel[] = ['high', 'medium', 'low']
export const BUFFER_MINUTES_RANGE = { min: 0, max: 60 } as const
export type EnergyPeriod = keyof PlannerPreferences['energy']

export function validatePlannerPreferences(preferences: PlannerPreferences) {
  if (preferences.focusStartTime >= preferences.focusEndTime) return 'Focus start time must be before focus end time.'
  if (preferences.lunch.start >= preferences.lunch.end) return 'Lunch start time must be before lunch end time.'
  if (!Object.values(preferences.energy).every((level) => ENERGY_LEVELS.includes(level))) return 'Energy preferences must be high, medium, or low.'
  if (preferences.note.length > 1000) return 'Personal note must be at most 1000 characters.'
  return ''
}

export function setEnergyPreference(preferences: PlannerPreferences, period: EnergyPeriod, level: EnergyLevel): PlannerPreferences {
  return { ...preferences, energy: { ...preferences.energy, [period]: level } }
}

/** Mirrors the web number input: blank/invalid input starts at the minimum. */
export function parseBufferMinutes(value: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return BUFFER_MINUTES_RANGE.min
  return Math.max(BUFFER_MINUTES_RANGE.min, Math.min(BUFFER_MINUTES_RANGE.max, Math.round(parsed)))
}

/** Keeps the screen's optimistic React Query update and rollback behavior testable. */
export async function savePlannerPreferencesOptimistically(
  next: PlannerPreferences,
  previous: PlannerPreferences,
  persist: (preferences: PlannerPreferences) => Promise<PlannerPreferences>,
  cache: { optimistic: (preferences: PlannerPreferences) => void; persisted: (preferences: PlannerPreferences) => void; rollback: (preferences: PlannerPreferences) => void },
) {
  cache.optimistic(next)
  try {
    const saved = await persist(next)
    cache.persisted(saved)
    return saved
  } catch (error) {
    cache.rollback(previous)
    throw error
  }
}

export function parseUnavailableHours(value: string): TimeWindow[] {
  return value.split(',').map((part) => part.trim().split('-')).filter(([start, end]) => /^\d{2}:\d{2}$/.test(start) && /^\d{2}:\d{2}$/.test(end) && start < end).map(([start, end]) => ({ start, end })).slice(0, 12)
}

export function formatUnavailableHours(windows: TimeWindow[]) { return windows.map((window) => `${window.start}-${window.end}`).join(', ') }
