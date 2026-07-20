import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Reminder } from '../features/reminders'
import type { ApiTask } from '../lib/tasksApi'
import { LanguageProvider } from '../i18n/LanguageContext'
import { AuthProvider } from '../providers/AuthProvider'
import { ThemeProvider } from '../theme/ThemeContext'
import CalendarScreen from './CalendarScreen'

function todayKey() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

const task = (overrides: Partial<ApiTask> = {}): ApiTask => ({
  id: 'task-1',
  title: 'Calendar task',
  description: '',
  priority: 'medium',
  status: 'todo',
  progress: 0,
  dueDate: todayKey(),
  dueTime: '',
  category: '',
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
})

const reminder = (overrides: Partial<Reminder> = {}): Reminder => ({
  id: 'reminder-1',
  title: 'Calendar reminder',
  type: 'time',
  status: 'active',
  priority: 'medium',
  remindAt: todayKey(),
  createdAt: '',
  updatedAt: '',
  ...overrides,
})

function renderCalendar(overrides: Partial<ComponentProps<typeof CalendarScreen>> = {}) {
  const onViewTask = vi.fn()
  const onViewReminder = vi.fn()
  const onCreateTaskForDate = vi.fn()

  render(
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <CalendarScreen
            tasks={[task()]}
            reminders={[reminder()]}
            onViewTask={onViewTask}
            onViewReminder={onViewReminder}
            onCreateTaskForDate={onCreateTaskForDate}
            {...overrides}
          />
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>,
  )

  return { onViewTask, onViewReminder, onCreateTaskForDate }
}

describe('CalendarScreen actions', () => {
  it('opens selected tasks and reminders through the supplied navigation handlers', async () => {
    const user = userEvent.setup()
    const handlers = renderCalendar()

    await user.click(screen.getByRole('button', { name: 'Open task: Calendar task' }))
    await user.click(screen.getByRole('button', { name: 'Open reminder: Calendar reminder' }))

    expect(handlers.onViewTask).toHaveBeenCalledWith('task-1')
    expect(handlers.onViewReminder).toHaveBeenCalledWith('reminder-1')
  })

  it('opens the existing create flow with the selected local day', async () => {
    const user = userEvent.setup()
    const handlers = renderCalendar()

    await user.click(screen.getByRole('button', { name: 'Add task' }))

    expect(handlers.onCreateTaskForDate).toHaveBeenCalledOnce()
    expect(handlers.onCreateTaskForDate).toHaveBeenCalledWith(todayKey())
  })

  it('returns the calendar to today and shows compact overflow for busy days', async () => {
    const user = userEvent.setup()
    renderCalendar({
      tasks: [task(), task({ id: 'task-2', title: 'Second task' }), task({ id: 'task-3', title: 'Third task' })],
      reminders: [],
    })

    expect(screen.getByText('+1')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Next/ }))
    await user.click(screen.getByRole('button', { name: 'Today' }))

    expect(screen.getByRole('gridcell', { name: /3 scheduled items/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('exposes today and selection state and supports arrow-key day navigation', async () => {
    const user = userEvent.setup()
    renderCalendar()
    const today = screen.getByRole('gridcell', { name: /today, 2 scheduled items/ })

    expect(today).toHaveAttribute('aria-current', 'date')
    expect(today).toHaveAttribute('aria-selected', 'true')
    await user.click(today)
    await user.keyboard('{ArrowRight}')

    expect(today).toHaveAttribute('aria-selected', 'false')
    expect(screen.getAllByRole('gridcell', { selected: true })).toHaveLength(1)
  })
})
