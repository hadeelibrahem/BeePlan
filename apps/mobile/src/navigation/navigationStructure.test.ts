import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTH_SCREENS,
  MAIN_TAB_SCREENS,
  MAIN_TAB_SCREEN_ROUTES,
  STACK_SCREENS,
  areaForScreen,
  screenForDeepLink,
} from './navigationStructure.ts';
import { SCREEN_PARENTS, type AppScreen } from './backNavigation.ts';
import { MAIN_TAB_ROUTES } from './types.ts';

test('main destinations are the bottom tabs', () => {
  assert.deepEqual([...MAIN_TAB_SCREENS], ['dashboard', 'tasks', 'focus', 'reminders', 'people']);
});

test('navigation specification and navigator tab routes cannot drift', () => {
  assert.deepEqual(MAIN_TAB_SCREENS.map((screen) => MAIN_TAB_SCREEN_ROUTES[screen]), MAIN_TAB_ROUTES);
});

test('every screen is classified into exactly one navigation area', () => {
  const all = [...MAIN_TAB_SCREENS, ...STACK_SCREENS, ...AUTH_SCREENS] as AppScreen[];
  const seen = new Set<AppScreen>();
  for (const screen of all) {
    assert.equal(seen.has(screen), false, `${screen} appears in more than one area`);
    seen.add(screen);
  }
  // The union must cover the full screen graph — nothing dropped in the migration.
  const graphScreens = Object.keys(SCREEN_PARENTS) as AppScreen[];
  assert.equal(seen.size, graphScreens.length);
  for (const screen of graphScreens) {
    assert.equal(seen.has(screen), true, `${screen} is not assigned to a navigation area`);
  }
});

test('areaForScreen agrees with the screen lists', () => {
  assert.equal(areaForScreen('dashboard'), 'tab');
  assert.equal(areaForScreen('reminders'), 'tab');
  assert.equal(areaForScreen('people'), 'tab');
  assert.equal(areaForScreen('taskDetails'), 'stack');
  assert.equal(areaForScreen('editTask'), 'stack');
  assert.equal(areaForScreen('social'), 'stack');
  assert.equal(areaForScreen('auth'), 'auth');
  assert.equal(areaForScreen('reset'), 'auth');
});

test('tab destinations sit at the root of the back graph (their parent is a root or another tab)', () => {
  for (const tab of MAIN_TAB_SCREENS) {
    const parent = SCREEN_PARENTS[tab];
    assert.ok(
      parent === null || (MAIN_TAB_SCREENS as readonly string[]).includes(parent),
      `tab ${tab} should return to a root/tab, not into a stack (got ${parent})`,
    );
  }
});

test('the reset-password deep link opens the reset screen', () => {
  assert.equal(screenForDeepLink('beeplan://reset-password?token=abc'), 'reset');
  assert.equal(screenForDeepLink('https://app.beeplan.dev/reset-password'), 'reset');
  assert.equal(screenForDeepLink('beeplan://dashboard'), null);
});

test('Calendar and AI Daily Planner are stack destinations with stable deep links', () => {
  assert.equal(areaForScreen('calendar'), 'stack');
  assert.equal(areaForScreen('aiDailyPlanner'), 'stack');
  assert.equal(screenForDeepLink('beeplan://calendar'), 'calendar');
  assert.equal(screenForDeepLink('https://beeplan.app/planner'), 'aiDailyPlanner');
});
