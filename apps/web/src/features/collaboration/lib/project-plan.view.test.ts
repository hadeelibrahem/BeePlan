import { describe, expect, it } from 'vitest'
import {
  buildTimelineRows,
  downstreamOf,
  filterNodeIds,
  groupByLayer,
  layoutGraph,
  nodeMatchesFilters,
  ownersOf,
  relatedPath,
  timelineDomain,
  upstreamOf,
  EMPTY_FILTERS,
  filtersFromFocus,
  hasActiveFilters,
} from './project-plan.view'
import type { ProjectPlanEdge, ProjectPlanNode } from '../api/project-plan.api'

function node(over: Partial<ProjectPlanNode> = {}): ProjectPlanNode {
  return {
    id: 'n',
    entityType: 'subtask',
    parentTaskId: 'task-1',
    title: 'Node',
    status: 'todo',
    assignee: { userId: 'u1', displayName: 'Alice' },
    estimatedMinutes: 60,
    actualMinutes: 0,
    remainingMinutes: 60,
    plannedStart: null,
    plannedEnd: null,
    forecastStart: null,
    forecastEnd: null,
    dueDate: null,
    progressPercent: 0,
    isBlocked: false,
    blockedByIds: [],
    blockingIds: [],
    focusSummary: null,
    isExternal: false,
    isGroup: false,
    layer: 0,
    inCycle: false,
    isUnscheduled: true,
    ...over,
  }
}

// a -> b -> c (a blocks b blocks c)
const chainEdges: ProjectPlanEdge[] = [
  { id: 'e1', sourceId: 'a', targetId: 'b', dependencyType: 'subtask' },
  { id: 'e2', sourceId: 'b', targetId: 'c', dependencyType: 'subtask' },
]

describe('selection traversal (shared, not duplicated in components)', () => {
  it('upstreamOf returns transitive prerequisites', () => {
    expect([...upstreamOf('c', chainEdges)].sort()).toEqual(['a', 'b'])
  })
  it('downstreamOf returns transitive dependents', () => {
    expect([...downstreamOf('a', chainEdges)].sort()).toEqual(['b', 'c'])
  })
  it('relatedPath combines self + upstream + downstream for highlight', () => {
    const path = relatedPath('b', chainEdges)
    expect([...path.all].sort()).toEqual(['a', 'b', 'c'])
    expect([...path.upstream]).toEqual(['a'])
    expect([...path.downstream]).toEqual(['c'])
  })
})

describe('filters', () => {
  const nodes = [
    node({ id: 'a', title: 'Design API', assignee: { userId: 'u1', displayName: 'Alice' }, status: 'todo', isBlocked: false }),
    node({ id: 'b', title: 'Build UI', assignee: { userId: 'u2', displayName: 'Bob' }, status: 'in_progress', isBlocked: true }),
  ]

  it('filters by owner, status, blocked and search', () => {
    expect([...filterNodeIds(nodes, { ...EMPTY_FILTERS, ownerId: 'u2' })]).toEqual(['b'])
    expect([...filterNodeIds(nodes, { ...EMPTY_FILTERS, status: 'todo' })]).toEqual(['a'])
    expect([...filterNodeIds(nodes, { ...EMPTY_FILTERS, blockedOnly: true })]).toEqual(['b'])
    expect([...filterNodeIds(nodes, { ...EMPTY_FILTERS, search: 'api' })]).toEqual(['a'])
  })

  it('an empty filter matches every node', () => {
    expect(nodes.every((n) => nodeMatchesFilters(n, EMPTY_FILTERS))).toBe(true)
  })

  it('ownersOf lists distinct assignees', () => {
    expect(ownersOf(nodes)).toEqual([
      { userId: 'u1', displayName: 'Alice' },
      { userId: 'u2', displayName: 'Bob' },
    ])
  })
})

describe('layered layout', () => {
  it('groups by layer ascending and lays out left-to-right', () => {
    const nodes = [node({ id: 'a', layer: 0 }), node({ id: 'b', layer: 1 }), node({ id: 'c', layer: 1 })]
    const groups = groupByLayer(nodes)
    expect(groups.map((g) => g.layer)).toEqual([0, 1])
    const layout = layoutGraph(nodes)
    expect(layout.positions.get('a')!.x).toBe(0)
    expect(layout.positions.get('b')!.x).toBeGreaterThan(0)
    expect(layout.positions.get('b')!.y).not.toBe(layout.positions.get('c')!.y)
  })
})

describe('timeline layout', () => {
  it('computes a domain covering planned + forecast and places a today marker', () => {
    const now = new Date('2026-07-25T00:00:00.000Z')
    const nodes = [
      node({ id: 'a', plannedStart: '2026-07-20T00:00:00.000Z', plannedEnd: '2026-07-24T00:00:00.000Z', forecastEnd: '2026-07-28T00:00:00.000Z' }),
    ]
    const domain = timelineDomain(nodes, now)
    expect(domain.startMs).toBe(new Date('2026-07-20T00:00:00.000Z').getTime())
    expect(domain.todayFraction).not.toBeNull()

    const [row] = buildTimelineRows(nodes, domain)
    expect(row.hasBar).toBe(true)
    // forecastEnd (Jul 28) is after plannedEnd (Jul 24) -> delayed.
    expect(row.isDelayed).toBe(true)
  })

  it('marks nodes without any dates as having no bar', () => {
    const nodes = [node({ id: 'a' })]
    const domain = timelineDomain(nodes)
    expect(buildTimelineRows(nodes, domain)[0].hasBar).toBe(false)
  })
})

describe('filtersFromFocus — deep links from recommendations and alerts', () => {
  it('returns the empty filters when there is no focus', () => {
    expect(filtersFromFocus(undefined)).toEqual(EMPTY_FILTERS)
  })

  it('maps a blocked-work alert onto the blocked-only filter', () => {
    const filters = filtersFromFocus({ blockedOnly: true })
    expect(filters.blockedOnly).toBe(true)
    expect(filters.itemIds).toBeNull()
  })

  it('maps a member-scoped focus onto the owner filter', () => {
    expect(filtersFromFocus({ memberId: 'u2' }).ownerId).toBe('u2')
  })

  it('maps affected items onto an item-id filter', () => {
    expect(filtersFromFocus({ itemIds: ['a', 'b'] }).itemIds).toEqual(['a', 'b'])
  })

  it('ignores an empty itemIds list rather than hiding every node', () => {
    expect(filtersFromFocus({ itemIds: [] }).itemIds).toBeNull()
  })

  it('shows only the focused items — the "blocked tasks -> only blocked visible" case', () => {
    const nodes = [node({ id: 'a' }), node({ id: 'b' }), node({ id: 'c' })]
    const visible = filterNodeIds(nodes, filtersFromFocus({ itemIds: ['a', 'c'] }))
    expect([...visible].sort()).toEqual(['a', 'c'])
  })

  it('combines an item filter with the other filters rather than replacing them', () => {
    const nodes = [
      node({ id: 'a', isBlocked: true }),
      node({ id: 'b', isBlocked: false }),
    ]
    const visible = filterNodeIds(nodes, filtersFromFocus({ itemIds: ['a', 'b'], blockedOnly: true }))
    expect([...visible]).toEqual(['a'])
  })
})

describe('hasActiveFilters', () => {
  it('is false for the empty filters', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false)
  })

  it.each([
    ['search', { search: 'intro' }],
    ['owner', { ownerId: 'u1' }],
    ['status', { status: 'todo' }],
    ['blockedOnly', { blockedOnly: true }],
    ['itemIds', { itemIds: ['a'] }],
  ])('is true when %s narrows the view', (_label, over) => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, ...over })).toBe(true)
  })
})
