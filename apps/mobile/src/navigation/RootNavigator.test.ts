import assert from 'node:assert/strict'
import test from 'node:test'
import { MAIN_TAB_ROUTES } from './types.ts'

test('MainTabs declares the five main destinations', () => {
  assert.deepEqual(MAIN_TAB_ROUTES, ['Dashboard', 'Tasks', 'Focus', 'Reminders', 'People'])
})
