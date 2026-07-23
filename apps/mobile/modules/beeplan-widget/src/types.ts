/**
 * Canonical contract for the Android home-screen widget snapshot.
 *
 * This is the single source of truth for the widget payload shape, shared by
 * the mobile mapper (`src/lib/widgetSnapshot.ts`) and the native bridge. Keep it
 * flat and render-only: every field must be safe to persist to widget storage,
 * so it deliberately excludes auth tokens and any sensitive user data.
 */

export type WidgetState =
  | 'recommendation'
  | 'focus-active'
  | 'completed-next'
  | 'day-complete'
  | 'signed-out'
  | 'empty';

export type WidgetPriority = 'low' | 'medium' | 'high';

export type BeePlanWidgetSnapshot = {
  state: WidgetState;
  /** ISO timestamp of when this snapshot was produced (drives "Updated Xh ago"). */
  updatedAt: string;

  title?: string;
  taskId?: string;
  subtaskId?: string;

  estimatedMinutes?: number;
  remainingMinutes?: number;

  priority?: WidgetPriority;
  dueAt?: string;
  /** Pre-rendered, timezone-resolved due label (e.g. "Due tomorrow"). */
  dueLabel?: string;
  whyNow?: string;

  focusSessionId?: string;
  /** Absolute ISO end time; the widget recomputes the countdown at render time. */
  focusEndsAt?: string;

  nextTitle?: string;
  nextTaskId?: string;
  nextSubtaskId?: string;
  nextEstimatedMinutes?: number;

  todayProgressPercent?: number;
  /** Minutes focused today (from dashboard progress) — shown in the Focus footer. */
  todayFocusMinutes?: number;
};
