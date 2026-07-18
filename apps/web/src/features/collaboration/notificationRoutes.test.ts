import { describe, expect, it } from 'vitest'
import { notificationTarget } from './notificationRoutes'
import type { AppNotification } from './types'

const notification = (type: AppNotification['type'], taskId = 'task-1'): AppNotification => ({
  id: 'note-1', type, taskId, title: 'Title', body: 'Body', isRead: false, sentAt: '2026-01-01T00:00:00.000Z',
})

describe('notification routes', () => {
  it('opens task notifications at their task route', () => {
    expect(notificationTarget(notification('task_updated'))).toBe('/tasks/task-1')
  })

  it('opens collaboration notifications in collaboration context', () => {
    expect(notificationTarget(notification('mention'))).toBe('/tasks/task-1/collaboration?notification=note-1')
  })

  it('does not produce a broken link without a task target', () => {
    expect(notificationTarget({ ...notification('reminder'), taskId: undefined })).toBeNull()
  })
})
