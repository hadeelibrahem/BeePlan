export type ReminderDraftType = 'time' | 'location' | 'context' | 'checklist';
export type ReminderDraftPriority = 'low' | 'medium' | 'high';
export type ReminderDraftRepeat = 'none' | 'daily' | 'weekly' | 'monthly';
export type ReminderDraftLocationMode = 'none' | 'specific' | 'general';
export type ReminderDraftLocationTrigger = 'arrive' | 'leave';

// Additive, optional block describing a "person nearby" reminder (e.g. "remind
// me to talk to Ahmad when I see him"). Detected by the parser but ignored by
// the generic reminder flow, so /ai/parse-reminder stays backward compatible.
export interface ReminderDraftPerson {
  isPersonReminder: boolean;
  personName: string;
  message: string;
  confidence: number;
}

export interface ReminderDraft {
  title: string;
  description: string;
  reminderType: ReminderDraftType;
  priority: ReminderDraftPriority;
  time: {
    date: string;
    time: string;
    repeat: ReminderDraftRepeat;
  };
  location: {
    mode: ReminderDraftLocationMode;
    name: string;
    address: string;
    category: string;
    trigger: ReminderDraftLocationTrigger;
    radius: number;
  };
  context: {
    condition: string;
  };
  checklist: string[];
  person: ReminderDraftPerson;
}

const REMINDER_TYPES: ReminderDraftType[] = [
  'time',
  'location',
  'context',
  'checklist',
];
const PRIORITIES: ReminderDraftPriority[] = ['low', 'medium', 'high'];
const REPEAT_OPTIONS: ReminderDraftRepeat[] = [
  'none',
  'daily',
  'weekly',
  'monthly',
];
const LOCATION_MODES: ReminderDraftLocationMode[] = [
  'none',
  'specific',
  'general',
];
const LOCATION_TRIGGERS: ReminderDraftLocationTrigger[] = ['arrive', 'leave'];

export function createEmptyReminderDraft(): ReminderDraft {
  return {
    title: '',
    description: '',
    reminderType: 'time',
    priority: 'medium',
    time: { date: '', time: '', repeat: 'none' },
    location: {
      mode: 'none',
      name: '',
      address: '',
      category: '',
      trigger: 'arrive',
      radius: 100,
    },
    context: { condition: '' },
    checklist: [],
    person: {
      isPersonReminder: false,
      personName: '',
      message: '',
      confidence: 0,
    },
  };
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asOneOf<T extends string>(
  value: unknown,
  options: readonly T[],
  fallback: T,
): T {
  return typeof value === 'string' &&
    (options as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Gemini output is untrusted free-form JSON; this coerces it into the exact
 * draft schema so malformed or partial model output can never reach clients.
 */
export function normalizeReminderDraft(input: unknown): ReminderDraft {
  const empty = createEmptyReminderDraft();
  const obj = asRecord(input);
  const time = asRecord(obj.time);
  const location = asRecord(obj.location);
  const context = asRecord(obj.context);

  return {
    title: asString(obj.title),
    description: asString(obj.description),
    reminderType: asOneOf(obj.reminderType, REMINDER_TYPES, empty.reminderType),
    priority: asOneOf(obj.priority, PRIORITIES, empty.priority),
    time: {
      date: asString(time.date),
      time: asString(time.time),
      repeat: asOneOf(time.repeat, REPEAT_OPTIONS, 'none'),
    },
    location: {
      mode: asOneOf(location.mode, LOCATION_MODES, 'none'),
      name: asString(location.name),
      address: asString(location.address),
      category: asString(location.category),
      trigger: asOneOf(location.trigger, LOCATION_TRIGGERS, 'arrive'),
      radius: asNumber(location.radius, 100),
    },
    context: {
      condition: asString(context.condition),
    },
    checklist: Array.isArray(obj.checklist)
      ? obj.checklist.filter((item): item is string => typeof item === 'string')
      : [],
    person: normalizePerson(asRecord(obj.person)),
  };
}

function normalizePerson(person: Record<string, unknown>): ReminderDraftPerson {
  const rawConfidence = asNumber(person.confidence, 0);
  return {
    isPersonReminder: person.isPersonReminder === true,
    personName: asString(person.personName),
    message: asString(person.message),
    // Clamp to [0, 1] so a malformed model value can't produce a weird score.
    confidence: Math.max(0, Math.min(1, rawConfidence)),
  };
}
