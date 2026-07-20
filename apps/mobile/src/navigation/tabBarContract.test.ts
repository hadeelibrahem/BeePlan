import assert from 'node:assert/strict'
import test from 'node:test'
import { pressTab, TAB_ROUTES } from './tabBarContract.ts'

test('tab bar declares exactly the five main routes including People', () => {
  assert.deepEqual(TAB_ROUTES, ['Dashboard', 'Tasks', 'Focus', 'Reminders', 'People'])
})

test('pressing an inactive tab calls navigator with its route', () => {
  const calls: string[] = []
  pressTab(false, 'People', 'people-key', () => ({ defaultPrevented: false }), (name) => calls.push(name))
  assert.deepEqual(calls, ['People'])
})

test('active or prevented tabs do not navigate', () => {
  const calls: string[] = []
  pressTab(true, 'Tasks', 'tasks-key', () => ({ defaultPrevented: false }), (name) => calls.push(name))
  pressTab(false, 'Focus', 'focus-key', () => ({ defaultPrevented: true }), (name) => calls.push(name))
  assert.deepEqual(calls, [])
})
