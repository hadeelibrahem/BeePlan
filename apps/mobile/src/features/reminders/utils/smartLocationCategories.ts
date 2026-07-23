import type { GeneralLocationCategory } from '../types/reminders.types';

export const GENERAL_LOCATION_CATEGORIES: GeneralLocationCategory[] = [
  'home',
  'work',
  'university',
  'school',
  'gym',
  'pharmacy',
  'supermarket',
  'cafe',
  'grocery_store',
  'coffee_shop',
  'restaurant',
  'bakery',
  'hospital',
  'clinic',
  'airport',
  'train_station',
  'bus_station',
  'bank',
  'atm',
  'bookstore',
  'electronics_store',
  'shopping_mall',
  'hardware_store',
  'pet_store',
  'laundry',
  'post_office',
  'parking',
  'gas_station',
  'mosque',
  'library',
];

export const SMART_LOCATION_CATEGORIES: GeneralLocationCategory[] = [
  'pharmacy',
  'supermarket',
  'cafe',
  'grocery_store',
  'coffee_shop',
  'restaurant',
  'bakery',
  'hospital',
  'clinic',
  'airport',
  'train_station',
  'bus_station',
  'bank',
  'atm',
  'bookstore',
  'electronics_store',
  'shopping_mall',
  'hardware_store',
  'pet_store',
  'laundry',
  'post_office',
  'gas_station',
  'gym',
  'school',
  'university',
  'library',
];

export const SMART_LOCATION_EMOJI: Partial<Record<GeneralLocationCategory, string>> = {
  pharmacy: '🏥',
  hospital: '🏥',
  clinic: '🏥',
  supermarket: '🛒',
  grocery_store: '🛒',
  cafe: '☕',
  coffee_shop: '☕',
  restaurant: '🍽',
  bakery: '🥖',
  atm: '🏧',
  bank: '🏦',
  gas_station: '⛽',
  gym: '💪',
  library: '📚',
  bookstore: '📚',
  electronics_store: '🔌',
  shopping_mall: '🛍',
  hardware_store: '🔧',
  pet_store: '🐾',
  laundry: '🧺',
  post_office: '✉',
  airport: '✈',
  train_station: '🚆',
  bus_station: '🚌',
  school: '🏫',
  university: '🎓',
};

/**
 * Per-category geofence radius defaults, in meters. Small/precise venues (ATMs,
 * pharmacies) use a tight radius; large venues (airports, malls) need a wider one
 * so the reminder still fires from the parking lot or curb.
 */
export const CATEGORY_DEFAULT_RADIUS: Partial<Record<GeneralLocationCategory, number>> = {
  atm: 100,
  bank: 100,
  pharmacy: 150,
  clinic: 150,
  post_office: 150,
  laundry: 150,
  cafe: 200,
  coffee_shop: 200,
  bakery: 200,
  grocery_store: 200,
  pet_store: 200,
  bookstore: 200,
  electronics_store: 200,
  hardware_store: 200,
  supermarket: 250,
  restaurant: 250,
  gym: 250,
  library: 250,
  gas_station: 300,
  hospital: 300,
  school: 300,
  bus_station: 300,
  train_station: 400,
  university: 400,
  shopping_mall: 400,
  airport: 500,
};

const FALLBACK_RADIUS_METERS = 200;

export function getCategoryDefaultRadius(category: GeneralLocationCategory): number {
  return CATEGORY_DEFAULT_RADIUS[category] ?? FALLBACK_RADIUS_METERS;
}

/**
 * Used only when a smart-location reminder has no stored AI/rules confidence
 * (e.g. editing a reminder saved before confidence was tracked). Deliberately a
 * medium-tier value rather than a high one, since we have no actual signal.
 */
export const DEFAULT_UNKNOWN_CONFIDENCE = 0.75;

export function matchGeneralCategory(rawCategory: string): { category: GeneralLocationCategory; customLabel?: string } {
  const normalized = rawCategory.trim().toLowerCase().replaceAll(' ', '_');
  const match = GENERAL_LOCATION_CATEGORIES.find((category) => category === normalized);
  if (match) return { category: match };
  return { category: 'custom', customLabel: rawCategory.trim() || undefined };
}

export function getCategoryLabel(category: GeneralLocationCategory, t: (key: string) => string) {
  return t(`reminders.generalLocationCategory.${category}`);
}

export function getCategoryEmoji(category: GeneralLocationCategory) {
  return SMART_LOCATION_EMOJI[category] ?? '📍';
}

export type ConfidenceTier = 'high' | 'medium' | 'low';

export function getConfidenceTier(confidence: number): ConfidenceTier {
  if (confidence >= 0.9) return 'high';
  if (confidence >= 0.7) return 'medium';
  return 'low';
}

export const CONFIDENCE_TIER_EMOJI: Record<ConfidenceTier, string> = {
  high: '🟢',
  medium: '🟡',
  low: '🔴',
};
