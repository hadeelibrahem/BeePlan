export const DASHBOARD_FALLBACK_TIMEZONE = 'UTC';

export type DashboardDayBoundaries = {
  timezone: string;
  localDate: string;
  tomorrowDate: string;
  startOfToday: Date;
  startOfTomorrow: Date;
  startOfDayAfterTomorrow: Date;
  localHour: number;
};

export function resolveDashboardTimezone(timezone: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: timezone || DASHBOARD_FALLBACK_TIMEZONE }).resolvedOptions().timeZone;
  } catch {
    return DASHBOARD_FALLBACK_TIMEZONE;
  }
}

/** Derives UTC query instants from local calendar days using the IANA timezone database. */
export function getDashboardDayBoundaries(timezone: string | null | undefined, now = new Date()): DashboardDayBoundaries {
  const effectiveTimezone = resolveDashboardTimezone(timezone);
  const parts = zonedParts(now, effectiveTimezone);
  const localDate = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  const tomorrow = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  const dayAfterTomorrow = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 2));
  const tomorrowDate = dateKey(tomorrow);
  return {
    timezone: effectiveTimezone,
    localDate,
    tomorrowDate,
    startOfToday: zonedMidnight(localDate, effectiveTimezone),
    startOfTomorrow: zonedMidnight(tomorrowDate, effectiveTimezone),
    startOfDayAfterTomorrow: zonedMidnight(dateKey(dayAfterTomorrow), effectiveTimezone),
    localHour: parts.hour,
  };
}

function zonedMidnight(date: string, timezone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  let instant = new Date(Date.UTC(year, month - 1, day));
  // Format the instant in the requested zone, then converge on that zone's
  // local midnight. Intl supplies the historical/DST offset for each pass.
  for (let i = 0; i < 3; i += 1) {
    const actual = zonedParts(instant, timezone);
    const adjustment = Date.UTC(year, month - 1, day) - Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    if (adjustment === 0) break;
    instant = new Date(instant.getTime() + adjustment);
  }
  return instant;
}

function zonedParts(date: Date, timezone: string) {
  const values = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(values.find((item) => item.type === type)?.value ?? 0);
  return { year: part('year'), month: part('month'), day: part('day'), hour: part('hour'), minute: part('minute'), second: part('second') };
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}
