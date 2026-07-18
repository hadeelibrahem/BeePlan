import { describe, expect, it } from 'vitest'
import { computeCompletionTrend } from './analytics'
import type { ApiTask } from './tasksApi'

const task = (overrides: Partial<ApiTask>): ApiTask => ({
  id: 'task', title: 'Task', description: '', priority: 'medium', status: 'todo', progress: 0,
  dueTime: '', category: '', notes: '', estimatedTimeMinutes: 0, spentTimeMinutes: 0, remainingTimeMinutes: 0,
  estimatedHours: 0, spentHours: 0, remainingHours: 0, progressPercentage: 0, reminderEnabled: false,
  labels: [], attachments: [], isFavorite: false, isFocusTask: false, isBlocked: false, dependenciesComplete: true,
  subtasks: [], dependencies: [], recurrence: null, activities: [], createdAt: '', updatedAt: '', ...overrides,
})

describe('computeCompletionTrend', () => {
  it('returns a fixed 14-day local calendar range and counts only recorded completions', () => {
    const now = new Date(2026, 6, 17, 12)
    const trend = computeCompletionTrend([
      task({ id: 'one', status: 'done', completedAt: '2026-07-17T09:00:00' }),
      task({ id: 'two', status: 'done', completedAt: '2026-07-17T20:00:00' }),
      task({ id: 'old', status: 'done', completedAt: '2026-07-01T20:00:00' }),
      task({ id: 'unknown', status: 'done' }),
    ], now)

    expect(trend).toHaveLength(14)
    expect(trend[0]).toEqual({ date: '2026-07-04', completed: 0 })
    expect(trend.at(-1)).toEqual({ date: '2026-07-17', completed: 2 })
  })
})
