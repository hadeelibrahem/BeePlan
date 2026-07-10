// Shared, side-effect-free time/date helpers used across the three planner
// layers (Rule Engine, Reasoning Engine, Scheduler Engine). Keeping them here
// avoids duplicating fragile HH:mm arithmetic in each layer.

export function isTime(value?: string): value is string {
  return Boolean(value && /^\d{2}:\d{2}$/.test(value) && toMinutes(value) >= 0 && toMinutes(value) < 24 * 60);
}

export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function fromMinutes(total: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(total)));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

export function addMinutes(time: string, minutes: number): string {
  return fromMinutes(toMinutes(time) + minutes);
}

export function minutesBetween(start: string, end: string): number {
  return Math.max(0, toMinutes(end) - toMinutes(start));
}

export function timeString(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function currentTimeString(): string {
  return timeString(new Date());
}

/** Local YYYY-MM-DD for the current day. */
export function todayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Convert an HH:mm..HH:mm window into the minute ranges it occupies within a
 * single day. A window whose end is not after its start is treated as crossing
 * midnight and yields two ranges (start→end-of-day and start-of-day→end).
 * Ranges are returned in [start, end) minutes-from-midnight.
 */
export function windowToDayRanges(start: string, end: string): { start: number; end: number }[] {
  if (!isTime(start) || !isTime(end)) return [];
  const startMin = toMinutes(start);
  const endMin = toMinutes(end);
  if (endMin > startMin) return [{ start: startMin, end: endMin }];
  // Crosses midnight: e.g. 23:00 → 07:00.
  const ranges: { start: number; end: number }[] = [];
  if (endMin > 0) ranges.push({ start: 0, end: endMin });
  if (startMin < 24 * 60) ranges.push({ start: startMin, end: 24 * 60 });
  return ranges;
}

export function isSameLocalDate(value: Date | null | undefined, date: string): boolean {
  return Boolean(value && value.toISOString().slice(0, 10) === date);
}

/** Add whole days to a YYYY-MM-DD string, returning YYYY-MM-DD. */
export function addDays(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** Whole days between `date` (YYYY-MM-DD) and a Date, positive when `value` is later. */
export function daysBetween(date: string, value: Date): number {
  const start = new Date(`${date}T00:00:00.000Z`).getTime();
  const end = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())).getTime();
  return Math.ceil((end - start) / 86_400_000);
}
