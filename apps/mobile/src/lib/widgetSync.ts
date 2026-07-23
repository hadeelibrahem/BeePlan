/**
 * The single mobile-side bridge between app state and the Android home-screen
 * widget. Screens/effects call {@link syncWidget} (or the logout/sign-out
 * helper) — they never build a widget payload themselves. This keeps snapshot
 * construction centralized in {@link buildWidgetSnapshot} so every surface
 * agrees on state selection, and it is the only place `setWidgetSnapshot` is
 * invoked (which triggers the native `updateAll`).
 *
 * All calls are safe no-ops on iOS/web (the native module is Android-only).
 */

import { buildWidgetSnapshot, type LocalFocusInput } from './widgetSnapshot';
import { focusPrimaryTitle } from './focusDisplay';
import { computeElapsed, type ActiveFocus } from './useFocusSession';
import type { TodayDashboard } from './tasksApi';
import { setWidgetSnapshot } from '../../modules/beeplan-widget';

/**
 * Convert the device's live Focus session into the widget's focus input,
 * deriving an absolute end time from the session's stable wall-clock fields
 * (never the per-second tick — so this is safe to depend on in an effect).
 */
export function localFocusFromActive(active: ActiveFocus | null): LocalFocusInput {
  if (!active) return null;
  const now = Date.now();
  const remainingMs = Math.max(0, active.plannedMinutes * 60_000 - computeElapsed(active, now));
  return {
    sessionId: active.sessionId,
    taskId: active.taskId,
    subtaskId: active.subtaskId,
    title: focusPrimaryTitle(active),
    endsAt: new Date(now + remainingMs).toISOString(),
  };
}

export type SyncWidgetParams = {
  dashboard: TodayDashboard | null;
  active: ActiveFocus | null;
  isAuthenticated: boolean;
  justCompleted?: boolean;
};

/** Build the current snapshot and push it to the widget. */
export async function syncWidget(params: SyncWidgetParams): Promise<void> {
  const snapshot = buildWidgetSnapshot({
    dashboard: params.dashboard,
    localFocus: localFocusFromActive(params.active),
    isAuthenticated: params.isAuthenticated,
    justCompleted: params.justCompleted,
  });
  await setWidgetSnapshot(snapshot);
}

/**
 * Overwrite the stored snapshot with the signed-out state on logout. Because
 * the signed-out snapshot carries no private fields, this both clears any
 * previously stored task details and shows the "Sign in…" prompt.
 */
export async function pushSignedOutWidget(): Promise<void> {
  await setWidgetSnapshot(buildWidgetSnapshot({ dashboard: null, isAuthenticated: false }));
}
