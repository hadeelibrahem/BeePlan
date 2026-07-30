import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProjectHealthPanel } from './ProjectHealthPanel'
import type { ProjectHealthReport } from '../../api/ai-collaboration.api'

let state: { data?: ProjectHealthReport; isLoading: boolean; isError: boolean; error: unknown }
vi.mock('../../api/ai-collaboration.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/ai-collaboration.api')>()
  return { ...actual, useProjectHealthQuery: () => state }
})

function metric(over: Partial<ProjectHealthReport['schedule']> = {}): ProjectHealthReport['schedule'] {
  return { score: 80, status: 'balanced', reason: 'Looks fine.', details: {}, ...over }
}

function health(over: Partial<ProjectHealthReport> = {}): ProjectHealthReport {
  return {
    viewerRole: 'owner',
    generatedAt: '2026-07-27T12:00:00.000Z',
    formulaVersion: 'project-health-v1',
    overall: metric({ score: 82, status: 'balanced', reason: 'Schedule needs attention first (70%).' }),
    schedule: metric({ score: 70, reason: 'Forecast completes within the deadline.', details: { forecastScore: 100, criticalPathScore: 75 } }),
    capacity: metric({ score: 80 }),
    dependency: metric({ score: 90, status: 'healthy' }),
    execution: metric({ score: 75 }),
    focus: metric({ score: null, status: 'no_data', reason: 'Not enough focus history to score focus health.' }),
    collaboration: metric({ score: 85, status: 'healthy' }),
    contributors: {
      positive: [{ tone: 'positive', text: 'Forecast is on time' }],
      negative: [{ tone: 'negative', text: '2 blocked critical task(s)' }],
    },
    warnings: [
      { group: 'Critical', severity: 'critical', message: '2 critical item(s) are blocked.', link: 'plan' },
      { group: 'Capacity', severity: 'warning', message: 'Capacity shortfall of 2h.', link: 'team' },
    ],
    trend: { available: false, points: [], reason: 'No historical health snapshots yet.' },
    ...over,
  }
}

function renderPanel(onNavigate = vi.fn()) {
  render(<ProjectHealthPanel taskId="task-1" accessToken="tok" onNavigate={onNavigate} />)
  return onNavigate
}

afterEach(() => vi.clearAllMocks())

describe('ProjectHealthPanel', () => {
  it('shows the overall score, status and the six breakdown metrics', () => {
    state = { data: health(), isLoading: false, isError: false, error: null }
    renderPanel()
    expect(screen.getByText('82%')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Project health 82 percent/i })).toBeInTheDocument()
    for (const label of ['Schedule health', 'Capacity health', 'Dependency health', 'Execution health', 'Focus health', 'Collaboration health']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('shows Focus health as no-data without a fake percentage', () => {
    state = { data: health(), isLoading: false, isError: false, error: null }
    renderPanel()
    expect(screen.getByText(/Not enough focus history/i)).toBeInTheDocument()
  })

  it('separates positive and negative contributors', () => {
    state = { data: health(), isLoading: false, isError: false, error: null }
    renderPanel()
    const helping = screen.getByText('Helping').closest('div')!
    const hurting = screen.getByText('Hurting').closest('div')!
    expect(within(helping).getByText(/Forecast is on time/)).toBeInTheDocument()
    expect(within(hurting).getByText(/blocked critical/)).toBeInTheDocument()
  })

  it('links a warning to the Plan tab', async () => {
    state = { data: health(), isLoading: false, isError: false, error: null }
    const onNavigate = renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'Open Plan' }))
    expect(onNavigate).toHaveBeenCalledWith('plan')
  })

  it('expands a metric card to reveal its detail breakdown', async () => {
    state = { data: health(), isLoading: false, isError: false, error: null }
    renderPanel()
    const [firstShow] = screen.getAllByRole('button', { name: 'Show details' })
    await userEvent.click(firstShow)
    expect(screen.getByText('Forecast Score')).toBeInTheDocument()
  })

  it('shows a trend-unavailable message and never invents history', () => {
    state = { data: health(), isLoading: false, isError: false, error: null }
    renderPanel()
    expect(screen.getByText(/No historical health snapshots yet/i)).toBeInTheDocument()
  })

  it('shows a permission-denied message on 403', () => {
    state = { data: undefined, isLoading: false, isError: true, error: { status: 403 } }
    renderPanel()
    expect(screen.getByText(/do not have permission/i)).toBeInTheDocument()
  })
})
