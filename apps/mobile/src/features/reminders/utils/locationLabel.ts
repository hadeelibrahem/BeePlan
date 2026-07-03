import type { Reminder } from '../types/reminders.types';

export function getLocationLabel(location: NonNullable<Reminder['location']>): string {
  if (location.mode === 'general_category' && location.generalCategory) {
    return location.generalCategory.category === 'custom' && location.generalCategory.customLabel
      ? location.generalCategory.customLabel
      : location.generalCategory.category.replace('_', ' ');
  }

  return location.specificPlace?.placeName ?? '';
}
