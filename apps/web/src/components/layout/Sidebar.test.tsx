import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Sidebar } from './Sidebar'

describe('Settings sidebar navigation', () => {
  it('constrains the desktop sidebar and makes shared content scrollable', () => {
    const { container } = render(<Sidebar active="dashboard" />)
    const desktopSidebar = container.querySelector('aside')
    const content = desktopSidebar?.firstElementChild

    expect(desktopSidebar).toHaveClass('h-[calc(100dvh-2.5rem)]', 'overflow-hidden', 'lg:flex')
    expect(content).toHaveClass('min-h-0', 'overflow-y-auto', 'overflow-x-hidden')
  })

  it('highlights Settings and keeps the other navigation actions functional', () => {
    const onNavigateSettings = vi.fn()
    const onNavigateNotes = vi.fn()

    render(
      <Sidebar
        active="settings"
        mobileOpen={false}
        onCloseMobile={() => undefined}
        onNavigateSettings={onNavigateSettings}
        onNavigateNotes={onNavigateNotes}
      />,
    )

    const settings = screen.getByRole('button', { name: 'Settings' })
    expect(settings).toHaveAttribute('aria-current', 'page')

    fireEvent.click(settings)
    fireEvent.click(screen.getByRole('button', { name: 'Notes' }))

    expect(onNavigateSettings).toHaveBeenCalledOnce()
    expect(onNavigateNotes).toHaveBeenCalledOnce()
  })
})
