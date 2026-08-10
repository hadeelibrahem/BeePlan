import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Sidebar, type SidebarNavHandlers, type SidebarPage } from './Sidebar'
import { GlobalHeader } from './GlobalHeader'

type AppLayoutProps = SidebarNavHandlers & {
  active: SidebarPage
  panelTitle?: string
  panelCaption?: string
  panelPercent?: number
  fab?: ReactNode
  focusMode?: boolean
  children: ReactNode
}

type SidebarMeta = Pick<AppLayoutProps, 'panelTitle' | 'panelCaption' | 'panelPercent'>
type AppShellContextValue = {
  setSidebarMeta: (meta: SidebarMeta | undefined) => void
}

const AppShellContext = createContext<AppShellContextValue | null>(null)

export function AppLayout({ active, panelTitle, panelCaption, panelPercent, fab, focusMode = false, children, ...nav }: AppLayoutProps) {
  const parentShell = useContext(AppShellContext)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [nestedSidebarMeta, setNestedSidebarMeta] = useState<SidebarMeta | undefined>(undefined)

  useEffect(() => {
    if (!parentShell) return
    parentShell.setSidebarMeta({ panelTitle, panelCaption, panelPercent })
    return () => parentShell.setSidebarMeta(undefined)
  }, [panelCaption, panelPercent, panelTitle, parentShell])

  if (parentShell) return <>{children}</>

  const sidebarMeta = nestedSidebarMeta ?? { panelTitle, panelCaption, panelPercent }
  const shellContextValue = useMemo(() => ({ setSidebarMeta: setNestedSidebarMeta }), [])

  return (
    <AppShellContext.Provider value={shellContextValue}>
      <div className={`bp-app-layout flex h-screen w-screen overflow-hidden bg-[#1A1F2C] text-[var(--bp-text)] ${focusMode ? 'fixed inset-0 z-[60]' : ''}`}>
        <div className={focusMode ? 'hidden' : 'contents'}>
          <Sidebar
            active={active}
            panelTitle={sidebarMeta.panelTitle}
            panelCaption={sidebarMeta.panelCaption}
            panelPercent={sidebarMeta.panelPercent}
            mobileOpen={mobileNavOpen}
            onCloseMobile={() => setMobileNavOpen(false)}
            {...nav}
          />
        </div>

        <div className="flex-1 flex flex-col h-screen min-w-0 overflow-hidden">
          <div className={focusMode ? 'hidden' : 'contents'}>
            <GlobalHeader onOpenMenu={() => setMobileNavOpen(true)} onOpenNotifications={nav.onNavigateNotifications} onOpenSettings={nav.onNavigateSettings} />
          </div>

          <main className={`flex min-h-0 flex-1 min-w-0 flex-col animate-[beeplanFadeIn_300ms_ease-out] ${active === 'achievements' ? 'achievement-museum-room' : ''} ${focusMode ? 'overflow-hidden p-0' : 'overflow-y-auto px-4 py-3 sm:px-6 lg:px-8'}`}>
            {children}
          </main>
        </div>

        {fab}
      </div>
    </AppShellContext.Provider>
  )
}
