// Weekday helpers shared by the Personal Context UI. 0 = Sunday .. 6 = Saturday
// (matches JS Date.getDay() and the API's daysOfWeek convention).

export const WEEKDAY_ORDER = [0, 1, 2, 3, 4, 5, 6] as const

const SHORT_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const LONG_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function weekdayShort(day: number): string {
  return SHORT_LABELS[day] ?? String(day)
}

export function weekdayLong(day: number): string {
  return LONG_LABELS[day] ?? String(day)
}

/** "Mon, Tue, Wed" — sorted, de-duplicated, short labels. */
export function formatDays(days: number[]): string {
  return sortDays(days).map(weekdayShort).join(', ')
}

export function sortDays(days: number[]): number[] {
  return Array.from(new Set(days.filter((d) => d >= 0 && d <= 6))).sort((a, b) => a - b)
}

export function toggleDay(days: number[], day: number): number[] {
  return days.includes(day) ? days.filter((d) => d !== day) : sortDays([...days, day])
}

/** "8:00 AM – 11:00 AM" from two HH:mm values. */
export function formatTimeRange(start: string, end: string): string {
  return `${formatTime(start)} – ${formatTime(end)}`
}

export function formatTime(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':')
  const h = Number(hStr)
  const m = Number(mStr)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm
  const period = h < 12 ? 'AM' : 'PM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`
}
