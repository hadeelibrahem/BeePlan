import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveHardwareBack, SCREEN_PARENTS, type AppScreen } from './backNavigation.ts';

test('an open sheet closes first, before any navigation', () => {
  assert.deepEqual(resolveHardwareBack({ screen: 'taskDetails', sheetOpen: true }), { type: 'close-sheet' });
  // Even on a root screen, the sheet takes precedence.
  assert.deepEqual(resolveHardwareBack({ screen: 'dashboard', sheetOpen: true }), { type: 'close-sheet' });
});

test('a non-root screen returns to its logical parent', () => {
  assert.deepEqual(resolveHardwareBack({ screen: 'taskDetails', sheetOpen: false }), {
    type: 'navigate',
    to: 'tasks',
  });
  assert.deepEqual(resolveHardwareBack({ screen: 'editTask', sheetOpen: false }), {
    type: 'navigate',
    to: 'taskDetails',
  });
  assert.deepEqual(resolveHardwareBack({ screen: 'edit', sheetOpen: false }), {
    type: 'navigate',
    to: 'details',
  });
  assert.deepEqual(resolveHardwareBack({ screen: 'create', sheetOpen: false }), {
    type: 'navigate',
    to: 'reminders',
  });
  assert.deepEqual(resolveHardwareBack({ screen: 'social', sheetOpen: false }), {
    type: 'navigate',
    to: 'reminders',
  });
  assert.deepEqual(resolveHardwareBack({ screen: 'notifications', sheetOpen: false }), {
    type: 'navigate',
    to: 'dashboard',
  });
  assert.deepEqual(resolveHardwareBack({ screen: 'settings', sheetOpen: false }), {
    type: 'navigate',
    to: 'dashboard',
  });
});

test('back within the reset-password flow returns to auth', () => {
  assert.deepEqual(resolveHardwareBack({ screen: 'forgot', sheetOpen: false }), { type: 'navigate', to: 'auth' });
  assert.deepEqual(resolveHardwareBack({ screen: 'reset', sheetOpen: false }), { type: 'navigate', to: 'auth' });
});

test('only root screens exit/background the app', () => {
  assert.deepEqual(resolveHardwareBack({ screen: 'dashboard', sheetOpen: false }), { type: 'exit' });
  assert.deepEqual(resolveHardwareBack({ screen: 'auth', sheetOpen: false }), { type: 'exit' });
});

test('every screen resolves to a defined decision (no accidental exits)', () => {
  const screens = Object.keys(SCREEN_PARENTS) as AppScreen[];
  for (const screen of screens) {
    const decision = resolveHardwareBack({ screen, sheetOpen: false });
    const parent = SCREEN_PARENTS[screen];
    if (parent === null) {
      assert.deepEqual(decision, { type: 'exit' }, `${screen} should exit`);
    } else {
      assert.deepEqual(decision, { type: 'navigate', to: parent }, `${screen} should navigate to ${parent}`);
    }
  }
});

test('navigating back never lands on the same screen', () => {
  const screens = Object.keys(SCREEN_PARENTS) as AppScreen[];
  for (const screen of screens) {
    const parent = SCREEN_PARENTS[screen];
    if (parent !== null) assert.notEqual(parent, screen, `${screen} must not be its own parent`);
  }
});
