import type { Reminder } from '../types/reminders.types'

export function getLocationLabel(location: NonNullable<Reminder['location']>): string {
  if (location.mode === 'category' && location.category) {
    return location.category.replace('_', ' ')
  }

  return location.placeName ?? ''
}
