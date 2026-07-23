/**
 * Pure mapper: `/dashboard/today` (+ the device's live Focus session) → the
 * flat snapshot the Android home-screen widget renders.
 *
 * This is the ONLY place a widget payload is constructed. Screens must not
 * assemble their own — they call {@link buildWidgetSnapshot} through
 * `widgetSync` so every surface agrees on state selection and labels.
 *
 * Design notes:
 * - No task-selection / recommendation logic lives here. We consume the
 *   server's already-chosen `recommendation` and `activeFocus`; we never
 *   re-rank tasks.
 * - Due-date and timezone reasoning is centralized here (see {@link dueLabel})
 *   and emitted as a ready-to-render `dueLabel` string, so the native Kotlin
 *   renderer never re-derives day boundaries — avoiding a widget-only timezone
 *   calculation that could disagree with the API. Labels use the dashboard's
 *   `timezone`; when absent we fall back to device-local, matching the API's
 *   UTC-leaning convention as closely as the client can.
 * - Focus remaining time is emitted as an absolute `focusEndsAt` timestamp so
 *   the widget can recompute the countdown at render time without per-second
 *   background refreshes. `remainingMinutes` is only an approximate snapshot
 *   value; the in-app Focus timer stays authoritative.
 */

import type { TodayDashboard } from './tasksApi';
import { focusPrimaryTitle } from './focusDisplay';
import type {
  BeePlanWidgetSnapshot,
  WidgetPriority,
  WidgetState,
} from '../../modules/beeplan-widget';

// Re-export the canonical widget contract (owned by the native module) so
// callers can import both the mapper and its types from one place.
export type { BeePlanWidgetSnapshot, WidgetPriority, WidgetState };

/**
 * The device-local active Focus session (from `useFocusSession`). Preferred
 * over the server's `activeFocus` because it carries the live, paused-aware
 * end time the countdown needs.
 */
export type LocalFocusInput = {
  sessionId: string;
  taskId?: string | null;
  subtaskId?: string | null;
  title: string;
  /** Absolute ISO time the current planned session ends. */
  endsAt: string;
} | null;

export type BuildSnapshotParams = {
  dashboard: TodayDashboard | null;
  localFocus?: LocalFocusInput;
  isAuthenticated: boolean;
  /**
   * True immediately after the user completes a session or the recommended
   * unit, so the widget can acknowledge it ("Great job") and surface the next
   * recommendation before the day-complete state settles in.
   */
  justCompleted?: boolean;
  now?: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Collapse the API's four-level priority onto the widget's three chips. */
export function normalizePriority(value: string | null | undefined): WidgetPriority | undefined {
  switch (value) {
    case 'urgent':
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    case 'low':
      return 'low';
    default:
      return undefined;
  }
}

function dayKeyInTz(ms: number, timezone?: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

function hourInTz(ms: number, timezone?: string): number {
  try {
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || undefined,
      hour: '2-digit',
      hour12: false,
    }).format(new Date(ms));
    const parsed = Number(formatted);
    return Number.isFinite(parsed) ? parsed % 24 : new Date(ms).getHours();
  } catch {
    return new Date(ms).getHours();
  }
}

/**
 * One short due-date label for the recommended unit. Overdue takes precedence;
 * an evening due time today reads as "tonight". Falls back to a formatted date
 * beyond tomorrow. Returns `undefined` for an unset/invalid due date so the
 * caller can omit the field entirely.
 */
export function dueLabel(dueAtIso: string | null | undefined, nowMs: number, timezone?: string): string | undefined {
  if (!dueAtIso) return undefined;
  const due = Date.parse(dueAtIso);
  if (Number.isNaN(due)) return undefined;
  if (due < nowMs) return 'Overdue';

  const todayKey = dayKeyInTz(nowMs, timezone);
  const dueKey = dayKeyInTz(due, timezone);
  if (dueKey === todayKey) {
    return hourInTz(due, timezone) >= 18 ? 'Due tonight' : 'Due today';
  }
  if (dueKey === dayKeyInTz(nowMs + DAY_MS, timezone)) return 'Due tomorrow';

  try {
    return `Due ${new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || undefined,
      month: 'short',
      day: 'numeric',
    }).format(new Date(due))}`;
  } catch {
    return `Due ${new Date(due).toISOString().slice(5, 10)}`;
  }
}

function focusEndsAtFromServer(active: NonNullable<TodayDashboard['activeFocus']>): string {
  const startedMs = Date.parse(active.startedAt);
  const base = Number.isNaN(startedMs) ? Date.now() : startedMs;
  return new Date(base + Math.max(0, active.plannedMinutes) * 60_000).toISOString();
}

function remainingMinutesUntil(endsAtIso: string, nowMs: number): number {
  const ends = Date.parse(endsAtIso);
  if (Number.isNaN(ends)) return 0;
  return Math.max(0, Math.ceil((ends - nowMs) / 60_000));
}

function isDayComplete(dashboard: TodayDashboard): boolean {
  return dashboard.dailyStatus.status === 'Day complete';
}

export function buildWidgetSnapshot(params: BuildSnapshotParams): BeePlanWidgetSnapshot {
  const nowMs = params.now ?? Date.now();
  const updatedAt = new Date(nowMs).toISOString();

  // Signed-out clears all private content — never leak task titles/ids.
  if (!params.isAuthenticated) {
    return { state: 'signed-out', updatedAt };
  }

  const { dashboard } = params;
  const progressPercent = dashboard?.progress?.percent;
  const focusMinutes = dashboard?.progress?.focusMinutes;

  // Active Focus always overrides the normal recommendation. Prefer the live
  // device session (paused-aware end time); fall back to the server's view.
  const localFocus = params.localFocus ?? null;
  if (localFocus) {
    return {
      state: 'focus-active',
      updatedAt,
      title: localFocus.title,
      taskId: localFocus.taskId ?? undefined,
      subtaskId: localFocus.subtaskId ?? undefined,
      focusSessionId: localFocus.sessionId,
      focusEndsAt: localFocus.endsAt,
      remainingMinutes: remainingMinutesUntil(localFocus.endsAt, nowMs),
      todayProgressPercent: progressPercent,
      todayFocusMinutes: focusMinutes,
    };
  }

  if (dashboard?.activeFocus) {
    const active = dashboard.activeFocus;
    const endsAt = focusEndsAtFromServer(active);
    return {
      state: 'focus-active',
      updatedAt,
      title: focusPrimaryTitle(active),
      taskId: active.taskId ?? undefined,
      subtaskId: active.subtaskId ?? undefined,
      focusSessionId: active.id,
      focusEndsAt: endsAt,
      remainingMinutes: remainingMinutesUntil(endsAt, nowMs),
      todayProgressPercent: progressPercent,
      todayFocusMinutes: focusMinutes,
    };
  }

  // No cached dashboard at all — safe "open the app" prompt, no private data.
  if (!dashboard) {
    return { state: 'empty', updatedAt };
  }

  const recommendation = dashboard.recommendation;
  const dayComplete = isDayComplete(dashboard);

  const recTitle = recommendation ? focusPrimaryTitle(recommendation) : undefined;

  // Just finished a session/unit: acknowledge, then surface what's next.
  if (params.justCompleted) {
    if (recommendation && recTitle) {
      return {
        state: 'completed-next',
        updatedAt,
        nextTitle: recTitle,
        nextTaskId: recommendation.taskId,
        nextSubtaskId: recommendation.subtaskId ?? undefined,
        nextEstimatedMinutes: recommendation.estimatedMinutes ?? undefined,
        todayProgressPercent: progressPercent,
      };
    }
    return { state: 'day-complete', updatedAt, todayProgressPercent: progressPercent };
  }

  // Normal recommended-work state.
  if (recommendation && recTitle) {
    return {
      state: 'recommendation',
      updatedAt,
      title: recTitle,
      taskId: recommendation.taskId,
      subtaskId: recommendation.subtaskId ?? undefined,
      estimatedMinutes: recommendation.estimatedMinutes ?? undefined,
      priority: normalizePriority(recommendation.priority),
      dueAt: recommendation.dueAt ?? undefined,
      dueLabel: dueLabel(recommendation.dueAt, nowMs, dashboard.timezone),
      whyNow: recommendation.recommendationReason || recommendation.reason || undefined,
      todayProgressPercent: progressPercent,
    };
  }

  // No recommendation: if the day is finished, celebrate; otherwise just point
  // the user back into the app rather than inventing work.
  if (dayComplete) {
    return { state: 'day-complete', updatedAt, todayProgressPercent: progressPercent };
  }
  return { state: 'empty', updatedAt, todayProgressPercent: progressPercent };
}
