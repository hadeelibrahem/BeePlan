import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlanView } from './PlanView'
import { LanguageProvider } from '../../../../i18n/LanguageContext'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import type { ProjectPlan } from '../../api/project-plan.api'

let planState: { data?: ProjectPlan; isLoading: boolean; isError: boolean; error: unknown }
vi.mock('../../api/project-plan.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/project-plan.api')>()
  return { ...actual, useProjectPlanQuery: () => planState }
})

// TodayTeamPlan hits its own queries; stub it so the Plan tab renders offline.
vi.mock('./TodayTeamPlan', () => ({ TodayTeamPlan: () => null }))

function planNode(over: Partial<ProjectPlan['nodes'][number]> = {}): ProjectPlan['nodes'][number] {
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

function plan(over: Partial<ProjectPlan> = {}): ProjectPlan {
  return {
    taskId: 'task-1',
    generatedAt: '2026-07-25T12:00:00.000Z',
    nodes: [planNode({ id: 'a', title: 'Design' }), planNode({ id: 'b', title: 'Build', blockedByIds: ['a'], isBlocked: true })],
    edges: [{ id: 'e1', sourceId: 'a', targetId: 'b', dependencyType: 'subtask' }],
    warnings: [],
    criticalPath: { status: 'available', itemIds: ['a', 'b'], durationMinutes: 120, projectedCompletion: '2026-07-25T14:00:00.000Z', reason: null },
    scheduling: {
      a: { earliestStart: '2026-07-25T12:00:00.000Z', earliestFinish: '2026-07-25T13:00:00.000Z', latestStart: '2026-07-25T12:00:00.000Z', latestFinish: '2026-07-25T13:00:00.000Z', totalFloatMinutes: 0, isCritical: true, forecastStatus: 'scheduled', forecastStart: '2026-07-25T12:00:00.000Z', forecastEnd: '2026-07-25T13:00:00.000Z', resourceConflictMinutes: 0, assigneeId: 'u1' },
      b: { earliestStart: '2026-07-25T13:00:00.000Z', earliestFinish: '2026-07-25T14:00:00.000Z', latestStart: '2026-07-25T13:00:00.000Z', latestFinish: '2026-07-25T14:00:00.000Z', totalFloatMinutes: 0, isCritical: true, forecastStatus: 'scheduled', forecastStart: '2026-07-25T13:00:00.000Z', forecastEnd: '2026-07-25T14:00:00.000Z', resourceConflictMinutes: 0, assigneeId: 'u1' },
    },
    forecast: {
      status: 'available',
      generatedAt: '2026-07-25T12:00:00.000Z',
      projectedCompletion: '2026-07-25T14:00:00.000Z',
      deadline: null,
      delayMinutes: 0,
      delayDays: 0,
      capacityShortfallMinutes: 0,
      unscheduledItemIds: [],
      bottleneckAssignee: null,
      fallbackPolicy: null,
      reasons: ['All work is scheduled within available capacity.'],
    },
    resourceLanes: [{ assigneeId: 'u1', assigneeName: 'Alice', availableMinutes: 480, scheduledMinutes: 120, utilisationPercent: 25, overloadMinutes: 0 }],
    ...over,
  }
}

function renderPlan() {
  return render(
    <ThemeProvider>
      <LanguageProvider>
        <PlanView taskId="task-1" accessToken="tok" />
      </LanguageProvider>
    </ThemeProvider>,
  )
}

afterEach(() => vi.clearAllMocks())

describe('PlanView', () => {
  it('offers the Timeline | Dependency Graph switcher without extra top-level tabs', () => {
    planState = { data: plan(), isLoading: false, isError: false, error: null }
    renderPlan()
    expect(screen.getByRole('button', { name: 'Timeline' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dependency Graph' })).toBeInTheDocument()
  })

  it('starts the dependency graph in its compact parent-task view and expands on demand', async () => {
    planState = { data: plan(), isLoading: false, isError: false, error: null }
    renderPlan()
    await userEvent.click(screen.getByRole('button', { name: 'Dependency Graph' }))
    const graph = screen.getByRole('img', { name: 'Dependency graph' })
    expect(within(graph).getByText(/Current task \(2\)/)).toBeInTheDocument()
    expect(within(graph).queryByText('Design')).not.toBeInTheDocument()
    await userEvent.click(within(graph).getByText(/Current task \(2\)/))
    expect(within(graph).getByText('Design')).toBeInTheDocument()
    expect(within(graph).getByText('Build')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fit to screen' })).toBeInTheDocument()
  })

  it('opens the SAME shared detail from a timeline row and a graph node', async () => {
    planState = {
      data: plan({ nodes: [planNode({ id: 'a', title: 'Design', dueDate: '2026-08-01T00:00:00.000Z', plannedEnd: '2026-08-01T00:00:00.000Z' })], edges: [] }),
      isLoading: false,
      isError: false,
      error: null,
    }
    renderPlan()
    // Timeline row -> detail dialog
    await userEvent.click(screen.getByRole('button', { name: /Design/ }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getByText('Owner')).toBeInTheDocument()
  })

  it('reports circular dependency data in a prominent banner (never silent)', () => {
    planState = {
      data: plan({ warnings: [{ code: 'cycle', message: 'This plan contains a circular dependency.', nodeIds: ['a', 'b'] }] }),
      isLoading: false,
      isError: false,
      error: null,
    }
    renderPlan()
    const alert = screen.getByRole('alert')
    expect(within(alert).getByText(/circular dependency/i)).toBeInTheDocument()
  })

  it('filters items by owner', async () => {
    planState = {
      data: plan({
        nodes: [
          planNode({ id: 'a', title: 'Design', assignee: { userId: 'u1', displayName: 'Alice' }, dueDate: '2026-08-01T00:00:00.000Z', plannedEnd: '2026-08-01T00:00:00.000Z' }),
          planNode({ id: 'b', title: 'Build', assignee: { userId: 'u2', displayName: 'Bob' }, dueDate: '2026-08-02T00:00:00.000Z', plannedEnd: '2026-08-02T00:00:00.000Z' }),
        ],
        edges: [],
      }),
      isLoading: false,
      isError: false,
      error: null,
    }
    renderPlan()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by owner' }), 'u2')
    expect(screen.queryByRole('button', { name: /Design/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Build/ })).toBeInTheDocument()
  })

  it('renders the resource forecast summary and team capacity lanes', () => {
    planState = { data: plan(), isLoading: false, isError: false, error: null }
    renderPlan()
    expect(screen.getByText('Resource Forecast')).toBeInTheDocument()
    expect(screen.getByText('Forecast completion')).toBeInTheDocument()
    expect(screen.getByText('Main bottleneck')).toBeInTheDocument()
    expect(screen.getByText('Team capacity')).toBeInTheDocument()
  })

  it('shows a no-permission state for a viewer without access (403)', () => {
    planState = { data: undefined, isLoading: false, isError: true, error: { status: 403 } }
    renderPlan()
    expect(screen.getByText('No access to this plan')).toBeInTheDocument()
  })

  it('shows an empty state when the plan has no nodes', () => {
    planState = { data: plan({ nodes: [], edges: [] }), isLoading: false, isError: false, error: null }
    renderPlan()
    expect(screen.getByText('No plan yet')).toBeInTheDocument()
  })
})
