import { useQuery } from '@tanstack/react-query'
import {
  AnalyticsIcon,
  AppLayout,
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
import { queryKeys } from '../lib/queryKeys'
import { getTasks } from '../lib/tasksApi'
import { computeCompletionTrend, computeTaskAnalytics } from '../lib/analytics'
import { getReminders } from '../features/reminders'
import { formatFocusMinutes, getFocusStats } from '../lib/focusApi'

type AnalyticsScreenProps = SidebarNavHandlers & {
  accessToken?: string
  onSignOut?: () => void
}

const LOADING_LABEL = '…'

export default function AnalyticsScreen({ accessToken, onSignOut, ...nav }: AnalyticsScreenProps) {
  const { t, toggleLanguage } = useLanguage()
  const { mode, toggleTheme } = useTheme()

  // Read tasks from the same unfiltered cache the Tasks screen, dashboard, and
  // mutations use. Sharing the query key (not an App-level copy) is what keeps
  // these analytics counts consistent with what the Tasks list shows.
  const tasksQuery = useQuery({
    queryKey: queryKeys.tasks.list({}),
    queryFn: () => getTasks(accessToken ?? ''),
    enabled: Boolean(accessToken),
  })

  const remindersQuery = useQuery({
    queryKey: queryKeys.reminders.list,
    queryFn: () => getReminders(accessToken ?? ''),
    enabled: Boolean(accessToken),
  })

  const focusStatsQuery = useQuery({
    queryKey: queryKeys.focus.stats,
    queryFn: () => getFocusStats(accessToken ?? ''),
    enabled: Boolean(accessToken),
  })

  const tasks = tasksQuery.data ?? []
  const analytics = computeTaskAnalytics(tasks)
  const completionTrend = computeCompletionTrend(tasks)

  // Show the loading placeholder only before the first result lands; once tasks
  // are cached, navigating back keeps the numbers on screen instead of flashing.
  const tasksLoading = tasksQuery.isLoading
  const tasksError = tasksQuery.isError
    ? tasksQuery.error instanceof Error
      ? tasksQuery.error.message
      : 'Unable to load analytics.'
    : ''

  const remindersLoading = remindersQuery.isLoading
  const remindersValue = remindersLoading ? LOADING_LABEL : String(remindersQuery.data?.length ?? 0)
  const focusStats = focusStatsQuery.data

  const statValue = (value: string) => (tasksLoading ? LOADING_LABEL : value)

  return (
    <AppLayout
      active="analytics"
      {...nav}
      panelTitle="Keep going!"
      panelCaption="You're doing great today."
      panelPercent={analytics.completionRate}
    >
      <PageHeader
        title={t('taskUi.analytics.title')}
        subtitle={t('taskUi.analytics.subtitle')}
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

      {tasksError ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
          <p className="text-xs font-semibold text-red-300">{tasksError}</p>
          <button
            type="button"
            onClick={() => void tasksQuery.refetch()}
            disabled={tasksQuery.isFetching}
            className="text-xs font-bold text-[var(--bp-accent)] hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            {tasksQuery.isFetching ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      ) : null}

      <section className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <StatsCard icon={<TasksIcon className="h-4 w-4" />} value={statValue(String(analytics.completedTasks))} title="Completed Tasks" desc="Tasks marked done" />
        <StatsCard icon={<TasksIcon className="h-4 w-4" />} value={statValue(String(analytics.missedTasks))} title="Missed Tasks" desc="Tasks past their due date" />
        <StatsCard icon={<AnalyticsIcon className="h-4 w-4" />} value={statValue(`${analytics.completionRate}%`)} title="Completion Rate" desc="Completed of all tasks" />
        <StatsCard icon={<RemindersIcon className="h-4 w-4" />} value={remindersValue} title="Reminders" desc="Active and completed" />
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <SectionCard>
          <h2 className="mb-1 text-sm font-bold">Completion trend</h2>
          <p className="mb-3 text-xs text-slate-400">Tasks completed in the last 14 days</p>
          <CompletionTrend points={completionTrend} loading={tasksLoading} />
        </SectionCard>

        <SectionCard>
          <h2 className="mb-1 text-sm font-bold">Focus time</h2>
          <p className="mb-3 text-xs text-slate-400">Based on completed focus sessions</p>
          {focusStatsQuery.isLoading ? (
            <p className="text-sm text-slate-400">Loading focus summary...</p>
          ) : focusStatsQuery.isError ? (
            <p role="status" className="text-sm text-red-300">Focus summary is unavailable right now.</p>
          ) : focusStats ? (
            <dl className="grid grid-cols-2 gap-3" aria-label="Focus time summary">
              <FocusMetric label="Today" value={formatFocusMinutes(focusStats.focusMinutesToday)} />
              <FocusMetric label="This week" value={formatFocusMinutes(focusStats.totalFocusMinutesThisWeek)} />
              <FocusMetric label="Completed sessions today" value={String(focusStats.completedSessionsToday)} />
              <FocusMetric label="Current streak" value={`${focusStats.currentStreak} day${focusStats.currentStreak === 1 ? '' : 's'}`} />
            </dl>
          ) : (
            <p className="text-sm text-slate-400">No focus sessions yet.</p>
          )}
        </SectionCard>

        <SectionCard>
          <h2 className="mb-3 text-sm font-bold">Tasks by Category</h2>
          <BreakdownList entries={analytics.byCategory} total={analytics.totalTasks} loading={tasksLoading} />
        </SectionCard>

        <SectionCard>
          <h2 className="mb-3 text-sm font-bold">Tasks by Priority</h2>
          <BreakdownList entries={analytics.byPriority} total={analytics.totalTasks} loading={tasksLoading} labelize={capitalize} />
        </SectionCard>
      </div>
    </AppLayout>
  )
}

function FocusMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--bp-border)] bg-[var(--bp-bg)]/50 px-3 py-2">
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-lg font-bold text-[var(--bp-text)]">{value}</dd>
    </div>
  )
}

function CompletionTrend({ points, loading }: { points: ReturnType<typeof computeCompletionTrend>; loading: boolean }) {
  if (loading) return <p className="text-sm text-slate-400">Loading completion trend...</p>

  const maximum = Math.max(1, ...points.map((point) => point.completed))
  const total = points.reduce((sum, point) => sum + point.completed, 0)
  if (total === 0) return <p className="text-sm text-slate-400">No completions recorded in the last 14 days.</p>

  return (
    <>
      <div role="img" aria-label={`Completion trend: ${total} tasks completed in the last 14 days`}>
        <div className="flex h-28 items-end gap-1" aria-hidden="true">
          {points.map((point) => (
            <div key={point.date} className="flex min-w-0 flex-1 flex-col justify-end">
              <div
                className="min-h-1 rounded-t bg-[var(--bp-accent)]"
                style={{ height: `${Math.max(4, Math.round((point.completed / maximum) * 100))}%` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs text-slate-400">
          <span>{points[0]?.date}</span>
          <span>{points.at(-1)?.date}</span>
        </div>
      </div>
      <ul className="sr-only" aria-label="Daily completion values">
        {points.map((point) => <li key={point.date}>{point.date}: {point.completed} completed</li>)}
      </ul>
    </>
  )
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function BreakdownList({
  entries,
  total,
  loading = false,
  labelize = (value: string) => value,
}: {
  entries: [string, number][]
  total: number
  loading?: boolean
  labelize?: (value: string) => string
}) {
  if (loading) {
    return <p className="text-sm text-slate-400">Loading breakdown…</p>
  }

  if (!entries.length) {
    return <p className="text-sm text-slate-400">No tasks yet — create one to see a breakdown here.</p>
  }

  return (
    <div className="space-y-2">
      {entries.map(([label, count]) => {
        const percent = total === 0 ? 0 : Math.round((count / total) * 100)
        return (
          <div key={label}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-semibold text-[var(--bp-text)]">{labelize(label)}</span>
              <span className="text-slate-400">{count} - {percent}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--bp-bg)]">
              <div className="h-1.5 rounded-full bg-[var(--bp-accent)]" style={{ width: `${percent}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
