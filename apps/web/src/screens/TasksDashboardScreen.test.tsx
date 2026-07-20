import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TasksDashboardScreen from './TasksDashboardScreen'
import { LanguageProvider } from '../i18n/LanguageContext'
import { ThemeProvider } from '../theme/ThemeContext'
import { AuthProvider } from '../providers/AuthProvider'
import type { ApiTask } from '../lib/tasksApi'

type Handlers = {
  onViewTasks: () => void
  onViewReminders: () => void
  onCreateTask: () => void
  onCreateTaskAi: () => void
  onCreateReminder: () => void
  onViewTaskDetails: (taskId: string) => void
}

function renderDashboard(overrides: Partial<Handlers> = {}, tasks: ApiTask[] = []) {
  const handlers: Handlers = {
    onViewTasks: vi.fn(),
    onViewReminders: vi.fn(),
    onCreateTask: vi.fn(),
    onCreateTaskAi: vi.fn(),
    onCreateReminder: vi.fn(),
    onViewTaskDetails: vi.fn(),
    ...overrides,
  }

  const noop = () => {}
  render(
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <TasksDashboardScreen
          reminders={[]}
          tasks={tasks}
          onViewTasks={handlers.onViewTasks}
          onViewReminders={handlers.onViewReminders}
          onCreateTask={handlers.onCreateTask}
          onCreateTaskAi={handlers.onCreateTaskAi}
          onCreateReminder={handlers.onCreateReminder}
          onViewTaskDetails={handlers.onViewTaskDetails}
          onNavigateFocus={noop}
          onNavigatePlanner={noop}
          onNavigatePeople={noop}
          onNavigateNotifications={noop}
          onNavigateCalendar={noop}
          onNavigateNotes={noop}
          onNavigateAnalytics={noop}
          />
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>,
  )

  return handlers
}

function focusTask(): ApiTask {
  return {
    id: 'focus-task', title: 'Prepare presentation', description: '', priority: 'high', status: 'todo', progress: 0,
    dueTime: '', category: 'Work', notes: '', estimatedTimeMinutes: 0, spentTimeMinutes: 0, remainingTimeMinutes: 0,
    estimatedHours: 0, spentHours: 0, remainingHours: 0, progressPercentage: 0, reminderEnabled: false,
    labels: [], attachments: [], isFavorite: false, isFocusTask: true, isBlocked: false, dependenciesComplete: true,
    subtasks: [], dependencies: [], recurrence: null, activities: [], createdAt: '', updatedAt: '',
  }
}

function getChooser() {
  return screen.getByRole('dialog', { name: /add task/i })
}

describe('TasksDashboardScreen create-task navigation', () => {
  it('uses an accessible button for focus rows and opens the task with keyboard activation', async () => {
    const user = userEvent.setup()
    const handlers = renderDashboard({}, [focusTask()])
    const row = screen.getByRole('button', { name: 'Open focus task: Prepare presentation' })

    row.focus()
    await user.keyboard('{Enter}')

    expect(handlers.onViewTaskDetails).toHaveBeenCalledWith('focus-task')
  })

  it('opens the Add Task chooser from the "New Task" quick action without routing through All Tasks', async () => {
    const user = userEvent.setup()
    const handlers = renderDashboard()

    expect(screen.queryByRole('dialog', { name: /add task/i })).toBeNull()

    await user.click(screen.getByRole('button', { name: /New Task/i }))

    expect(getChooser()).toBeInTheDocument()
    expect(handlers.onViewTasks).not.toHaveBeenCalled()
    expect(handlers.onCreateTask).not.toHaveBeenCalled()
  })

  it('opens the same chooser from the floating action button', async () => {
    const user = userEvent.setup()
    const handlers = renderDashboard()

    await user.click(screen.getByRole('button', { name: /primary action/i }))

    expect(getChooser()).toBeInTheDocument()
    expect(handlers.onViewTasks).not.toHaveBeenCalled()
  })

  it('routes to the manual create flow when picking "Manual Task"', async () => {
    const user = userEvent.setup()
    const handlers = renderDashboard()

    await user.click(screen.getByRole('button', { name: /New Task/i }))
    await user.click(within(getChooser()).getByRole('button', { name: /Manual Task/i }))

    expect(handlers.onCreateTask).toHaveBeenCalledTimes(1)
    expect(handlers.onCreateTaskAi).not.toHaveBeenCalled()
    expect(handlers.onViewTasks).not.toHaveBeenCalled()
    // Chooser closes after a choice is made.
    expect(screen.queryByRole('dialog', { name: /add task/i })).toBeNull()
  })

  it('routes to the AI planner flow when picking "AI Plan Task"', async () => {
    const user = userEvent.setup()
    const handlers = renderDashboard()

    await user.click(screen.getByRole('button', { name: /primary action/i }))
    await user.click(within(getChooser()).getByRole('button', { name: /AI Plan Task/i }))

    expect(handlers.onCreateTaskAi).toHaveBeenCalledTimes(1)
    expect(handlers.onCreateTask).not.toHaveBeenCalled()
    expect(handlers.onViewTasks).not.toHaveBeenCalled()
  })

  it('keeps "All Tasks" navigating to the task list, distinct from "New Task"', async () => {
    const user = userEvent.setup()
    const handlers = renderDashboard()

    await user.click(screen.getByRole('button', { name: /All Tasks/i }))

    expect(handlers.onViewTasks).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog', { name: /add task/i })).toBeNull()
  })

  it('opens the reminder create flow directly from "New Reminder" (not the reminders list)', async () => {
    const user = userEvent.setup()
    const handlers = renderDashboard()

    await user.click(screen.getByRole('button', { name: /New Reminder/i }))

    expect(handlers.onCreateReminder).toHaveBeenCalledTimes(1)
    expect(handlers.onViewReminders).not.toHaveBeenCalled()
  })
})
