import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TasksDashboardScreen from './TasksDashboardScreen'
import { LanguageProvider } from '../i18n/LanguageContext'
import { ThemeProvider } from '../theme/ThemeContext'
import { AuthProvider } from '../providers/AuthProvider'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { challengesApi } from '../features/challenges/challengesApi'
import type { TodayDashboard } from '../lib/tasksApi'

vi.mock('../features/challenges/challengesApi', () => ({ challengesApi: { list: vi.fn() } }))

const base: TodayDashboard = { generatedAt: '2026-07-21T12:00:00Z', timezone: 'UTC', greeting: 'Good afternoon, Fatima', dailyStatus: { status: 'On track', statusTone: 'positive', summaryLines: ['30 minutes of estimated work remain.'] }, activeFocus: null, recommendation: { taskId: 'task-1', taskTitle: 'Prepare presentation', subtaskId: 'sub-1', subtaskTitle: 'Draft opening', estimatedMinutes: 30, reason: '', recommendationReason: '', score: 10 }, whyNow: [{ code: 'high_priority', label: 'High priority' }], timeline: [], locationContext: null, suggestions: [], progress: { percent: 50, completedWorkUnits: 1, totalWorkUnits: 2, focusMinutes: 25, remainingEstimatedMinutes: 30, basis: 'eligible tasks and subtasks due today' }, tomorrowPreview: { date: '2026-07-22', calendarEvents: [], dueWorkUnits: 2, estimatedWorkMinutes: 90, highPriorityItems: 1, capacityMinutes: 60, overloadStatus: 'overloaded' } }

function renderDashboard(dashboard: TodayDashboard | null = base, loading = false, error = '') {
  const onStartFocus = vi.fn().mockResolvedValue(undefined); const onContinueFocus = vi.fn(); const retry = vi.fn(); const noop = () => {}
  render(<AuthProvider><ThemeProvider><LanguageProvider><TasksDashboardScreen dashboard={dashboard} summaryLoading={loading} summaryError={error} onRetrySummary={retry} onViewTasks={noop} onViewReminders={noop} onStartFocus={onStartFocus} onContinueFocus={onContinueFocus} onNavigateFocus={noop} onNavigatePlanner={noop} onNavigatePeople={noop} onNavigateNotifications={noop} onNavigateCalendar={noop} onNavigateNotes={noop} onNavigateAnalytics={noop} /></LanguageProvider></ThemeProvider></AuthProvider>)
  return { onStartFocus, onContinueFocus, retry }
}

describe('TasksDashboardScreen action dashboard', () => {
  it('renders subtask context, structured reasons, progress, and empty timeline', () => {
    renderDashboard()
    expect(screen.getByText('Draft opening')).toBeInTheDocument()
    expect(screen.getByText('Part of: Prepare presentation')).toBeInTheDocument()
    expect(screen.getByText('High priority')).toBeInTheDocument()
    expect(screen.getByText('No accepted plan is scheduled for today.')).toBeInTheDocument()
    expect(screen.getByText('1/2 units')).toBeInTheDocument()
    expect(screen.getByText('Tomorrow is overloaded.')).toBeInTheDocument()
  })
  it('starts focus with the subtask-aware recommendation', async () => {
    const user = userEvent.setup(); const { onStartFocus } = renderDashboard()
    await user.click(screen.getByRole('button', { name: 'Start Focus' }))
    expect(onStartFocus).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'task-1', subtaskId: 'sub-1' }))
  })
  it('makes an active session the primary action', async () => {
    const user = userEvent.setup(); const { onContinueFocus } = renderDashboard({ ...base, activeFocus: { id: 'session-1', taskId: 'task-1', taskTitle: 'Prepare presentation', subtaskId: null, subtaskTitle: null, startedAt: '2026-07-21T11:00:00Z', endedAt: null, plannedMinutes: 50, actualMinutes: null, status: 'active', sessionType: 'pomodoro', notes: null, createdAt: '2026-07-21T11:00:00Z' } })
    await user.click(screen.getByRole('button', { name: 'Continue Focus' }))
    expect(onContinueFocus).toHaveBeenCalledOnce()
  })
  it('renders loading and retryable error states', () => {
    const { rerender } = render(<AuthProvider><ThemeProvider><LanguageProvider><TasksDashboardScreen dashboard={null} summaryLoading summaryError="" onViewTasks={() => {}} onViewReminders={() => {}} onStartFocus={async () => {}} onContinueFocus={() => {}} onNavigateFocus={() => {}} onNavigatePlanner={() => {}} onNavigatePeople={() => {}} onNavigateNotifications={() => {}} onNavigateCalendar={() => {}} onNavigateNotes={() => {}} onNavigateAnalytics={() => {}} /></LanguageProvider></ThemeProvider></AuthProvider>)
    expect(document.querySelector('.animate-pulse')).not.toBeNull()
    rerender(<AuthProvider><ThemeProvider><LanguageProvider><TasksDashboardScreen dashboard={null} summaryLoading={false} summaryError="Unable to load" onRetrySummary={() => {}} onViewTasks={() => {}} onViewReminders={() => {}} onStartFocus={async () => {}} onContinueFocus={() => {}} onNavigateFocus={() => {}} onNavigatePlanner={() => {}} onNavigatePeople={() => {}} onNavigateNotifications={() => {}} onNavigateCalendar={() => {}} onNavigateNotes={() => {}} onNavigateAnalytics={() => {}} /></LanguageProvider></ThemeProvider></AuthProvider>)
    expect(screen.getByText('Unable to load')).toBeInTheDocument()
  })
})

describe('dashboard Challenge widget', () => {
  const active: any = { id: 'soon', title: 'Admin challenge title', description: 'Admin description', type: 'focus_minutes', targetValue: 100, progressValue: 140, status: 'active', completed: false, completedAt: null, startAt: '2026-01-01T00:00:00Z', endAt: '2026-06-01T00:00:00Z' }
  const renderWidget = () => { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return render(<QueryClientProvider client={client}><AuthProvider><ThemeProvider><LanguageProvider><TasksDashboardScreen dashboard={base} accessToken="token" onViewTasks={() => {}} onViewReminders={() => {}} onStartFocus={async () => {}} onContinueFocus={() => {}} onNavigateFocus={() => {}} onNavigatePlanner={() => {}} onNavigatePeople={() => {}} onNavigateNotifications={() => {}} onNavigateCalendar={() => {}} onNavigateNotes={() => {}} onNavigateAnalytics={() => {}} /></LanguageProvider></ThemeProvider></AuthProvider></QueryClientProvider>) }
  it('renders the localized active widget, clamps progress, links correctly, and selects the earliest ending active challenge', async () => { vi.mocked(challengesApi.list).mockResolvedValue([{ ...active, id: 'later', endAt: '2026-07-01T00:00:00Z' }, active]); renderWidget(); expect(await screen.findByText('Community Challenge')).toBeInTheDocument(); expect(screen.getByText('Admin challenge title')).toBeInTheDocument(); expect(screen.getByText('100 / 100 minutes')).toBeInTheDocument(); expect(document.querySelector('[style*="width: 100%"]')).not.toBeNull(); expect(screen.getByRole('link', { name: 'View challenge' })).toHaveAttribute('href', '/challenges/soon'); expect(screen.getByText(/Ends/)).toBeInTheDocument() })
  it('omits the widget without an active challenge', async () => { vi.mocked(challengesApi.list).mockResolvedValue([{ ...active, status: 'scheduled' }]); renderWidget(); await screen.findByText('Good afternoon, Fatima'); expect(screen.queryByText('Community Challenge')).toBeNull() })
})
