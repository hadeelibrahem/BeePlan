import { useState } from 'react'
import {
  AppLayout,
  PageHeader,
  TopActionBar,
  FilterTabs,
  SectionCard,
  type SidebarNavHandlers,
} from '../components/layout'
import { useLanguage } from '../i18n/LanguageContext'
import { useTheme } from '../theme/ThemeContext'
import type { ApiTask } from '../lib/tasksApi'
import { TeamMemberList } from '../features/collaboration/components/ai/TeamMemberList'
import { ProjectHealthPanel } from '../features/collaboration/components/ai/ProjectHealthPanel'
import { PlanView } from '../features/collaboration/components/ai/PlanView'
import { OverviewPanel } from '../features/collaboration/components/ai/OverviewPanel'
import { HistoryFeed } from '../features/collaboration/components/ai/HistoryFeed'
import { DistributionPanel } from '../features/collaboration/components/ai/DistributionPanel'
import type { PlanFocus } from '../features/collaboration/api/ai-collaboration.api'

type Tab = 'overview' | 'plan' | 'team' | 'health' | 'activity' | 'distribution'

const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'plan', label: 'Plan' },
  { value: 'team', label: 'Team' },
  { value: 'health', label: 'Health' },
  { value: 'activity', label: 'Activity' },
  { value: 'distribution', label: 'Distribution' },
]

/** Start a focus session on the recommended unit (wired by the app shell). */
export type StartFocusInput = {
  taskId: string
  taskTitle: string
  subtaskId: string | null
  subtaskTitle: string | null
  estimatedMinutes: number | null
}

type TaskCollaborationScreenProps = SidebarNavHandlers & {
  task?: ApiTask | null
  accessToken?: string
  currentUserId?: string
  onBack?: () => void
  onSignOut?: () => void
  onStartFocus?: (input: StartFocusInput) => void
}

/**
 * Persistent, tabbed AI Collaboration surface for a shared task. Five tabs —
 * Overview / Plan / Team / Health / Activity — so related data lives together
 * without duplication.
 *
 * Overview is the command centre and hosts the AI decision loop (see
 * SuggestionsFeed): every recommendation is explained, previewed against the
 * real forecast, and applied only on an explicit editor/owner approval. Findings
 * deep-link into Plan or Team carrying backend-provided filters, so "3 blocked
 * items" opens the Plan already filtered to those items.
 */
export default function TaskCollaborationScreen({
  task,
  accessToken = '',
  currentUserId = '',
  onBack,
  onSignOut,
  onStartFocus,
  ...nav
}: TaskCollaborationScreenProps) {
  const { t, toggleLanguage } = useLanguage()
  const { mode, toggleTheme } = useTheme()
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<Tab>('overview')
  // Deep-link focus from an Overview recommendation or alert. Cleared when the
  // user changes tabs themselves, so it never silently re-filters a later visit.
  const [focus, setFocus] = useState<PlanFocus | undefined>()

  const taskId = task?.id ?? ''

  const navigateToTab = (next: Tab, nextFocus?: PlanFocus) => {
    setFocus(nextFocus)
    setTab(next)
  }

  return (
    <AppLayout
      active="tasks"
      {...nav}
      onNavigateTasks={onBack}
    >
      <div className="mb-3 flex items-center gap-2 text-xs text-[var(--bp-muted)]">
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
          <TopActionBar pageOnly
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
          <p className="text-sm text-[var(--bp-muted)]">No task selected.</p>
        </SectionCard>
      ) : (
        <>
          <div className="mb-4">
            <FilterTabs tabs={TABS} active={tab} onChange={(next) => navigateToTab(next)} />
          </div>

          {tab === 'overview' ? (
            <OverviewPanel
              taskId={taskId}
              accessToken={accessToken}
              onNavigate={navigateToTab}
              onStartFocus={onStartFocus}
              onViewDetails={onBack}
            />
          ) : null}
          {tab === 'plan' ? (
            <PlanView taskId={taskId} accessToken={accessToken} initialFocus={focus} />
          ) : null}
          {tab === 'team' ? (
            <div className="space-y-4">
              <TeamMemberList taskId={taskId} accessToken={accessToken} initialFocus={focus} />
            </div>
          ) : null}
          {tab === 'health' ? (
            <ProjectHealthPanel
              taskId={taskId}
              accessToken={accessToken}
              onNavigate={navigateToTab}
            />
          ) : null}
          {tab === 'distribution' ? <DistributionPanel task={task} accessToken={accessToken} /> : null}
          {tab === 'activity' ? <HistoryFeed taskId={taskId} accessToken={accessToken} /> : null}
        </>
      )}
    </AppLayout>
  )
}
