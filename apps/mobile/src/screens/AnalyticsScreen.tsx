import { useQuery } from '@tanstack/react-query'
import { Pressable, Text, View } from 'react-native'
import { AppScreen, FilterTabs, LoadingState, PageHeader, SectionCard, StatsCard } from '../components/layout'
import { getReminders } from '../features/reminders'
import { computeCompletionTrend, computeTaskAnalytics } from '../lib/analytics'
import { formatFocusMinutes, getFocusStats } from '../lib/focusApi'
import { queryKeys } from '../lib/queryKeys'
import { getTasks } from '../lib/tasksApi'
import { useTheme } from '../theme/useTheme'
import { useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext'

const periods = ['7', '14', '30']

export default function AnalyticsScreen({ accessToken, onBack }: { accessToken: string; onBack: () => void }) {
  const { theme } = useTheme(); const { colors } = theme; const { t } = useLanguage(); const [period, setPeriod] = useState('14')
  const tasksQuery = useQuery({ queryKey: queryKeys.tasks.list({}), queryFn: () => getTasks(accessToken), enabled: Boolean(accessToken) })
  const remindersQuery = useQuery({ queryKey: queryKeys.reminders.list, queryFn: () => getReminders(accessToken), enabled: Boolean(accessToken) })
  const focusQuery = useQuery({ queryKey: queryKeys.focus.stats, queryFn: () => getFocusStats(accessToken), enabled: Boolean(accessToken) })
  const tasks = tasksQuery.data ?? []; const stats = computeTaskAnalytics(tasks); const trend = computeCompletionTrend(tasks, Number(period)); const maximum = Math.max(1, ...trend.map((point) => point.completed)); const focus = focusQuery.data
  const retry = () => { void tasksQuery.refetch(); void remindersQuery.refetch(); void focusQuery.refetch() }
  return <AppScreen>
    <PageHeader title={t('analytics.title')} subtitle={t('analytics.subtitle')} onBack={onBack} />
    {(tasksQuery.isError || remindersQuery.isError || focusQuery.isError) ? <View className="mb-3 rounded-xl p-3" style={{ backgroundColor: `${colors.error}18` }}><Text style={{ color: colors.error }}>{t('analytics.unavailable')}</Text><Pressable onPress={retry} accessibilityRole="button"><Text className="mt-2 font-bold" style={{ color: colors.accentInk }}>{t('analytics.retry')}</Text></Pressable></View> : null}
    <View className="mb-3 flex-row flex-wrap gap-2"><StatsCard icon="Done" value={tasksQuery.isLoading ? '...' : String(stats.completedTasks)} title={t('analytics.completed')} /><StatsCard icon="Rate" value={tasksQuery.isLoading ? '...' : `${stats.completionRate}%`} title={t('analytics.productivity')} /><StatsCard icon="Missed" value={tasksQuery.isLoading ? '...' : String(stats.missedTasks)} title={t('analytics.missed')} /><StatsCard icon="Remind" value={remindersQuery.isLoading ? '...' : String(remindersQuery.data?.length ?? 0)} title={t('analytics.reminders')} /></View>
    <SectionCard className="mb-3"><Text className="text-sm font-black" style={{ color: colors.text }}>{t('analytics.trend')}</Text><Text className="mb-2 text-xs" style={{ color: colors.secondaryText }}>{t('analytics.trendHelp')}</Text><FilterTabs tabs={periods.map((value) => ({ value, label: t('analytics.days', { count: Number(value) }) }))} active={period} onChange={setPeriod} /><View className="mt-3 h-28 flex-row items-end gap-1">{trend.map((point) => <View key={point.date} className="flex-1 justify-end"><View className="rounded-t" style={{ height: `${Math.max(point.completed ? 4 : 0, Math.round((point.completed / maximum) * 100))}%`, backgroundColor: colors.accent }} /></View>)}</View></SectionCard>
    <SectionCard className="mb-3"><Text className="mb-3 text-sm font-black" style={{ color: colors.text }}>{t('analytics.focusTime')}</Text>{focusQuery.isLoading ? <LoadingState rows={1} /> : focus ? <View className="flex-row flex-wrap gap-2"><Metric label={t('analytics.today')} value={formatFocusMinutes(focus.focusMinutesToday)} /><Metric label={t('analytics.thisWeek')} value={formatFocusMinutes(focus.totalFocusMinutesThisWeek)} /><Metric label={t('analytics.sessionsToday')} value={String(focus.completedSessionsToday)} /><Metric label={t('analytics.streak')} value={`${focus.currentStreak} ${t('analytics.days', { count: focus.currentStreak })}`} /></View> : <Text style={{ color: colors.secondaryText }}>{t('analytics.noFocus')}</Text>}</SectionCard>
    <Breakdown title={t('analytics.byCategory')} entries={stats.byCategory} total={stats.totalTasks} loading={tasksQuery.isLoading} colors={colors} empty={t('analytics.noTasks')} />
    <Breakdown title={t('analytics.byPriority')} entries={stats.byPriority} total={stats.totalTasks} loading={tasksQuery.isLoading} colors={colors} empty={t('analytics.noTasks')} />
  </AppScreen>
}

function Metric({ label, value }: { label: string; value: string }) { const { theme } = useTheme(); return <View className="w-[47%] rounded-xl p-2" style={{ backgroundColor: theme.colors.background }}><Text className="text-xs" style={{ color: theme.colors.secondaryText }}>{label}</Text><Text className="text-lg font-black" style={{ color: theme.colors.text }}>{value}</Text></View> }
function Breakdown({ title, entries, total, loading, colors, empty }: { title: string; entries: [string, number][]; total: number; loading: boolean; colors: any; empty: string }) { return <SectionCard className="mb-3"><Text className="mb-3 text-sm font-black" style={{ color: colors.text }}>{title}</Text>{loading ? <LoadingState rows={1} /> : entries.length ? entries.map(([label, count]) => <View key={label} className="mb-3"><View className="mb-1 flex-row justify-between"><Text style={{ color: colors.text }}>{label}</Text><Text style={{ color: colors.secondaryText }}>{count} / {total ? Math.round(count / total * 100) : 0}%</Text></View><View className="h-2 rounded-full" style={{ backgroundColor: colors.background }}><View className="h-2 rounded-full" style={{ width: `${total ? count / total * 100 : 0}%`, backgroundColor: colors.accent }} /></View></View>) : <Text style={{ color: colors.secondaryText }}>{empty}</Text>}</SectionCard> }
