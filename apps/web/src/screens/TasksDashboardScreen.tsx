import type { ReactNode } from 'react'
import {
  AnalyticsIcon,
  AppLayout,
  CalendarIcon,
  FloatingActionButton,
  PageHeader,
  RemindersIcon,
  SectionCard,
  StatsCard,
  TasksIcon,
  TopActionBar,
  type SidebarNavHandlers,
} from '../components/layout'
import { useLanguage } from '../i18n/LanguageContext'
import { useTheme } from '../theme/ThemeContext'
import type { Reminder } from '../features/reminders'
import type { DashboardSummary } from '../lib/tasksApi'

type TasksDashboardScreenProps = SidebarNavHandlers & {
  reminders: Reminder[]
  summary?: DashboardSummary | null
  summaryLoading?: boolean
  summaryError?: string
  onRetrySummary?: () => void
  onViewReminders: () => void
  onViewTasks: () => void
  onSignOut?: () => void
}

export default function TasksDashboardScreen({
  reminders,
  summary = null,
  summaryLoading = false,
  summaryError = '',
  onRetrySummary,
  onViewReminders,
  onViewTasks,
  onSignOut,
  ...nav
}: TasksDashboardScreenProps) {
  const { t, toggleLanguage, isRTL } = useLanguage()
  const { mode, toggleTheme } = useTheme()
  const isLoading = summaryLoading && !summary
  const loadingLabel = '…'
  const todayTasksValue = isLoading ? loadingLabel : String(summary?.todayTasks ?? 0)
  const completedValue = isLoading ? loadingLabel : String(summary?.completedTasks ?? 0)
  const highPriorityValue = isLoading ? loadingLabel : String(summary?.highPriorityTasks ?? 0)
  const remindersValue = isLoading ? loadingLabel : String(summary?.reminders ?? reminders.length)
  const totalTasks = summary?.totalTasks ?? 0
  const completedTasks = summary?.completedTasks ?? 0
  const overallProgress = summary?.overallProgress ?? 0

  return (
    <AppLayout
      active="dashboard"
      onNavigateTasks={onViewTasks}
      onNavigateFocus={nav.onNavigateFocus}
      onNavigateReminders={onViewReminders}
      onNavigateCalendar={nav.onNavigateCalendar}
      onNavigateNotes={nav.onNavigateNotes}
      onNavigateAnalytics={nav.onNavigateAnalytics}
      panelTitle="Keep going!"
      panelCaption="You're doing great today."
      panelPercent={64}
      fab={<FloatingActionButton onClick={onViewTasks} />}
    >
      <PageHeader
        title="Dashboard"
        subtitle="Smart productivity dashboard"
        toolbar={
          <TopActionBar
            searchValue=""
            onSearchChange={() => {}}
            themeMode={mode}
            onToggleTheme={toggleTheme}
            languageLabel={t('common.languageToggle')}
            onToggleLanguage={toggleLanguage}
            onProfileClick={onSignOut}
          />
        }
      />

      {summaryError ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
          <p className="text-xs font-semibold text-red-300">{summaryError}</p>
          {onRetrySummary ? (
            <button
              type="button"
              onClick={onRetrySummary}
              disabled={summaryLoading}
              className="text-xs font-bold text-[var(--bp-accent)] hover:underline disabled:cursor-not-allowed disabled:opacity-60"
            >
              {summaryLoading ? 'Retrying…' : 'Retry'}
            </button>
          ) : null}
        </div>
      ) : null}

      <section className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <StatsCard icon={<TasksIcon className="h-4 w-4" />} value={todayTasksValue} title="Today's Tasks" desc="Tasks planned for today" />
        <StatsCard icon={<TasksIcon className="h-4 w-4" />} value={completedValue} title="Completed" desc="Tasks you've completed" />
        <StatsCard icon={<AnalyticsIcon className="h-4 w-4" />} value={highPriorityValue} title="High Priority" desc="Important tasks to focus on" />
        <StatsCard
          icon={<RemindersIcon className="h-4 w-4" />}
          value={remindersValue}
          title="Reminders"
          desc="Smart reminders synced"
        />
      </section>

      <SectionCard className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold">Overall Progress</h2>
            <p className="text-xs text-slate-400">You're doing great! Keep it up.</p>
          </div>
          <div className="flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-[var(--bp-accent)] text-sm font-black text-[var(--bp-accent)]">
            {isLoading ? loadingLabel : `${overallProgress}%`}
          </div>
        </div>

        <div className="mt-4 h-2 rounded-full bg-[var(--bp-bg)]">
          <div className="h-2 rounded-full bg-[var(--bp-accent)]" style={{ width: `${overallProgress}%` }} />
        </div>

        <div className="mt-2 flex justify-between text-xs text-slate-400">
          <span>{completedTasks} completed</span>
          <span>{totalTasks} total tasks</span>
        </div>
      </SectionCard>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <SectionCard>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold">Today's Focus</h2>
            <button type="button" onClick={onViewTasks} className="text-xs font-bold text-[var(--bp-accent)]">
              View All {isRTL ? '<' : '>'}
            </button>
          </div>

          <FocusTask title="Finalize Q3 marketing strategy" time="10:00 AM" color="bg-red-400" />
          <FocusTask title="Review design mockups for mobile app" time="1:30 PM" color="bg-orange-400" />
          <FocusTask title="Team sync - weekly standup" time="9:00 AM" color="bg-[var(--bp-accent)]" done />
          <FocusTask title="Update project documentation" time="4:00 PM" color="bg-slate-400" />
        </SectionCard>

        <SectionCard>
          <h2 className="mb-3 text-sm font-bold">Quick Actions</h2>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ActionCard icon={<TasksIcon className="h-4 w-4" />} title="New Task" desc="Create a new task" onClick={onViewTasks} />
            <ActionCard icon={<RemindersIcon className="h-4 w-4" />} title="New Reminder" desc="Add a reminder" onClick={onViewReminders} />
            <ActionCard icon={<CalendarIcon className="h-4 w-4" />} title="View Calendar" desc="See your schedule" onClick={nav.onNavigateCalendar} />
            <ActionCard icon={<TasksIcon className="h-4 w-4" />} title="All Tasks" desc="View all tasks" onClick={onViewTasks} />
          </div>
        </SectionCard>
      </section>
    </AppLayout>
  )
}

function FocusTask({
  title,
  time,
  color,
  done,
}: {
  title: string
  time: string
  color: string
  done?: boolean
}) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <div className={`h-4 w-4 rounded-full border ${done ? 'border-[var(--bp-accent)] bg-[var(--bp-accent)]' : 'border-slate-500'}`} />
      <div className="flex-1">
        <p className={`text-sm font-semibold ${done ? 'text-slate-500 line-through' : ''}`}>{title}</p>
        <p className="text-xs text-slate-400">{time}</p>
      </div>
      <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
    </div>
  )
}

function ActionCard({
  icon,
  title,
  desc,
  onClick,
}: {
  icon: ReactNode
  title: string
  desc: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-bg)] p-3 text-start transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--bp-accent)]/40"
    >
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bp-accent)]/15 text-[var(--bp-accent)]">{icon}</div>
      <h3 className="text-sm font-bold">{title}</h3>
      <p className="text-xs text-slate-400">{desc}</p>
    </button>
  )
}
