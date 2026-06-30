import type { PlaceCategory } from '../features/reminders/types/reminders.types';

const BASE_URL = 'https://api.geoapify.com';

// Geoapify Places API category codes: https://apidocs.geoapify.com/docs/places/#categories
const CATEGORY_CODES: Record<PlaceCategory, string> = {
  pharmacy: 'healthcare.pharmacy',
  supermarket: 'commercial.supermarket',
  restaurant: 'catering.restaurant',
  hospital: 'healthcare.hospital',
  university: 'education.university',
  school: 'education.school',
  bank: 'finance.bank',
  atm: 'finance.atm',
  gym: 'sport.fitness',
  gas_station: 'service.vehicle.fuel',
  cafe: 'catering.cafe',
};

function getApiKey(): string {
  const apiKey = process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY;

  if (!apiKey) {
    throw new Error('EXPO_PUBLIC_GEOAPIFY_API_KEY is not configured.');
  }

  return apiKey;
}

export type PlaceSuggestion = {
  placeId: string;
  label: string;
};

export type PlaceDetails = {
  placeName: string;
  address?: string;
  latitude: number;
  longitude: number;
};

export type NearbyPlace = {
  name: string;
  address?: string;
};

export async function autocompletePlaces(text: string): Promise<PlaceSuggestion[]> {
  if (!text.trim()) return [];

  const apiKey = getApiKey();
  const url = `${BASE_URL}/v1/geocode/autocomplete?text=${encodeURIComponent(text)}&format=json&apiKey=${apiKey}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Failed to search places.');
  }

  const data = await response.json();

  return ((data.results ?? []) as Array<{ place_id: string; formatted: string }>).map((result) => ({
    placeId: result.place_id,
    label: result.formatted,
  }));
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const apiKey = getApiKey();
  const url = `${BASE_URL}/v2/place-details?id=${encodeURIComponent(placeId)}&apiKey=${apiKey}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Failed to load place details.');
  }

  const data = await response.json();
  const feature = data.features?.[0];
  const properties = feature?.properties;
  const geometry = feature?.geometry;

  if (!properties) {
    throw new Error('Place details not found.');
  }

  // `properties.lat`/`properties.lon` are always flat numbers and the most
  // reliable source. `geometry.coordinates` is only a simple [lon, lat] pair
  // when geometry.type is "Point" — for buildings/landmarks Geoapify often
  // returns a "Polygon" (nested rings) or "MultiPolygon" instead, which must
  // not be read as coordinates. Coerce with Number() either way so the
  // backend never receives a string or NaN.
  let latitude = Number(properties.lat);
  let longitude = Number(properties.lon);

  if ((!Number.isFinite(latitude) || !Number.isFinite(longitude)) && geometry?.type === 'Point') {
    const [pointLongitude, pointLatitude] = geometry.coordinates as [unknown, unknown];
    latitude = Number(pointLatitude);
    longitude = Number(pointLongitude);
  }

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Place details did not include valid coordinates.');
  }

  return {
    placeName: properties.name ?? properties.address_line1 ?? properties.formatted,
    address: properties.formatted ?? properties.address_line2,
    latitude,
    longitude,
  };
}

export async function searchPlacesByCategory(
  category: PlaceCategory,
  latitude: number,
  longitude: number,
  radiusMeters: number,
  limit = 5,
): Promise<NearbyPlace[]> {
  const apiKey = getApiKey();
  const categoryCode = CATEGORY_CODES[category];
  const url = `${BASE_URL}/v2/places?categories=${categoryCode}&filter=circle:${longitude},${latitude},${radiusMeters}&limit=${limit}&apiKey=${apiKey}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Failed to search nearby places.');
  }

  const data = await response.json();

  return ((data.features ?? []) as Array<{ properties?: { name?: string; formatted?: string } }>).map((feature) => ({
    name: feature.properties?.name ?? feature.properties?.formatted ?? '',
    address: feature.properties?.formatted,
  }));
}
