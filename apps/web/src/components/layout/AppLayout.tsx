import { useState, type ReactNode } from 'react'
import { MenuIcon } from './icons'
import { Sidebar, type SidebarNavHandlers, type SidebarPage } from './Sidebar'

type AppLayoutProps = SidebarNavHandlers & {
  active: SidebarPage
  panelTitle: string
  panelCaption: string
  panelPercent: number
  fab?: ReactNode
  children: ReactNode
}

export function AppLayout({ active, panelTitle, panelCaption, panelPercent, fab, children, ...nav }: AppLayoutProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className="min-h-screen bg-[var(--bp-bg)] text-[var(--bp-text)]">
      <div className="mx-auto flex max-w-7xl gap-6 px-6 py-6">
        <Sidebar
          active={active}
          panelTitle={panelTitle}
          panelCaption={panelCaption}
          panelPercent={panelPercent}
          mobileOpen={mobileNavOpen}
          onCloseMobile={() => setMobileNavOpen(false)}
          {...nav}
        />

        <main className="flex-1 animate-[beeplanFadeIn_300ms_ease-out] rounded-[20px] border border-[var(--bp-border)] bg-[var(--bp-surface)]/40 p-6">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open menu"
            className="mb-4 flex items-center gap-2 rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-3 py-2 text-sm font-semibold text-[var(--bp-text)] lg:hidden"
          >
            <MenuIcon className="h-5 w-5" />
            Menu
          </button>

          {children}
        </main>
      </div>

      {fab}
    </div>
  )
}
