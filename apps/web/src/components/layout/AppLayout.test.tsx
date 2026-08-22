import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { AppLayout } from './AppLayout'
import { FloatingActionButton } from './FloatingActionButton'
import { LanguageProvider } from '../../i18n/LanguageContext'

vi.mock('./GlobalHeader', () => ({ GlobalHeader: () => null }))

function renderShell(ui: ReactNode) {
  return render(<LanguageProvider>{ui}</LanguageProvider>)
}

describe('shared app shell', () => {
  it('keeps one sidebar mounted while the route content changes', () => {
    const { container, rerender } = renderShell(
      <AppLayout active="tasks">
        <div>Dashboard content</div>
      </AppLayout>,
    )
    const sidebar = container.querySelector('.bp-sidebar')

    rerender(
      <LanguageProvider>
        <AppLayout active="tasks"><div>Tasks content</div></AppLayout>
      </LanguageProvider>,
    )

    expect(screen.getByText('Tasks content')).toBeInTheDocument()
    expect(container.querySelector('.bp-sidebar')).toBe(sidebar)
    expect(container.querySelectorAll('[data-sidebar-page]').length).toBeGreaterThan(1)
    expect(screen.getByRole('button', { name: 'Tasks' })).toHaveAttribute('aria-current', 'page')
  })

  it('renders nested screen layouts as content without duplicating the canonical sidebar', () => {
    const { container } = renderShell(
      <AppLayout active="tasks">
        <AppLayout active="tasks" panelTitle="Today" panelCaption="Your next best action." panelPercent={50}>
          <div aria-busy="true">Loading page content</div>
        </AppLayout>
      </AppLayout>,
    )

    expect(container.querySelectorAll('aside.bp-sidebar, aside.bp-sidebar-drawer')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Tasks' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Tasks' })).not.toBeDisabled()
    expect(screen.getByText('Today')).toBeInTheDocument()
  })

  it('keeps a nested page floating action mounted', () => {
    renderShell(
      <AppLayout active="tasks">
        <AppLayout active="tasks" fab={<FloatingActionButton ariaLabel="Add Task" />}>
          <div>Tasks content</div>
        </AppLayout>
      </AppLayout>,
    )

    const fab = screen.getByRole('button', { name: 'Add Task' })
    expect(fab).toBeInTheDocument()
    expect(fab.parentElement).toBe(document.body)
  })
})
