/**
 * Target navigation architecture for the stack + tabs migration (Task 20).
 *
 * This is the pure, framework-agnostic *specification* of the app's navigation
 * tree: which screens are bottom-tab destinations, which live in the
 * detail/create/edit stack, which belong to the pre-auth flow, and how deep
 * links map to screens. It reuses the AppScreen union from the existing
 * hand-rolled model ([[backNavigation]]) so the React Navigation wiring and the
 * current screen state machine describe the same set of screens.
 *
 * Keeping this as data (no react-navigation imports) lets the architecture be
 * unit-tested before the navigators are wired, and gives the eventual
 * Tab/Stack navigators a single source of truth for their screen lists.
 */

import type { AppScreen } from './backNavigation';

/** Bottom-tab destinations — the app's top-level "places". */
export const MAIN_TAB_SCREENS = ['dashboard', 'tasks', 'focus', 'reminders'] as const;
export type MainTabScreen = (typeof MAIN_TAB_SCREENS)[number];

/**
 * Screens pushed onto the stack above the tabs: detail / create / edit / modal
 * flows reached from a tab. Ordered roughly by the flow they belong to.
 */
export const STACK_SCREENS = [
  'taskDetails',
  'createTask',
  'aiPlanTask',
  'editTask',
  'focusSession',
  'create',
  'details',
  'edit',
  'social',
  'notifications',
] as const;
export type StackScreen = (typeof STACK_SCREENS)[number];

/** Pre-authentication flow — its own stack, shown when there is no user. */
export const AUTH_SCREENS = ['auth', 'forgot', 'reset'] as const;
export type AuthScreen = (typeof AUTH_SCREENS)[number];

export type NavigationArea = 'tab' | 'stack' | 'auth';

/**
 * Deep links that must keep working after the migration. Maps a URL path
 * fragment to the screen it should open. The reset-password link is delivered
 * via expo-linking today; React Navigation's `linking` config should reproduce
 * this mapping.
 */
export const DEEP_LINKS: Record<string, AppScreen> = {
  'reset-password': 'reset',
};

/** Which area of the navigation tree a screen belongs to. */
export function areaForScreen(screen: AppScreen): NavigationArea {
  if ((MAIN_TAB_SCREENS as readonly string[]).includes(screen)) return 'tab';
  if ((AUTH_SCREENS as readonly string[]).includes(screen)) return 'auth';
  return 'stack';
}

/** Resolve a deep-link path fragment to the screen it should open, if any. */
export function screenForDeepLink(url: string): AppScreen | null {
  for (const [fragment, screen] of Object.entries(DEEP_LINKS)) {
    if (url.includes(fragment)) return screen;
  }
  return null;
}
