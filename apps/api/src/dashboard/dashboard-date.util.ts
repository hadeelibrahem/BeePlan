export function getUtcDayBoundaries(reference = new Date()) {
  const startOfToday = new Date(
    Date.UTC(
      reference.getUTCFullYear(),
      reference.getUTCMonth(),
      reference.getUTCDate(),
    ),
  );
  const startOfTomorrow = new Date(
    Date.UTC(
      reference.getUTCFullYear(),
      reference.getUTCMonth(),
      reference.getUTCDate() + 1,
    ),
  );

  return { startOfToday, startOfTomorrow };
}
