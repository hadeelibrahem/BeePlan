import type { ReactNode } from 'react'
import { BeePlanLogo } from '../BeePlanLogo'
import {
  AnalyticsIcon,
  CalendarIcon,
  CloseIcon,
  DashboardIcon,
  NotesIcon,
  RemindersIcon,
  TasksIcon,
} from './icons'

export type SidebarPage = 'dashboard' | 'tasks' | 'reminders' | 'calendar' | 'notes' | 'analytics'

export type SidebarNavHandlers = {
  onNavigateDashboard?: () => void
  onNavigateTasks?: () => void
  onNavigateReminders?: () => void
  onNavigateCalendar?: () => void
  onNavigateNotes?: () => void
  onNavigateAnalytics?: () => void
}

type SidebarProps = SidebarNavHandlers & {
  active: SidebarPage
  panelTitle: string
  panelCaption: string
  panelPercent: number
  mobileOpen?: boolean
  onCloseMobile?: () => void
}

const NAV_ITEMS: { page: SidebarPage; label: string; Icon: typeof DashboardIcon; handler: keyof SidebarNavHandlers }[] = [
  { page: 'dashboard', label: 'Dashboard', Icon: DashboardIcon, handler: 'onNavigateDashboard' },
  { page: 'tasks', label: 'Tasks', Icon: TasksIcon, handler: 'onNavigateTasks' },
  { page: 'reminders', label: 'Reminders', Icon: RemindersIcon, handler: 'onNavigateReminders' },
  { page: 'calendar', label: 'Calendar', Icon: CalendarIcon, handler: 'onNavigateCalendar' },
  { page: 'notes', label: 'Notes', Icon: NotesIcon, handler: 'onNavigateNotes' },
  { page: 'analytics', label: 'Analytics', Icon: AnalyticsIcon, handler: 'onNavigateAnalytics' },
]

export function Sidebar({ active, panelTitle, panelCaption, panelPercent, mobileOpen, onCloseMobile, ...nav }: SidebarProps) {
  return (
    <>
      <aside className="hidden w-64 shrink-0 rounded-[20px] border border-[var(--bp-border)] bg-[var(--bp-surface)]/80 p-4 lg:block">
        <SidebarContent active={active} panelTitle={panelTitle} panelCaption={panelCaption} panelPercent={panelPercent} nav={nav} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={onCloseMobile} />
          <aside className="absolute inset-y-0 start-0 w-72 max-w-[85vw] animate-[beeplanFadeIn_200ms_ease-out] overflow-y-auto border-e border-[var(--bp-border)] bg-[var(--bp-surface)] p-4">
            <div className="mb-4 flex items-center justify-end">
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Close menu"
                className="rounded-lg p-2 text-slate-300 hover:bg-[var(--bp-bg)] hover:text-[var(--bp-text)]"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>
            <SidebarContent
              active={active}
              panelTitle={panelTitle}
              panelCaption={panelCaption}
              panelPercent={panelPercent}
              nav={nav}
              onNavigate={onCloseMobile}
            />
          </aside>
        </div>
      )}
    </>
  )
}

function SidebarContent({
  active,
  panelTitle,
  panelCaption,
  panelPercent,
  nav,
  onNavigate,
}: {
  active: SidebarPage
  panelTitle: string
  panelCaption: string
  panelPercent: number
  nav: SidebarNavHandlers
  onNavigate?: () => void
}) {
  return (
    <>
      <div className="mb-8 flex items-center gap-3 px-2">
        <BeePlanLogo showTagline size={48} />
      </div>

      <nav className="space-y-1 text-sm">
        {NAV_ITEMS.map(({ page, label, Icon, handler }) => (
          <SideItem
            key={page}
            active={active === page}
            icon={<Icon />}
            label={label}
            onClick={() => {
              nav[handler]?.()
              onNavigate?.()
            }}
          />
        ))}
      </nav>

      <div className="mt-10">
        <p className="mb-3 px-4 text-xs font-bold uppercase tracking-wide text-slate-400">Categories</p>
        <CategoryDot label="Work" color="bg-blue-400" />
        <CategoryDot label="Personal" color="bg-purple-400" />
        <CategoryDot label="Study" color="bg-green-400" />
        <CategoryDot label="Health" color="bg-red-400" />
        <CategoryDot label="Finance" color="bg-[var(--bp-accent)]" />
      </div>

      <div className="mt-16 rounded-2xl bg-[var(--bp-bg)] p-4">
        <p className="font-bold">{panelTitle}</p>
        <p className="mt-1 text-xs text-slate-400">{panelCaption}</p>
        <div className="mt-4 flex h-20 w-20 items-center justify-center rounded-full border-4 border-[var(--bp-accent)] font-black text-[var(--bp-accent)]">
          {panelPercent}%
        </div>
      </div>
    </>
  )
}

function SideItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: ReactNode
  label: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`group relative flex w-full items-center gap-3 rounded-xl px-4 py-3 text-start transition-all duration-150 ${
        active ? 'bg-[var(--bp-accent)]/15 text-[var(--bp-accent)]' : 'text-slate-300 hover:translate-x-0.5 hover:bg-[var(--bp-bg)] hover:text-[var(--bp-text)]'
      }`}
    >
      {active && <span className="absolute inset-y-1 start-0 w-1 rounded-full bg-[var(--bp-accent)]" />}
      <span className={active ? 'text-[var(--bp-accent)]' : 'text-slate-400 transition-colors group-hover:text-[var(--bp-text)]'}>{icon}</span>
      <span className="font-semibold">{label}</span>
    </button>
  )
}

function CategoryDot({ label, color }: { label: string; color: string }) {
  return (
    <div className="mb-3 flex items-center gap-3 px-4 text-sm text-slate-300">
      <span className={`h-3 w-3 rounded-full ${color}`} />
      {label}
    </div>
  )
}
