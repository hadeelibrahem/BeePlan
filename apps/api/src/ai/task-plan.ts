// Response shape + normalization for the AI Task Builder chat endpoint
// (POST /ai/task-plan/chat). Mirrors the pattern in reminder-draft.ts: the
// model returns loosely-shaped JSON and normalizeTaskPlanChatResponse coerces
// it into the strict contract the frontend relies on.

export type TaskPlanPriority = 'low' | 'medium' | 'high';

export type ConversationState = 'discovery' | 'scope_refinement' | 'planning' | 'review' | 'save_ready';

export type UnderstoodSummary = {
  goal: string;
  goalType: string | null;
  deadline: string | null;
  availableTime: string | null;
  currentProgress: string | null;
  deliverables: string[];
  constraints: string[];
  risks: string[];
};

export type TaskPlanMainTask = {
  title: string;
  description: string;
  dueDate: string | null;
  priority: TaskPlanPriority;
  scheduledDate?: string | null;
  scheduledStartTime?: string | null;
  scheduledEndTime?: string | null;
};

export type TaskPlanSubtask = {
  title: string;
  description: string;
  estimatedMinutes: number;
  order: number;
  priority?: TaskPlanPriority;
  startDate?: string | null;
  dueDate?: string | null;
  scheduledDate?: string | null;
  scheduledStartTime?: string | null;
  scheduledEndTime?: string | null;
  isFocusTask?: boolean;
  dependencyTitles?: string[];
};

export type TaskPlanFocusSession = {
  title: string;
  startTime: string;
  endTime: string;
  relatedSubtaskTitle: string;
};

export type TaskPlanReminder = {
  title: string;
  remindAt: string;
  type: 'time';
};

export type TaskPlan = {
  mainTask: TaskPlanMainTask;
  subtasks: TaskPlanSubtask[];
  focusSessions: TaskPlanFocusSession[];
  reminders: TaskPlanReminder[];
  mode?: 'structureOnly' | 'scheduledPlan';
  schedulingNeedsInput?: string[];
};

export type TaskPlanChatResponse = {
  type: 'question' | 'advice' | 'plan';
  message: string;
  quickReplies?: string[];
  state: ConversationState;
  understoodSummary?: UnderstoodSummary;
  plan?: TaskPlan;
};

const TITLE_MAX = 255;
const SUBTASK_MINUTES = { min: 5, max: 480 } as const;
const MAX_SUBTASKS = 20;
const MAX_FOCUS_SESSIONS = 30;
const MAX_REMINDERS = 10;
const MAX_QUICK_REPLIES = 4;
const MAX_SUMMARY_LIST_ITEMS = 10;

const VALID_STATES: readonly ConversationState[] = [
  'discovery',
  'scope_refinement',
  'planning',
  'review',
  'save_ready',
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown, max = TITLE_MAX): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function readNullableString(value: unknown, max: number): string | null {
  const str = readString(value, max);
  return str || null;
}

function readStringArray(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => readString(item, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

function readPriority(value: unknown): TaskPlanPriority {
  return value === 'low' || value === 'high' ? value : 'medium';
}

function readState(value: unknown, fallback: ConversationState): ConversationState {
  return typeof value === 'string' && (VALID_STATES as readonly string[]).includes(value)
    ? (value as ConversationState)
    : fallback;
}

function readIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function readMinutes(value: unknown): number {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(num)) return 30;
  return Math.max(SUBTASK_MINUTES.min, Math.min(SUBTASK_MINUTES.max, Math.round(num)));
}

function readQuickReplies(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => readString(item, 80))
    .filter(Boolean)
    .slice(0, MAX_QUICK_REPLIES);
}

/** Only attached to the response when the model has actually named a goal. */
function normalizeUnderstoodSummary(value: unknown): UnderstoodSummary | undefined {
  const record = asRecord(value);
  const goal = readString(record.goal, 300);
  if (!goal) return undefined;

  return {
    goal,
    goalType: readNullableString(record.goalType, 120),
    deadline: readNullableString(record.deadline, 120),
    availableTime: readNullableString(record.availableTime, 200),
    currentProgress: readNullableString(record.currentProgress, 300),
    deliverables: readStringArray(record.deliverables, MAX_SUMMARY_LIST_ITEMS, 200),
    constraints: readStringArray(record.constraints, MAX_SUMMARY_LIST_ITEMS, 200),
    risks: readStringArray(record.risks, MAX_SUMMARY_LIST_ITEMS, 200),
  };
}

function normalizeSubtasks(value: unknown): TaskPlanSubtask[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = asRecord(item);
      return {
        title: readString(record.title),
        description: readString(record.description, 1000),
        estimatedMinutes: readMinutes(record.estimatedMinutes),
        order: 0,
        priority: readPriority(record.priority),
        startDate: readIsoDate(record.startDate),
        dueDate: readIsoDate(record.dueDate),
        scheduledDate: readIsoDate(record.scheduledDate),
        scheduledStartTime: readNullableString(record.scheduledStartTime, 5),
        scheduledEndTime: readNullableString(record.scheduledEndTime, 5),
        isFocusTask: record.isFocusTask !== false,
        dependencyTitles: readStringArray(record.dependencyTitles, MAX_SUBTASKS, TITLE_MAX),
      };
    })
    .filter((subtask) => subtask.title)
    .slice(0, MAX_SUBTASKS)
    .map((subtask, index) => ({ ...subtask, order: index + 1 }));
}

function normalizeFocusSessions(value: unknown, now: Date): TaskPlanFocusSession[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = asRecord(item);
      return {
        title: readString(record.title),
        startTime: readIsoDate(record.startTime),
        endTime: readIsoDate(record.endTime),
        relatedSubtaskTitle: readString(record.relatedSubtaskTitle),
      };
    })
    .filter(
      (session): session is TaskPlanFocusSession =>
        Boolean(session.title && session.startTime && session.endTime) &&
        // Never surface sessions in the past or with an inverted range.
        new Date(session.startTime!) > now &&
        new Date(session.endTime!) > new Date(session.startTime!),
    )
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .slice(0, MAX_FOCUS_SESSIONS);
}

function normalizeReminders(value: unknown, now: Date): TaskPlanReminder[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = asRecord(item);
      return {
        title: readString(record.title),
        remindAt: readIsoDate(record.remindAt),
        type: 'time' as const,
      };
    })
    .filter(
      (reminder): reminder is TaskPlanReminder =>
        Boolean(reminder.title && reminder.remindAt) && new Date(reminder.remindAt!) > now,
    )
    .sort((a, b) => a.remindAt.localeCompare(b.remindAt))
    .slice(0, MAX_REMINDERS);
}

function attachSessionWindows(subtasks: TaskPlanSubtask[], sessions: TaskPlanFocusSession[]): TaskPlanSubtask[] {
  return subtasks.map((subtask) => {
    const related = sessions
      .filter((session) => session.relatedSubtaskTitle === subtask.title)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    const first = related[0];
    const last = related[related.length - 1];
    if (!first || !last) return subtask;
    return {
      ...subtask,
      startDate: subtask.startDate ?? first.startTime,
      dueDate: subtask.dueDate ?? last.endTime,
      scheduledDate: subtask.scheduledDate ?? first.startTime.slice(0, 10),
      scheduledStartTime: subtask.scheduledStartTime ?? first.startTime.slice(11, 16),
      scheduledEndTime: subtask.scheduledEndTime ?? last.endTime.slice(11, 16),
    };
  });
}

/**
 * Coerce whatever the model returned into the strict response contract.
 * A malformed "plan" downgrades to a follow-up question rather than erroring,
 * so a flaky generation never breaks the chat flow. `state` and
 * `understoodSummary` are new, additive fields — a response missing them
 * (or an older-shaped response) still normalizes cleanly with sensible
 * defaults, so this stays backward compatible with plain "question"/"plan"
 * responses.
 */
export function normalizeTaskPlanChatResponse(raw: unknown, now = new Date()): TaskPlanChatResponse {
  const record = asRecord(raw);
  const message = readString(record.message, 2000);
  const quickReplies = readQuickReplies(record.quickReplies);
  const understoodSummary = normalizeUnderstoodSummary(record.understoodSummary);

  if (record.type === 'plan') {
    const planRecord = asRecord(record.plan);
    const mainRecord = asRecord(planRecord.mainTask);
    const title = readString(mainRecord.title);

    if (title) {
      const focusSessions = normalizeFocusSessions(planRecord.focusSessions, now);
      const subtasks = attachSessionWindows(normalizeSubtasks(planRecord.subtasks), focusSessions);
      const hasConcreteSchedule = subtasks.some((subtask) => subtask.scheduledDate && subtask.scheduledStartTime);
      return {
        type: 'plan',
        message: message || 'Here is your plan. Review it and save when ready.',
        state: readState(record.state, 'save_ready'),
        ...(understoodSummary ? { understoodSummary } : {}),
        plan: {
          mainTask: {
            title,
            description: readString(mainRecord.description, 2000),
            dueDate: readIsoDate(mainRecord.dueDate),
            priority: readPriority(mainRecord.priority),
            ...(readIsoDate(mainRecord.scheduledDate) || focusSessions[0]
              ? { scheduledDate: readIsoDate(mainRecord.scheduledDate) ?? focusSessions[0]?.startTime.slice(0, 10) }
              : {}),
            ...(readNullableString(mainRecord.scheduledStartTime, 5) || focusSessions[0]
              ? { scheduledStartTime: readNullableString(mainRecord.scheduledStartTime, 5) ?? focusSessions[0]?.startTime.slice(11, 16) }
              : {}),
            ...(readNullableString(mainRecord.scheduledEndTime, 5) || focusSessions[focusSessions.length - 1]
              ? { scheduledEndTime: readNullableString(mainRecord.scheduledEndTime, 5) ?? focusSessions[focusSessions.length - 1]?.endTime.slice(11, 16) }
              : {}),
          },
          subtasks,
          focusSessions,
          reminders: normalizeReminders(planRecord.reminders, now),
          mode: hasConcreteSchedule || focusSessions.length > 0
            ? 'scheduledPlan'
            : 'structureOnly',
          schedulingNeedsInput: readStringArray(record.schedulingNeedsInput, 4, 160).length
            ? readStringArray(record.schedulingNeedsInput, 4, 160)
            : !mainRecord.dueDate && !hasConcreteSchedule && focusSessions.length === 0
              ? ['deadline or available planning window']
              : [],
        },
      };
    }
    // Fall through: a "plan" without a usable title is treated as a regular
    // reply below rather than surfacing a broken/empty plan to the user.
  }

  if (record.type === 'advice') {
    return {
      type: 'advice',
      message: message || 'Here are a few things worth thinking about before we plan this out.',
      state: readState(record.state, 'scope_refinement'),
      ...(quickReplies.length ? { quickReplies } : {}),
      ...(understoodSummary ? { understoodSummary } : {}),
    };
  }

  return {
    type: 'question',
    message:
      message ||
      'Could you tell me a bit more about your goal, when it is due, and how much time you have?',
    state: readState(record.state, 'discovery'),
    ...(quickReplies.length ? { quickReplies } : {}),
    ...(understoodSummary ? { understoodSummary } : {}),
  };
}
