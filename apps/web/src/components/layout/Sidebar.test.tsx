import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Sidebar } from './Sidebar'
import { LanguageProvider } from '../../i18n/LanguageContext'

describe('Settings sidebar navigation', () => {
  it('constrains the desktop sidebar and makes shared content scrollable', () => {
    const { container } = render(<LanguageProvider><Sidebar active="dashboard" /></LanguageProvider>)
    const desktopSidebar = container.querySelector('aside')
    const content = desktopSidebar?.firstElementChild

    expect(desktopSidebar).toHaveClass('top-0', 'h-screen', 'lg:flex')
    expect(content).toHaveClass('h-full', 'min-h-0')
  })

  it('highlights Settings and keeps the other navigation actions functional', () => {
    const onNavigateSettings = vi.fn()
    const onNavigateNotes = vi.fn()

    render(<LanguageProvider><Sidebar
      active="settings"
      mobileOpen={false}
      onCloseMobile={() => undefined}
      onNavigateSettings={onNavigateSettings}
      onNavigateNotes={onNavigateNotes}
    /></LanguageProvider>)

    const settings = screen.getByRole('button', { name: 'Settings' })
    expect(settings).toHaveAttribute('aria-current', 'page')

    fireEvent.click(settings)
    fireEvent.click(screen.getByRole('button', { name: 'Notes' }))

    expect(onNavigateSettings).toHaveBeenCalledOnce()
    expect(onNavigateNotes).toHaveBeenCalledOnce()
  })

  it('renders a desktop sidebar plus an isolated mobile drawer tree when open', () => {
    const { container } = render(
      <LanguageProvider>
        <Sidebar active="calendar" mobileOpen onCloseMobile={() => undefined} />
      </LanguageProvider>,
    )

    expect(container.querySelectorAll('aside.bp-sidebar, aside.bp-sidebar-drawer')).toHaveLength(2)
    expect(container.querySelector('aside.bp-sidebar')).toHaveClass('hidden', 'lg:flex')
    expect(container.querySelector('aside.bp-sidebar-drawer')?.closest('.lg\\:hidden')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Calendar' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Calendar' }).every((button) => button.getAttribute('aria-current') === 'page')).toBe(true)
    expect(screen.getAllByRole('button', { name: 'Dashboard' })).toHaveLength(2)
  })
})
