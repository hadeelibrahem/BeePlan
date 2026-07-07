import type { ReactNode } from 'react'
import { BeePlanLogo } from '../BeePlanLogo'
import {
  AnalyticsIcon,
  CalendarIcon,
  CloseIcon,
  DashboardIcon,
  FocusIcon,
  NotesIcon,
  PlannerIcon,
  RemindersIcon,
  TasksIcon,
} from './icons'

export type SidebarPage = 'dashboard' | 'tasks' | 'focus' | 'planner' | 'reminders' | 'calendar' | 'notes' | 'analytics'

export type SidebarNavHandlers = {
  onNavigateDashboard?: () => void
  onNavigateTasks?: () => void
  onNavigateFocus?: () => void
  onNavigatePlanner?: () => void
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
  { page: 'focus', label: 'Focus', Icon: FocusIcon, handler: 'onNavigateFocus' },
  { page: 'planner', label: 'AI Planner', Icon: PlannerIcon, handler: 'onNavigatePlanner' },
  { page: 'reminders', label: 'Reminders', Icon: RemindersIcon, handler: 'onNavigateReminders' },
  { page: 'calendar', label: 'Calendar', Icon: CalendarIcon, handler: 'onNavigateCalendar' },
  { page: 'notes', label: 'Notes', Icon: NotesIcon, handler: 'onNavigateNotes' },
  { page: 'analytics', label: 'Analytics', Icon: AnalyticsIcon, handler: 'onNavigateAnalytics' },
]

export function Sidebar({ active, panelTitle, panelCaption, panelPercent, mobileOpen, onCloseMobile, ...nav }: SidebarProps) {
  return (
    <>
      <aside className="hidden w-48 shrink-0 rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)]/80 p-3 lg:block">
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
      <div className="mb-5 flex items-center gap-2 px-1">
        <BeePlanLogo showTagline size={34} />
      </div>

      <nav className="space-y-0.5 text-sm">
        {NAV_ITEMS.map(({ page, label, Icon, handler }) => (
          <SidebarNavItem
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

      <div className="mt-6">
        <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">Categories</p>
        <CategoryDot label="Work" color="bg-blue-400" />
        <CategoryDot label="Personal" color="bg-purple-400" />
        <CategoryDot label="Study" color="bg-green-400" />
        <CategoryDot label="Health" color="bg-red-400" />
        <CategoryDot label="Finance" color="bg-[var(--bp-accent)]" />
      </div>

      <div className="mt-6 rounded-xl bg-[var(--bp-bg)] p-3">
        <p className="text-xs font-bold">{panelTitle}</p>
        <p className="mt-0.5 text-[11px] text-slate-400">{panelCaption}</p>
        <div className="mx-auto mt-3 flex h-12 w-12 items-center justify-center rounded-full border-[3px] border-[var(--bp-accent)] text-xs font-black text-[var(--bp-accent)]">
          {panelPercent}%
        </div>
      </div>
    </>
  )
}

/**
 * Reusable, fully-clickable sidebar/nav row. The `<button>` is the root
 * element so the icon, label, empty space, background, and hover state all
 * share one click/hover/focus target instead of being scoped to the icon or
 * text alone.
 */
export function SidebarNavItem({
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
      className={`group relative flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-start transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bp-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bp-surface)] ${
        active ? 'bg-[var(--bp-accent)]/15 text-[var(--bp-accent)]' : 'text-slate-300 hover:translate-x-0.5 hover:bg-[var(--bp-bg)] hover:text-[var(--bp-text)]'
      }`}
    >
      {active && <span className="absolute inset-y-1 start-0 w-1 rounded-full bg-[var(--bp-accent)]" />}
      <span className={active ? 'text-[var(--bp-accent)]' : 'text-slate-400 transition-colors group-hover:text-[var(--bp-text)]'}>{icon}</span>
      <span className="text-[13px] font-semibold">{label}</span>
    </button>
  )
}

function CategoryDot({ label, color }: { label: string; color: string }) {
  return (
    <div className="mb-2 flex items-center gap-2.5 px-3 text-[13px] text-slate-300">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      {label}
    </div>
  )
}
