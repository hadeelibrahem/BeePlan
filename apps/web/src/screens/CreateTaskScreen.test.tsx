import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import CreateTaskScreen from './CreateTaskScreen'
import { LanguageProvider } from '../i18n/LanguageContext'
import { ThemeProvider } from '../theme/ThemeContext'
import { AuthProvider } from '../providers/AuthProvider'

function renderCreateTaskScreen(onSave: (payload: unknown) => unknown) {
  // A data router is required because CreateTaskScreen's unsaved-changes guard
  // uses useBlocker.
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <ThemeProvider>
            <LanguageProvider>
              <AuthProvider>
                <CreateTaskScreen onSave={onSave as never} />
              </AuthProvider>
            </LanguageProvider>
          </ThemeProvider>
        ),
      },
    ],
    { initialEntries: ['/'] },
  )
  return render(<RouterProvider router={router} />)
}

function getReminderToggle() {
  return screen.getByRole('switch', { name: /reminder/i })
}

describe('CreateTaskScreen reminder toggle', () => {
  it('associates the required title label with its field and announces validation errors', async () => {
    const user = userEvent.setup()
    renderCreateTaskScreen(vi.fn())

    const title = screen.getByRole('textbox', { name: /task title/i })
    expect(title).toBeRequired()
    expect(title).toHaveAttribute('aria-required', 'true')

    await user.click(screen.getByRole('button', { name: /save task/i }))
    expect(screen.getByRole('alert')).toHaveTextContent('Task title is required.')
    expect(title).toHaveAttribute('aria-describedby', 'create-task-error')
  })

  it('is on by default and enables the reminder time field', () => {
    renderCreateTaskScreen(vi.fn())

    const toggle = getReminderToggle()
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('combobox', { name: /reminder time/i })).toBeEnabled()
  })

  it('toggles off on click, disabling the reminder time field', async () => {
    const user = userEvent.setup()
    renderCreateTaskScreen(vi.fn())

    const toggle = getReminderToggle()
    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('combobox', { name: /reminder time/i })).toBeDisabled()
  })

  it('toggles via the keyboard (Enter/Space) like a native switch', async () => {
    const user = userEvent.setup()
    renderCreateTaskScreen(vi.fn())

    const toggle = getReminderToggle()
    toggle.focus()
    await user.keyboard('{Enter}')
    expect(toggle).toHaveAttribute('aria-checked', 'false')

    await user.keyboard(' ')
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  it('submits reminderEnabled: true and a reminderBeforeMinutes when on', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue({ id: 'task-1' })
    renderCreateTaskScreen(onSave)

    await user.type(screen.getByPlaceholderText(/enter task title/i), 'Ship the feature')
    await user.click(screen.getByRole('button', { name: /save task/i }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const payload = onSave.mock.calls[0][0]
    expect(payload.reminderEnabled).toBe(true)
    expect(payload.reminderBeforeMinutes).toBe(30)
  })

  it('submits reminderEnabled: false and omits reminderBeforeMinutes when off', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue({ id: 'task-1' })
    renderCreateTaskScreen(onSave)

    await user.type(screen.getByPlaceholderText(/enter task title/i), 'Ship the feature')
    await user.click(getReminderToggle())
    await user.click(screen.getByRole('button', { name: /save task/i }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const payload = onSave.mock.calls[0][0]
    expect(payload.reminderEnabled).toBe(false)
    expect(payload.reminderBeforeMinutes).toBeUndefined()
  })
})
