import assert from 'node:assert/strict'
import test from 'node:test'
import { filterNotifications } from './notificationSearch.ts'
import type { AppNotification } from './types'

const notifications: AppNotification[] = [
  { id: '1', type: 'comment_added', title: 'New comment', body: 'Sam mentioned the launch plan', taskId: 'task-launch', data: { taskTitle: 'Launch plan' }, isRead: false, actor: { id: 'sam', fullName: 'Sam Lee' }, sentAt: '2026-07-18T09:00:00Z' },
  { id: '2', type: 'reminder', title: 'Reminder', body: 'Review budget', data: { reminderId: 'reminder-budget', relatedName: 'July budget' }, isRead: true, sentAt: '2026-07-18T10:00:00Z' },
]

test('searches notification title, body, type, and supported related entities', () => {
  assert.deepEqual(filterNotifications(notifications, 'comment').map((item) => item.id), ['1'])
  assert.deepEqual(filterNotifications(notifications, 'Sam').map((item) => item.id), ['1'])
  assert.deepEqual(filterNotifications(notifications, 'reminder-budget').map((item) => item.id), ['2'])
  assert.deepEqual(filterNotifications(notifications, 'reminder').map((item) => item.id), ['2'])
})

test('clearing search restores the currently selected read filter', () => {
  assert.deepEqual(filterNotifications(notifications, 'launch', 'unread').map((item) => item.id), ['1'])
  assert.deepEqual(filterNotifications(notifications, '', 'unread').map((item) => item.id), ['1'])
})

test('returns an empty result when no notification matches', () => {
  assert.deepEqual(filterNotifications(notifications, 'does not exist'), [])
})

test('combines search with read filters without changing unread state', () => {
  assert.deepEqual(filterNotifications(notifications, 'budget', 'read').map((item) => item.id), ['2'])
  assert.deepEqual(filterNotifications(notifications, 'budget', 'unread'), [])
  assert.equal(notifications[0].isRead, false)
})
