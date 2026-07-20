import assert from 'node:assert/strict'
import test from 'node:test'
import { createReminderInitialState } from './createReminderInitialState.ts'
import { createPersonReminderParams } from './personReminderNavigation.ts'

test('person-reminder CTA navigates directly to Create Reminder with person type', () => {
  assert.deepEqual(createPersonReminderParams(), { initialType: 'person' })
})

test('person-reminder navigation preserves a selected friend when supplied', () => {
  assert.deepEqual(createPersonReminderParams('friend-7'), { initialType: 'person', initialFriendId: 'friend-7' })
})

test('Create Reminder initializes the person form and selected friend from navigation', () => {
  const initial = createReminderInitialState('person', 'friend-7')
  assert.equal(initial?.type, 'person')
  assert.equal(initial?.person?.targetUserId, 'friend-7')
  assert.equal(createReminderInitialState(), undefined)
})
