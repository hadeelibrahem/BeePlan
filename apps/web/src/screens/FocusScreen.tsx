import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AppLayout,
  PageHeader,
  TopActionBar,
  type SidebarNavHandlers,
} from '../components/layout'
import { PrimaryButton, SecondaryButton, OutlineButton } from '../components/layout/Buttons'
import { useLanguage } from '../i18n/LanguageContext'
import { useTheme } from '../theme/ThemeContext'
import { toUiPriority, toUiStatus, updateTask, type ApiTask } from '../lib/tasksApi'
import {
  SESSION_TYPE_PRESETS,
  formatFocusMinutes,
  getFocusRecommendation,
  getFocusStats,
  getTodayFocusSessions,
  type FocusRecommendation,
  type FocusSession,
  type FocusSessionType,
  type FocusStats,
} from '../lib/focusApi'
import { formatClock, type UseFocusSession } from '../lib/useFocusSession'

type FocusScreenProps = SidebarNavHandlers & {
  onBackDashboard?: () => void
  onViewTaskDetails?: (taskId: string) => void
  onSignOut?: () => void
  tasks?: ApiTask[]
  accessToken: string
  focus: UseFocusSession
  onTaskUpdated?: (task: ApiTask) => void
  onOpenWorkspace: () => void
}

type StartTarget = { id: string; title: string; priority: string; category: string }

export default function FocusScreen({
  onBackDashboard,
  onViewTaskDetails,
  onSignOut,
  tasks: apiTasks = [],
  accessToken,
  focus,
  onTaskUpdated,
  onOpenWorkspace,
  ...nav
}: FocusScreenProps) {
  const [search, setSearch] = useState('')
  const { t, toggleLanguage } = useLanguage()
  const { mode, toggleTheme } = useTheme()

  const [stats, setStats] = useState<FocusStats | null>(null)
  const [recommendation, setRecommendation] = useState<FocusRecommendation | null>(null)
  const [todaySessions, setTodaySessions] = useState<FocusSession[]>([])
  const [startModalTask, setStartModalTask] = useState<StartTarget | null>(null)
  const [error, setError] = useState('')
  const removingRef = useRef<Set<string>>(new Set())

  // The running timer lives in the dedicated workspace; this page only opens or resumes it.
  const focusTasks = useMemo(
    () =>
      apiTasks
        .filter((task) => task.isFocusTask)
        .filter((task) => task.title.toLowerCase().includes(search.toLowerCase())),
    [apiTasks, search],
  )

  const refreshFocusData = useCallback(async () => {
    if (!accessToken) return
    try {
      const [statsData, sessions, rec] = await Promise.all([
        getFocusStats(accessToken),
        getTodayFocusSessions(accessToken),
        getFocusRecommendation(accessToken).catch(() => null),
      ])
      setStats(statsData)
      setTodaySessions(sessions)
      setRecommendation(rec)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load focus data.')
    }
  }, [accessToken])

  useEffect(() => {
    void refreshFocusData()
  }, [refreshFocusData])

  const handleStart = useCallback(
    async (type: FocusSessionType, minutes: number) => {
      if (!startModalTask) return
      const ok = await focus.start(
        {
          id: startModalTask.id,
          title: startModalTask.title,
          priority: startModalTask.priority,
          category: startModalTask.category,
        },
        type,
        minutes,
      )
      if (ok) {
        setStartModalTask(null)
        onOpenWorkspace()
      }
    },
    [startModalTask, focus, onOpenWorkspace],
  )

  const openStartModal = useCallback(
    (task: { id: string; title: string; priority: ApiTask['priority']; category: string }) => {
      setStartModalTask({
        id: task.id,
        title: task.title,
        priority: toUiPriority(task.priority),
        category: task.category || 'General',
      })
    },
    [],
  )

  const handleRemoveFocus = useCallback(
    async (taskId: string) => {
      if (!accessToken || removingRef.current.has(taskId)) return
      removingRef.current.add(taskId)
      try {
        const updated = await updateTask(accessToken, taskId, { isFocusTask: false })
        onTaskUpdated?.(updated)
        void refreshFocusData()
      } catch (removeError) {
        setError(removeError instanceof Error ? removeError.message : 'Unable to remove from focus.')
      } finally {
        removingRef.current.delete(taskId)
      }
    },
    [accessToken, onTaskUpdated, refreshFocusData],
  )

  return (
    <AppLayout
      active="focus"
      {...nav}
      onNavigateDashboard={onBackDashboard}
      panelTitle="Deep work"
      panelCaption={focus.active ? 'Focus session in progress.' : 'Start a session to get in the zone.'}
      panelPercent={focus.active ? 100 : focusTasks.length ? 100 : 0}
    >
      <PageHeader
        title="Focus Mode"
        subtitle="Your deep-work control center"
        toolbar={
          <TopActionBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search focus tasks..."
            themeMode={mode}
            onToggleTheme={toggleTheme}
            languageLabel={t('common.languageToggle')}
            onToggleLanguage={toggleLanguage}
            onProfileClick={onSignOut}
          />
        }
      />

      {error || focus.error ? (
        <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300">
          {error || focus.error}
        </p>
      ) : null}

      <StatsRow stats={stats} />

      {focus.active ? (
        <InProgressCard
          title={focus.active.taskTitle ?? 'Focus session'}
          remaining={formatClock(focus.remainingMs)}
          complete={focus.sessionComplete}
          onResume={onOpenWorkspace}
        />
      ) : (
        <RecommendationCard
          recommendation={recommendation}
          tasks={apiTasks}
          onFocus={openStartModal}
          onView={onViewTaskDetails}
        />
      )}

      <FocusQueue
        tasks={focusTasks}
        disabled={Boolean(focus.active)}
        onStart={openStartModal}
        onRemove={(taskId) => void handleRemoveFocus(taskId)}
        onView={onViewTaskDetails}
      />

      <TodaySessions sessions={todaySessions} />

      {startModalTask ? (
        <StartSessionModal
          taskTitle={startModalTask.title}
          busy={focus.busy}
          onClose={() => setStartModalTask(null)}
          onStart={(type, minutes) => void handleStart(type, minutes)}
        />
      ) : null}
    </AppLayout>
  )
}

// --- In-progress resume card ----------------------------------------------

function InProgressCard({
  title,
  remaining,
  complete,
  onResume,
}: {
  title: string
  remaining: string
  complete: boolean
  onResume: () => void
}) {
  return (
    <section className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--bp-accent)]/40 bg-[var(--bp-accent-soft)] p-4">
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-wide text-[var(--bp-accent)]">Focus session in progress</p>
        <h3 className="mt-1 truncate text-lg font-black text-[var(--bp-text)]">{title}</h3>
        <p className="mt-0.5 text-sm font-semibold tabular-nums text-[var(--bp-muted)]">
          {complete ? 'Session complete' : `${remaining} remaining`}
        </p>
      </div>
      <PrimaryButton onClick={onResume}>Resume Session</PrimaryButton>
    </section>
  )
}

// --- Stats -----------------------------------------------------------------

function StatsRow({ stats }: { stats: FocusStats | null }) {
  const tiles = [
    { label: 'Focus today', value: stats ? formatFocusMinutes(stats.focusMinutesToday) : '—' },
    { label: 'Sessions today', value: stats ? String(stats.sessionsToday) : '—' },
    { label: 'Completed', value: stats ? String(stats.completedSessionsToday) : '—' },
    { label: 'Current streak', value: stats ? `${stats.currentStreak}d` : '—' },
    { label: 'This week', value: stats ? formatFocusMinutes(stats.totalFocusMinutesThisWeek) : '—' },
    { label: 'Top task', value: stats?.topFocusTask?.title ?? 'None yet' },
  ]

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-3">
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{tile.label}</p>
          <p className="mt-1 truncate text-lg font-black text-[var(--bp-text)]" title={tile.value}>
            {tile.value}
          </p>
        </div>
      ))}
    </div>
  )
}

// --- AI recommendation -----------------------------------------------------

function RecommendationCard({
  recommendation,
  tasks,
  onFocus,
  onView,
}: {
  recommendation: FocusRecommendation | null
  tasks: ApiTask[]
  onFocus: (task: { id: string; title: string; priority: ApiTask['priority']; category: string }) => void
  onView?: (taskId: string) => void
}) {
  if (!recommendation) {
    return (
      <section className="mb-4 rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4">
        <p className="text-xs font-black uppercase tracking-wide text-slate-500">Recommended now</p>
        <p className="mt-1 text-sm text-slate-400">
          No suggestion yet — add tasks or mark one as a focus task to get a recommendation.
        </p>
      </section>
    )
  }

  const task = tasks.find((item) => item.id === recommendation.taskId)

  return (
    <section className="mb-4 rounded-2xl border border-[var(--bp-accent)]/40 bg-[var(--bp-accent-soft)] p-4">
      <p className="text-xs font-black uppercase tracking-wide text-[var(--bp-accent)]">Recommended now</p>
      <h3 className="mt-1 text-lg font-black text-[var(--bp-text)]">{recommendation.taskTitle}</h3>
      <p className="mt-1 text-sm text-slate-400">Reason: {recommendation.reason}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {task ? (
          <PrimaryButton
            size="sm"
            onClick={() =>
              onFocus({ id: task.id, title: task.title, priority: task.priority, category: task.category })
            }
          >
            Start Focus
          </PrimaryButton>
        ) : null}
        {task ? (
          <OutlineButton size="sm" onClick={() => onView?.(recommendation.taskId)}>
            View task
          </OutlineButton>
        ) : null}
      </div>
    </section>
  )
}

// --- Focus queue -----------------------------------------------------------

function FocusQueue({
  tasks,
  disabled,
  onStart,
  onRemove,
  onView,
}: {
  tasks: ApiTask[]
  disabled: boolean
  onStart: (task: { id: string; title: string; priority: ApiTask['priority']; category: string }) => void
  onRemove: (taskId: string) => void
  onView?: (taskId: string) => void
}) {
  return (
    <section className="mb-4">
      <h3 className="mb-2 text-sm font-black text-[var(--bp-text)]">
        Focus Queue <span className="text-xs font-semibold text-slate-400">· {tasks.length} tasks</span>
      </h3>

      {tasks.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {tasks.map((task) => (
            <FocusCard
              key={task.id}
              task={task}
              disabled={disabled}
              onStart={() =>
                onStart({ id: task.id, title: task.title, priority: task.priority, category: task.category })
              }
              onRemove={() => onRemove(task.id)}
              onView={() => onView?.(task.id)}
            />
          ))}
        </div>
      ) : (
        <div className="flex h-32 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--bp-border)] px-4 text-center">
          <p className="text-sm font-black text-[var(--bp-text)]">No focus tasks yet</p>
          <p className="mt-1 text-xs text-slate-500">Turn on Focus Task from Task Details to add it here.</p>
        </div>
      )}
    </section>
  )
}

function FocusCard({
  task,
  disabled,
  onStart,
  onRemove,
  onView,
}: {
  task: ApiTask
  disabled: boolean
  onStart: () => void
  onRemove: () => void
  onView: () => void
}) {
  const completedSubtasks = task.subtasks.filter((subtask) => subtask.isDone).length
  const priority = toUiPriority(task.priority)
  const status = toUiStatus(task.status)

  return (
    <div className="flex flex-col rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4">
      <button type="button" onClick={onView} className="min-w-0 text-start">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <Badge label={priority} type={priority} />
          <Badge label={status} type={status} />
          <span className="rounded-full bg-[var(--bp-bg)] px-2 py-1 text-[11px] font-bold text-slate-400">
            {task.category || 'General'}
          </span>
        </div>
        <h4 className="truncate text-sm font-black text-[var(--bp-text)]">{task.title}</h4>
      </button>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
        <Meta label="Due" value={formatDue(task.dueDate, task.dueTime)} />
        <Meta label="Estimated" value={task.estimatedTimeMinutes ? formatFocusMinutes(task.estimatedTimeMinutes) : '—'} />
        <Meta label="Subtasks" value={task.subtasks.length ? `${completedSubtasks}/${task.subtasks.length} done` : 'None'} />
        <Meta label="Progress" value={`${task.progress}%`} />
      </div>

      <div className="mt-3 h-1.5 rounded-full bg-[var(--bp-bg)]">
        <div
          className={`h-1.5 rounded-full ${
            task.progress === 100 ? 'bg-green-400' : task.progress === 0 ? 'bg-slate-600' : 'bg-[var(--bp-accent)]'
          }`}
          style={{ width: `${task.progress}%` }}
        />
      </div>

      <div className="mt-4 flex gap-2">
        <PrimaryButton size="sm" onClick={onStart} disabled={disabled} className="flex-1">
          Start Focus
        </PrimaryButton>
        <OutlineButton size="sm" onClick={onRemove}>
          Remove
        </OutlineButton>
      </div>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</span>
      <p className="truncate font-semibold text-[var(--bp-text)]">{value}</p>
    </div>
  )
}

// --- Today's sessions ------------------------------------------------------

function TodaySessions({ sessions }: { sessions: FocusSession[] }) {
  return (
    <section className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4">
      <h3 className="mb-3 text-sm font-black text-[var(--bp-text)]">Today's Sessions</h3>
      {sessions.length ? (
        <div className="divide-y divide-[var(--bp-border)]">
          {sessions.map((session) => (
            <div key={session.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-[var(--bp-text)]">
                  {session.taskTitle ?? 'Focus session'}
                </p>
                <p className="text-xs text-slate-500">
                  {labelForType(session.sessionType) } · {formatTime(session.startedAt)}
                </p>
              </div>
              <div className="flex items-center gap-2 text-end">
                <span className="text-xs font-semibold text-slate-400">
                  {formatFocusMinutes(session.actualMinutes ?? 0)}
                </span>
                <SessionStatusBadge status={session.status} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">No sessions yet today. Start one from the queue above.</p>
      )}
    </section>
  )
}

function SessionStatusBadge({ status }: { status: string }) {
  const color =
    status === 'completed'
      ? 'bg-green-500/20 text-green-300'
      : status === 'cancelled'
        ? 'bg-red-500/20 text-red-300'
        : 'bg-blue-500/20 text-blue-300'
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${color}`}>{status}</span>
}

// --- Start-session modal ---------------------------------------------------

function StartSessionModal({
  taskTitle,
  busy,
  onClose,
  onStart,
}: {
  taskTitle: string
  busy: boolean
  onClose: () => void
  onStart: (type: FocusSessionType, minutes: number) => void
}) {
  const [selected, setSelected] = useState<FocusSessionType>('pomodoro')
  const [customMinutes, setCustomMinutes] = useState(30)
  const preset = SESSION_TYPE_PRESETS.find((item) => item.type === selected)
  const minutes = selected === 'custom' ? clamp(customMinutes, 1, 600) : (preset?.minutes ?? 25)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 px-4 backdrop-blur-[2px] md:items-center">
      <div className="w-full max-w-lg rounded-t-[28px] border border-[var(--bp-border)] bg-[var(--bp-surface-elevated)] p-6 md:rounded-[28px]">
        <div className="mx-auto mb-5 h-1.5 w-14 rounded-full bg-[var(--bp-border)] md:hidden" />
        <header className="mb-4 text-center">
          <h2 className="text-2xl font-black text-[var(--bp-text)]">Start Focus Session</h2>
          <p className="mt-1 truncate text-sm text-[var(--bp-muted)]">{taskTitle}</p>
        </header>

        <div className="grid grid-cols-2 gap-3">
          {SESSION_TYPE_PRESETS.map((item) => (
            <button
              key={item.type}
              type="button"
              onClick={() => setSelected(item.type)}
              className={`rounded-2xl border px-4 py-3 text-start transition active:scale-[0.98] ${
                selected === item.type
                  ? 'border-[var(--bp-accent)] bg-[var(--bp-accent-soft)]'
                  : 'border-[var(--bp-border)] bg-[var(--bp-surface)] hover:border-[var(--bp-accent)]/50'
              }`}
            >
              <p className="text-sm font-black text-[var(--bp-text)]">
                {item.label}
                {item.type !== 'custom' ? ` · ${item.minutes}m` : ''}
              </p>
              <p className="mt-0.5 text-xs text-[var(--bp-muted)]">{item.description}</p>
            </button>
          ))}
        </div>

        {selected === 'custom' ? (
          <label className="mt-4 block">
            <span className="text-xs font-black uppercase tracking-wide text-[var(--bp-muted)]">Minutes</span>
            <input
              type="number"
              min={1}
              max={600}
              value={customMinutes}
              onChange={(event) => setCustomMinutes(Number(event.target.value))}
              className="mt-2 w-full rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-4 py-3 text-sm font-semibold text-[var(--bp-text)] outline-none focus:border-[var(--bp-accent)]"
            />
          </label>
        ) : null}

        <footer className="mt-5 grid grid-cols-2 gap-3">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={() => onStart(selected, minutes)} disabled={busy}>
            Start {minutes} min
          </PrimaryButton>
        </footer>
      </div>
    </div>
  )
}

// --- Small pieces ----------------------------------------------------------

function Badge({ label, type }: { label: string; type: string }) {
  const color =
    type === 'High' || type === 'Urgent' || type === 'Missed'
      ? 'bg-red-500/20 text-red-300'
      : type === 'Medium'
        ? 'bg-orange-500/20 text-orange-300'
        : type === 'Low' || type === 'Done'
          ? 'bg-green-500/20 text-green-300'
          : type === 'In Progress'
            ? 'bg-blue-500/20 text-blue-300'
            : 'bg-slate-500/20 text-slate-300'
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${color}`}>{label}</span>
}

function labelForType(type: FocusSessionType): string {
  return SESSION_TYPE_PRESETS.find((item) => item.type === type)?.label ?? 'Focus'
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(Math.max(value, min), max)
}

function formatDue(value?: string, dueTime?: string): string {
  if (!value) return 'No due date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const datePart = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
  return dueTime ? `${datePart} · ${dueTime}` : datePart
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)
}
