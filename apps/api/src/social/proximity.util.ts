export type LatLng = { latitude: number; longitude: number };

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Great-circle distance between two coordinates in meters (haversine). Used to
 * decide whether two consenting users are "near" each other; the raw distance
 * never leaves the server — only a boolean nearby/not decision does.
 */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const SHARING_EXPIRATIONS = ['1h', 'today', '1w', 'always'] as const;
export type SharingExpiration = (typeof SHARING_EXPIRATIONS)[number];

/**
 * Resolves a user-facing expiration choice into an absolute expiry timestamp.
 * Returns null for "always" (no expiration). "today" means end of the current
 * UTC day so the permission survives until midnight, matching user intuition.
 */
export function resolveExpiration(
  expiration: SharingExpiration,
  now: Date = new Date(),
): Date | null {
  switch (expiration) {
    case '1h':
      return new Date(now.getTime() + 60 * 60 * 1000);
    case 'today': {
      const end = new Date(now);
      end.setUTCHours(23, 59, 59, 999);
      return end;
    }
    case '1w':
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case 'always':
      return null;
    default:
      return null;
  }
}
