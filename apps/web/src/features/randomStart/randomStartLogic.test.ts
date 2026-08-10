import { describe, expect, it } from 'vitest'
import { buildWheel, EMPTY_FILTERS, matchesFilters, pickRandom } from './randomStartLogic'
import type { RandomStartItem } from '../../lib/tasksApi'

const task = (id: string, extra: Partial<RandomStartItem> = {}): RandomStartItem => ({ id, candidateKey: `task:${id}`, itemType: 'task', title: id, priority: 'medium', status: 'todo', progress: 0, ...extra })

describe('random start wheel logic', () => {
  it('builds all and manual wheels while honoring temporary exclusions', () => {
    const items = [task('a'), task('b'), task('c')]
    expect(buildWheel(items, 'all', new Set(), EMPTY_FILTERS, new Set(['task:b']))).toHaveLength(2)
    expect(buildWheel(items, 'pick', new Set(['task:c']), EMPTY_FILTERS, new Set())).toEqual([items[2]])
  })
  it('combines task filters', () => {
    const today = new Date(2026, 7, 9, 12)
    expect(matchesFilters(task('a', { priority: 'high', dueDate: '2026-08-09T15:00:00', estimatedTimeMinutes: 20 }), { priorities: ['high'], due: ['today'], durations: ['under30'] }, today)).toBe(true)
    expect(matchesFilters(task('b', { priority: 'low' }), { priorities: ['high'], due: [], durations: [] }, today)).toBe(false)
  })
  it('never lets dependency metadata silently affect all, pick, filter, or random selection', () => {
    const dependent = task('dependent', { priority: 'high', incompleteDependencyCount: 1, dependencyTitles: ['Finish API'] })
    expect(buildWheel([dependent], 'all', new Set(), EMPTY_FILTERS, new Set())).toEqual([dependent])
    expect(buildWheel([dependent], 'pick', new Set([dependent.candidateKey]), EMPTY_FILTERS, new Set())).toEqual([dependent])
    expect(buildWheel([dependent], 'filter', new Set(), { priorities: ['high'], due: [], durations: [] }, new Set())).toEqual([dependent])
    expect(pickRandom([task('plain'), dependent], false, () => .99)).toBe(dependent)
  })
  it('uses priority weights without becoming deterministic', () => {
    const items = [task('high', { priority: 'high' }), task('low', { priority: 'low' })]
    expect(pickRandom(items, true, () => 0)?.id).toBe('high')
    expect(pickRandom(items, true, () => .99)?.id).toBe('low')
    expect(pickRandom([], true, () => 0)).toBeNull()
  })
})
