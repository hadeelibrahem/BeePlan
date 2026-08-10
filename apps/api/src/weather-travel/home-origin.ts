export type SavedHomeCandidate = {
  name: string | null;
  category: string | null;
  latitude: unknown;
  longitude: unknown;
};

/** Exact semantic Home match, with a narrow legacy name-only compatibility path. */
export function isHomeOriginCandidate(place: SavedHomeCandidate) {
  const category = place.category?.trim().toLowerCase() || null;
  const name = place.name?.trim().toLowerCase() ?? '';
  const semanticHome = category === 'home' || (category === null && name === 'home');
  const latitude = Number(place.latitude);
  const longitude = Number(place.longitude);
  return semanticHome && Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}
