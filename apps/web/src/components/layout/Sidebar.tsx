import type { ReactNode } from 'react'
import { BeePlanLogo } from '../BeePlanLogo'
import {
  AnalyticsIcon,
  CalendarIcon,
  CloseIcon,
  DashboardIcon,
  FocusIcon,
  NotesIcon,
  PeopleIcon,
  PlannerIcon,
  RemindersIcon,
  TasksIcon,
} from './icons'

export type SidebarPage =
  | 'dashboard'
  | 'tasks'
  | 'focus'
  | 'planner'
  | 'reminders'
  | 'people'
  | 'notifications'
  | 'calendar'
  | 'notes'
  | 'analytics'
  | 'settings'
  | 'timeCapsules'
  | 'whiteboard'
  | 'whiteboards'
  | 'achievements'

export type SidebarNavHandlers = {
  onNavigateDashboard?: () => void
  onNavigateTasks?: () => void
  onNavigateFocus?: () => void
  onNavigatePlanner?: () => void
  onNavigateReminders?: () => void
  onNavigatePeople?: () => void
  onNavigateNotifications?: () => void
  onNavigateCalendar?: () => void
  onNavigateNotes?: () => void
  onNavigateAnalytics?: () => void
  onNavigateSettings?: () => void
  onNavigateTimeCapsules?: () => void
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-[18px] w-[18px]" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-[18px] w-[18px]" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l-.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

type SidebarProps = SidebarNavHandlers & {
  active: SidebarPage
  panelTitle?: string
  panelCaption?: string
  panelPercent?: number
  mobileOpen?: boolean
  onCloseMobile?: () => void
}

const NAV_GROUPS = [
  {
    title: 'MAIN',
    items: [
      { page: 'dashboard', label: 'Dashboard', Icon: DashboardIcon, handler: 'onNavigateDashboard' },
      { page: 'tasks', label: 'Tasks', Icon: TasksIcon, handler: 'onNavigateTasks' },
      { page: 'focus', label: 'Focus', Icon: FocusIcon, handler: 'onNavigateFocus' },
      { page: 'planner', label: 'AI Planner', Icon: PlannerIcon, handler: 'onNavigatePlanner' },
    ]
  },
  {
    title: 'WORKSPACE',
    items: [
      { page: 'reminders', label: 'Reminders', Icon: RemindersIcon, handler: 'onNavigateReminders' },
      { page: 'calendar', label: 'Calendar', Icon: CalendarIcon, handler: 'onNavigateCalendar' },
      { page: 'notes', label: 'Notes', Icon: NotesIcon, handler: 'onNavigateNotes' },
      { page: 'timeCapsules', label: 'Time Capsule', Icon: CalendarIcon, handler: 'onNavigateTimeCapsules' },
      { page: 'people', label: 'People', Icon: PeopleIcon, handler: 'onNavigatePeople' },
    ]
  },
  {
    title: 'SYSTEM',
    items: [
      { page: 'notifications', label: 'Notifications', Icon: BellIcon, handler: 'onNavigateNotifications' },
      { page: 'analytics', label: 'Analytics', Icon: AnalyticsIcon, handler: 'onNavigateAnalytics' },
      { page: 'settings', label: 'Settings', Icon: SettingsIcon, handler: 'onNavigateSettings' },
    ]
  }
] as const

export function Sidebar({ active, panelTitle, panelCaption, panelPercent, mobileOpen, onCloseMobile, ...nav }: SidebarProps) {
  return (
    <>
      {/* Desktop Sidebar: full-height, 230px, flex column */}
      <aside className="bp-sidebar sticky top-0 hidden h-screen w-[230px] shrink-0 flex-col border-r border-white/5 bg-slate-900/35 lg:flex shadow-[8px_0_18px_rgba(0,0,0,0.08)]">
        <SidebarContent active={active} panelTitle={panelTitle} panelCaption={panelCaption} panelPercent={panelPercent} nav={nav} />
      </aside>

      {/* Mobile Drawer Sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-[beeplanFadeIn_150ms_ease-out]" onClick={onCloseMobile} />
          <aside className="bp-sidebar-drawer absolute inset-y-0 start-0 w-[230px] max-w-[85vw] animate-[beeplanFadeIn_200ms_ease-out] border-r border-white/5 bg-slate-900 flex flex-col">
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
  panelTitle?: string
  panelCaption?: string
  panelPercent?: number
  nav: SidebarNavHandlers
  onNavigate?: () => void
}) {
  return (
    <div className="relative flex h-full min-h-0 flex-col py-0">
      {/* Logo container section - aligns perfectly with the h-16 main header bar */}
      <div className="bp-sidebar-logo flex h-16 shrink-0 items-center justify-between border-b border-white/5 bg-slate-900/10 px-5">
        <div className="flex items-center gap-3">
          <BeePlanLogo showTagline={false} size={30} />
          <span className="bp-sidebar-brand text-[17px] leading-none tracking-[-0.02em]">
            <span className="bp-sidebar-brand-bee font-semibold">Bee</span><span className="bp-sidebar-brand-plan font-bold">Plan</span>
          </span>
        </div>
        {onNavigate && (
          <button
            type="button"
            onClick={onNavigate}
            aria-label="Close menu"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden transition-colors"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Navigation list (hides vertical scrollbar using tailwind utilities) */}
      <nav className="flex-1 space-y-4 overflow-y-auto px-5 pr-4 text-sm [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] mt-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="space-y-1">
            <div className="bp-sidebar-group px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500/60">
              {group.title}
            </div>
            <div className="space-y-1.5">
              {group.items.map(({ page, label, Icon, handler }) => (
                <SidebarNavItem
                  key={page}
                  page={page}
                  beeTarget
                  active={active === page}
                  icon={<Icon />}
                  label={label}
                  onClick={() => {
                    nav[handler]?.()
                    onNavigate?.()
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom progress widget aligned cleanly at the bottom using mt-auto */}
      {panelPercent !== undefined ? (
        <div className="bp-sidebar-progress mt-auto mb-3 mx-4 p-3 rounded-xl border border-white/8 bg-slate-950/30 shadow-lg shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-200 truncate">{panelTitle}</p>
              <p className="mt-0.5 text-[10px] text-slate-400 font-medium truncate">{panelCaption}</p>
            </div>

            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center">
              <svg className="absolute inset-0 h-full w-full transform -rotate-90">
                <circle
                  cx="18"
                  cy="18"
                  r="15"
                  className="stroke-slate-800"
                  strokeWidth="3"
                  fill="transparent"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="15"
                  className="stroke-[#FDEF4B]"
                  strokeWidth="3"
                  fill="transparent"
                  strokeDasharray={94.2}
                  strokeDashoffset={94.2 - (94.2 * (panelPercent ?? 0)) / 100}
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-[9px] font-black text-[#FDEF4B]">{panelPercent}%</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function SidebarNavItem({
  page,
  beeTarget,
  icon,
  label,
  active,
  onClick,
}: {
  page?: SidebarPage
  beeTarget?: boolean
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
      data-sidebar-page={page}
      data-bee-target={beeTarget ? 'true' : undefined}
      className={`bp-sidebar-nav-item group relative flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-[14px] px-3 py-2.5 text-start transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FDEF4B] focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
        active
          ? 'bg-[#FDEF4B]/12 text-[#FDEF4B] shadow-[0_4px_14px_rgba(253,239,75,0.08)]'
          : 'text-slate-400 hover:bg-slate-800/40 hover:text-white'
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-[#FDEF4B] rounded-r shadow-[0_0_12px_rgba(253,239,75,0.65)]" />
      )}
      <span className={`bp-sidebar-icon flex shrink-0 items-center justify-center ${active ? 'text-[#FDEF4B]' : 'text-slate-500 group-hover:text-slate-300 transition-colors'}`}>
        {icon}
      </span>
      <span className={`text-[13px] leading-5 ${active ? 'font-semibold' : 'font-medium'}`}>{label}</span>
    </button>
  )
}
