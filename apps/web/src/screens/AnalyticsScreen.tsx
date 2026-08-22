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
import { getFocusStats } from '../lib/focusApi'

type AnalyticsScreenProps = SidebarNavHandlers & {
  accessToken?: string
  onSignOut?: () => void
}

const LOADING_LABEL = '…'

export default function AnalyticsScreen({ accessToken, onSignOut, ...nav }: AnalyticsScreenProps) {
  const { formatNumber, formatPercent, t, toggleLanguage } = useLanguage()
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
  const tasksError = tasksQuery.isError ? t('analyticsUi.loadFailed') : ''

  const remindersLoading = remindersQuery.isLoading
  const remindersValue = remindersLoading ? LOADING_LABEL : formatNumber(remindersQuery.data?.length ?? 0)
  const focusStats = focusStatsQuery.data

  const statValue = (value: string) => (tasksLoading ? LOADING_LABEL : value)

  return (
    <AppLayout
      active="analytics"
      {...nav}
      panelTitle={t('analyticsUi.keepGoing')}
      panelCaption={t('analyticsUi.doingGreat')}
      panelPercent={analytics.completionRate}
    >
      <PageHeader
        title={t('taskUi.analytics.title')}
        subtitle={t('taskUi.analytics.subtitle')}
        toolbar={
          <TopActionBar pageOnly
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
            className="text-xs font-bold text-[var(--bp-accent-ink)] hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            {tasksQuery.isFetching ? t('analyticsUi.retrying') : t('analyticsUi.retry')}
          </button>
        </div>
      ) : null}

      <section className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <StatsCard icon={<TasksIcon className="h-4 w-4" />} value={statValue(formatNumber(analytics.completedTasks))} title={t('analyticsUi.completedTasks')} desc={t('analyticsUi.tasksMarkedDone')} />
        <StatsCard icon={<TasksIcon className="h-4 w-4" />} value={statValue(formatNumber(analytics.missedTasks))} title={t('analyticsUi.missedTasks')} desc={t('analyticsUi.tasksPastDue')} />
        <StatsCard icon={<AnalyticsIcon className="h-4 w-4" />} value={statValue(formatPercent(analytics.completionRate))} title={t('analyticsUi.completionRate')} desc={t('analyticsUi.completedOfAll')} />
        <StatsCard icon={<RemindersIcon className="h-4 w-4" />} value={remindersValue} title={t('analyticsUi.reminders')} desc={t('analyticsUi.activeAndCompleted')} />
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <SectionCard>
          <h2 className="mb-1 text-sm font-bold">{t('analyticsUi.completionTrend')}</h2>
          <p className="mb-3 text-xs text-[var(--bp-muted)]">{t('analyticsUi.lastFourteenDays')}</p>
          <CompletionTrend points={completionTrend} loading={tasksLoading} />
        </SectionCard>

        <SectionCard>
          <h2 className="mb-1 text-sm font-bold">{t('analyticsUi.focusTime')}</h2>
          <p className="mb-3 text-xs text-[var(--bp-muted)]">{t('analyticsUi.basedOnFocus')}</p>
          {focusStatsQuery.isLoading ? (
            <p className="text-sm text-[var(--bp-muted)]">{t('analyticsUi.loadingFocus')}</p>
          ) : focusStatsQuery.isError ? (
            <p role="status" className="text-sm text-red-300">{t('analyticsUi.focusUnavailable')}</p>
          ) : focusStats ? (
            <dl className="grid grid-cols-2 gap-3" aria-label={t('analyticsUi.focusSummary')}>
              <FocusMetric label={t('analyticsUi.today')} value={formatMinutes(focusStats.focusMinutesToday, t, formatNumber)} />
              <FocusMetric label={t('analyticsUi.thisWeek')} value={formatMinutes(focusStats.totalFocusMinutesThisWeek, t, formatNumber)} />
              <FocusMetric label={t('analyticsUi.sessionsToday')} value={formatNumber(focusStats.completedSessionsToday)} />
              <FocusMetric label={t('analyticsUi.currentStreak')} value={t('analyticsUi.days', { count: formatNumber(focusStats.currentStreak) })} />
            </dl>
          ) : (
            <p className="text-sm text-[var(--bp-muted)]">{t('analyticsUi.noFocusSessions')}</p>
          )}
        </SectionCard>

        <SectionCard>
          <h2 className="mb-3 text-sm font-bold">{t('analyticsUi.tasksByCategory')}</h2>
          <BreakdownList entries={analytics.byCategory} total={analytics.totalTasks} loading={tasksLoading} />
        </SectionCard>

        <SectionCard>
          <h2 className="mb-3 text-sm font-bold">{t('analyticsUi.tasksByPriority')}</h2>
          <BreakdownList entries={analytics.byPriority} total={analytics.totalTasks} loading={tasksLoading} labelize={(value) => t(`taskLabels.priority.${value}`)} />
        </SectionCard>
      </div>
    </AppLayout>
  )
}

type Translate = (key: string, params?: Record<string, string | number>) => string
function formatMinutes(totalMinutes: number, t: Translate, formatNumber: (value: number) => string) {
  const minutes = Math.max(0, Math.round(totalMinutes))
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours && rest) return t('analyticsUi.hoursMinutes', { hours: formatNumber(hours), minutes: formatNumber(rest) })
  if (hours) return t('analyticsUi.hours', { count: formatNumber(hours) })
  return t('analyticsUi.minutes', { count: formatNumber(rest) })
}

function FocusMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--bp-border)] bg-[var(--bp-bg)]/50 px-3 py-2">
      <dt className="text-xs text-[var(--bp-muted)]">{label}</dt>
      <dd className="mt-0.5 text-lg font-bold text-[var(--bp-text)]">{value}</dd>
    </div>
  )
}

function CompletionTrend({ points, loading }: { points: ReturnType<typeof computeCompletionTrend>; loading: boolean }) {
  const { formatNumber, t } = useLanguage()
  if (loading) return <p className="text-sm text-[var(--bp-muted)]">{t('analyticsUi.loadingTrend')}</p>

  const maximum = Math.max(1, ...points.map((point) => point.completed))
  const total = points.reduce((sum, point) => sum + point.completed, 0)
  if (total === 0) return <p className="text-sm text-[var(--bp-muted)]">{t('analyticsUi.noCompletions')}</p>

  return (
    <>
      <div role="img" aria-label={t('analyticsUi.trendDescription', { count: formatNumber(total) })}>
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
        <div className="mt-2 flex justify-between text-xs text-[var(--bp-muted)]">
          <span>{points[0]?.date}</span>
          <span>{points.at(-1)?.date}</span>
        </div>
      </div>
      <ul className="sr-only" aria-label={t('analyticsUi.dailyValues')}>
        {points.map((point) => <li key={point.date}>{t('analyticsUi.dailyCompleted', { date: point.date, count: formatNumber(point.completed) })}</li>)}
      </ul>
    </>
  )
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
  const { formatNumber, formatPercent, t } = useLanguage()
  if (loading) {
    return <p className="text-sm text-[var(--bp-muted)]">{t('analyticsUi.loadingBreakdown')}</p>
  }

  if (!entries.length) {
    return <p className="text-sm text-[var(--bp-muted)]">{t('analyticsUi.noTasksBreakdown')}</p>
  }

  return (
    <div className="space-y-2">
      {entries.map(([label, count]) => {
        const percent = total === 0 ? 0 : Math.round((count / total) * 100)
        return (
          <div key={label}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-semibold text-[var(--bp-text)]">{labelize(label)}</span>
              <span className="text-[var(--bp-muted)]">{formatNumber(count)} - {formatPercent(percent)}</span>
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
