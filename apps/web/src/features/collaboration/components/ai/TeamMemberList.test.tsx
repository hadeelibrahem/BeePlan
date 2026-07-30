import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TeamMemberList } from './TeamMemberList'
import { LanguageProvider } from '../../../../i18n/LanguageContext'
import type { TeamInsights, TeamInsightsMember } from '../../api/ai-collaboration.api'

let state: { data?: TeamInsights; isLoading: boolean; isError: boolean; error: unknown }
vi.mock('../../api/ai-collaboration.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/ai-collaboration.api')>()
  return { ...actual, useTeamInsightsQuery: () => state }
})

function member(over: Partial<TeamInsightsMember> = {}): TeamInsightsMember {
  return {
    userId: 'u1',
    name: 'Alice',
    avatarUrl: null,
    role: 'owner',
    status: 'balanced',
    utilisationPercent: 50,
    remainingMinutes: 240,
    availableMinutes: 480,
    overloadMinutes: 0,
    actualMinutes: 30,
    completedMinutes: 60,
    assignedItemCount: 3,
    completedItemCount: 1,
    readyItemCount: 2,
    blockedItemCount: 0,
    criticalItemCount: 0,
    futureItemCount: 0,
    unscheduledItemCount: 0,
    forecastDelayMinutes: 0,
    isBottleneck: false,
    ...over,
  }
}

function insights(over: Partial<TeamInsights> = {}): TeamInsights {
  return {
    generatedAt: '2026-07-27T12:00:00.000Z',
    viewerRole: 'owner',
    summary: {
      health: 'at_risk',
      balancePercent: 62,
      remainingMinutes: 900,
      availableMinutes: 1440,
      capacityShortfallMinutes: 120,
      forecastCompletion: '2026-07-30T12:00:00.000Z',
      forecastDelay: { minutes: 1440, days: 1 },
      overloadedCount: 1,
      availableCount: 1,
      blockedCriticalCount: 1,
      memberCount: 2,
      bottleneckUserId: 'u2',
      unassigned: { itemCount: 0, remainingMinutes: 0 },
    },
    members: [
      member({ userId: 'u2', name: 'Bob', role: 'editor', status: 'over_capacity', utilisationPercent: 130, overloadMinutes: 180, criticalItemCount: 2, blockedItemCount: 1, isBottleneck: true }),
      member({ userId: 'u1', name: 'Alice', status: 'available', utilisationPercent: 20 }),
    ],
    warnings: ['Bob is over capacity by 180 min.'],
    formulaVersion: 'team-intelligence-v2',
    ...over,
  }
}

function renderList() {
  return render(
    <LanguageProvider>
      <TeamMemberList taskId="task-1" accessToken="tok" />
    </LanguageProvider>,
  )
}

afterEach(() => vi.clearAllMocks())

describe('Team Intelligence dashboard', () => {
  it('shows the team summary with backend-derived health, shortfall and delay', () => {
    state = { data: insights(), isLoading: false, isError: false, error: null }
    renderList()
    expect(screen.getByText('Team health')).toBeInTheDocument()
    expect(screen.getByText('At risk')).toBeInTheDocument()
    expect(screen.getByText('Workload balance')).toBeInTheDocument()
    expect(screen.getByText('Blocked critical items')).toBeInTheDocument()
    expect(screen.getByText('1 day')).toBeInTheDocument() // forecast delay
  })

  it('marks the project bottleneck with a star and status text (not colour alone)', () => {
    state = { data: insights(), isLoading: false, isError: false, error: null }
    renderList()
    expect(screen.getByText('⭐ Project bottleneck')).toBeInTheDocument()
    // Status is conveyed as text, not colour only.
    expect(screen.getAllByText('Over capacity').length).toBeGreaterThan(0)
  })

  it('filters members by a quick filter (Overloaded)', async () => {
    state = { data: insights(), isLoading: false, isError: false, error: null }
    renderList()
    const region = screen.getByRole('region', { name: 'Team members' })
    expect(within(region).getByText('Alice')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Overloaded' }))
    expect(within(region).queryByText('Alice')).not.toBeInTheDocument()
    expect(within(region).getByText('Bob')).toBeInTheDocument()
  })

  it('expands a member card to reveal assignment readiness and capacity analysis', async () => {
    state = { data: insights(), isLoading: false, isError: false, error: null }
    renderList()
    const [firstShow] = screen.getAllByRole('button', { name: 'Show details' })
    await userEvent.click(firstShow)
    expect(screen.getByText('Assignment readiness')).toBeInTheDocument()
    expect(screen.getByText('Capacity analysis')).toBeInTheDocument()
    expect(screen.getByText('Forecast impact')).toBeInTheDocument()
  })

  it('shows a read-only label for a viewer and never exposes owner mutation controls', () => {
    state = { data: insights({ viewerRole: 'viewer' }), isLoading: false, isError: false, error: null }
    renderList()
    expect(screen.getByText(/Read-only Team Intelligence/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /redistribute|apply|generate/i })).not.toBeInTheDocument()
  })

  it('shows a permission-denied message on 403', () => {
    state = { data: undefined, isLoading: false, isError: true, error: { status: 403 } }
    renderList()
    expect(screen.getByText(/do not have permission/i)).toBeInTheDocument()
  })
})
