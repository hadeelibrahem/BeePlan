import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { CreateReminderScreen } from './CreateReminderScreen'
import { LanguageProvider } from '../../../i18n/LanguageContext'
import { ThemeProvider } from '../../../theme/ThemeContext'

// The form only needs the friends lookup to resolve; nothing else is called on mount.
vi.mock('../../social/api/social.api', () => ({
  getFriends: vi.fn().mockResolvedValue([]),
  createPersonReminder: vi.fn(),
  parsePersonReminder: vi.fn(),
}))

function renderCreate(initialType?: 'time' | 'person') {
  render(
    <ThemeProvider>
      <LanguageProvider>
        <CreateReminderScreen
          accessToken="test-token"
          initialType={initialType}
          onCancel={vi.fn()}
          onCreated={vi.fn()}
        />
      </LanguageProvider>
    </ThemeProvider>,
  )
}

describe('CreateReminderScreen initial type', () => {
  it('preselects the Person type when opened with initialType="person"', async () => {
    renderCreate('person')

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Person Reminder/i })).toHaveAttribute('aria-pressed', 'true'),
    )
    // Other types remain available (types are preserved, not removed).
    expect(screen.getByRole('button', { name: /^Time/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('defaults to the Time type when no initial type is provided', async () => {
    renderCreate()

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Person Reminder/i })).toHaveAttribute('aria-pressed', 'false'),
    )
    expect(screen.getByRole('button', { name: /^Time/i })).toHaveAttribute('aria-pressed', 'true')
  })
})
