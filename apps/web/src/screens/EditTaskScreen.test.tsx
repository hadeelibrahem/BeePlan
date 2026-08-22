import { fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { LanguageProvider, useLanguage } from '../i18n/LanguageContext'
import type { ApiTask } from '../lib/tasksApi'
import { AuthProvider } from '../providers/AuthProvider'
import { ToastProvider } from '../components/feedback/ToastProvider'
import { ThemeProvider } from '../theme/ThemeContext'
import EditTaskScreen from './EditTaskScreen'

const task: ApiTask = {
  id: 'task-1', title: 'Plan release', description: '', priority: 'medium', status: 'todo', progress: 0,
  dueDate: '2026-08-20', dueTime: '09:00', scheduledDate: '2026-08-19', scheduledStartTime: '08:00', scheduledEndTime: '09:00',
  category: 'General', notes: '', estimatedTimeMinutes: 60, spentTimeMinutes: 0, remainingTimeMinutes: 60,
  estimatedHours: 1, spentHours: 0, remainingHours: 1, progressPercentage: 0, reminderEnabled: true,
  reminderBeforeMinutes: 10, labels: [], attachments: [], isFavorite: false, isFocusTask: false, isBlocked: false,
  dependenciesComplete: true, subtasks: [], dependencies: [], recurrence: null, activities: [],
  createdAt: '2026-08-19T00:00:00.000Z', updatedAt: '2026-08-19T00:00:00.000Z', viewerRole: 'owner', canEdit: true,
}

function LanguageSwitch() {
  const { setLanguage } = useLanguage()
  return <button type="button" onClick={() => setLanguage('en')}>Switch to English</button>
}

describe('EditTaskScreen Arabic scheduling and reminders', () => {
  it('renders localized scheduling, recurrence, and reminder controls', () => {
    window.localStorage.setItem('beeplan.language-preference', 'ar')
    const router = createMemoryRouter([
      {
        path: '/',
        element: (
          <LanguageProvider>
            <ThemeProvider>
              <LanguageSwitch />
              <EditTaskScreen task={task} onBack={() => undefined} onCancel={() => undefined} />
            </ThemeProvider>
          </LanguageProvider>
        ),
      },
    ])
    render(
      <AuthProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthProvider>,
    )

    expect(screen.getByText('\u0627\u0644\u062c\u062f\u0648\u0644\u0629', { exact: false })).toBeInTheDocument()
    expect(screen.getByLabelText('\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0627\u0633\u062a\u062d\u0642\u0627\u0642')).toBeInTheDocument()
    expect(screen.getByText('\u0627\u0644\u062a\u0643\u0631\u0627\u0631')).toBeInTheDocument()
    expect(screen.getByText('\u062a\u0630\u0643\u064a\u0631')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '\u0642\u0628\u0644 10 \u062f\u0642\u0627\u0626\u0642' })).toBeInTheDocument()
    expect(screen.getByText('\u0627\u0644\u0645\u0647\u0627\u0645 \u0627\u0644\u0641\u0631\u0639\u064a\u0629')).toBeInTheDocument()
    expect(screen.getByLabelText('\u0645\u0644\u0627\u062d\u0638\u0627\u062a')).toBeInTheDocument()
    expect(screen.getByText('\u0627\u0644\u0645\u0631\u0641\u0642\u0627\u062a')).toBeInTheDocument()
    expect(screen.getByText('\u0627\u0644\u062a\u0628\u0639\u064a\u0627\u062a')).toBeInTheDocument()

    fireEvent.change(document.getElementById('edit-task-title') as HTMLInputElement, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '\u062d\u0641\u0638 \u0627\u0644\u062a\u063a\u064a\u064a\u0631\u0627\u062a' }))
    expect(screen.getByRole('alert')).toHaveTextContent('\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0645\u0647\u0645\u0629 \u0645\u0637\u0644\u0648\u0628.')

    fireEvent.click(screen.getByRole('button', { name: 'Switch to English' }))
    expect(screen.getByRole('option', { name: '10 minutes before' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Task title is required.')
  })
})
