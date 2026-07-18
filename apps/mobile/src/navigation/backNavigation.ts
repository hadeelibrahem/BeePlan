/**
 * Hardware-back navigation model for the hand-rolled screen state machine in
 * App.tsx. Kept as pure data + functions (no React, no react-native imports) so
 * the Android back behavior can be unit-tested in isolation.
 *
 * This intentionally does NOT introduce React Navigation — it mirrors the
 * logical parent each screen's on-screen back button already navigates to, so
 * the hardware back button and the header back arrow always agree.
 */

export type AppScreen =
  | 'auth'
  | 'forgot'
  | 'reset'
  | 'dashboard'
  | 'tasks'
  | 'focus'
  | 'focusSession'
  | 'createTask'
  | 'aiPlanTask'
  | 'taskDetails'
  | 'editTask'
  | 'reminders'
  | 'create'
  | 'details'
  | 'edit'
  | 'social'
  | 'notifications';

/**
 * The logical parent of each screen — where "back" returns to. `null` marks a
 * root screen: back there falls through to the OS (exit/background). The Record
 * type forces every screen to declare a parent, so a newly added screen can't
 * silently fall back to exiting the app.
 */
export const SCREEN_PARENTS: Record<AppScreen, AppScreen | null> = {
  // Pre-auth roots + flow.
  auth: null,
  forgot: 'auth',
  reset: 'auth',
  // Main app root.
  dashboard: null,
  // Primary destinations hang off the dashboard.
  tasks: 'dashboard',
  focus: 'dashboard',
  reminders: 'dashboard',
  notifications: 'dashboard',
  // Task detail/create/edit flow.
  focusSession: 'focus',
  createTask: 'tasks',
  aiPlanTask: 'tasks',
  taskDetails: 'tasks',
  editTask: 'taskDetails',
  // Reminder detail/create/edit flow.
  create: 'reminders',
  details: 'reminders',
  edit: 'details',
  social: 'reminders',
};

export type BackDecision =
  | { type: 'close-sheet' }
  | { type: 'navigate'; to: AppScreen }
  | { type: 'exit' };

/**
 * Decide what an Android hardware-back press should do, given the current
 * screen and whether a modal/sheet is open. Order matters:
 *   1. An open sheet/modal closes first.
 *   2. A non-root screen returns to its logical parent.
 *   3. A root screen exits/backgrounds the app (caller returns false to the OS).
 */
export function resolveHardwareBack(state: { screen: AppScreen; sheetOpen: boolean }): BackDecision {
  if (state.sheetOpen) return { type: 'close-sheet' };

  const parent = SCREEN_PARENTS[state.screen];
  if (parent) return { type: 'navigate', to: parent };

  return { type: 'exit' };
}
