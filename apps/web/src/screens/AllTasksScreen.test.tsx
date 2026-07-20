import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AllTasksScreen from './AllTasksScreen'
import { LanguageProvider } from '../i18n/LanguageContext'
import { ThemeProvider } from '../theme/ThemeContext'
import { AuthProvider } from '../providers/AuthProvider'
import { ToastProvider } from '../components/feedback/ToastProvider'
import * as tasksApi from '../lib/tasksApi'
import type { ApiTask } from '../lib/tasksApi'

vi.mock('../lib/tasksApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/tasksApi')>('../lib/tasksApi')
  return {
    ...actual,
    getTasks: vi.fn(),
    getTaskFilterSummary: vi.fn(),
    changeTaskStatus: vi.fn(),
  }
})

const getTasksMock = vi.mocked(tasksApi.getTasks)
const getTaskFilterSummaryMock = vi.mocked(tasksApi.getTaskFilterSummary)
const changeTaskStatusMock = vi.mocked(tasksApi.changeTaskStatus)

function makeTask(overrides: Partial<ApiTask> = {}): ApiTask {
  return {
    id: 'task-1',
    title: 'Write report',
    description: '',
    priority: 'high',
    status: 'todo',
    progress: 0,
    dueTime: '',
    category: 'Work',
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
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

function renderScreen(tasks: ApiTask[], props: Partial<Parameters<typeof AllTasksScreen>[0]> = {}) {
  // getTasks serves both the filtered list and the "shared ids" lookup.
  getTasksMock.mockImplementation((_token, filters) =>
    Promise.resolve(filters?.shared ? [] : tasks),
  )
  getTaskFilterSummaryMock.mockResolvedValue({
    counts: { overdue: 0, today: 0, upcoming: 0, focus: 0, completed: 0, highPriority: 0 },
    categories: [],
  } as never)

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onViewTaskDetails = vi.fn()
  const onTaskUpdated = vi.fn()

  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>
              <AllTasksScreen
                accessToken="test-token"
                tasks={tasks}
                onViewTaskDetails={onViewTaskDetails}
                onTaskUpdated={onTaskUpdated}
                {...props}
              />
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </ToastProvider>
    </QueryClientProvider>,
  )

  return { onViewTaskDetails, onTaskUpdated }
}

function getCheckbox(name: RegExp) {
  return screen.getByRole('checkbox', { name })
}

describe('AllTasksScreen completion checkbox', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders an accessible, unchecked checkbox for an incomplete task', async () => {
    renderScreen([makeTask()])

    const checkbox = await screen.findByRole('checkbox', { name: /mark task write report as complete/i })
    expect(checkbox).toHaveAttribute('aria-checked', 'false')
  })

  it('completes a task optimistically and calls changeTaskStatus with done/100', async () => {
    changeTaskStatusMock.mockResolvedValue(makeTask({ status: 'done', progress: 100 }))
    const user = userEvent.setup()
    const { onViewTaskDetails } = renderScreen([makeTask()])

    const checkbox = await screen.findByRole('checkbox', { name: /mark task write report as complete/i })
    await user.click(checkbox)

    await waitFor(() => expect(changeTaskStatusMock).toHaveBeenCalledTimes(1))
    expect(changeTaskStatusMock).toHaveBeenCalledWith('test-token', 'task-1', { status: 'done', progress: 100 })
    // Optimistic flip: the row shows as checked immediately.
    expect(getCheckbox(/reopen task write report/i)).toHaveAttribute('aria-checked', 'true')
    // Toggling the checkbox must not navigate to the task details.
    expect(onViewTaskDetails).not.toHaveBeenCalled()
  })

  it('reopens a completed task with todo/0', async () => {
    changeTaskStatusMock.mockResolvedValue(makeTask({ status: 'todo', progress: 0 }))
    const user = userEvent.setup()
    renderScreen([makeTask({ status: 'done', progress: 100 })])

    const checkbox = await screen.findByRole('checkbox', { name: /reopen task write report/i })
    await user.click(checkbox)

    await waitFor(() => expect(changeTaskStatusMock).toHaveBeenCalledTimes(1))
    expect(changeTaskStatusMock).toHaveBeenCalledWith('test-token', 'task-1', { status: 'todo', progress: 0 })
  })

  it('blocks completion when dependencies are incomplete and shows an error', async () => {
    const user = userEvent.setup()
    renderScreen([makeTask({ isBlocked: true, dependenciesComplete: false })])

    const checkbox = await screen.findByRole('checkbox', { name: /mark task write report as complete/i })
    await user.click(checkbox)

    expect(await screen.findByText(/complete this task’s dependencies/i)).toBeInTheDocument()
    expect(changeTaskStatusMock).not.toHaveBeenCalled()
    expect(checkbox).toHaveAttribute('aria-checked', 'false')
  })

  it('ignores duplicate clicks while a completion is in flight', async () => {
    // Never resolves — keeps the row in the pending state for the whole test.
    changeTaskStatusMock.mockReturnValue(new Promise(() => {}) as never)
    const user = userEvent.setup()
    renderScreen([makeTask()])

    const checkbox = await screen.findByRole('checkbox', { name: /mark task write report as complete/i })
    await user.click(checkbox)
    await waitFor(() => expect(getCheckbox(/updating task/i)).toBeDisabled())
    await user.click(getCheckbox(/updating task/i))

    expect(changeTaskStatusMock).toHaveBeenCalledTimes(1)
  })

  it('rolls back and shows an error when the server rejects the change', async () => {
    changeTaskStatusMock.mockRejectedValue(new Error('Network down'))
    const user = userEvent.setup()
    renderScreen([makeTask()])

    const checkbox = await screen.findByRole('checkbox', { name: /mark task write report as complete/i })
    await user.click(checkbox)

    expect((await screen.findAllByText(/network down/i)).length).toBeGreaterThan(0)
    expect(getCheckbox(/mark task write report as complete/i)).toHaveAttribute('aria-checked', 'false')
  })

  it('navigates to details when the row (not the checkbox) is clicked', async () => {
    const user = userEvent.setup()
    const { onViewTaskDetails } = renderScreen([makeTask()])

    const title = await screen.findByText('Write report')
    await user.click(title)

    expect(onViewTaskDetails).toHaveBeenCalledWith('task-1')
    expect(changeTaskStatusMock).not.toHaveBeenCalled()
  })
})

describe('AllTasksScreen inline status changes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('changes a simple list status without opening the task details', async () => {
    changeTaskStatusMock.mockResolvedValue(makeTask({ status: 'in_progress' }))
    const user = userEvent.setup()
    const { onTaskUpdated, onViewTaskDetails } = renderScreen([makeTask()])

    const control = await screen.findByRole('combobox', { name: /change status for write report/i })
    await user.selectOptions(control, 'In Progress')

    await waitFor(() => expect(changeTaskStatusMock).toHaveBeenCalledTimes(1))
    expect(changeTaskStatusMock).toHaveBeenCalledWith('test-token', 'task-1', {
      status: 'in_progress',
      progress: 0,
    })
    expect(onTaskUpdated).toHaveBeenCalledWith(expect.objectContaining({ status: 'in_progress' }))
    expect(onViewTaskDetails).not.toHaveBeenCalled()
  })

  it('keeps an inline status change disabled while its mutation is pending', async () => {
    changeTaskStatusMock.mockReturnValue(new Promise(() => {}) as never)
    const user = userEvent.setup()
    renderScreen([makeTask()])

    const control = await screen.findByRole('combobox', { name: /change status for write report/i })
    await user.selectOptions(control, 'In Progress')
    await waitFor(() => expect(control).toBeDisabled())

    expect(changeTaskStatusMock).toHaveBeenCalledTimes(1)
  })

  it('prevents starting a dependency-blocked task from the list', async () => {
    const user = userEvent.setup()
    renderScreen([makeTask({ isBlocked: true, dependenciesComplete: false })])

    const control = await screen.findByRole('combobox', { name: /change status for write report/i })
    await user.selectOptions(control, 'In Progress')

    expect(await screen.findByText(/complete this task's dependencies before starting it/i)).toBeInTheDocument()
    expect(changeTaskStatusMock).not.toHaveBeenCalled()
  })
})
