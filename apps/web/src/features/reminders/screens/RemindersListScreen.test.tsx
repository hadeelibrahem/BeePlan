import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RemindersListScreen } from './RemindersListScreen'
import { LanguageProvider } from '../../../i18n/LanguageContext'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { AuthProvider } from '../../../providers/AuthProvider'
import type { Reminder } from '../types/reminders.types'

type Handlers = {
  onCreate: () => void
  onCreatePerson: () => void
  onNavigatePeople: () => void
  onSelect: (id: string) => void
  onToggle: (id: string) => void
}

function renderList(reminders: Reminder[], overrides: Partial<Handlers> = {}) {
  const handlers: Handlers = {
    onCreate: vi.fn(),
    onCreatePerson: vi.fn(),
    onNavigatePeople: vi.fn(),
    onSelect: vi.fn(),
    onToggle: vi.fn(),
    ...overrides,
  }
  const noop = () => {}

  render(
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <RemindersListScreen
            reminders={reminders}
            onCreate={handlers.onCreate}
            onCreatePerson={handlers.onCreatePerson}
            onSelect={handlers.onSelect}
            onToggle={handlers.onToggle}
            onNavigatePeople={handlers.onNavigatePeople}
            onNavigateTasks={noop}
            onNavigateFocus={noop}
            onNavigatePlanner={noop}
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

describe('RemindersListScreen person-reminder CTA', () => {
  it('"Create Person Reminder" opens the create form (person) instead of navigating to People', async () => {
    const user = userEvent.setup()
    const handlers = renderList([])

    await user.click(screen.getByRole('button', { name: /Create Person Reminder/i }))

    expect(handlers.onCreatePerson).toHaveBeenCalledTimes(1)
    expect(handlers.onNavigatePeople).not.toHaveBeenCalled()
    expect(handlers.onCreate).not.toHaveBeenCalled()
  })

  it('the person-tab empty state also routes to the create form, not People', async () => {
    const user = userEvent.setup()
    const handlers = renderList([])

    // Switch to the People/person filter tab (scoped to <main> so it doesn't
    // collide with the sidebar's People nav item), revealing its empty state.
    const main = screen.getByRole('main')
    await user.click(within(main).getByRole('button', { name: /^People$/i }))
    const emptyStateAction = within(main).getAllByRole('button', { name: /Create Person Reminder/i })

    // Click the empty-state action (the last matching control).
    await user.click(emptyStateAction[emptyStateAction.length - 1])

    expect(handlers.onCreatePerson).toHaveBeenCalled()
    expect(handlers.onNavigatePeople).not.toHaveBeenCalled()
  })
})
