import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SuggestionsFeed } from './SuggestionsFeed'
import { LanguageProvider } from '../../../../i18n/LanguageContext'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import { ToastProvider } from '../../../../components/feedback/ToastProvider'
import type {
  DetailedRecommendation,
  PreviewSnapshot,
  RecommendationPreview,
} from '../../api/ai-collaboration.api'

// The backend owns detection, explanation, impact and permissions — these tests
// feed its contract in and assert only what the client does with it.
let listState: { data?: { items: DetailedRecommendation[]; viewerRole: string }; isLoading: boolean; isError: boolean; error: unknown }
let previewState: { data?: RecommendationPreview; isLoading: boolean; isError: boolean; error: unknown }
const approve = vi.fn(async () => undefined)
const dismiss = vi.fn(async () => undefined)

vi.mock('../../api/ai-collaboration.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/ai-collaboration.api')>()
  return {
    ...actual,
    useSuggestionsQuery: () => listState,
    useSuggestionPreviewQuery: () => previewState,
    useApproveSuggestionMutation: () => ({ mutateAsync: approve, isPending: false }),
    useDismissSuggestionMutation: () => ({ mutateAsync: dismiss, isPending: false }),
  }
})

function recommendation(over: Partial<DetailedRecommendation> = {}): DetailedRecommendation {
  return {
    id: 'rec-1',
    kind: 'workload_imbalance',
    status: 'pending',
    targetUserId: 'u1',
    title: 'Workload is uneven — rebalance?',
    message: 'Move "Write the intro" to someone with more room?',
    reason: 'Remaining workload is 2x higher for this member.',
    createdAt: '2026-07-27T12:00:00.000Z',
    resolvedAt: null,
    kindLabel: 'Workload imbalance',
    resolutionReason: null,
    resolutionLabel: null,
    target: { userId: 'u1', displayName: 'Alice' },
    explanation: {
      problem: 'One member is carrying substantially more remaining work.',
      detection: 'The busiest member holds at least 1.5x the remaining minutes.',
      expectedImprovement: 'Reassigning evens out utilisation.',
      evidence: ['Remaining workload is 2x higher.', '"Write the intro" — assigned to Alice, estimated 1h.'],
    },
    confidence: {
      level: 'high',
      reason: 'Complete scheduling data',
      basis: ['Every affected item has a time estimate.'],
    },
    impact: {
      metrics: [
        {
          key: 'blockedItems',
          label: 'Blocked items',
          unit: 'count',
          before: 7,
          after: 2,
          direction: 'better',
        },
        {
          key: 'healthOverall',
          label: 'Overall health',
          unit: 'points',
          before: 66,
          after: 78,
          direction: 'better',
        },
      ],
      forecastDateBefore: '2026-07-30T00:00:00.000Z',
      forecastDateAfter: '2026-07-28T00:00:00.000Z',
      summary: 'Approving this improves blocked items by 5 items.',
    },
    affectedItems: [
      {
        subtaskId: 'sub-1',
        title: 'Write the intro',
        status: 'todo',
        isComplete: false,
        assignee: { userId: 'u1', displayName: 'Alice' },
        estimatedDurationMinutes: 60,
        startDate: null,
        dueDate: null,
      },
    ],
    affectedMembers: [
      { userId: 'u1', displayName: 'Alice', relation: 'subject' },
      { userId: 'u2', displayName: 'Bilal', relation: 'to' },
    ],
    changes: [
      {
        subtaskId: 'sub-1',
        subtaskTitle: 'Write the intro',
        kind: 'reassign',
        summary: 'Reassign "Write the intro" from Alice to Bilal.',
      },
    ],
    navigation: { tab: 'team', label: 'Open in Team', focus: { memberId: 'u1' } },
    blockers: [],
    canApprove: true,
    canDismiss: true,
    canPreview: true,
    ...over,
  }
}

function snapshot(
  over: { delayDays?: number; overall?: number; balance?: number; blockedItems?: number } = {},
): PreviewSnapshot {
  return {
    forecast: {
      status: 'available',
      projectedCompletion: '2026-07-30T00:00:00.000Z',
      deadline: '2026-07-29T00:00:00.000Z',
      delayMinutes: (over.delayDays ?? 0) * 1440,
      delayDays: over.delayDays ?? 0,
      capacityShortfallMinutes: 0,
      unscheduledItemCount: 0,
      bottleneck: null,
    },
    health: {
      overallScore: over.overall ?? 70,
      overallStatus: 'balanced',
      scheduleScore: 70,
      capacityScore: 70,
      dependencyScore: 90,
      executionScore: 60,
      collaborationScore: 80,
    },
    capacity: {
      balancePercent: over.balance ?? 80,
      overloadedCount: 0,
      availableCount: 1,
      memberCount: 2,
      remainingMinutes: 240,
      availableMinutes: 480,
      members: [],
    },
    criticalWork: {
      status: 'available',
      itemCount: 2,
      blockedCount: 0,
      durationMinutes: 120,
      projectedCompletion: '2026-07-30T00:00:00.000Z',
    },
    work: {
      blockedItemCount: over.blockedItems ?? 0,
      readyItemCount: 3,
      openItemCount: 3 + (over.blockedItems ?? 0),
    },
  }
}

function preview(over: Partial<RecommendationPreview> = {}): RecommendationPreview {
  return {
    recommendation: recommendation(),
    before: snapshot({ delayDays: 3, overall: 55 }),
    after: snapshot({ delayDays: 1, overall: 68 }),
    deltas: [
      {
        key: 'forecastDelayDays',
        label: 'Forecast delay',
        unit: 'days',
        before: 3,
        after: 1,
        change: -2,
        direction: 'better',
      },
      {
        key: 'healthOverall',
        label: 'Overall health',
        unit: 'points',
        before: 55,
        after: 68,
        change: 13,
        direction: 'better',
      },
    ],
    summary: 'Forecast delay improves by 2 days; Overall health improves by 13 points.',
    isNoOp: false,
    generatedAt: '2026-07-27T12:00:00.000Z',
    ...over,
  }
}

function renderFeed(onNavigate = vi.fn()) {
  render(
    <ThemeProvider>
      <LanguageProvider>
        <ToastProvider>
          <SuggestionsFeed taskId="task-1" accessToken="tok" onNavigate={onNavigate} />
        </ToastProvider>
      </LanguageProvider>
    </ThemeProvider>,
  )
  return { onNavigate }
}

const ready = (items: DetailedRecommendation[], viewerRole = 'owner') => {
  listState = { data: { items, viewerRole }, isLoading: false, isError: false, error: null }
  previewState = { data: preview(), isLoading: false, isError: false, error: null }
}

afterEach(() => vi.clearAllMocks())

describe('SuggestionsFeed — the case for each recommendation', () => {
  it('shows title, explanation, why it exists, and an explained confidence level', () => {
    ready([recommendation()])
    renderFeed()

    expect(screen.getByText('Workload is uneven — rebalance?')).toBeInTheDocument()
    expect(screen.getByText('Move "Write the intro" to someone with more room?')).toBeInTheDocument()
    expect(screen.getByText('Remaining workload is 2x higher for this member.')).toBeInTheDocument()
    expect(screen.getByText(/High confidence — Complete scheduling data/)).toBeInTheDocument()
  })

  // "0%" was the old failure mode: it told the user nothing except that
  // something had gone wrong. Confidence is now a level with a reason.
  it('never renders a numeric confidence percentage', () => {
    ready([
      recommendation({
        confidence: { level: 'unavailable', reason: 'Insufficient project data', basis: [] },
      }),
    ])
    renderFeed()

    expect(screen.queryByText(/confidence.*\d+%/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Confidence unavailable — Insufficient project data/)).toBeInTheDocument()
  })

  it.each([
    ['high', 'High confidence — Complete scheduling data'],
    ['medium', 'Medium confidence — Minor estimate uncertainty'],
    ['low', 'Low confidence — Several assumptions required'],
    ['unavailable', 'Confidence unavailable — Insufficient project data'],
  ])('renders the %s confidence level with its reason', (level, expected) => {
    const reason = expected.split('— ')[1]
    ready([
      recommendation({
        confidence: { level: level as 'high', reason, basis: ['because'] },
      }),
    ])
    renderFeed()
    expect(screen.getByText(new RegExp(expected))).toBeInTheDocument()
  })

  it('lists the affected work and the affected members with their roles in the change', () => {
    ready([recommendation()])
    renderFeed()

    expect(screen.getByText('Affected work')).toBeInTheDocument()
    expect(screen.getByText('Affected members')).toBeInTheDocument()
    // The item title appears as an affected-work chip (and again in the modal's
    // change summary, hence getAllByText here).
    expect(screen.getAllByText(/Write the intro/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Subject:/)).toBeInTheDocument()
    expect(screen.getByText(/Moving to:/)).toBeInTheDocument()
    expect(screen.getByText('Alice', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('Bilal', { exact: false })).toBeInTheDocument()
  })

  it('marks an item with no estimate rather than implying one', () => {
    ready([
      recommendation({
        affectedItems: [
          {
            subtaskId: 'sub-1',
            title: 'Write the intro',
            status: 'todo',
            isComplete: false,
            assignee: null,
            estimatedDurationMinutes: null,
            startDate: null,
            dueDate: null,
          },
        ],
      }),
    ])
    renderFeed()
    expect(screen.getByText(/no estimate/)).toBeInTheDocument()
  })

  it('renders several recommendations and counts the pending ones', () => {
    ready([
      recommendation({ id: 'rec-1', title: 'First finding' }),
      recommendation({ id: 'rec-2', title: 'Second finding' }),
      recommendation({ id: 'rec-3', title: 'Third finding' }),
    ])
    renderFeed()

    expect(screen.getByText('AI recommendations (3)')).toBeInTheDocument()
    expect(screen.getByText('First finding')).toBeInTheDocument()
    expect(screen.getByText('Third finding')).toBeInTheDocument()
  })
})

describe('SuggestionsFeed — permissions', () => {
  it.each(['owner', 'editor'])('offers Review, Approve and Dismiss to %s', (role) => {
    ready([recommendation()], role)
    renderFeed()

    expect(screen.getByRole('button', { name: /^Review/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Approve/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Dismiss/ })).toBeInTheDocument()
  })

  // The server is the real gate; the client hides what it was told it cannot do.
  it('lets a viewer review but hides Approve and Dismiss, and says why', () => {
    ready([recommendation({ canApprove: false, canDismiss: false })], 'viewer')
    renderFeed()

    expect(screen.getByRole('button', { name: /^Review/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Approve/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Dismiss/ })).not.toBeInTheDocument()
    expect(screen.getByText(/only an editor or the owner can act on it/i)).toBeInTheDocument()
  })

  it('withholds Approve but keeps Dismiss when a recommendation went stale', () => {
    ready([
      recommendation({ canApprove: false, blockers: ['"Write the intro" is already complete.'] }),
    ])
    renderFeed()

    expect(screen.queryByRole('button', { name: /^Approve/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Dismiss/ })).toBeInTheDocument()
    expect(screen.getByText(/already complete/)).toBeInTheDocument()
  })
})

describe('SuggestionsFeed — approve and dismiss', () => {
  it('approves through the existing endpoint', async () => {
    ready([recommendation()])
    renderFeed()

    await userEvent.click(screen.getByRole('button', { name: /^Approve/ }))
    expect(approve).toHaveBeenCalledWith('rec-1')
    expect(dismiss).not.toHaveBeenCalled()
  })

  it('dismisses through the existing endpoint', async () => {
    ready([recommendation()])
    renderFeed()

    await userEvent.click(screen.getByRole('button', { name: /^Dismiss/ }))
    expect(dismiss).toHaveBeenCalledWith('rec-1')
    expect(approve).not.toHaveBeenCalled()
  })

  it('surfaces a permission failure from the server instead of silently failing', async () => {
    approve.mockRejectedValueOnce(
      Object.assign(new Error('You do not have permission to edit this task.'), { status: 403 }),
    )
    ready([recommendation()])
    renderFeed()

    await userEvent.click(screen.getByRole('button', { name: /^Approve/ }))
    expect(await screen.findByText(/permission/i)).toBeInTheDocument()
  })

  it('keeps resolved recommendations as a decision record, collapsed by default', async () => {
    ready([
      recommendation(),
      recommendation({
        id: 'rec-old',
        status: 'approved',
        title: 'Already handled',
        canApprove: false,
        canDismiss: false,
        canPreview: false,
      }),
    ])
    renderFeed()

    expect(screen.queryByText('Already handled')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Show 1 resolved/ }))
    expect(screen.getByText('Already handled')).toBeInTheDocument()
    expect(screen.getByText('Approved')).toBeInTheDocument()
  })
})

describe('SuggestionsFeed — review modal and preview', () => {
  async function openReview() {
    await userEvent.click(screen.getByRole('button', { name: /^Review/ }))
    return screen.getByRole('dialog')
  }

  it('explains the problem, the detection and the evidence', async () => {
    ready([recommendation()])
    renderFeed()
    const dialog = await openReview()

    expect(within(dialog).getByText('Problem')).toBeInTheDocument()
    expect(within(dialog).getByText('How this was detected')).toBeInTheDocument()
    expect(within(dialog).getByText('Evidence')).toBeInTheDocument()
    expect(within(dialog).getByText(/The busiest member holds at least 1.5x/)).toBeInTheDocument()
  })

  it('states exactly what approving would change', async () => {
    ready([recommendation()])
    renderFeed()
    const dialog = await openReview()

    expect(within(dialog).getByText('What changes if you approve')).toBeInTheDocument()
    expect(within(dialog).getByText(/Reassign "Write the intro" from Alice to Bilal\./)).toBeInTheDocument()
  })

  it('renders the forecast change as before, after and a signed delta', async () => {
    ready([recommendation()])
    renderFeed()
    const dialog = await openReview()

    const row = within(dialog).getByRole('row', { name: /Forecast delay/ })
    expect(within(row).getByText('3 days')).toBeInTheDocument()
    expect(within(row).getByText('1 day')).toBeInTheDocument()
    expect(within(row).getByText('−2 days')).toBeInTheDocument()
    expect(within(row).getByText('Improves:')).toBeInTheDocument()
  })

  it('renders the health change as before, after and a signed delta', async () => {
    ready([recommendation()])
    renderFeed()
    const dialog = await openReview()

    const row = within(dialog).getByRole('row', { name: /Overall health/ })
    expect(within(row).getByText('55')).toBeInTheDocument()
    expect(within(row).getByText('68')).toBeInTheDocument()
    expect(within(row).getByText('+13')).toBeInTheDocument()
  })

  it('shows both Before and After snapshots and states nothing has changed yet', async () => {
    ready([recommendation()])
    renderFeed()
    const dialog = await openReview()

    // Headings, not the delta table's column headers of the same name.
    expect(within(dialog).getByRole('heading', { name: 'Before' })).toBeInTheDocument()
    expect(within(dialog).getByRole('heading', { name: 'After' })).toBeInTheDocument()
    expect(within(dialog).getByText(/Nothing has been changed/)).toBeInTheDocument()
  })

  it('warns plainly when the preview shows no measurable effect', async () => {
    ready([recommendation()])
    previewState = {
      data: preview({
        isNoOp: true,
        summary: 'No tracked forecast, health, capacity or critical-path metric changes if you approve this.',
        deltas: [
          {
            key: 'forecastDelayDays',
            label: 'Forecast delay',
            unit: 'days',
            before: 2,
            after: 2,
            change: 0,
            direction: 'unchanged',
          },
        ],
      }),
      isLoading: false,
      isError: false,
      error: null,
    }
    renderFeed()
    const dialog = await openReview()

    expect(within(dialog).getByText(/No tracked forecast, health, capacity/)).toBeInTheDocument()
    expect(within(dialog).getByText('No change')).toBeInTheDocument()
  })

  it('shows a loading state while the impact is being calculated', async () => {
    ready([recommendation()])
    previewState = { data: undefined, isLoading: true, isError: false, error: null }
    renderFeed()
    const dialog = await openReview()

    expect(within(dialog).getByText('Calculating the impact…')).toBeInTheDocument()
  })

  it('keeps the explanation usable when the preview itself fails', async () => {
    ready([recommendation()])
    previewState = { data: undefined, isLoading: false, isError: true, error: new Error('boom') }
    renderFeed()
    const dialog = await openReview()

    expect(within(dialog).getByRole('alert')).toBeInTheDocument()
    expect(within(dialog).getByText('Problem')).toBeInTheDocument()
  })

  it('approves from inside the review modal', async () => {
    ready([recommendation()])
    renderFeed()
    const dialog = await openReview()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve' }))
    expect(approve).toHaveBeenCalledWith('rec-1')
  })

  it('closes on Escape without acting', async () => {
    ready([recommendation()])
    renderFeed()
    await openReview()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(approve).not.toHaveBeenCalled()
    expect(dismiss).not.toHaveBeenCalled()
  })
})

describe('SuggestionsFeed — deep links', () => {
  it('navigates to the backend-chosen tab with its filters applied', async () => {
    ready([recommendation()])
    const { onNavigate } = renderFeed()

    await userEvent.click(screen.getByRole('button', { name: /^Review/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Open in Team' }))

    expect(onNavigate).toHaveBeenCalledWith('team', { memberId: 'u1' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('passes an item-scoped focus straight through for a plan-shaped finding', async () => {
    ready([
      recommendation({
        kind: 'deadline_risk',
        navigation: { tab: 'plan', label: 'Open in Plan', focus: { itemIds: ['sub-1', 'sub-2'] } },
      }),
    ])
    const { onNavigate } = renderFeed()

    await userEvent.click(screen.getByRole('button', { name: /^Review/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Open in Plan' }))

    expect(onNavigate).toHaveBeenCalledWith('plan', { itemIds: ['sub-1', 'sub-2'] })
  })
})

describe('SuggestionsFeed — empty and failure states', () => {
  it('renders nothing at all when there is nothing to decide', () => {
    ready([])
    const { container } = render(
      <ThemeProvider>
        <LanguageProvider>
          <ToastProvider>
            <SuggestionsFeed taskId="task-1" accessToken="tok" onNavigate={vi.fn()} />
          </ToastProvider>
        </LanguageProvider>
      </ThemeProvider>,
    )
    expect(container.querySelector('h3')).toBeNull()
  })

  it('says it is caught up when every recommendation is already resolved', () => {
    ready([
      recommendation({
        status: 'dismissed',
        canApprove: false,
        canDismiss: false,
        canPreview: false,
      }),
    ])
    renderFeed()
    expect(screen.getByText(/Nothing needs a decision right now/)).toBeInTheDocument()
  })

  it('shows a loading line while the list loads', () => {
    listState = { data: undefined, isLoading: true, isError: false, error: null }
    previewState = { data: undefined, isLoading: false, isError: false, error: null }
    renderFeed()
    expect(screen.getByText(/Looking for decisions that need you/)).toBeInTheDocument()
  })

  it('stays silent on a 403 rather than nagging a user who cannot see this', () => {
    listState = { data: undefined, isLoading: false, isError: true, error: { status: 403 } }
    previewState = { data: undefined, isLoading: false, isError: false, error: null }
    const { container } = render(
      <ThemeProvider>
        <LanguageProvider>
          <ToastProvider>
            <SuggestionsFeed taskId="task-1" accessToken="tok" onNavigate={vi.fn()} />
          </ToastProvider>
        </LanguageProvider>
      </ThemeProvider>,
    )
    expect(container.textContent).toBe('')
  })

  it('reports a real load failure', () => {
    listState = { data: undefined, isLoading: false, isError: true, error: new Error('network') }
    previewState = { data: undefined, isLoading: false, isError: false, error: null }
    renderFeed()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})

describe('SuggestionsFeed — measurable impact on the card', () => {
  it('shows real before → after values instead of vague prose', () => {
    ready([recommendation()])
    renderFeed()

    expect(screen.getByText('Measured impact')).toBeInTheDocument()
    // Blocked items 7 → 2
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText(/2$/)).toBeInTheDocument()
    // Overall health 66 → 78
    expect(screen.getByText('66')).toBeInTheDocument()
    expect(screen.getByText(/78$/)).toBeInTheDocument()
  })

  it('shows the forecast completion date shift when the date moves', () => {
    ready([recommendation()])
    renderFeed()
    expect(screen.getByText('Forecast')).toBeInTheDocument()
  })

  it('omits the forecast row when the completion date does not move', () => {
    ready([
      recommendation({
        impact: {
          metrics: [
            { key: 'healthOverall', label: 'Overall health', unit: 'points', before: 60, after: 70, direction: 'better' },
          ],
          forecastDateBefore: null,
          forecastDateAfter: null,
          summary: 'x',
        },
      }),
    ])
    renderFeed()
    expect(screen.getByText('Measured impact')).toBeInTheDocument()
    expect(screen.queryByText('Forecast')).not.toBeInTheDocument()
  })

  // Zero-impact recommendations are auto-resolved server-side and never reach a
  // card, so the block simply does not render rather than showing "no change".
  it('renders no impact block when there is nothing measurable to show', () => {
    ready([
      recommendation({
        impact: { metrics: [], forecastDateBefore: null, forecastDateAfter: null, summary: 'x' },
      }),
    ])
    renderFeed()
    expect(screen.queryByText('Measured impact')).not.toBeInTheDocument()
  })

  it('labels a worsening metric for screen readers, not by colour alone', () => {
    ready([
      recommendation({
        impact: {
          metrics: [
            { key: 'workloadBalance', label: 'Workload balance', unit: 'percent', before: 90, after: 70, direction: 'worse' },
          ],
          forecastDateBefore: null,
          forecastDateAfter: null,
          summary: 'x',
        },
      }),
    ])
    renderFeed()
    expect(screen.getByText('Worsens:')).toBeInTheDocument()
  })

  it('shows no impact block on a resolved card', () => {
    ready([
      recommendation({
        status: 'auto_resolved',
        canApprove: false,
        canDismiss: false,
        canPreview: false,
        impact: null,
      }),
    ])
    renderFeed()
    expect(screen.queryByText('Measured impact')).not.toBeInTheDocument()
  })
})

describe('SuggestionsFeed — automatic resolution', () => {
  it.each([
    ['completed', 'Completed automatically'],
    ['already_applied', 'Already fixed'],
    ['not_applicable', 'No longer applicable'],
    ['superseded', 'Superseded by a newer recommendation'],
    ['no_impact', 'No measurable effect'],
    ['forecast_conflict', 'Contradicted by the forecast'],
  ])('shows the %s resolution reason rather than a bare status', async (reason, label) => {
    ready([
      recommendation({
        status: 'auto_resolved',
        resolutionReason: reason as 'completed',
        resolutionLabel: label,
        canApprove: false,
        canDismiss: false,
        canPreview: false,
        impact: null,
      }),
    ])
    renderFeed()

    await userEvent.click(screen.getByRole('button', { name: /Show 1 resolved/ }))
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('offers no actions on an auto-resolved card', async () => {
    ready([
      recommendation({
        status: 'auto_resolved',
        resolutionReason: 'completed',
        resolutionLabel: 'Completed automatically',
        canApprove: false,
        canDismiss: false,
        canPreview: false,
        impact: null,
      }),
    ])
    renderFeed()

    await userEvent.click(screen.getByRole('button', { name: /Show 1 resolved/ }))
    expect(screen.queryByRole('button', { name: /^Approve/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Review/ })).not.toBeInTheDocument()
  })
})
