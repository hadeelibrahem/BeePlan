import { describe, expect, it } from 'vitest'
import { pathForScreen, resolveAppRoute } from './appRoutes'

describe('app routes', () => {
  it('resolves task deep links and editing routes', () => {
    expect(resolveAppRoute('/tasks/task-1')).toEqual({ screen: 'taskDetails', taskId: 'task-1' })
    expect(resolveAppRoute('/tasks/task-1/edit')).toEqual({ screen: 'editTask', taskId: 'task-1' })
  })

  it('creates shareable paths for task and notification views', () => {
    expect(pathForScreen('taskDetails', { taskId: 'a/b' })).toBe('/tasks/a%2Fb')
    expect(pathForScreen('notifications')).toBe('/notifications')
  })

  it('covers the major static navigation destinations', () => {
    expect(resolveAppRoute('/calendar').screen).toBe('calendar')
    expect(resolveAppRoute('/notifications').screen).toBe('notifications')
    expect(resolveAppRoute('/people').screen).toBe('social')
    expect(resolveAppRoute('/sign-in').screen).toBe('dashboard')
  })

  it('returns a safe fallback for unknown paths', () => {
    expect(resolveAppRoute('/not-a-screen')).toEqual({ screen: 'notFound' })
  })
})
