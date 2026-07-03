import type { GeoapifyPlaceSelection } from '../types/reminders.types'

const BASE_URL = 'https://api.geoapify.com'

function getApiKey(): string {
  const apiKey = import.meta.env.VITE_GEOAPIFY_API_KEY

  if (!apiKey) {
    throw new Error('VITE_GEOAPIFY_API_KEY is not configured.')
  }

  return apiKey
}

export type GeoapifyPlaceSuggestion = GeoapifyPlaceSelection & {
  label: string
}

type GeoapifyAutocompleteResult = {
  place_id: string
  formatted: string
  address_line1?: string
  address_line2?: string
  city?: string
  lat?: number
  lon?: number
}

/**
 * Searches Geoapify's autocomplete endpoint and returns fully-resolved place
 * selections (no follow-up place-details request needed — the autocomplete
 * response already carries coordinates and the geoapify place id).
 */
export async function searchPlaces(query: string, limit = 5): Promise<GeoapifyPlaceSuggestion[]> {
  if (!query.trim()) return []

  const apiKey = getApiKey()
  const url = `${BASE_URL}/v1/geocode/autocomplete?text=${encodeURIComponent(query)}&limit=${limit}&format=json&apiKey=${apiKey}`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error('Failed to search places.')
  }

  const data = await response.json()
  const results = (data.results ?? []) as GeoapifyAutocompleteResult[]

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
    }))
}

type GeoapifyReverseResult = GeoapifyAutocompleteResult

/**
 * Resolves a place name/address for a raw coordinate pair — used after a
 * map tap or "use my current location" pin drop. Falls back to a generic
 * "Pinned location" label if Geoapify has nothing nearby to name.
 */
export async function reverseGeocode(latitude: number, longitude: number): Promise<GeoapifyPlaceSuggestion> {
  const apiKey = getApiKey()
  const url = `${BASE_URL}/v1/geocode/reverse?lat=${latitude}&lon=${longitude}&format=json&apiKey=${apiKey}`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error('Failed to reverse geocode the selected point.')
  }

  const data = await response.json()
  const result = (data.results ?? [])[0] as GeoapifyReverseResult | undefined

  if (!result) {
    return {
      placeName: 'Pinned location',
      address: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
      latitude,
      longitude,
      label: 'Pinned location',
    }
  }

  return {
    geoapifyPlaceId: result.place_id,
    placeName: result.address_line1 ?? result.formatted,
    address: result.address_line2 ?? result.formatted,
    city: result.city,
    latitude,
    longitude,
    label: result.formatted,
  }
}

/**
 * URL template for Geoapify's raster map tiles, consumable by any slippy-map
 * library (Leaflet, MapLibre, react-native-maps' UrlTile). `{z}`/`{x}`/`{y}`
 * are left as literal placeholders for the map library to substitute.
 */
export function getTileLayerUrl(style: 'osm-bright' | 'osm-carto' = 'osm-bright') {
  const apiKey = getApiKey()
  return `${BASE_URL}/v1/tile/${style}/{z}/{x}/{y}.png?apiKey=${apiKey}`
}
