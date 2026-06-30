import type { ReactNode } from 'react'
import { BeePlanLogo } from '../BeePlanLogo'
import {
  AnalyticsIcon,
  CalendarIcon,
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
}

const NAV_ITEMS: { page: SidebarPage; label: string; Icon: typeof DashboardIcon; handler: keyof SidebarNavHandlers }[] = [
  { page: 'dashboard', label: 'Dashboard', Icon: DashboardIcon, handler: 'onNavigateDashboard' },
  { page: 'tasks', label: 'Tasks', Icon: TasksIcon, handler: 'onNavigateTasks' },
  { page: 'reminders', label: 'Reminders', Icon: RemindersIcon, handler: 'onNavigateReminders' },
  { page: 'calendar', label: 'Calendar', Icon: CalendarIcon, handler: 'onNavigateCalendar' },
  { page: 'notes', label: 'Notes', Icon: NotesIcon, handler: 'onNavigateNotes' },
  { page: 'analytics', label: 'Analytics', Icon: AnalyticsIcon, handler: 'onNavigateAnalytics' },
]

export function Sidebar({ active, panelTitle, panelCaption, panelPercent, ...nav }: SidebarProps) {
  return (
    <aside className="hidden w-64 shrink-0 rounded-[20px] border border-[var(--bp-border)] bg-[var(--bp-surface)]/80 p-4 lg:block">
      <div className="mb-8 flex items-center gap-3 px-2">
        <BeePlanLogo showTagline size={48} />
      </div>

      <nav className="space-y-1 text-sm">
        {NAV_ITEMS.map(({ page, label, Icon, handler }) => (
          <SideItem key={page} active={active === page} icon={<Icon />} label={label} onClick={nav[handler]} />
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
    </aside>
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
      className={`group relative flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-all duration-150 ${
        active ? 'bg-[var(--bp-accent)]/15 text-[var(--bp-accent)]' : 'text-slate-300 hover:translate-x-0.5 hover:bg-[var(--bp-bg)] hover:text-[var(--bp-text)]'
      }`}
    >
      {active && <span className="absolute inset-y-1 left-0 w-1 rounded-full bg-[var(--bp-accent)]" />}
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
