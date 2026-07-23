export const SMART_PLACE_CATEGORIES = [
  'pharmacy',
  'supermarket',
  'cafe',
  'coffee_shop',
  'restaurant',
  'bakery',
  'atm',
  'bank',
  'gas_station',
  'hospital',
  'clinic',
  'gym',
  'school',
  'university',
  'bookstore',
  'electronics_store',
  'shopping_mall',
  'hardware_store',
  'pet_store',
  'laundry',
  'post_office',
  'airport',
  'train_station',
  'bus_station',
  'library',
] as const;

export type SmartPlaceCategory = (typeof SMART_PLACE_CATEGORIES)[number];

const CATEGORY_ALIASES: Record<string, SmartPlaceCategory> = {
  book_store: 'bookstore',
  books: 'bookstore',
  bus_stop: 'bus_station',
  coffee: 'coffee_shop',
  electronics: 'electronics_store',
  fuel: 'gas_station',
  gas: 'gas_station',
  grocery: 'supermarket',
  grocery_store: 'supermarket',
  groceries: 'supermarket',
  hardware: 'hardware_store',
  mall: 'shopping_mall',
  post: 'post_office',
  postoffice: 'post_office',
  train: 'train_station',
};

export function normalizeSmartPlaceCategory(
  value: unknown,
): SmartPlaceCategory | null {
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!normalized) return null;

  if ((SMART_PLACE_CATEGORIES as readonly string[]).includes(normalized)) {
    return normalized as SmartPlaceCategory;
  }

  return CATEGORY_ALIASES[normalized] ?? null;
}

