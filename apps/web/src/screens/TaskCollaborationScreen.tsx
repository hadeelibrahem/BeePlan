import { useState } from 'react'
import {
  AppLayout,
  PageHeader,
  TopActionBar,
  FilterTabs,
  StatsCard,
  SectionCard,
  type SidebarNavHandlers,
} from '../components/layout'
import { useLanguage } from '../i18n/LanguageContext'
import { useTheme } from '../theme/ThemeContext'
import type { ApiTask } from '../lib/tasksApi'
import {
  useCapacityQuery,
  useProgressQuery,
  useSuggestionsQuery,
  useTodayQuery,
} from '../features/collaboration/api/ai-collaboration.api'
import { CapacityOverview } from '../features/collaboration/components/ai/CapacityOverview'
import { TodayTeamPlan } from '../features/collaboration/components/ai/TodayTeamPlan'
import { TeamProgressComb } from '../features/collaboration/components/ai/TeamProgressComb'
import { DistributionPanel } from '../features/collaboration/components/ai/DistributionPanel'
import { SuggestionsFeed } from '../features/collaboration/components/ai/SuggestionsFeed'
import { TimelineView } from '../features/collaboration/components/ai/TimelineView'
import { HistoryFeed } from '../features/collaboration/components/ai/HistoryFeed'

type Tab = 'overview' | 'today' | 'progress' | 'distribution' | 'suggestions' | 'timeline' | 'history'

const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'today', label: 'Today' },
  { value: 'progress', label: 'Progress' },
  { value: 'distribution', label: 'Distribution' },
  { value: 'suggestions', label: 'Suggestions' },
  { value: 'timeline', label: 'Timeline' },
  { value: 'history', label: 'History' },
]

type TaskCollaborationScreenProps = SidebarNavHandlers & {
  task?: ApiTask | null
  accessToken?: string
  currentUserId?: string
  onBack?: () => void
  onSignOut?: () => void
}

/**
 * Persistent, tabbed AI Collaboration surface for a shared task. Replaces the
 * old one-shot AiCollaborationPlannerModal — the AI stays available across
 * Overview / Today / Progress / Distribution / Suggestions / Timeline /
 * History, and every change still requires the owner's explicit approval.
 */
export default function TaskCollaborationScreen({
  task,
  accessToken = '',
  currentUserId = '',
  onBack,
  onSignOut,
  ...nav
}: TaskCollaborationScreenProps) {
  const { t, toggleLanguage } = useLanguage()
  const { mode, toggleTheme } = useTheme()
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<Tab>('overview')

  const taskId = task?.id ?? ''

  return (
    <AppLayout
      active="tasks"
      {...nav}
      onNavigateTasks={onBack}
    >
      <div className="mb-3 flex items-center gap-2 text-xs text-slate-400">
        <button type="button" onClick={onBack} className="hover:text-[var(--bp-text)]">
          Back
        </button>
        <span>Tasks</span>
        <span>/</span>
        <span className="text-[var(--bp-text)]">AI Collaboration</span>
      </div>

      <PageHeader
        title="AI Collaboration"
        subtitle={task?.title ?? 'No task selected'}
        toolbar={
          <TopActionBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search..."
            themeMode={mode}
            onToggleTheme={toggleTheme}
            languageLabel={t('common.languageToggle')}
            onToggleLanguage={toggleLanguage}
            onOpenNotifications={nav.onNavigateNotifications}
            onSignOut={onSignOut}
          />
        }
      />

      {!task || !accessToken || !currentUserId ? (
        <SectionCard>
          <p className="text-sm text-slate-400">No task selected.</p>
        </SectionCard>
      ) : (
        <>
          <div className="mb-4">
            <FilterTabs tabs={TABS} active={tab} onChange={setTab} />
          </div>

          {tab === 'overview' ? <OverviewTab taskId={taskId} accessToken={accessToken} /> : null}
          {tab === 'today' ? <TodayTeamPlan taskId={taskId} accessToken={accessToken} /> : null}
          {tab === 'progress' ? <TeamProgressComb taskId={taskId} accessToken={accessToken} /> : null}
          {tab === 'distribution' ? <DistributionPanel task={task} accessToken={accessToken} /> : null}
          {tab === 'suggestions' ? <SuggestionsFeed taskId={taskId} accessToken={accessToken} /> : null}
          {tab === 'timeline' ? <TimelineView taskId={taskId} accessToken={accessToken} /> : null}
          {tab === 'history' ? <HistoryFeed taskId={taskId} accessToken={accessToken} /> : null}
        </>
      )}
    </AppLayout>
  )
}

function OverviewTab({ taskId, accessToken }: { taskId: string; accessToken: string }) {
  const todayQuery = useTodayQuery(taskId, accessToken)
  const capacityQuery = useCapacityQuery(taskId, accessToken)
  const progressQuery = useProgressQuery(taskId, accessToken)
  const suggestionsQuery = useSuggestionsQuery(taskId, accessToken)

  const pendingSuggestions = (suggestionsQuery.data?.items ?? []).filter((s) => s.status === 'pending').length

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatsCard
          icon={<span>🎯</span>}
          value={progressQuery.data ? `${progressQuery.data.overallPercent}%` : '—'}
          title="Overall progress"
          desc={
            progressQuery.data
              ? `${progressQuery.data.completedCount} of ${progressQuery.data.totalCount} done`
              : 'Loading…'
          }
        />
        <StatsCard
          icon={<span>💡</span>}
          value={String(pendingSuggestions)}
          title="Pending suggestions"
          desc={pendingSuggestions ? 'Waiting on your review' : "You're all caught up"}
        />
        <StatsCard
          icon={<span>👥</span>}
          value={String(capacityQuery.data?.members.length ?? 0)}
          title="Team members"
          desc="Tracked for this task"
        />
      </div>

      <SectionCard>
        <h3 className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">Today&apos;s goal</h3>
        <p className="text-sm font-bold text-[var(--bp-text)]">{todayQuery.data?.goal ?? 'Loading…'}</p>
      </SectionCard>

      <SectionCard>
        <h3 className="mb-3 text-[10px] font-black uppercase tracking-wide text-slate-400">Capacity snapshot</h3>
        {capacityQuery.isLoading ? (
          <p className="text-xs text-slate-400">Loading capacity…</p>
        ) : (
          <CapacityOverview members={capacityQuery.data?.members ?? []} compact />
        )}
      </SectionCard>
    </div>
  )
}
