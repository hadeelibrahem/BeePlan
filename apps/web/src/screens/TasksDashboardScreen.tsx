import { useMemo, useState, type ReactNode } from 'react'
import {
  AnalyticsIcon,
  AppLayout,
  CalendarIcon,
  DirectionalChevron,
  FocusIcon,
  FloatingActionButton,
  PageHeader,
  RemindersIcon,
  SectionCard,
  StatsCard,
  TasksIcon,
  TopActionBar,
  type SidebarNavHandlers,
} from '../components/layout'
import RecurrenceSuggestionCard from '../components/RecurrenceSuggestionCard'
import { AddTaskModeChooser } from '../components/AddTaskModeChooser'
import { SharedBadge } from '../features/collaboration/components/SharedBadge'
import { useLanguage } from '../i18n/LanguageContext'
import { useTheme } from '../theme/ThemeContext'
import type { Reminder } from '../features/reminders'
import type { ApiTask, DashboardSummary, RecurrenceSuggestion } from '../lib/tasksApi'

type TasksDashboardScreenProps = SidebarNavHandlers & {
  reminders: Reminder[]
  tasks?: ApiTask[]
  summary?: DashboardSummary | null
  summaryLoading?: boolean
  summaryError?: string
  tasksLoading?: boolean
  recurrenceSuggestions?: RecurrenceSuggestion[]
  sharedTaskIds?: Set<string>
  onRetrySummary?: () => void
  onViewReminders: () => void
  onViewTasks: () => void
  onCreateTask?: () => void
  onCreateTaskAi?: () => void
  onCreateReminder?: () => void
  onViewTaskDetails?: (taskId: string) => void
  onMakeRecurringSuggestion?: (suggestion: RecurrenceSuggestion) => void
  onDismissRecurrenceSuggestion?: (suggestion: RecurrenceSuggestion) => void
  onSignOut?: () => void
}

export default function TasksDashboardScreen({
  reminders,
  tasks = [],
  summary = null,
  summaryLoading = false,
  summaryError = '',
  tasksLoading = false,
  recurrenceSuggestions = [],
  sharedTaskIds,
  onRetrySummary,
  onViewReminders,
  onViewTasks,
  onCreateTask,
  onCreateTaskAi,
  onCreateReminder,
  onViewTaskDetails,
  onMakeRecurringSuggestion,
  onDismissRecurrenceSuggestion,
  onSignOut,
  ...nav
}: TasksDashboardScreenProps) {
  const { t, toggleLanguage, isRTL } = useLanguage()
  const { mode, toggleTheme } = useTheme()
  const [addTaskChooserOpen, setAddTaskChooserOpen] = useState(false)
  const isLoading = summaryLoading && !summary
  const loadingLabel = '...'
  const todayTasksValue = isLoading ? loadingLabel : String(summary?.todayTasks ?? 0)
  const completedValue = isLoading ? loadingLabel : String(summary?.completedTasks ?? 0)
  const highPriorityValue = isLoading ? loadingLabel : String(summary?.highPriorityTasks ?? 0)
  const remindersValue = isLoading ? loadingLabel : String(summary?.reminders ?? reminders.length)
  const totalTasks = summary?.totalTasks ?? 0
  const completedTasks = summary?.completedTasks ?? 0
  const overallProgress = summary?.overallProgress ?? 0
  const focusTasks = useMemo(() => getDashboardFocusTasks(tasks), [tasks])
  const isFocusLoading = tasksLoading && tasks.length === 0

  return (
    <AppLayout
      active="dashboard"
      {...nav}
      onNavigateTasks={onViewTasks}
      onNavigateReminders={onViewReminders}
      panelTitle="Keep going!"
      panelCaption="You're doing great today."
      panelPercent={overallProgress}
      fab={<FloatingActionButton onClick={() => setAddTaskChooserOpen(true)} />}
    >
      {addTaskChooserOpen ? (
        <AddTaskModeChooser
          onClose={() => setAddTaskChooserOpen(false)}
          onManual={() => {
            setAddTaskChooserOpen(false)
            onCreateTask?.()
          }}
          onAiPlan={() => {
            setAddTaskChooserOpen(false)
            onCreateTaskAi?.()
          }}
        />
      ) : null}
      <PageHeader
        title={t('taskUi.dashboard.title')}
        subtitle={t('taskUi.dashboard.subtitle')}
        toolbar={
          <TopActionBar
            themeMode={mode}
            onToggleTheme={toggleTheme}
            languageLabel={t('common.languageToggle')}
            onToggleLanguage={toggleLanguage}
            onOpenNotifications={nav.onNavigateNotifications}
            onSignOut={onSignOut}
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
              {summaryLoading ? 'Retrying...' : 'Retry'}
            </button>
          ) : null}
        </div>
      ) : null}

      {recurrenceSuggestions.length ? (
        <div className="mb-4 grid gap-3 lg:grid-cols-2">
          {recurrenceSuggestions.map((suggestion) => (
            <RecurrenceSuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              onMakeRecurring={(item) => onMakeRecurringSuggestion?.(item)}
              onDismiss={(item) => onDismissRecurrenceSuggestion?.(item)}
            />
          ))}
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
          <span className="text-lg font-black text-[var(--bp-accent)]">{isLoading ? loadingLabel : `${overallProgress}%`}</span>
        </div>

        <div role="progressbar" aria-label="Overall task progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={overallProgress} className="mt-4 h-2 rounded-full bg-[var(--bp-bg)]">
          <div className="h-2 rounded-full bg-[var(--bp-accent)]" style={{ width: `${overallProgress}%` }} />
        </div>

        <div className="mt-2 flex justify-between text-xs text-slate-400">
          <span>{completedTasks} completed</span>
          <span>{totalTasks} total tasks</span>
        </div>
      </SectionCard>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-[1.25fr_0.75fr]">
        <SectionCard>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold">Today's Focus</h2>
            <button type="button" onClick={onViewTasks} className="text-xs font-bold text-[var(--bp-accent)]">
              <span className="inline-flex items-center gap-1">View all <DirectionalChevron direction="forward" isRTL={isRTL} className="h-3.5 w-3.5" /></span>
            </button>
          </div>

          {isFocusLoading ? (
            <p className="py-8 text-center text-sm text-slate-400">Loading focus tasks...</p>
          ) : focusTasks.length ? (
            focusTasks.map((task) => (
              <FocusTask
                key={task.id}
                task={task}
                isShared={sharedTaskIds?.has(task.id) ?? false}
                onClick={onViewTaskDetails}
              />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--bp-accent)]/15 text-[var(--bp-accent)]">
                <FocusIcon className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold text-[var(--bp-text)]">No focus tasks for today.</p>
              <p className="mt-1 max-w-sm text-xs text-slate-400">
                Tasks due today, focus tasks, or high-priority tasks will appear here.
              </p>
            </div>
          )}
        </SectionCard>

        <SectionCard>
          <h2 className="mb-3 text-sm font-bold">Quick Actions</h2>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ActionCard icon={<TasksIcon className="h-4 w-4" />} title="New task" desc="Create a new task" onClick={() => setAddTaskChooserOpen(true)} />
            <ActionCard icon={<RemindersIcon className="h-4 w-4" />} title="New reminder" desc="Add a reminder" onClick={onCreateReminder ?? onViewReminders} />
            <ActionCard icon={<CalendarIcon className="h-4 w-4" />} title="View calendar" desc="See your schedule" onClick={nav.onNavigateCalendar} />
            <ActionCard icon={<TasksIcon className="h-4 w-4" />} title="All tasks" desc="View all tasks" onClick={onViewTasks} />
          </div>
        </SectionCard>
      </section>
    </AppLayout>
  )
}

function FocusTask({
  task,
  isShared,
  onClick,
}: {
  task: ApiTask
  isShared?: boolean
  onClick?: (taskId: string) => void
}) {
  const reason = getPrimaryFocusReason(task)
  const dueLabel = formatFocusDue(task)
  const reasonColor =
    reason === 'Due Today' ? 'bg-[var(--bp-accent)]' : reason === 'Focus' ? 'bg-purple-400' : 'bg-orange-400'

  const content = (
    <>
      <div className="h-4 w-4 shrink-0 rounded-full border border-slate-500" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-[var(--bp-text)]">
          <span className="truncate">{task.title}</span>
          {isShared ? <SharedBadge /> : null}
        </p>
        <p className="truncate text-xs text-slate-400">
          {task.category || 'General'}
          {dueLabel ? ` • ${dueLabel}` : ''}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${reasonColor}`} />
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{reason}</span>
      </div>
    </>
  )

  return onClick ? (
    <button type="button" onClick={() => onClick(task.id)} aria-label={`Open focus task: ${task.title}`} className="mb-3 flex w-full items-center gap-3 rounded-lg text-left transition hover:bg-[var(--bp-bg)] last:mb-0">
      {content}
    </button>
  ) : <div className="mb-3 flex items-center gap-3 last:mb-0">{content}</div>
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
      className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-bg)] p-3 text-start transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--bp-accent)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bp-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bp-bg)]"
    >
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bp-accent)]/15 text-[var(--bp-accent)]">{icon}</div>
      <h3 className="text-sm font-bold">{title}</h3>
      <p className="text-xs text-slate-400">{desc}</p>
    </button>
  )
}

function getDashboardFocusTasks(tasks: ApiTask[]) {
  const { startOfToday, startOfTomorrow } = getUtcDayBounds()

  return tasks
    .filter((task) => task.status !== 'done' && task.status !== 'missed')
    .map((task) => ({
      task,
      reasons: getTaskFocusReasons(task, startOfToday, startOfTomorrow),
    }))
    .filter(({ reasons }) => reasons.length > 0)
    .sort((left, right) => {
      const leftScore = focusScore(left.reasons)
      const rightScore = focusScore(right.reasons)

      if (leftScore !== rightScore) return rightScore - leftScore

      const leftDue = left.task.dueDate ? new Date(left.task.dueDate).getTime() : Number.POSITIVE_INFINITY
      const rightDue = right.task.dueDate ? new Date(right.task.dueDate).getTime() : Number.POSITIVE_INFINITY
      if (leftDue !== rightDue) return leftDue - rightDue

      return left.task.title.localeCompare(right.task.title)
    })
    .map(({ task }) => task)
}

function getTaskFocusReasons(task: ApiTask, startOfToday: number, startOfTomorrow: number) {
  const reasons: string[] = []
  const dueTime = task.dueDate ? new Date(task.dueDate).getTime() : null

  if (dueTime !== null && dueTime >= startOfToday && dueTime < startOfTomorrow) {
    reasons.push('Due Today')
  }

  if (task.isFocusTask) {
    reasons.push('Focus')
  }

  if (task.priority === 'high') {
    reasons.push('High Priority')
  }

  return reasons
}

function getPrimaryFocusReason(task: ApiTask) {
  const { startOfToday, startOfTomorrow } = getUtcDayBounds()
  const reasons = getTaskFocusReasons(task, startOfToday, startOfTomorrow)
  return reasons[0] ?? 'Focus'
}

function focusScore(reasons: string[]) {
  return reasons.reduce((score, reason) => {
    if (reason === 'Due Today') return score + 3
    if (reason === 'Focus') return score + 2
    if (reason === 'High Priority') return score + 1
    return score
  }, 0)
}

function getUtcDayBounds() {
  const now = new Date()
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const startOfTomorrow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  return { startOfToday, startOfTomorrow }
}

function formatFocusDue(task: ApiTask) {
  if (!task.dueDate) return task.dueTime ? `at ${formatTime(task.dueTime)}` : ''

  const date = new Date(task.dueDate)
  if (Number.isNaN(date.getTime())) return task.dueTime ? `at ${formatTime(task.dueTime)}` : ''

  const dateLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)
  return task.dueTime ? `${dateLabel} at ${formatTime(task.dueTime)}` : dateLabel
}

function formatTime(time: string) {
  const [hoursStr, minutesStr] = time.split(':')
  const hours = Number(hoursStr)
  const minutes = Number(minutesStr)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return time

  const isPm = hours >= 12
  const displayHours = hours % 12 === 0 ? 12 : hours % 12
  return `${displayHours}:${String(minutes).padStart(2, '0')} ${isPm ? 'PM' : 'AM'}`
}
