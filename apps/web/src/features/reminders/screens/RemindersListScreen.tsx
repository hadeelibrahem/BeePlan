import { useState } from 'react'
import { ArrowDownUp, Search, Sparkles } from 'lucide-react'
import {
  AppLayout,
  EmptyState,
  FilterTabs,
  FloatingActionButton,
  PageHeader,
  RemindersIcon,
  StatsCard,
  TopActionBar,
  type SidebarNavHandlers,
} from '../../../components/layout'
import { useLanguage } from '../../../i18n/LanguageContext'
import { useTheme } from '../../../theme/ThemeContext'
import { ReminderCard } from '../components/ReminderCard'
import { CoreListSkeleton, useDelayedSkeleton } from '../../../components/feedback/CoreListSkeleton'
import type { Reminder, ReminderType } from '../types/reminders.types'

type FilterTab = 'all' | ReminderType | 'completed'

type Props = SidebarNavHandlers & {
  reminders: Reminder[]
  onSelect: (id: string) => void
  onCreate: () => void
  /** Open the reminder create form with the Person type preselected. */
  onCreatePerson?: () => void
  onToggle: (id: string) => void
  onBack?: () => void
  onSignOut?: () => void
  loading?: boolean
}

export function RemindersListScreen({
  reminders,
  onSelect,
  onCreate,
  onCreatePerson,
  onToggle,
  onBack,
  onSignOut,
  loading = false,
  onNavigateTasks,
  onNavigateFocus,
  onNavigatePlanner,
  onNavigatePeople,
  onNavigateNotifications,
  onNavigateCalendar,
  onNavigateNotes,
  onNavigateAnalytics,
  onNavigateSettings,
}: Props) {
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [sort, setSort] = useState<'date' | 'priority' | 'created' | 'alphabetical'>('date')
  const [pageSize, setPageSize] = useState(40)
  const { t, toggleLanguage } = useLanguage()
  const { mode, toggleTheme } = useTheme()
  const showSkeleton = useDelayedSkeleton(loading)

  const tabs: { value: FilterTab; label: string }[] = [
    { value: 'all', label: t('filters.all') },
    { value: 'time', label: t('filters.time') },
    { value: 'location', label: t('filters.location') },
    { value: 'person', label: 'People' },
    { value: 'checklist', label: t('filters.checklist') },
    { value: 'context', label: t('filters.context') },
    { value: 'completed', label: t('filters.completed') },
  ]

  const filtered = reminders.filter((reminder) => {
    const matchSearch =
      !search ||
      reminder.title.toLowerCase().includes(search.toLowerCase()) ||
      reminder.description?.toLowerCase().includes(search.toLowerCase()) ||
      getTriggerSearchText(reminder).toLowerCase().includes(search.toLowerCase())

    const matchTab =
      activeTab === 'all'
        ? reminder.status !== 'done'
        : activeTab === 'completed'
          ? reminder.status === 'done'
          : reminder.type === activeTab && reminder.status !== 'done'

    return matchSearch && matchTab
  }).sort((a, b) => {
    if (sort === 'alphabetical') return a.title.localeCompare(b.title)
    if (sort === 'created') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    if (sort === 'priority') return priorityRank(b.priority) - priorityRank(a.priority)
    return (new Date(a.remindAt ?? a.updatedAt).getTime() || Infinity) - (new Date(b.remindAt ?? b.updatedAt).getTime() || Infinity)
  })
  const visibleReminders = filtered.slice(0, pageSize)

  const totalCount = reminders.length
  const activeCount = reminders.filter((reminder) => reminder.status === 'active').length
  const completedCount = reminders.filter((reminder) => reminder.status === 'done').length
  const highPriorityCount = reminders.filter(
    (reminder) => reminder.priority === 'high' || reminder.priority === 'urgent',
  ).length
  const completionPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  return (
    <AppLayout
      active="reminders"
      onNavigateDashboard={onBack}
      onNavigateTasks={onNavigateTasks}
      onNavigateFocus={onNavigateFocus}
      onNavigatePlanner={onNavigatePlanner}
      onNavigatePeople={onNavigatePeople}
      onNavigateNotifications={onNavigateNotifications}
      onNavigateCalendar={onNavigateCalendar}
      onNavigateNotes={onNavigateNotes}
      onNavigateAnalytics={onNavigateAnalytics}
      onNavigateSettings={onNavigateSettings}
      panelTitle="Keep going!"
      panelCaption={`${activeCount} active reminder${activeCount === 1 ? '' : 's'} to handle.`}
      panelPercent={completionPercent}
      fab={<FloatingActionButton onClick={onCreate} />}
    >
      <PageHeader
        title={t('dashboard.remindersTitle')}
        subtitle={t('dashboard.remindersSubtitle')}
        toolbar={
          <TopActionBar pageOnly
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder={t('dashboard.searchPlaceholder')}
            themeMode={mode}
            onToggleTheme={toggleTheme}
            languageLabel={t('common.languageToggle')}
            onToggleLanguage={toggleLanguage}
            onSignOut={onSignOut}
          />
        }
      />

      <section className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <StatsCard
          icon={<RemindersIcon className="h-4 w-4" />}
          value={String(totalCount)}
          title={t('dashboard.statTotal')}
          desc={t('dashboard.statTotalDesc')}
        />
        <StatsCard
          icon={<RemindersIcon className="h-4 w-4" />}
          value={String(activeCount)}
          title={t('dashboard.statActive')}
          desc={t('dashboard.statActiveDesc')}
        />
        <StatsCard
          icon={<RemindersIcon className="h-4 w-4" />}
          value={String(completedCount)}
          title={t('dashboard.statCompleted')}
          desc={t('dashboard.statCompletedDesc')}
        />
        <StatsCard
          icon={<RemindersIcon className="h-4 w-4" />}
          value={String(highPriorityCount)}
          title={t('dashboard.statHighPriority')}
          desc={t('dashboard.statHighPriorityDesc')}
        />
      </section>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <FilterTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
        <label className="flex items-center gap-1.5 rounded-lg border border-[var(--bp-border)] bg-[var(--bp-surface)] px-2.5 py-1.5 text-xs text-[var(--bp-muted)]">
          <ArrowDownUp className="h-3.5 w-3.5" />
          <span className="sr-only">Sort reminders</span>
          <select value={sort} onChange={(event) => { setSort(event.target.value as typeof sort); setPageSize(40) }} className="bg-transparent text-xs font-semibold text-[var(--bp-text)] outline-none">
            <option value="date">Date</option><option value="priority">Priority</option><option value="created">Recently created</option><option value="alphabetical">Alphabetical</option>
          </select>
        </label>
        {onCreatePerson && (
          <button
            type="button"
            onClick={onCreatePerson}
            className="rounded-lg border border-sky-400/40 bg-sky-400/10 px-3 py-2 text-xs font-semibold text-sky-300 transition hover:bg-sky-400/20"
          >
            {'👤 Create Person Reminder'}
          </button>
        )}
      </div>

      {search && <div className="mb-3 flex items-center gap-2 text-xs text-[var(--bp-muted)]"><Search className="h-3.5 w-3.5" /> Showing {filtered.length} matching reminder{filtered.length === 1 ? '' : 's'}</div>}

      {showSkeleton ? <CoreListSkeleton variant="reminders" rows={3} /> : filtered.length === 0 ? (
        activeTab === 'person' ? (
          <EmptyState
            illustration={<Sparkles className="h-6 w-6" />}
            variant="first-run"
            title="No person reminders yet"
            description="Create one to be reminded when someone is nearby."
            actionLabel={onCreatePerson ? 'Create Person Reminder' : undefined}
            onAction={onCreatePerson}
          />
        ) : (
          <EmptyState
            illustration={<Sparkles className="h-6 w-6" />}
            variant={search ? 'filtered' : 'first-run'}
            title={search ? t('dashboard.noResults') : t('dashboard.noReminders')}
            description={search ? t('dashboard.tryDifferentSearch') : t('dashboard.createFirstReminder')}
            actionLabel={search ? undefined : t('dashboard.newReminder')}
            onAction={search ? undefined : onCreate}
          />
        )
      ) : (
        <section className="flex flex-col gap-2">
          {visibleReminders.map((reminder) => (
            <ReminderCard
              key={reminder.id}
              reminder={reminder}
              onPress={() => onSelect(reminder.id)}
              onToggle={() => onToggle(reminder.id)}
            />
          ))}
        </section>
      )}
      {!showSkeleton && filtered.length > visibleReminders.length && <button type="button" onClick={() => setPageSize((size) => size + 40)} className="mx-auto mt-4 block rounded-lg border border-[var(--bp-border)] px-4 py-2 text-xs font-semibold text-[var(--bp-muted)] hover:border-[var(--bp-accent)] hover:text-[var(--bp-text)]">Load more reminders</button>}
    </AppLayout>
  )
}

function priorityRank(priority: Reminder['priority']) { return priority === 'urgent' ? 4 : priority === 'high' ? 3 : priority === 'medium' ? 2 : 1 }
function getTriggerSearchText(reminder: Reminder) { return [reminder.remindAt, reminder.context?.condition, reminder.person?.targetName, reminder.person?.targetFriendName, reminder.location?.generalCategory?.customLabel, reminder.location?.specificPlace?.placeName].filter(Boolean).join(' ') }
