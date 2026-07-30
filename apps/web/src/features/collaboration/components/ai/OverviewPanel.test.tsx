import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OverviewPanel } from './OverviewPanel'
import { LanguageProvider } from '../../../../i18n/LanguageContext'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import type { CollaborationOverview, DoThisNow } from '../../api/ai-collaboration.api'

// Only the read hooks are stubbed; the rest of the module (types) stays real.
// The recommendations section lives on the Overview now, so its query is stubbed
// empty here — SuggestionsFeed.test.tsx covers the decision loop itself.
let overviewState: { data?: CollaborationOverview; isLoading: boolean; isError: boolean; error: unknown }
vi.mock('../../api/ai-collaboration.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/ai-collaboration.api')>()
  return {
    ...actual,
    useOverviewQuery: () => overviewState,
    useSuggestionsQuery: () => ({
      data: { items: [], viewerRole: 'owner' },
      isLoading: false,
      isError: false,
      error: null,
    }),
    useApproveSuggestionMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useDismissSuggestionMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  }
})

function baseOverview(overrides: Partial<CollaborationOverview> = {}): CollaborationOverview {
  return {
    viewerRole: 'editor',
    status: {
      overallPercent: 40,
      completedCount: 2,
      totalCount: 5,
      pendingActionCount: 1,
      health: { status: 'on_track', tone: 'positive' },
      deadline: '2026-08-01T00:00:00.000Z',
      isDeadlineAtRisk: false,
      teamMemberCount: 3,
    },
    doThisNow: null,
    alerts: [],
    plan: {
      remainingEstimatedMinutes: 120,
      blockedCount: 1,
      criticalPathSummary: null,
      forecastDate: null,
      deadline: '2026-08-01T00:00:00.000Z',
      availableCapacityMemberCount: 1,
    },
    team: {
      contributorCount: 3,
      balance: 'uneven',
      mostOverloaded: { userId: 'u1', displayName: 'Alex', loadPercent: 90 },
      mostAvailable: { userId: 'u2', displayName: 'Sam', loadPercent: 20 },
    },
    ...overrides,
  }
}

function doThisNow(overrides: Partial<DoThisNow> = {}): DoThisNow {
  return {
    kind: 'subtask',
    taskId: 'task-1',
    subtaskId: 'sub-1',
    title: 'Write the intro section',
    parentTaskTitle: 'Group Report',
    assignee: { userId: 'u2', displayName: 'Sam' },
    estimatedRemainingMinutes: 45,
    dueDate: '2026-07-28T00:00:00.000Z',
    blocksCount: 2,
    status: 'in_progress',
    isBlocked: false,
    isOverdue: false,
    canStartFocus: true,
    ...overrides,
  }
}

function renderPanel(props: Partial<Parameters<typeof OverviewPanel>[0]> = {}) {
  return render(
    <ThemeProvider>
      <LanguageProvider>
        <OverviewPanel taskId="task-1" accessToken="tok" onNavigate={vi.fn()} {...props} />
      </LanguageProvider>
    </ThemeProvider>,
  )
}

afterEach(() => vi.clearAllMocks())

describe('OverviewPanel — Do This Now: task vs subtask display', () => {
  it('shows the parent task title above the subtask when recommending a subtask', () => {
    overviewState = { data: baseOverview({ doThisNow: doThisNow() }), isLoading: false, isError: false, error: null }
    renderPanel()
    expect(screen.getByText('Group Report')).toBeInTheDocument()
    expect(screen.getByText('Write the intro section')).toBeInTheDocument()
    expect(screen.getByText(/Unblocks 2 downstream/i)).toBeInTheDocument()
  })

  it('shows just the task title (no parent line) when recommending the parent task', () => {
    overviewState = {
      data: baseOverview({
        doThisNow: doThisNow({ kind: 'task', subtaskId: null, title: 'Group Report', parentTaskTitle: 'Group Report', assignee: null }),
      }),
      isLoading: false,
      isError: false,
      error: null,
    }
    renderPanel()
    // The title renders exactly once (no separate parent-title line above it).
    expect(screen.getAllByText('Group Report')).toHaveLength(1)
  })
})

describe('OverviewPanel — owner/editor/viewer actions', () => {
  it('shows Start focus for an allowed user and calls the handler with the subtask', async () => {
    const onStartFocus = vi.fn()
    overviewState = { data: baseOverview({ doThisNow: doThisNow({ canStartFocus: true }) }), isLoading: false, isError: false, error: null }
    renderPanel({ onStartFocus })
    const button = screen.getByRole('button', { name: 'Start focus' })
    await userEvent.click(button)
    expect(onStartFocus).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task-1', subtaskId: 'sub-1', subtaskTitle: 'Write the intro section' }),
    )
  })

  it('hides Start focus when the viewer is not allowed to work on it', () => {
    overviewState = { data: baseOverview({ viewerRole: 'viewer', doThisNow: doThisNow({ canStartFocus: false }) }), isLoading: false, isError: false, error: null }
    renderPanel({ onStartFocus: vi.fn() })
    expect(screen.queryByRole('button', { name: 'Start focus' })).not.toBeInTheDocument()
  })

  it('hides Start focus when no focus handler is wired even if allowed', () => {
    overviewState = { data: baseOverview({ doThisNow: doThisNow({ canStartFocus: true }) }), isLoading: false, isError: false, error: null }
    renderPanel({ onStartFocus: undefined })
    expect(screen.queryByRole('button', { name: 'Start focus' })).not.toBeInTheDocument()
  })
})

describe('OverviewPanel — missing optional data & states', () => {
  it('renders the card without meta when estimate/due/assignee are absent', () => {
    overviewState = {
      data: baseOverview({
        doThisNow: doThisNow({ estimatedRemainingMinutes: null, dueDate: null, assignee: null, blocksCount: 0 }),
      }),
      isLoading: false,
      isError: false,
      error: null,
    }
    renderPanel()
    expect(screen.getByText('Write the intro section')).toBeInTheDocument()
    expect(screen.queryByText(/left/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Due /)).not.toBeInTheDocument()
  })

  it('shows Not available yet for absent critical path and forecast', () => {
    overviewState = { data: baseOverview(), isLoading: false, isError: false, error: null }
    renderPanel()
    expect(screen.getAllByText('Not available yet').length).toBeGreaterThanOrEqual(2)
  })

  it('flags overdue and blocked states with chips', () => {
    overviewState = {
      data: baseOverview({ doThisNow: doThisNow({ isOverdue: true, isBlocked: true }) }),
      isLoading: false,
      isError: false,
      error: null,
    }
    renderPanel()
    expect(screen.getByText('Overdue')).toBeInTheDocument()
    expect(screen.getByText('Blocked')).toBeInTheDocument()
  })

  it('renders a skeleton while loading and an empty state when there is nothing', () => {
    overviewState = { data: undefined, isLoading: true, isError: false, error: null }
    const { rerender } = renderPanel()
    expect(screen.getByText('Loading overview…')).toBeInTheDocument()

    overviewState = {
      data: baseOverview({
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
        team: { contributorCount: 0, balance: null, mostOverloaded: null, mostAvailable: null },
      }),
      isLoading: false,
      isError: false,
      error: null,
    }
    rerender(
      <ThemeProvider>
        <LanguageProvider>
          <OverviewPanel taskId="task-1" accessToken="tok" onNavigate={vi.fn()} />
        </LanguageProvider>
      </ThemeProvider>,
    )
    expect(screen.getByText('Nothing to show yet')).toBeInTheDocument()
  })

  it('shows a no-permission state on a 403', () => {
    overviewState = { data: undefined, isLoading: false, isError: true, error: { status: 403 } }
    renderPanel()
    expect(screen.getByText('No access to this overview')).toBeInTheDocument()
  })
})

describe('OverviewPanel — critical alerts', () => {
  it('renders alert reason + impact and navigates to the linked tab', async () => {
    const onNavigate = vi.fn()
    overviewState = {
      data: baseOverview({
        alerts: [
          {
            id: 'a1',
            kind: 'deadline_risk',
            severity: 'critical',
            title: 'Overdue work is slipping',
            reason: '2 open items are past due.',
            impact: 'The finish date is at risk.',
            link: 'plan',
          },
        ],
      }),
      isLoading: false,
      isError: false,
      error: null,
    }
    renderPanel({ onNavigate })
    expect(screen.getByText('2 open items are past due.')).toBeInTheDocument()
    expect(screen.getByText(/Impact: The finish date is at risk\./)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Go to Plan' }))
    expect(onNavigate).toHaveBeenCalledWith('plan')
  })
})
