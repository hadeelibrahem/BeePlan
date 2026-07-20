import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AnalyticsScreen from './AnalyticsScreen'
import { LanguageProvider } from '../i18n/LanguageContext'
import { ThemeProvider } from '../theme/ThemeContext'
import { AuthProvider } from '../providers/AuthProvider'
import { computeTaskAnalytics } from '../lib/analytics'
import type { ApiTask } from '../lib/tasksApi'
import type { FocusStats } from '../lib/focusApi'
import * as tasksApi from '../lib/tasksApi'
import * as remindersApi from '../features/reminders'
import * as focusApi from '../lib/focusApi'

vi.mock('../lib/tasksApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/tasksApi')>()),
  getTasks: vi.fn(),
}))

vi.mock('../features/reminders', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../features/reminders')>()),
  getReminders: vi.fn(),
}))

vi.mock('../lib/focusApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/focusApi')>()),
  getFocusStats: vi.fn(),
}))

const getTasksMock = vi.mocked(tasksApi.getTasks)
const getRemindersMock = vi.mocked(remindersApi.getReminders)
const getFocusStatsMock = vi.mocked(focusApi.getFocusStats)

const EMPTY_FOCUS_STATS: FocusStats = {
  focusMinutesToday: 0,
  sessionsToday: 0,
  completedSessionsToday: 0,
  currentStreak: 0,
  totalFocusMinutesThisWeek: 0,
  topFocusTask: null,
}

function makeTask(overrides: Partial<ApiTask>): ApiTask {
  return {
    id: Math.random().toString(36).slice(2),
    title: 'Task',
    description: '',
    priority: 'medium',
    status: 'todo',
    progress: 0,
    dueTime: '',
    category: 'General',
    notes: '',
    estimatedTimeMinutes: 0,
    spentTimeMinutes: 0,
    remainingTimeMinutes: 0,
    estimatedHours: 0,
    spentHours: 0,
    remainingHours: 0,
    progressPercentage: 0,
    reminderEnabled: false,
    labels: [],
    attachments: [],
    isFavorite: false,
    isFocusTask: false,
    isBlocked: false,
    dependenciesComplete: true,
    subtasks: [],
    dependencies: [],
    recurrence: null,
    activities: [],
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

const SAMPLE_TASKS: ApiTask[] = [
  makeTask({ status: 'done', category: 'Work', priority: 'high' }),
  makeTask({ status: 'done', category: 'Work', priority: 'low' }),
  makeTask({ status: 'missed', category: 'Home', priority: 'medium' }),
  makeTask({ status: 'todo', category: 'Home', priority: 'high' }),
]

function renderAnalytics() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const noop = () => {}
  render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <AnalyticsScreen
              accessToken="test-token"
              onNavigateDashboard={noop}
              onNavigateFocus={noop}
              onNavigatePlanner={noop}
              onNavigatePeople={noop}
              onNavigateNotifications={noop}
              onNavigateCalendar={noop}
              onNavigateNotes={noop}
              onNavigateAnalytics={noop}
              onNavigateReminders={noop}
              onNavigateTasks={noop}
            />
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

// Read the big number rendered inside the stat card carrying `title`. Scoped to
// <main> so the "Reminders" card title doesn't collide with the sidebar nav item.
function statValue(title: string) {
  const main = screen.getByRole('main')
  const card = within(main).getByText(title).closest('.rounded-2xl')
  if (!card) throw new Error(`Stat card "${title}" not found`)
  return within(card as HTMLElement).getByText(/\d/).textContent
}

describe('computeTaskAnalytics (data consistency)', () => {
  it('counts done/missed/total the same way the Tasks screen filters them', () => {
    const analytics = computeTaskAnalytics(SAMPLE_TASKS)

    // Independent recomputation from the same list — mirrors the Tasks screen's
    // own status filters — must agree with the analytics numbers.
    expect(analytics.totalTasks).toBe(SAMPLE_TASKS.length)
    expect(analytics.completedTasks).toBe(SAMPLE_TASKS.filter((t) => t.status === 'done').length)
    expect(analytics.missedTasks).toBe(SAMPLE_TASKS.filter((t) => t.status === 'missed').length)
    expect(analytics.completedTasks).toBe(2)
    expect(analytics.missedTasks).toBe(1)
  })

  it('derives completion rate as completed / total', () => {
    expect(computeTaskAnalytics(SAMPLE_TASKS).completionRate).toBe(50)
    expect(computeTaskAnalytics([]).completionRate).toBe(0)
  })

  it('breakdown counts sum back to the total task count', () => {
    const analytics = computeTaskAnalytics(SAMPLE_TASKS)
    const categorySum = analytics.byCategory.reduce((sum, [, count]) => sum + count, 0)
    const prioritySum = analytics.byPriority.reduce((sum, [, count]) => sum + count, 0)

    expect(categorySum).toBe(analytics.totalTasks)
    expect(prioritySum).toBe(analytics.totalTasks)
  })

  it('groups categories and priorities without losing tasks', () => {
    const analytics = computeTaskAnalytics(SAMPLE_TASKS)
    expect(Object.fromEntries(analytics.byCategory)).toEqual({ Work: 2, Home: 2 })
    expect(Object.fromEntries(analytics.byPriority)).toEqual({ high: 2, low: 1, medium: 1 })
  })
})

describe('AnalyticsScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRemindersMock.mockResolvedValue([])
    getFocusStatsMock.mockResolvedValue(EMPTY_FOCUS_STATS)
  })

  it('renders stat cards from the same query data the Tasks list uses', async () => {
    getTasksMock.mockResolvedValue(SAMPLE_TASKS)
    getRemindersMock.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }] as never)

    renderAnalytics()

    await waitFor(() => expect(statValue('Completed Tasks')).toBe('2'))
    expect(statValue('Missed Tasks')).toBe('1')
    expect(statValue('Completion Rate')).toBe('50%')
    expect(statValue('Reminders')).toBe('3')

    // Screen values match the pure derivation over the identical task list.
    const expected = computeTaskAnalytics(SAMPLE_TASKS)
    expect(statValue('Completed Tasks')).toBe(String(expected.completedTasks))
    expect(statValue('Missed Tasks')).toBe(String(expected.missedTasks))
  })

  it('shows a loading placeholder before the first result arrives', () => {
    getTasksMock.mockReturnValue(new Promise(() => {}) as never)
    getRemindersMock.mockReturnValue(new Promise(() => {}) as never)

    renderAnalytics()

    // Both breakdown sections (category + priority) show the loading placeholder.
    expect(screen.getAllByText('Loading breakdown…')).toHaveLength(2)
    expect(screen.getAllByText('…').length).toBeGreaterThan(0)
  })

  it('surfaces an error with a retry action when the tasks query fails', async () => {
    getTasksMock.mockRejectedValueOnce(new Error('Network down'))

    renderAnalytics()

    expect(await screen.findByText('Network down')).toBeInTheDocument()

    getTasksMock.mockResolvedValueOnce(SAMPLE_TASKS)
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))

    await waitFor(() => expect(statValue('Completed Tasks')).toBe('2'))
    expect(screen.queryByText('Network down')).not.toBeInTheDocument()
  })

  it('renders an empty state and zeroed counts when there are no tasks', async () => {
    getTasksMock.mockResolvedValue([])

    renderAnalytics()

    await waitFor(() =>
      expect(screen.getAllByText(/No tasks yet — create one to see a breakdown here\./i)).toHaveLength(2),
    )
    expect(statValue('Completed Tasks')).toBe('0')
    expect(statValue('Completion Rate')).toBe('0%')
  })
})
