export const MIN_RADIUS_METERS = 10;
export const MAX_RADIUS_METERS = 5000;

export function isValidRadiusMeters(value: number): boolean {
  return (
    Number.isSafeInteger(value) &&
    value >= MIN_RADIUS_METERS &&
    value <= MAX_RADIUS_METERS
  );
}

export function validateRadiusMetersText(value: string): string | null {
  if (!/^\d+$/.test(value)) {
    return 'Radius must be a positive whole number.';
  }

  const radius = Number(value);
  if (!Number.isSafeInteger(radius)) {
    return 'Radius must be a positive whole number.';
  }
  if (radius < MIN_RADIUS_METERS || radius > MAX_RADIUS_METERS) {
    return `Radius must be between ${MIN_RADIUS_METERS} and ${MAX_RADIUS_METERS} meters.`;
  }
  return null;
}
