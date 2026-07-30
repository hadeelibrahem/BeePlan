import { useState, type ReactNode } from 'react'
import { Sidebar, type SidebarNavHandlers, type SidebarPage } from './Sidebar'
import { GlobalHeader } from './GlobalHeader'

type AppLayoutProps = SidebarNavHandlers & {
  active: SidebarPage
  panelTitle?: string
  panelCaption?: string
  panelPercent?: number
  fab?: ReactNode
  children: ReactNode
}

export function AppLayout({ active, panelTitle, panelCaption, panelPercent, fab, children, ...nav }: AppLayoutProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className="bp-app-layout flex h-screen w-screen overflow-hidden bg-[#1A1F2C] text-[var(--bp-text)]">
      <Sidebar
        active={active}
        panelTitle={panelTitle}
        panelCaption={panelCaption}
        panelPercent={panelPercent}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
        {...nav}
      />

      <div className="flex-1 flex flex-col h-screen min-w-0 overflow-hidden">
        <GlobalHeader onOpenMenu={() => setMobileNavOpen(true)} onOpenNotifications={nav.onNavigateNotifications} onOpenSettings={nav.onNavigateSettings} />

        <main className="flex-1 overflow-y-auto min-w-0 animate-[beeplanFadeIn_300ms_ease-out] px-4 py-3 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>

      {fab}
    </div>
  )
}
