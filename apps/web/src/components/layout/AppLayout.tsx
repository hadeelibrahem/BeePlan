import type { ReactNode } from 'react'
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
  return (
    <div className="min-h-screen bg-[var(--bp-bg)] text-[var(--bp-text)]">
      <div className="mx-auto flex max-w-7xl gap-6 px-6 py-6">
        <Sidebar active={active} panelTitle={panelTitle} panelCaption={panelCaption} panelPercent={panelPercent} {...nav} />

        <main className="flex-1 animate-[beeplanFadeIn_300ms_ease-out] rounded-[20px] border border-[var(--bp-border)] bg-[var(--bp-surface)]/40 p-6">
          {children}
        </main>
      </div>

      {fab}
    </div>
  )
}
