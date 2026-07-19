import assert from 'node:assert/strict'
import test from 'node:test'
import { notificationDestination } from './notificationRouting.ts'

const notification = (type: string, data: Record<string, unknown> = {}) => ({ id: 'n1', type, title: '', body: '', taskId: 'task-1', data, isRead: false, sentAt: new Date().toISOString() }) as never

test('routes collaboration, AI, and reminder notifications to their dedicated mobile destinations', () => {
  assert.deepEqual(notificationDestination(notification('comment_added')), { screen: 'TaskDetails', taskId: 'task-1' })
  assert.deepEqual(notificationDestination(notification('task_updated', { destination: 'ai_collaboration' })), { screen: 'AiCollaboration', taskId: 'task-1' })
  assert.deepEqual(notificationDestination(notification('reminder', { reminderId: 'reminder-1' })), { screen: 'ReminderDetails', reminderId: 'reminder-1' })
})
