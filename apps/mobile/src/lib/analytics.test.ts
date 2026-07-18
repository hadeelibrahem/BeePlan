import assert from 'node:assert/strict'
import test from 'node:test'
import { computeCompletionTrend, computeTaskAnalytics } from './analytics.ts'

const tasks: any[] = [{ id: '1', status: 'done', category: 'Work', priority: 'high', completedAt: '2026-07-18T09:00:00' }, { id: '2', status: 'missed', category: '', priority: 'low' }, { id: '3', status: 'todo', category: 'Work', priority: 'high' }]

test('computes productivity totals and breakdowns from the shared task model', () => {
  const stats = computeTaskAnalytics(tasks)
  assert.equal(stats.completedTasks, 1)
  assert.equal(stats.missedTasks, 1)
  assert.equal(stats.completionRate, 33)
  assert.deepEqual(stats.byCategory, [['Work', 2], ['Uncategorized', 1]])
})

test('builds a filtered completion chart from completion timestamps', () => {
  assert.deepEqual(computeCompletionTrend(tasks, 3, new Date('2026-07-18T12:00:00')).map((point) => point.completed), [0, 0, 1])
})
