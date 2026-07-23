import type { GeneralLocationCategory, GeoapifyPlaceSelection } from '../types/reminders.types';

const BASE_URL = 'https://api.geoapify.com';

function getApiKey(): string {
  // Expo inlines env vars prefixed with EXPO_PUBLIC_ at bundle time — VITE_
  // vars are a Vite/web-only convention and are never available here.
  const apiKey = process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY;

  if (!apiKey) {
    throw new Error('EXPO_PUBLIC_GEOAPIFY_API_KEY is not configured.');
  }

  return apiKey;
}

export type GeoapifyPlaceSuggestion = GeoapifyPlaceSelection & {
  label: string;
};

type GeoapifyAutocompleteResult = {
  place_id: string;
  formatted: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  lat?: number;
  lon?: number;
};

type GeoapifyPlaceFeature = {
  properties?: GeoapifyAutocompleteResult & {
    name?: string;
    distance?: number;
    categories?: string[];
  };
  geometry?: {
    type?: string;
    coordinates?: [number, number];
  };
};

export type NearbyGeoapifyPlace = GeoapifyPlaceSuggestion & {
  distanceMeters: number;
  categories: string[];
};

const GEOAPIFY_CATEGORY_BY_REMINDER_CATEGORY: Partial<Record<GeneralLocationCategory, string[]>> = {
  pharmacy: ['healthcare.pharmacy', 'commercial.health_and_beauty.pharmacy'],
  supermarket: ['commercial.supermarket'],
  grocery_store: ['commercial.supermarket'],
  cafe: ['catering.cafe'],
  coffee_shop: ['catering.cafe.coffee_shop', 'catering.cafe.coffee', 'commercial.food_and_drink.coffee_and_tea'],
  restaurant: ['catering.restaurant'],
  bakery: ['commercial.food_and_drink.bakery'],
  atm: ['service.financial.atm'],
  bank: ['service.financial.bank'],
  gas_station: ['service.vehicle.fuel', 'commercial.gas'],
  hospital: ['healthcare.hospital'],
  clinic: ['healthcare.clinic_or_praxis'],
  gym: ['sport.fitness.gym', 'sport.fitness.fitness_centre'],
  school: ['education.school'],
  university: ['education.university'],
  library: ['education.library'],
  bookstore: ['commercial.books'],
  electronics_store: ['commercial.elektronics'],
  shopping_mall: ['commercial.shopping_mall'],
  hardware_store: ['commercial.houseware_and_hardware.hardware_and_tools', 'commercial.houseware_and_hardware.doityourself'],
  pet_store: ['pet.shop'],
  laundry: ['service.cleaning.laundry', 'service.cleaning.dry_cleaning'],
  post_office: ['service.post.office'],
  airport: ['airport', 'airport.terminal'],
  train_station: ['public_transport.train'],
  bus_station: ['public_transport.bus'],
};

/**
 * Searches Geoapify's autocomplete endpoint and returns fully-resolved place
 * selections (no follow-up place-details request needed — the autocomplete
 * response already carries coordinates and the geoapify place id).
 */
export async function searchPlaces(query: string, limit = 5): Promise<GeoapifyPlaceSuggestion[]> {
  if (!query.trim()) return [];

  const apiKey = getApiKey();
  const url = `${BASE_URL}/v1/geocode/autocomplete?text=${encodeURIComponent(query)}&limit=${limit}&format=json&apiKey=${apiKey}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Failed to search places.');
  }

  const data = await response.json();
  const results = (data.results ?? []) as GeoapifyAutocompleteResult[];

  return results
    .filter((result) => Number.isFinite(result.lat) && Number.isFinite(result.lon))
    .map((result) => ({
      geoapifyPlaceId: result.place_id,
      placeName: result.address_line1 ?? result.formatted,
      address: result.address_line2 ?? result.formatted,
      city: result.city,
      latitude: Number(result.lat),
      longitude: Number(result.lon),
      label: result.formatted,
    }));
}

export async function searchNearbyPlacesByCategory({
  category,
  latitude,
  longitude,
  radiusMeters,
  limit = 10,
}: {
  category: GeneralLocationCategory;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  limit?: number;
}): Promise<NearbyGeoapifyPlace[]> {
  const categories = GEOAPIFY_CATEGORY_BY_REMINDER_CATEGORY[category];
  if (!categories?.length) return [];

  const apiKey = getApiKey();
  const params = new URLSearchParams({
    categories: categories.join(','),
    filter: `circle:${longitude},${latitude},${radiusMeters}`,
    bias: `proximity:${longitude},${latitude}`,
    limit: String(limit),
    apiKey,
  });
  const response = await fetch(`${BASE_URL}/v2/places?${params.toString()}`);

  if (!response.ok) {
    throw new Error('Failed to search nearby places.');
  }

  const data = await response.json();
  const features = (data.features ?? []) as GeoapifyPlaceFeature[];

  return features
    .map((feature): NearbyGeoapifyPlace | null => {
      const properties = feature.properties;
      const coordinates = feature.geometry?.coordinates;
      const resultLatitude = properties?.lat ?? coordinates?.[1];
      const resultLongitude = properties?.lon ?? coordinates?.[0];

      if (!properties || !Number.isFinite(resultLatitude) || !Number.isFinite(resultLongitude)) {
        return null;
      }

      const placeName = properties.name ?? properties.address_line1 ?? properties.formatted;
      const address = properties.address_line2 ?? properties.formatted;

      return {
        geoapifyPlaceId: properties.place_id,
        placeName,
        address,
        city: properties.city,
        latitude: Number(resultLatitude),
        longitude: Number(resultLongitude),
        label: properties.formatted,
        distanceMeters: properties.distance ?? 0,
        categories: properties.categories ?? [],
      };
    })
    .filter((place): place is NearbyGeoapifyPlace => Boolean(place));
}

type GeoapifyReverseResult = GeoapifyAutocompleteResult;

/**
 * Resolves a place name/address for a raw coordinate pair — used after a
 * map tap or "use my current location" pin drop. Falls back to a generic
 * "Pinned location" label if Geoapify has nothing nearby to name.
 */
export async function reverseGeocode(latitude: number, longitude: number): Promise<GeoapifyPlaceSuggestion> {
  const apiKey = getApiKey();
  const url = `${BASE_URL}/v1/geocode/reverse?lat=${latitude}&lon=${longitude}&format=json&apiKey=${apiKey}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Failed to reverse geocode the selected point.');
  }

  const data = await response.json();
  const result = (data.results ?? [])[0] as GeoapifyReverseResult | undefined;

  if (!result) {
    return {
      placeName: 'Pinned location',
      address: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
      latitude,
      longitude,
      label: 'Pinned location',
    };
  }

  return {
    geoapifyPlaceId: result.place_id,
    placeName: result.address_line1 ?? result.formatted,
    address: result.address_line2 ?? result.formatted,
    city: result.city,
    latitude,
    longitude,
    label: result.formatted,
  };
}

/**
 * URL template for Geoapify's raster map tiles, consumable by any slippy-map
 * library (Leaflet, MapLibre, react-native-maps' UrlTile). `{z}`/`{x}`/`{y}`
 * are left as literal placeholders for the map library to substitute.
 */
export function getTileLayerUrl(style: 'osm-bright' | 'osm-carto' = 'osm-bright') {
  const apiKey = getApiKey();
  return `${BASE_URL}/v1/tile/${style}/{z}/{x}/{y}.png?apiKey=${apiKey}`;
}
