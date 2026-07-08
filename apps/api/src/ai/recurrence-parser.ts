import { InternalServerErrorException } from '@nestjs/common';

export type AiRecurrenceRepeat =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'custom'
  | 'never';

export type AiRecurrenceEndCondition =
  | 'never'
  | 'onDate'
  | 'afterOccurrences';

export type AiRecurrenceParseResponse = {
  repeat: AiRecurrenceRepeat;
  interval: number;
  daysOfWeek: string[];
  dayOfMonth: number | null;
  endCondition: AiRecurrenceEndCondition;
  endDate: string | null;
  occurrences: number | null;
  time: string | null;
  preview: string;
  confidence: number;
  clarifyingQuestion: string | null;
};

const REPEATS: AiRecurrenceRepeat[] = [
  'daily',
  'weekly',
  'monthly',
  'yearly',
  'custom',
  'never',
];
const END_CONDITIONS: AiRecurrenceEndCondition[] = [
  'never',
  'onDate',
  'afterOccurrences',
];
export const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

const WEEKDAY_ALIASES: Record<string, (typeof WEEKDAYS)[number]> = {
  monday: 'Monday',
  mon: 'Monday',
  'الاثنين': 'Monday',
  'الإثنين': 'Monday',
  'اتنين': 'Monday',
  tuesday: 'Tuesday',
  tue: 'Tuesday',
  'الثلاثاء': 'Tuesday',
  wednesday: 'Wednesday',
  wed: 'Wednesday',
  'الاربعاء': 'Wednesday',
  'الأربعاء': 'Wednesday',
  thursday: 'Thursday',
  thu: 'Thursday',
  'الخميس': 'Thursday',
  friday: 'Friday',
  fri: 'Friday',
  'الجمعة': 'Friday',
  saturday: 'Saturday',
  sat: 'Saturday',
  'السبت': 'Saturday',
  sunday: 'Sunday',
  sun: 'Sunday',
  'الاحد': 'Sunday',
  'الأحد': 'Sunday',
};

const MONTH_ALIASES: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
  'يناير': 0,
  'فبراير': 1,
  'مارس': 2,
  'ابريل': 3,
  'أبريل': 3,
  'مايو': 4,
  'يونيو': 5,
  'يوليو': 6,
  'اغسطس': 7,
  'أغسطس': 7,
  'سبتمبر': 8,
  'اكتوبر': 9,
  'أكتوبر': 9,
  'نوفمبر': 10,
  'ديسمبر': 11,
};

export function normalizeAiRecurrenceResponse(
  value: unknown,
  currentDate?: string,
): AiRecurrenceParseResponse {
  if (!value || typeof value !== 'object') {
    throw new InternalServerErrorException('AI returned an invalid recurrence response.');
  }

  const record = value as Record<string, unknown>;
  const referenceDate = parseReferenceDate(currentDate ?? '');
  const repeat = asOneOf(record.repeat, REPEATS, 'never');
  const interval = asPositiveInteger(record.interval, 1, 365, 1);
  const daysOfWeek = normalizeWeekdays(record.daysOfWeek);
  const dayOfMonth = normalizeNullableInteger(record.dayOfMonth, 1, 31);
  const endCondition = asOneOf(record.endCondition, END_CONDITIONS, 'never');
  const endDate = normalizeEndDate(record.endDate, referenceDate);
  const occurrences = normalizeNullableInteger(record.occurrences, 1, 999);
  const time = normalizeTime(record.time);
  const confidence = clampNumber(record.confidence, 0, 1, 0);
  const clarifyingQuestion = normalizeNullableString(record.clarifyingQuestion, 240);
  const preview =
    normalizeNullableString(record.preview, 320) ??
    buildPreview({
      repeat,
      interval,
      daysOfWeek,
      dayOfMonth,
      endCondition,
      endDate,
      occurrences,
      time,
      preview: '',
      confidence,
      clarifyingQuestion,
    });

  if (repeat === 'weekly' && !daysOfWeek.length && !clarifyingQuestion) {
    return {
      repeat,
      interval,
      daysOfWeek,
      dayOfMonth,
      endCondition,
      endDate,
      occurrences,
      time,
      preview,
      confidence: Math.min(confidence, 0.4),
      clarifyingQuestion: 'Which day of the week should it repeat?',
    };
  }

  if (endCondition === 'onDate' && !endDate) {
    return {
      repeat,
      interval,
      daysOfWeek,
      dayOfMonth,
      endCondition: 'never',
      endDate: null,
      occurrences,
      time,
      preview,
      confidence: Math.min(confidence, 0.5),
      clarifyingQuestion: clarifyingQuestion ?? 'What date should the recurrence end?',
    };
  }

  if (endCondition === 'afterOccurrences' && !occurrences) {
    return {
      repeat,
      interval,
      daysOfWeek,
      dayOfMonth,
      endCondition: 'never',
      endDate,
      occurrences: null,
      time,
      preview,
      confidence: Math.min(confidence, 0.5),
      clarifyingQuestion: clarifyingQuestion ?? 'How many occurrences should it repeat for?',
    };
  }

  return {
    repeat,
    interval,
    daysOfWeek,
    dayOfMonth,
    endCondition,
    endDate,
    occurrences,
    time,
    preview,
    confidence,
    clarifyingQuestion,
  };
}

export function parseRecurrenceWithRules(
  message: string,
  currentDate: string,
): AiRecurrenceParseResponse {
  const source = message.trim();
  const normalized = source.toLocaleLowerCase();
  const referenceDate = parseReferenceDate(currentDate);
  const daysOfWeek = extractWeekdays(source);
  const time = extractTime(source);
  const untilDate = extractUntilDate(source, referenceDate);
  const occurrences = extractOccurrences(normalized);
  const interval = extractInterval(normalized);

  let repeat: AiRecurrenceRepeat = 'never';
  let clarifyingQuestion: string | null = null;
  let dayOfMonth: number | null = null;

  if (/\bweekdays?\b/.test(normalized) || /ايام العمل|أيام العمل/.test(source)) {
    repeat = 'weekly';
    daysOfWeek.splice(0, daysOfWeek.length, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday');
  } else if (
    /every\s+day|\bdaily\b|كل يوم|يوميا|يوميًا/.test(normalized)
  ) {
    repeat = 'daily';
  } else if (
    /first\s+sunday\s+of\s+the\s+month|first\s+\w+\s+of\s+the\s+month/.test(normalized)
  ) {
    repeat = 'monthly';
  } else if (
    /\bmonthly\b|every\s+month|كل شهر|شهريا|شهريًا/.test(normalized)
  ) {
    repeat = 'monthly';
    dayOfMonth = extractDayOfMonth(normalized);
  } else if (
    /\byearly\b|every\s+year|كل سنة|كل عام|سنويا|سنويًا/.test(normalized)
  ) {
    repeat = 'yearly';
  } else if (
    /\bweekly\b|every\s+week|كل أسبوع|كل اسبوع|اسبوعيا|أسبوعيا|أسبوعيًا/.test(normalized) ||
    daysOfWeek.length > 0
  ) {
    repeat = 'weekly';
  }

  if (repeat === 'weekly' && !daysOfWeek.length) {
    clarifyingQuestion = 'Which day of the week should it repeat?';
  }

  if (repeat === 'never') {
    clarifyingQuestion = 'How often should this task repeat?';
  }

  const endCondition: AiRecurrenceEndCondition = untilDate
    ? 'onDate'
    : occurrences
      ? 'afterOccurrences'
      : 'never';

  const response: AiRecurrenceParseResponse = {
    repeat,
    interval,
    daysOfWeek: [...new Set(daysOfWeek)],
    dayOfMonth,
    endCondition,
    endDate: untilDate,
    occurrences,
    time,
    preview: '',
    confidence: clarifyingQuestion ? 0.45 : repeat === 'never' ? 0.2 : 0.72,
    clarifyingQuestion,
  };

  return { ...response, preview: buildPreview(response) };
}

/**
 * Coerce any date-ish value into a validated API date string (YYYY-MM-DD), or
 * null when it cannot be resolved to a real calendar date. Accepts Date
 * objects, ISO dates/datetimes, human-readable dates ("August", "31 Aug 2026",
 * "Aug 31, 2026", "08/31/2026") and the relative phrases the recurrence parser
 * already understands. Used both by the AI response normalizer and as the
 * defensive guard on the task DTO so a display string never reaches the DB.
 */
export function toApiDate(
  value: unknown,
  referenceDate: Date = new Date(),
): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : toDateString(value);
  }
  const reference = Number.isNaN(referenceDate.getTime())
    ? new Date()
    : referenceDate;
  return normalizeEndDate(value, reference);
}

function asOneOf<T extends string>(value: unknown, options: T[], fallback: T): T {
  return typeof value === 'string' && options.includes(value as T)
    ? (value as T)
    : fallback;
}

function asPositiveInteger(
  value: unknown,
  fallback: number,
  max: number,
  min: number,
) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.round(number), min), max);
}

function normalizeNullableInteger(
  value: unknown,
  min: number,
  max: number,
) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const integer = Math.round(number);
  if (integer < min || integer > max) return null;
  return integer;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}

function normalizeWeekdays(value: unknown) {
  if (!Array.isArray(value)) return [];

  return [
    ...new Set(
      value
        .map((item) => (typeof item === 'string' ? WEEKDAY_ALIASES[item.toLocaleLowerCase()] : null))
        .filter((item): item is (typeof WEEKDAYS)[number] => Boolean(item)),
    ),
  ];
}

function normalizeDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : value;
}

/**
 * Coerce an end date coming from the AI (which may be human-readable, e.g.
 * "August", "31 Aug 2026", "08/31/2026", "next Friday") into a validated
 * ISO-8601 calendar date (YYYY-MM-DD). Returns null when it cannot resolve to a
 * real calendar date, so the caller keeps its existing "ask for a date" behavior.
 */
function normalizeEndDate(value: unknown, referenceDate: Date): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;

  // Already an ISO date or datetime string: keep only the calendar date part.
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (iso) {
    return buildDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }

  return (
    parseRelativeDate(raw.toLocaleLowerCase(), referenceDate) ??
    parseNumericDate(raw.toLocaleLowerCase(), referenceDate) ??
    parseMonthNameDate(raw.toLocaleLowerCase(), referenceDate)
  );
}

const WEEKDAY_TO_INDEX: Record<(typeof WEEKDAYS)[number], number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

function parseRelativeDate(lower: string, referenceDate: Date): string | null {
  const base = startOfUtcDay(referenceDate);

  if (/\btoday\b/.test(lower)) return toDateString(base);
  if (/\btomorrow\b/.test(lower)) return shiftDays(base, 1);
  if (/\byesterday\b/.test(lower)) return shiftDays(base, -1);

  const inMatch = lower.match(/\bin\s+(\d+)\s+(day|week|month|year)s?\b/);
  if (inMatch) return shiftByUnit(base, Number(inMatch[1]), inMatch[2]);

  if (/\bnext\s+week\b/.test(lower)) return shiftDays(base, 7);
  if (/\bnext\s+month\b/.test(lower)) return shiftByUnit(base, 1, 'month');
  if (/\bnext\s+year\b/.test(lower)) return shiftByUnit(base, 1, 'year');

  return parseWeekdayDate(lower, base);
}

function parseWeekdayDate(lower: string, base: Date): string | null {
  for (const [alias, weekday] of Object.entries(WEEKDAY_ALIASES)) {
    const isEnglishAlias = /^[a-z]+$/.test(alias);
    const matches = isEnglishAlias
      ? new RegExp(`\\b${escapeRegExp(alias)}\\b`).test(lower)
      : lower.includes(alias);
    if (matches) {
      const current = base.getUTCDay();
      let delta = (WEEKDAY_TO_INDEX[weekday] - current + 7) % 7;
      if (delta === 0) delta = 7; // "next Friday" always resolves to a future date
      return shiftDays(base, delta);
    }
  }
  return null;
}

function parseNumericDate(lower: string, referenceDate: Date): string | null {
  // YYYY-MM-DD or YYYY/MM/DD
  let match = lower.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (match) return buildDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

  // MM/DD/YYYY or DD/MM/YYYY (disambiguated when a value exceeds 12)
  match = lower.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/);
  if (match) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    const year = Number(match[3]);
    return first > 12 && second <= 12
      ? buildDate(year, second - 1, first)
      : buildDate(year, first - 1, second);
  }

  // MM/DD without a year: assume the reference year (or next year when past)
  match = lower.match(/\b(\d{1,2})[-/.](\d{1,2})\b/);
  if (match) {
    const monthIndex = Number(match[1]) - 1;
    const day = Number(match[2]);
    return buildDate(
      yearForMonthDay(monthIndex, day, referenceDate),
      monthIndex,
      day,
    );
  }

  return null;
}

function parseMonthNameDate(lower: string, referenceDate: Date): string | null {
  let monthIndex: number | null = null;
  let matchedToken = '';

  for (const [name, index] of Object.entries(MONTH_ALIASES)) {
    const isEnglishAlias = /^[a-z]+$/.test(name);
    const matches = isEnglishAlias
      ? new RegExp(`\\b${escapeRegExp(name)}\\b`).test(lower)
      : lower.includes(name);
    // Prefer the longest match so "august" wins over a partial alias.
    if (matches && name.length > matchedToken.length) {
      matchedToken = name;
      monthIndex = index;
    }
  }

  if (monthIndex === null) return null;

  let day: number | null = null;
  let year: number | null = null;
  for (const token of lower.match(/\d{1,4}/g) ?? []) {
    const number = Number(token);
    if (number >= 1000) year = number;
    else if (day === null && number >= 1 && number <= 31) day = number;
  }

  const resolvedYear = year ?? yearForMonthDay(monthIndex, day, referenceDate);
  // Month name with no day (e.g. "until August") ends on the last day of that month.
  if (day === null) return lastDayOfMonth(resolvedYear, monthIndex);
  return buildDate(resolvedYear, monthIndex, day);
}

function yearForMonthDay(
  monthIndex: number,
  day: number | null,
  referenceDate: Date,
): number {
  const year = referenceDate.getUTCFullYear();
  const refMonth = referenceDate.getUTCMonth();
  const refDay = referenceDate.getUTCDate();
  if (monthIndex < refMonth) return year + 1;
  if (monthIndex === refMonth && day !== null && day < refDay) return year + 1;
  return year;
}

function buildDate(year: number, monthIndex: number, day: number): string | null {
  if (!Number.isInteger(year) || year < 1970 || year > 9999) return null;
  if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, monthIndex, day));
  // Reject overflowed dates such as "Feb 30" that JS silently rolls forward.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== monthIndex ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return toDateString(date);
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function shiftDays(base: Date, days: number): string {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return toDateString(next);
}

function shiftByUnit(base: Date, amount: number, unit: string): string {
  const next = new Date(base);
  if (unit === 'day') next.setUTCDate(next.getUTCDate() + amount);
  else if (unit === 'week') next.setUTCDate(next.getUTCDate() + amount * 7);
  else if (unit === 'month') next.setUTCMonth(next.getUTCMonth() + amount);
  else if (unit === 'year') next.setUTCFullYear(next.getUTCFullYear() + amount);
  return toDateString(next);
}

function normalizeTime(value: unknown) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? value : null;
}

function normalizeNullableString(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function extractWeekdays(source: string) {
  const lower = source.toLocaleLowerCase();
  const days: string[] = [];

  for (const [alias, weekday] of Object.entries(WEEKDAY_ALIASES)) {
    const normalizedAlias = alias.toLocaleLowerCase();
    const isEnglishAlias = /^[a-z]+$/.test(normalizedAlias);
    const matches = isEnglishAlias
      ? new RegExp(`\\b${escapeRegExp(normalizedAlias)}\\b`).test(lower)
      : lower.includes(normalizedAlias);

    if (matches) {
      days.push(weekday);
    }
  }

  return [...new Set(days)].sort(
    (a, b) => WEEKDAYS.indexOf(a as (typeof WEEKDAYS)[number]) - WEEKDAYS.indexOf(b as (typeof WEEKDAYS)[number]),
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractTime(source: string) {
  const lower = source.toLocaleLowerCase();
  const match = lower.match(/(?:at|الساعة|ساعه)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|ص|م|الصبح|صباح|صباحا|صباحًا|المسا|المساء|مساء|مساءً)?/);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3] ?? '';

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  if ((meridiem.includes('pm') || meridiem.includes('م') || meridiem.includes('مساء')) && hour < 12) hour += 12;
  if ((meridiem.includes('am') || meridiem.includes('ص') || meridiem.includes('صباح') || meridiem.includes('صبح')) && hour === 12) hour = 0;

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function extractUntilDate(source: string, referenceDate: Date) {
  const lower = source.toLocaleLowerCase();
  const isoMatch = lower.match(/\buntil\s+(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) return normalizeDate(isoMatch[1]);

  if (/for\s+(\d+)\s+months?/.test(lower)) {
    const months = Number(lower.match(/for\s+(\d+)\s+months?/)?.[1] ?? 0);
    if (months > 0) {
      const end = new Date(referenceDate);
      end.setUTCMonth(end.getUTCMonth() + months);
      return toDateString(end);
    }
  }

  for (const [month, monthIndex] of Object.entries(MONTH_ALIASES)) {
    if (lower.includes(`until ${month}`) || source.includes(`حتى ${month}`)) {
      let year = referenceDate.getUTCFullYear();
      if (monthIndex < referenceDate.getUTCMonth()) year += 1;
      return lastDayOfMonth(year, monthIndex);
    }
  }

  return null;
}

function extractOccurrences(source: string) {
  const match = source.match(/(?:after|for)\s+(\d+)\s+(?:occurrences?|times?)/);
  return match ? Math.max(Number(match[1]), 1) : null;
}

function extractInterval(source: string) {
  const match = source.match(/every\s+(\d+)\s+(?:days?|weeks?|months?|years?)/);
  return match ? Math.max(Number(match[1]), 1) : 1;
}

function extractDayOfMonth(source: string) {
  const match = source.match(/\b(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (!match) return null;
  const day = Number(match[1]);
  return day >= 1 && day <= 31 ? day : null;
}

function parseReferenceDate(currentDate: string) {
  const parsed = new Date(currentDate);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function lastDayOfMonth(year: number, month: number) {
  return toDateString(new Date(Date.UTC(year, month + 1, 0)));
}

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildPreview(response: AiRecurrenceParseResponse) {
  if (response.clarifyingQuestion) return response.clarifyingQuestion;
  if (response.repeat === 'never') return 'No recurrence detected.';

  const parts: string[] = [];
  if (response.repeat === 'daily') parts.push(response.interval === 1 ? 'Daily' : `Every ${response.interval} days`);
  if (response.repeat === 'weekly') {
    parts.push(response.interval === 1 ? 'Weekly' : `Every ${response.interval} weeks`);
    if (response.daysOfWeek.length) parts.push(`on ${formatList(response.daysOfWeek)}`);
  }
  if (response.repeat === 'monthly') {
    parts.push(response.interval === 1 ? 'Monthly' : `Every ${response.interval} months`);
    if (response.daysOfWeek.length) parts.push(`on the first ${response.daysOfWeek[0]}`);
    if (response.dayOfMonth) parts.push(`on day ${response.dayOfMonth}`);
  }
  if (response.repeat === 'yearly') parts.push(response.interval === 1 ? 'Yearly' : `Every ${response.interval} years`);
  if (response.repeat === 'custom') parts.push(`Custom repeat every ${response.interval}`);
  if (response.time) parts.push(`at ${response.time}`);
  if (response.endCondition === 'onDate' && response.endDate) parts.push(`until ${response.endDate}`);
  if (response.endCondition === 'afterOccurrences' && response.occurrences) {
    parts.push(`for ${response.occurrences} occurrences`);
  }

  return parts.join(' ');
}

function formatList(values: string[]) {
  if (values.length <= 1) return values[0] ?? '';
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`;
}
