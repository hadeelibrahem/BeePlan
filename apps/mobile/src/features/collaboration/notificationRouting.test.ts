import assert from 'node:assert/strict'
import test from 'node:test'
import { notificationDestination } from './notificationRouting.ts'

const notification = (type: string, data: Record<string, unknown> = {}) => ({ id: 'n1', type, title: '', body: '', taskId: 'task-1', data, isRead: false, sentAt: new Date().toISOString() }) as never

test('routes collaboration, AI, and reminder notifications to their dedicated mobile destinations', () => {
  assert.deepEqual(notificationDestination(notification('comment_added')), { screen: 'TaskDetails', taskId: 'task-1' })
  assert.deepEqual(notificationDestination(notification('task_updated', { destination: 'ai_collaboration' })), { screen: 'AiCollaboration', taskId: 'task-1' })
  assert.deepEqual(notificationDestination(notification('reminder', { reminderId: 'reminder-1' })), { screen: 'ReminderDetails', reminderId: 'reminder-1' })
})

test('preserves comment and subtask entity IDs for direct task navigation', () => {
  assert.deepEqual(notificationDestination(notification('mention', { commentId: 'comment-1' })), { screen: 'TaskDetails', taskId: 'task-1', commentId: 'comment-1' })
  assert.deepEqual(notificationDestination(notification('subtask_completed', { subtaskId: 'subtask-1' })), { screen: 'TaskDetails', taskId: 'task-1', subtaskId: 'subtask-1' })
})

test('routes calendar, focus, planner, and deleted targets safely', () => {
  assert.deepEqual(notificationDestination(notification('calendar_conflict', { date: '2026-08-02' })), { screen: 'Calendar', date: '2026-08-02' })
  assert.deepEqual(notificationDestination(notification('focus_reminder')), { screen: 'Focus' })
  assert.deepEqual(notificationDestination(notification('ai_recommendation_ready')), { screen: 'AiDailyPlanner' })
  assert.deepEqual(notificationDestination({ ...notification('task_updated'), taskId: undefined } as never), { screen: 'Notifications' })
})
