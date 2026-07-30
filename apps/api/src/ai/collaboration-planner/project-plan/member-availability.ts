// Pure, IO-free derivation of a member's deterministic weekly availability, used
// only by the Resource-Aware Forecast (resource-forecast.logic.ts). It reuses the
// EXISTING personal-context signals — planner preferences (working/focus hours,
// sleep, lunch, unavailable windows, daily work cap) and recurring commitments —
// and never invents availability. When a member has no saved data the caller
// supplies defaults and marks `hasData: false` so the forecast can document its
// fallback policy. Kept dependency-free so every branch is trivially unit-testable.

export type DayRange = { start: number; end: number }; // minutes from local midnight [start, end)

export type MemberAvailability = {
  userId: string;
  displayName: string;
  /** localWallMs = utcMs + offsetMinutes * 60_000 (single project timezone). */
  offsetMinutes: number;
  /** Daily cap on real work minutes (planner_preferences.maxDailyWorkMinutes). */
  maxDailyWorkMinutes: number;
  /** Free work windows per weekday (0 = Sunday .. 6 = Saturday), sorted, disjoint. */
  freeWindowsByWeekday: DayRange[][];
  /** Preferred deep-work windows per weekday (⊆ freeWindows), for "outside preferred hours". */
  preferredWindowsByWeekday: DayRange[][];
  /** False when the member had no saved preferences and the documented defaults were used. */
  hasData: boolean;
};

// The assumed general working span when a member has no dedicated working-hours
// record (BeePlan stores focus hours + a daily cap, not a distinct work span).
// Mirrors the solo AI planner's DEFAULT_WORKING_HOURS so both stay consistent.
export const DEFAULT_WORK_DAY = { start: '08:00', end: '21:00' } as const;
export const DEFAULT_MAX_DAILY_WORK_MINUTES = 480;

export type AvailabilityPreferences = {
  focusStartTime: string;
  focusEndTime: string;
  maxDailyWorkMinutes: number;
  sleep: { start: string; end: string };
  lunch: { start: string; end: string };
  unavailableHours: { start: string; end: string }[];
};

export type AvailabilityCommitment = {
  isActive: boolean;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
};

const DAY_MINUTES = 24 * 60;

function toMinutes(time: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(time ?? '');
  if (!match) return NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * The minute ranges an HH:mm..HH:mm window occupies within a single day. A window
 * whose end is not after its start is treated as crossing midnight and yields two
 * ranges (mirrors the planner's windowToDayRanges so behaviour stays consistent).
 */
export function windowToDayRanges(start: string, end: string): DayRange[] {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (Number.isNaN(s) || Number.isNaN(e)) return [];
  if (e > s) return [{ start: s, end: e }];
  const ranges: DayRange[] = [];
  if (e > 0) ranges.push({ start: 0, end: e });
  if (s < DAY_MINUTES) ranges.push({ start: s, end: DAY_MINUTES });
  return ranges;
}

/** Merge overlapping/adjacent ranges into a sorted, disjoint list. */
export function mergeRanges(ranges: DayRange[]): DayRange[] {
  const sorted = [...ranges].filter((r) => r.end > r.start).sort((a, b) => a.start - b.start);
  const merged: DayRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

/** `base` minus every `busy` range, clipped to base, as a sorted disjoint list. */
export function subtractRanges(base: DayRange[], busy: DayRange[]): DayRange[] {
  const blockers = mergeRanges(busy);
  const result: DayRange[] = [];
  for (const segment of mergeRanges(base)) {
    let cursor = segment.start;
    for (const block of blockers) {
      if (block.end <= cursor || block.start >= segment.end) continue;
      if (block.start > cursor) result.push({ start: cursor, end: Math.min(block.start, segment.end) });
      cursor = Math.max(cursor, block.end);
      if (cursor >= segment.end) break;
    }
    if (cursor < segment.end) result.push({ start: cursor, end: segment.end });
  }
  return result.filter((r) => r.end > r.start);
}

/** Intersection of two disjoint range lists. */
export function intersectRanges(a: DayRange[], b: DayRange[]): DayRange[] {
  const result: DayRange[] = [];
  for (const x of a) {
    for (const y of b) {
      const start = Math.max(x.start, y.start);
      const end = Math.min(x.end, y.end);
      if (end > start) result.push({ start, end });
    }
  }
  return mergeRanges(result);
}

/**
 * Build one member's weekly availability from their saved preferences + recurring
 * commitments. Free windows = the working span minus sleep, lunch, unavailable
 * hours, and every recurring commitment falling on that weekday. Preferred windows
 * = the intersection of the free windows with the member's focus hours.
 */
export function buildMemberAvailability(input: {
  userId: string;
  displayName: string;
  offsetMinutes: number;
  preferences: AvailabilityPreferences | null;
  commitments: AvailabilityCommitment[];
  hasData: boolean;
}): MemberAvailability {
  const prefs = input.preferences;
  const workSpan: DayRange[] = [
    { start: toMinutes(DEFAULT_WORK_DAY.start), end: toMinutes(DEFAULT_WORK_DAY.end) },
  ];
  const focusRange: DayRange[] = prefs
    ? [{ start: toMinutes(prefs.focusStartTime), end: toMinutes(prefs.focusEndTime) }].filter(
        (r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start,
      )
    : [];

  const activeCommitments = input.commitments.filter((c) => c.isActive);

  const freeWindowsByWeekday: DayRange[][] = [];
  const preferredWindowsByWeekday: DayRange[][] = [];

  for (let weekday = 0; weekday < 7; weekday += 1) {
    const busy: DayRange[] = [];
    if (prefs) {
      busy.push(...windowToDayRanges(prefs.sleep.start, prefs.sleep.end));
      busy.push(...windowToDayRanges(prefs.lunch.start, prefs.lunch.end));
      for (const window of prefs.unavailableHours) busy.push(...windowToDayRanges(window.start, window.end));
    }
    for (const commitment of activeCommitments) {
      if (commitment.daysOfWeek.includes(weekday)) {
        busy.push(...windowToDayRanges(commitment.startTime, commitment.endTime));
      }
    }
    const free = subtractRanges(workSpan, busy);
    freeWindowsByWeekday[weekday] = free;
    preferredWindowsByWeekday[weekday] = focusRange.length ? intersectRanges(free, focusRange) : [];
  }

  return {
    userId: input.userId,
    displayName: input.displayName,
    offsetMinutes: input.offsetMinutes,
    maxDailyWorkMinutes:
      prefs && Number.isFinite(prefs.maxDailyWorkMinutes) && prefs.maxDailyWorkMinutes > 0
        ? prefs.maxDailyWorkMinutes
        : DEFAULT_MAX_DAILY_WORK_MINUTES,
    freeWindowsByWeekday,
    preferredWindowsByWeekday,
    hasData: input.hasData,
  };
}

/** The default availability for a member with no saved preferences (documented fallback). */
export function fallbackAvailability(
  userId: string,
  displayName: string,
  offsetMinutes: number,
): MemberAvailability {
  return buildMemberAvailability({
    userId,
    displayName,
    offsetMinutes,
    preferences: null,
    commitments: [],
    hasData: false,
  });
}

export const FALLBACK_POLICY_TEXT =
  'Members without saved working hours are assumed available 08:00–21:00 in the project timezone, ' +
  'minus sleep, lunch, and unavailable windows, and capped at their daily work limit ' +
  '(8h when unset). Unassigned or estimate-less items are left unscheduled rather than guessed.';
