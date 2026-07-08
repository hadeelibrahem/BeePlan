import { createHash } from 'node:crypto';

export type RecurrenceSuggestionRepeat =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'custom'
  | 'never';

export type RecurrenceSuggestion = {
  id: string;
  sourceTaskId: string;
  taskTitle: string;
  reason: string;
  suggestedRepeat: RecurrenceSuggestionRepeat;
  repeat: RecurrenceSuggestionRepeat;
  interval: number;
  daysOfWeek: string[];
  dayOfMonth: number | null;
  endCondition: 'never' | 'onDate' | 'afterOccurrences';
  endDate: string | null;
  occurrences: number | null;
  suggestedTime: string | null;
  preview: string;
  confidence: number;
};

export type RecurrenceSuggestionTask = {
  id: string;
  title: string;
  category?: string | null;
  dueDate?: Date | string | null;
  dueTime?: string | null;
  status?: string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  completedAt?: Date | string | null;
  isRecurring?: boolean;
};

type TaskSignal = RecurrenceSuggestionTask & {
  normalizedTitle: string;
  titleTokens: string[];
  occurrenceDate: Date;
};

type PatternGroup = {
  titleTokens: string[];
  normalizedTitle: string;
  category: string;
  tasks: TaskSignal[];
};

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;
const WEEKDAY_OUTPUT = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];
const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'to',
  'for',
  'of',
  'my',
  'me',
  'task',
  'do',
  'doing',
  'عمل',
  'مهمة',
]);
const SYNONYMS: Record<string, string> = {
  practice: 'study',
  practicing: 'study',
  studied: 'study',
  studying: 'study',
  learn: 'study',
  learning: 'study',
  workout: 'gym',
  exercise: 'gym',
  exercises: 'gym',
};

export function detectRecurrenceSuggestions(
  tasks: RecurrenceSuggestionTask[],
  dismissedSuggestionIds: Set<string> = new Set(),
): RecurrenceSuggestion[] {
  const signals = tasks
    .filter((task) => !task.isRecurring)
    .map(toTaskSignal)
    .filter((task): task is TaskSignal => task !== null);

  const groups = groupSimilarTasks(signals);
  const suggestions = groups
    .map(detectGroupPattern)
    .filter((suggestion): suggestion is RecurrenceSuggestion => Boolean(suggestion))
    .filter((suggestion) => suggestion.confidence >= 0.78)
    .filter((suggestion) => !dismissedSuggestionIds.has(suggestion.id))
    .sort((left, right) => right.confidence - left.confidence);

  return suggestions.slice(0, 2);
}

function toTaskSignal(task: RecurrenceSuggestionTask): TaskSignal | null {
  const occurrenceDate = toOccurrenceDate(task);
  const titleTokens = normalizeTitleTokens(task.title);
  if (!occurrenceDate || titleTokens.length === 0) return null;

  return {
    ...task,
    occurrenceDate,
    titleTokens,
    normalizedTitle: titleTokens.join(' '),
  };
}

function toOccurrenceDate(task: RecurrenceSuggestionTask) {
  const source =
    task.dueDate ??
    (task.status === 'done' ? task.completedAt ?? task.updatedAt : null) ??
    task.createdAt;
  if (!source) return null;

  const date = source instanceof Date ? source : new Date(source);
  return Number.isNaN(date.getTime()) ? null : startOfUtcDay(date);
}

function groupSimilarTasks(tasks: TaskSignal[]): PatternGroup[] {
  const groups: PatternGroup[] = [];

  for (const task of tasks) {
    const category = (task.category ?? '').trim().toLocaleLowerCase();
    const group = groups.find(
      (candidate) =>
        candidate.category === category &&
        titleSimilarity(candidate.titleTokens, task.titleTokens) >= 0.6,
    );

    if (group) {
      group.tasks.push(task);
      continue;
    }

    groups.push({
      titleTokens: task.titleTokens,
      normalizedTitle: task.normalizedTitle,
      category,
      tasks: [task],
    });
  }

  return groups.filter((group) => distinctDateKeys(group.tasks).length >= 3);
}

function detectGroupPattern(group: PatternGroup): RecurrenceSuggestion | null {
  const tasks = [...group.tasks].sort(
    (left, right) => left.occurrenceDate.getTime() - right.occurrenceDate.getTime(),
  );
  const dateKeys = distinctDateKeys(tasks);
  const latestTask = [...tasks].sort(
    (left, right) => toTime(right.updatedAt ?? right.createdAt) - toTime(left.updatedAt ?? left.createdAt),
  )[0];
  const commonTime = getCommonTime(tasks);

  const monthly = detectMonthly(tasks, dateKeys, latestTask, commonTime);
  if (monthly) return monthly;

  const weekday = detectWeekdays(tasks, dateKeys, latestTask, commonTime);
  if (weekday) return weekday;

  const daily = detectDaily(tasks, dateKeys, latestTask, commonTime);
  if (daily) return daily;

  return detectWeekly(tasks, dateKeys, latestTask, commonTime);
}

function detectDaily(
  tasks: TaskSignal[],
  dateKeys: string[],
  latestTask: TaskSignal,
  commonTime: string | null,
) {
  if (dateKeys.length < 3) return null;
  const sortedDays = dateKeys.map((key) => new Date(`${key}T00:00:00Z`).getTime()).sort((a, b) => a - b);
  const gaps = sortedDays.slice(1).map((day, index) => Math.round((day - sortedDays[index]) / 86_400_000));
  const maxGap = Math.max(...gaps);
  if (maxGap > 2) return null;

  return createSuggestion({
    tasks,
    latestTask,
    repeat: 'daily',
    daysOfWeek: [],
    dayOfMonth: null,
    suggestedTime: commonTime,
    confidence: Math.min(0.82 + dateKeys.length * 0.025 + (commonTime ? 0.04 : 0), 0.95),
    reason: `You created or completed "${latestTask.title}" on ${dateKeys.length} recent days${commonTime ? ` around ${formatTime(commonTime)}` : ''}.`,
  });
}

function detectWeekdays(
  tasks: TaskSignal[],
  dateKeys: string[],
  latestTask: TaskSignal,
  commonTime: string | null,
) {
  if (dateKeys.length < 4) return null;
  const weekdayIndexes = new Set(tasks.map((task) => task.occurrenceDate.getUTCDay()));
  const hasWeekend = weekdayIndexes.has(0) || weekdayIndexes.has(6);
  if (hasWeekend) return null;

  return createSuggestion({
    tasks,
    latestTask,
    repeat: 'weekly',
    daysOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    dayOfMonth: null,
    suggestedTime: commonTime,
    confidence: Math.min(0.84 + dateKeys.length * 0.02 + (commonTime ? 0.04 : 0), 0.94),
    reason: `You often do "${latestTask.title}" on weekdays${commonTime ? ` around ${formatTime(commonTime)}` : ''}.`,
  });
}

function detectWeekly(
  tasks: TaskSignal[],
  dateKeys: string[],
  latestTask: TaskSignal,
  commonTime: string | null,
) {
  if (dateKeys.length < 3) return null;
  const counts = countBy(tasks.map((task) => task.occurrenceDate.getUTCDay()));
  const repeatedWeekdays = [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([weekday]) => weekday)
    .sort((a, b) => a - b);
  if (!repeatedWeekdays.length) return null;

  const daysOfWeek = repeatedWeekdays.map((weekday) => WEEKDAYS[weekday]);
  return createSuggestion({
    tasks,
    latestTask,
    repeat: 'weekly',
    daysOfWeek: toOutputWeekdayOrder(daysOfWeek),
    dayOfMonth: null,
    suggestedTime: commonTime,
    confidence: Math.min(0.78 + repeatedWeekdays.length * 0.04 + dateKeys.length * 0.015, 0.9),
    reason: `You often do "${latestTask.title}" on ${formatList(toOutputWeekdayOrder(daysOfWeek))}${commonTime ? ` around ${formatTime(commonTime)}` : ''}.`,
  });
}

function detectMonthly(
  tasks: TaskSignal[],
  dateKeys: string[],
  latestTask: TaskSignal,
  commonTime: string | null,
) {
  if (dateKeys.length < 3) return null;
  const dayCounts = countBy(tasks.map((task) => task.occurrenceDate.getUTCDate()));
  const [dayOfMonth, count] = [...dayCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  if (!dayOfMonth || count < 3) return null;

  const months = new Set(tasks.map((task) => `${task.occurrenceDate.getUTCFullYear()}-${task.occurrenceDate.getUTCMonth()}`));
  if (months.size < 3) return null;

  return createSuggestion({
    tasks,
    latestTask,
    repeat: 'monthly',
    daysOfWeek: [],
    dayOfMonth,
    suggestedTime: commonTime,
    confidence: Math.min(0.84 + count * 0.025 + (commonTime ? 0.03 : 0), 0.94),
    reason: `You often do "${latestTask.title}" monthly on day ${dayOfMonth}${commonTime ? ` around ${formatTime(commonTime)}` : ''}.`,
  });
}

function createSuggestion({
  tasks,
  latestTask,
  repeat,
  daysOfWeek,
  dayOfMonth,
  suggestedTime,
  confidence,
  reason,
}: {
  tasks: TaskSignal[];
  latestTask: TaskSignal;
  repeat: RecurrenceSuggestionRepeat;
  daysOfWeek: string[];
  dayOfMonth: number | null;
  suggestedTime: string | null;
  confidence: number;
  reason: string;
}): RecurrenceSuggestion {
  const interval = 1;
  const id = suggestionId({
    title: latestTask.normalizedTitle,
    category: latestTask.category ?? '',
    repeat,
    daysOfWeek,
    dayOfMonth,
    suggestedTime,
  });

  return {
    id,
    sourceTaskId: latestTask.id,
    taskTitle: pickDisplayTitle(tasks),
    reason,
    suggestedRepeat: repeat,
    repeat,
    interval,
    daysOfWeek,
    dayOfMonth,
    endCondition: 'never',
    endDate: null,
    occurrences: null,
    suggestedTime,
    preview: buildPreview(repeat, daysOfWeek, dayOfMonth, suggestedTime),
    confidence: Math.round(confidence * 100) / 100,
  };
}

function suggestionId(input: {
  title: string;
  category: string;
  repeat: RecurrenceSuggestionRepeat;
  daysOfWeek: string[];
  dayOfMonth: number | null;
  suggestedTime: string | null;
}) {
  const hash = createHash('sha1')
    .update(
      [
        input.title,
        input.category,
        input.repeat,
        input.daysOfWeek.join(','),
        input.dayOfMonth ?? '',
        input.suggestedTime ?? '',
      ].join('|'),
    )
    .digest('hex')
    .slice(0, 24);
  return `recurrence-${hash}`;
}

function normalizeTitleTokens(title: string) {
  return title
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((token) => SYNONYMS[token] ?? token)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token))
    .sort();
}

function titleSimilarity(left: string[], right: string[]) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const intersection = [...leftSet].filter((token) => rightSet.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

function distinctDateKeys(tasks: TaskSignal[]) {
  return [...new Set(tasks.map((task) => toDateKey(task.occurrenceDate)))].sort();
}

function getCommonTime(tasks: TaskSignal[]) {
  const times = tasks
    .map((task) => normalizeTime(task.dueTime))
    .filter((time): time is string => Boolean(time));
  if (times.length < 2) return null;

  const counts = countBy(times);
  const [time, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  return time && count / tasks.length >= 0.6 ? time : null;
}

function normalizeTime(value?: string | null) {
  if (!value) return null;
  const match = value.match(/^([01]?\d|2[0-3]):([0-5]\d)/);
  if (!match) return null;
  return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`;
}

function countBy<T>(items: T[]) {
  const counts = new Map<T, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return counts;
}

function pickDisplayTitle(tasks: TaskSignal[]) {
  const counts = countBy(tasks.map((task) => task.title.trim()).filter(Boolean));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? tasks[0]?.title ?? 'this task';
}

function buildPreview(
  repeat: RecurrenceSuggestionRepeat,
  daysOfWeek: string[],
  dayOfMonth: number | null,
  suggestedTime: string | null,
) {
  let preview = 'Repeats';
  if (repeat === 'daily') preview = 'Repeats every day';
  if (repeat === 'weekly') preview = daysOfWeek.length ? `Repeats every ${formatList(daysOfWeek)}` : 'Repeats every week';
  if (repeat === 'monthly') preview = dayOfMonth ? `Repeats every month on day ${dayOfMonth}` : 'Repeats every month';
  if (suggestedTime) preview += ` at ${formatTime(suggestedTime)}`;
  return preview;
}

function formatTime(time: string) {
  const [hourText, minuteText] = time.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function formatList(values: string[]) {
  if (values.length <= 1) return values[0] ?? '';
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`;
}

function toOutputWeekdayOrder(days: readonly string[]) {
  return WEEKDAY_OUTPUT.filter((day) => days.includes(day));
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toTime(value?: Date | string | null) {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}
