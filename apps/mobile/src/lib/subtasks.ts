import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ApiSubtask, ApiSubtaskPriority, ApiSubtaskStatus } from './tasksApi';
import { cancelScheduledNotification, scheduleReminderNotification } from './notifications';

// ---- Display ----

export const SUBTASK_STATUS_LABEL: Record<ApiSubtaskStatus, string> = {
  todo: 'Todo',
  in_progress: 'In Progress',
  done: 'Done',
  blocked: 'Blocked',
  missed: 'Missed',
};

export const SUBTASK_PRIORITY_LABEL: Record<ApiSubtaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export type SubtaskIndicator = 'overdue' | 'due-today' | 'upcoming' | 'completed' | 'blocked';

// Traffic-light dot colors (aligned with the web palette).
export const SUBTASK_INDICATOR_COLOR: Record<SubtaskIndicator, string> = {
  overdue: '#ef4444',
  'due-today': '#f97316',
  upcoming: '#3b82f6',
  completed: '#22c55e',
  blocked: '#64748b',
};

export const SUBTASK_INDICATOR_LABEL: Record<SubtaskIndicator, string> = {
  overdue: 'Overdue',
  'due-today': 'Due Today',
  upcoming: 'Upcoming',
  completed: 'Completed',
  blocked: 'Blocked',
};

export const SUBTASK_PRIORITY_COLOR: Record<ApiSubtaskPriority, string> = {
  low: '#22c55e',
  medium: '#f97316',
  high: '#ef4444',
  urgent: '#f87171',
};

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export type BadgeMeta = { label: string; tone: BadgeTone };

/** Semantic labels and tones shared by task, subtask, and dependency badges. */
export const STATUS_BADGE_META: Record<string, BadgeMeta> = {
  todo: { label: 'To Do', tone: 'neutral' },
  'To Do': { label: 'To Do', tone: 'neutral' },
  in_progress: { label: 'In Progress', tone: 'info' },
  'In Progress': { label: 'In Progress', tone: 'info' },
  done: { label: 'Done', tone: 'success' },
  Done: { label: 'Done', tone: 'success' },
  blocked: { label: 'Blocked', tone: 'danger' },
  Blocked: { label: 'Blocked', tone: 'danger' },
  missed: { label: 'Missed', tone: 'danger' },
  Missed: { label: 'Missed', tone: 'danger' },
};

export const PRIORITY_BADGE_META: Record<string, BadgeMeta> = {
  low: { label: 'Low', tone: 'success' },
  Low: { label: 'Low', tone: 'success' },
  medium: { label: 'Medium', tone: 'warning' },
  Medium: { label: 'Medium', tone: 'warning' },
  high: { label: 'High', tone: 'danger' },
  High: { label: 'High', tone: 'danger' },
  urgent: { label: 'Urgent', tone: 'danger' },
  Urgent: { label: 'Urgent', tone: 'danger' },
};

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function getSubtaskIndicator(subtask: ApiSubtask, now: Date = new Date()): SubtaskIndicator {
  if (subtask.status === 'done' || subtask.isDone) return 'completed';
  if (subtask.status === 'blocked') return 'blocked';
  if (subtask.status === 'missed') return 'overdue';
  if (subtask.dueDate) {
    const due = new Date(subtask.dueDate);
    if (!Number.isNaN(due.getTime())) {
      if (isSameDay(due, now)) return 'due-today';
      if (due.getTime() < now.getTime()) return 'overdue';
    }
  }
  return 'upcoming';
}

export function formatDuration(minutes?: number | null): string {
  if (!minutes || minutes <= 0) return '';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// ---- Assignment / sharing (mirrors web lib/subtaskDisplay.ts) ----

export type SubtaskAssignment = 'shared' | 'personal' | 'unassigned';

export function getSubtaskAssignment(subtask: ApiSubtask): SubtaskAssignment {
  if (subtask.isShared) return 'shared';
  if (subtask.assigneeUserId) return 'personal';
  return 'unassigned';
}

/**
 * Strips a leading `Name:` prefix from a title when it matches the subtask's
 * own assignee display name (legacy plans embedded names). Structural titles
 * with an unrelated colon are left intact.
 */
export function displaySubtaskTitle(subtask: ApiSubtask): string {
  const title = subtask.title?.trim() ?? '';
  const name = subtask.assignee?.trim();
  if (!name) return title;
  const match = title.match(/^([^:]{1,60}):\s*(.+\S)\s*$/);
  if (match && match[1].trim().toLowerCase() === name.toLowerCase()) {
    return match[2].trim();
  }
  return title;
}

export type SubtaskFilter = 'mine' | 'team' | 'shared' | 'unassigned' | 'member';

export function matchesSubtaskFilter(
  subtask: ApiSubtask,
  filter: SubtaskFilter,
  ctx: { currentUserId?: string; memberId?: string },
): boolean {
  switch (filter) {
    case 'mine':
      return Boolean(ctx.currentUserId) && subtask.assigneeUserId === ctx.currentUserId;
    case 'shared':
      return Boolean(subtask.isShared);
    case 'unassigned':
      return !subtask.isShared && !subtask.assigneeUserId;
    case 'member':
      return Boolean(ctx.memberId) && subtask.assigneeUserId === ctx.memberId;
    case 'team':
    default:
      return true;
  }
}

export function getSubtaskWarnings(
  subtask: ApiSubtask,
  opts: { parentDueDate?: string; remainingParentMinutes?: number },
): string[] {
  const warnings: string[] = [];
  if (subtask.dueDate && opts.parentDueDate) {
    const sub = new Date(subtask.dueDate).getTime();
    const parent = new Date(opts.parentDueDate).getTime();
    if (!Number.isNaN(sub) && !Number.isNaN(parent) && sub > parent) {
      warnings.push('Due after the parent task’s due date.');
    }
  }
  if (
    subtask.estimatedDurationMinutes &&
    opts.remainingParentMinutes !== undefined &&
    subtask.estimatedDurationMinutes > opts.remainingParentMinutes
  ) {
    warnings.push('Estimated time exceeds the remaining available time.');
  }
  return warnings;
}

// ---- Reminder scheduling ----
//
// Local notifications only. We persist a subtaskId -> notificationId map so a
// reminder can be cancelled (on completion) or rescheduled (on due-date change)
// without a standalone reminder entity. This is intentionally future-ready: the
// same subtask can later be promoted to a full reminder without touching the DB.

const REMINDER_MAP_KEY = 'beeplan.subtaskReminderMap.v1';

async function readReminderMap(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(REMINDER_MAP_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

async function writeReminderMap(map: Record<string, string>): Promise<void> {
  try {
    await AsyncStorage.setItem(REMINDER_MAP_KEY, JSON.stringify(map));
  } catch {
    // Non-fatal: worst case a stale reminder can't be cancelled by id later.
  }
}

/** Computes the moment a subtask reminder should fire, or null if not schedulable. */
function reminderTriggerAt(subtask: ApiSubtask): Date | null {
  if (subtask.reminderTime) {
    const explicit = new Date(subtask.reminderTime);
    if (!Number.isNaN(explicit.getTime())) return explicit;
  }
  if (subtask.dueDate) {
    const due = new Date(subtask.dueDate);
    if (!Number.isNaN(due.getTime())) {
      const before = subtask.reminderMinutesBeforeDue ?? 0;
      return new Date(due.getTime() - before * 60_000);
    }
  }
  return null;
}

/**
 * Reconciles the local notification for a single subtask with its current
 * state. Safe to call after any create/update: it cancels the old scheduled
 * notification (if any) and schedules a fresh one when appropriate.
 */
export async function syncSubtaskReminder(subtask: ApiSubtask): Promise<void> {
  const map = await readReminderMap();
  const existingId = map[subtask.id];

  // Cancel first — covers reschedule (due changed), disable, and completion.
  if (existingId) {
    await cancelScheduledNotification(existingId);
    delete map[subtask.id];
  }

  const isComplete = subtask.status === 'done' || subtask.isDone;
  const trigger = reminderTriggerAt(subtask);

  if (subtask.reminderEnabled && !isComplete && trigger && trigger.getTime() > Date.now()) {
    try {
      const id = await scheduleReminderNotification({
        title: subtask.title,
        body: 'Subtask reminder',
        triggerDateTime: trigger.toISOString(),
        priority: subtask.priority,
      });
      map[subtask.id] = id;
    } catch {
      // Permission denied or past-time — the backend already owns the config,
      // so a failed local schedule must never block the update.
    }
  }

  await writeReminderMap(map);
}

/** Reconciles reminders for every subtask of a task (call after a task load/update). */
export async function syncTaskSubtaskReminders(subtasks: ApiSubtask[]): Promise<void> {
  for (const subtask of subtasks) {
    await syncSubtaskReminder(subtask);
  }
}
