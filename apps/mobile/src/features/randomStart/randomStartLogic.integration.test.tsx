import { buildWheel, EMPTY_FILTERS, matchesFilters, pickRandom } from './randomStartLogic'
import type { RandomStartItem } from '../../lib/tasksApi'

const task = (id: string, extra: Partial<RandomStartItem> = {}): RandomStartItem => ({ id, candidateKey: `task:${id}`, itemType: 'task', title: id, priority: 'medium', status: 'todo', progress: 0, ...extra })

describe('Random Start wheel logic', () => {
  it('builds manual pools and excludes a result without mutating the task', () => {
    const items = [task('a'), task('b')]
    expect(buildWheel(items, 'pick', new Set(['task:a', 'task:b']), EMPTY_FILTERS, new Set(['task:a']))).toEqual([items[1]])
    expect(items[0].status).toBe('todo')
  })
  it('combines filters and supports an empty wheel', () => {
    expect(matchesFilters(task('a', { priority: 'high', estimatedTimeMinutes: 20 }), { priorities: ['high'], due: [], durations: ['under30'] })).toBe(true)
    expect(pickRandom([], true, () => 0)).toBeNull()
  })
  it('performs weighted random selection', () => {
    const items = [task('high', { priority: 'high' }), task('low', { priority: 'low' })]
    expect(pickRandom(items, true, () => 0)?.id).toBe('high')
    expect(pickRandom(items, true, () => .99)?.id).toBe('low')
  })
  it('keeps dependent tasks in all, manual, and filtered pools', () => {
    const dependent = task('dependent', { priority: 'high', incompleteDependencyCount: 1, dependencyTitles: ['Finish API'] })
    expect(buildWheel([dependent], 'all', new Set(), EMPTY_FILTERS, new Set())).toEqual([dependent])
    expect(buildWheel([dependent], 'pick', new Set([dependent.candidateKey]), EMPTY_FILTERS, new Set())).toEqual([dependent])
    expect(buildWheel([dependent], 'filter', new Set(), { priorities: ['high'], due: [], durations: [] }, new Set())).toEqual([dependent])
  })
})
