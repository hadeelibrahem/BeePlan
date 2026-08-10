import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TaskCollaborationScreen from './TaskCollaborationScreen'
import { LanguageProvider } from '../i18n/LanguageContext'
import { ThemeProvider } from '../theme/ThemeContext'
import { AuthProvider } from '../providers/AuthProvider'
import type { ApiTask } from '../lib/tasksApi'

const plannerMocks = vi.hoisted(() => ({
  generate: vi.fn(),
  apply: vi.fn(),
}))

vi.mock('../features/collaboration/api/ai-collaboration-planner.api', () => ({
  generateCollaborationPlan: (...args: unknown[]) => plannerMocks.generate(...args),
  applyCollaborationPlan: (...args: unknown[]) => plannerMocks.apply(...args),
}))

// Keep every AI-collaboration read/mutation deterministic and offline — we are
// testing the tab structure and permission gating, not data fetching.
vi.mock('../features/collaboration/api/ai-collaboration.api', () => {
  const emptyQuery = <T,>(data: T) => () => ({ data, isLoading: false, isError: false, error: null })
  const noopMutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(async () => undefined), isPending: false })
  return {
    useOverviewQuery: emptyQuery({
      viewerRole: 'owner',
      status: {
        overallPercent: 0,
        completedCount: 0,
        totalCount: 0,
        pendingActionCount: 0,
        health: null,
        deadline: null,
        isDeadlineAtRisk: false,
        teamMemberCount: 0,
      },
      doThisNow: null,
      alerts: [],
      plan: {
        remainingEstimatedMinutes: null,
        blockedCount: 0,
        criticalPathSummary: null,
        forecastDate: null,
        deadline: null,
        availableCapacityMemberCount: 0,
      },
      team: { contributorCount: 0, balance: null, mostOverloaded: null, mostAvailable: null },
    }),
    useCapacityQuery: emptyQuery({ members: [] }),
    useTeamInsightsQuery: emptyQuery({
      generatedAt: '2026-07-27T12:00:00.000Z',
      viewerRole: 'owner',
      summary: {
        health: 'healthy',
        balancePercent: 100,
        remainingMinutes: 120,
        availableMinutes: 480,
        capacityShortfallMinutes: 0,
        forecastCompletion: '2026-07-28T12:00:00.000Z',
        forecastDelay: { minutes: 0, days: 0 },
        overloadedCount: 0,
        availableCount: 1,
        blockedCriticalCount: 0,
        memberCount: 1,
        bottleneckUserId: null,
        unassigned: { itemCount: 0, remainingMinutes: 0 },
      },
      members: [
        {
          userId: 'user-1',
          name: 'Alice',
          avatarUrl: null,
          role: 'owner',
          status: 'balanced',
          utilisationPercent: 25,
          remainingMinutes: 120,
          availableMinutes: 480,
          overloadMinutes: 0,
          actualMinutes: 0,
          completedMinutes: 0,
          assignedItemCount: 2,
          completedItemCount: 0,
          readyItemCount: 2,
          blockedItemCount: 0,
          criticalItemCount: 1,
          futureItemCount: 0,
          unscheduledItemCount: 0,
          forecastDelayMinutes: 0,
          isBottleneck: false,
        },
      ],
      warnings: [],
      formulaVersion: 'team-intelligence-v2',
    }),
    useProjectHealthQuery: emptyQuery({
      viewerRole: 'owner',
      generatedAt: '2026-07-27T12:00:00.000Z',
      formulaVersion: 'project-health-v1',
      overall: { score: 82, status: 'balanced', reason: 'Schedule needs attention first.', details: {} },
      schedule: { score: 70, status: 'balanced', reason: 'ok', details: {} },
      capacity: { score: 80, status: 'balanced', reason: 'ok', details: {} },
      dependency: { score: 90, status: 'healthy', reason: 'ok', details: {} },
      execution: { score: 75, status: 'balanced', reason: 'ok', details: {} },
      focus: { score: null, status: 'no_data', reason: 'Not enough focus history.', details: {} },
      collaboration: { score: 85, status: 'healthy', reason: 'ok', details: {} },
      contributors: { positive: [{ tone: 'positive', text: 'Forecast is on time' }], negative: [] },
      warnings: [],
      trend: { available: false, points: [], reason: 'No historical health snapshots yet.' },
    }),
    useProgressQuery: emptyQuery({ overallPercent: 0, completedCount: 0, totalCount: 0, members: [] }),
    useSuggestionsQuery: emptyQuery({ items: [], viewerRole: 'owner' }),
    useSuggestionPreviewQuery: emptyQuery(undefined),
    useTodayQuery: emptyQuery({ goal: 'Ship the first draft', members: [], sharedItems: [] }),
    useTimelineQuery: emptyQuery({ today: '2026-07-25', deadline: null, milestones: [], bufferDay: null }),
    useInvalidateAiCollaboration: () => () => {},
    useApproveSuggestionMutation: noopMutation,
    useDismissSuggestionMutation: noopMutation,
  }
})

// DistributionPanel loads the member roster directly — stub it offline too.
vi.mock('../features/collaboration/api/collaboration.api', () => ({
  getMembers: vi.fn(async () => []),
}))

function makeTask(overrides: Partial<ApiTask> = {}): ApiTask {
  return {
    id: 'task-1',
    title: 'Group project',
    description: '',
    priority: 'high',
    status: 'todo',
    viewerRole: 'owner',
    subtasks: [],
    dependencies: [],
    activities: [],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  } as ApiTask
}

function renderScreen(task: ApiTask) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <TaskCollaborationScreen task={task} accessToken="test-token" currentUserId="user-1" />
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

const NEW_TABS = ['Overview', 'Plan', 'Team', 'Health', 'Activity', 'Distribution']
const REMOVED_TABS = ['Today', 'Progress', 'Suggestions', 'Timeline', 'History']

describe('TaskCollaborationScreen tab mapping', () => {
  afterEach(() => vi.clearAllMocks())

  it('renders exactly the five consolidated tabs', () => {
    renderScreen(makeTask())
    for (const label of NEW_TABS) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('no longer renders the removed legacy standalone tabs', () => {
    renderScreen(makeTask())
    for (const label of REMOVED_TABS) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }
  })

  it('opens the existing DistributionPanel from the Distribution tab', async () => {
    const user = userEvent.setup()
    renderScreen(makeTask())
    await user.click(screen.getByRole('button', { name: 'Distribution' }))
    expect(screen.getByText('Smart fair split')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate plan' })).toBeInTheDocument()
  })

  it('keeps generation and apply wired to the existing planner endpoints', async () => {
    plannerMocks.generate.mockResolvedValueOnce({
      planId: 'plan-1',
      generatedAt: '2026-08-09T12:00:00.000Z',
      source: 'fallback',
      taskCollaborationType: 'divisible',
      recoveryMode: false,
      summary: 'Generated split',
      items: [{
        proposalId: 'proposal-1', title: 'Draft section', description: 'Draft it', assigneeUserId: 'user-1', assigneeDisplayName: 'Alice',
        estimatedDurationMinutes: 30, suggestedStart: null, suggestedDue: null, priority: 'medium', order: 0,
        dependsOnProposalIds: [], canRunInParallel: true, reason: 'Available capacity', assumptions: [], warnings: [], activityType: 'production', sharedSessionId: null,
      }],
      workloadByMember: [{ userId: 'user-1', displayName: 'Alice', itemCount: 1, totalEstimatedMinutes: 30 }],
      totalEstimatedMinutes: 30, deadlineFeasible: true, risks: [], unassignedWork: [], reviewMilestone: null, suggestedBufferMinutes: null, warnings: [], assumptions: [],
    })
    plannerMocks.apply.mockResolvedValueOnce({ success: true, created: { subtaskIds: ['subtask-1'], dependencyCount: 0 }, itemErrors: [] })

    const user = userEvent.setup()
    renderScreen(makeTask())
    await user.click(screen.getByRole('button', { name: 'Distribution' }))
    await user.click(screen.getByRole('button', { name: 'Generate plan' }))
    expect(await screen.findByText('Generated split')).toBeInTheDocument()
    expect(plannerMocks.generate).toHaveBeenCalledWith('task-1', { selectedMemberIds: [], preferences: { includeOwner: true } }, 'test-token')

    await user.click(screen.getByRole('button', { name: 'Accept plan' }))
    expect(plannerMocks.apply).toHaveBeenCalledWith('task-1', 'plan-1', expect.any(Array), 'test-token')
  })

  it('exposes the Timeline | Dependency Graph switcher inside the Plan tab', async () => {
    const user = userEvent.setup()
    renderScreen(makeTask())
    await user.click(screen.getByRole('button', { name: 'Plan' }))
    expect(screen.getByRole('button', { name: 'Timeline' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dependency Graph' })).toBeInTheDocument()
  })
})

describe('TaskCollaborationScreen Team Intelligence (read-only)', () => {
  afterEach(() => vi.clearAllMocks())

  it('renders the read-only Team Intelligence dashboard for an owner', async () => {
    const user = userEvent.setup()
    renderScreen(makeTask({ viewerRole: 'owner' }))
    await user.click(screen.getByRole('button', { name: 'Team' }))
    expect(screen.getByText('Team health')).toBeInTheDocument()
    expect(screen.getByText('Workload comparison')).toBeInTheDocument()
    // This phase is read-only: no redistribution / split controls are exposed.
    expect(screen.queryByText(/Smart fair split/i)).not.toBeInTheDocument()
  })

  it('renders the same read-only dashboard for a non-owner without owner-only controls', async () => {
    const user = userEvent.setup()
    renderScreen(makeTask({ viewerRole: 'editor' }))
    await user.click(screen.getByRole('button', { name: 'Team' }))
    expect(screen.getByText('Team health')).toBeInTheDocument()
    expect(screen.queryByText(/generate or apply/i)).not.toBeInTheDocument()
  })
})
