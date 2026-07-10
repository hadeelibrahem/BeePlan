import { useState } from 'react'
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
import type { Reminder, ReminderType } from '../types/reminders.types'

type FilterTab = 'all' | ReminderType | 'completed'

type Props = SidebarNavHandlers & {
  reminders: Reminder[]
  onSelect: (id: string) => void
  onCreate: () => void
  onToggle: (id: string) => void
  onBack?: () => void
  onSignOut?: () => void
}

export function RemindersListScreen({
  reminders,
  onSelect,
  onCreate,
  onToggle,
  onBack,
  onSignOut,
  onNavigateTasks,
  onNavigateFocus,
  onNavigatePlanner,
  onNavigatePeople,
  onNavigateCalendar,
  onNavigateNotes,
  onNavigateAnalytics,
}: Props) {
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const { t, toggleLanguage } = useLanguage()
  const { mode, toggleTheme } = useTheme()

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
      reminder.description?.toLowerCase().includes(search.toLowerCase())

    const matchTab =
      activeTab === 'all'
        ? reminder.status !== 'done'
        : activeTab === 'completed'
          ? reminder.status === 'done'
          : reminder.type === activeTab && reminder.status !== 'done'

    return matchSearch && matchTab
  })

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
      onNavigateCalendar={onNavigateCalendar}
      onNavigateNotes={onNavigateNotes}
      onNavigateAnalytics={onNavigateAnalytics}
      panelTitle="Keep going!"
      panelCaption={`${activeCount} active reminder${activeCount === 1 ? '' : 's'} to handle.`}
      panelPercent={completionPercent}
      fab={<FloatingActionButton onClick={onCreate} />}
    >
      <PageHeader
        title={t('dashboard.remindersTitle')}
        subtitle={t('dashboard.remindersSubtitle')}
        toolbar={
          <TopActionBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder={t('dashboard.searchPlaceholder')}
            themeMode={mode}
            onToggleTheme={toggleTheme}
            languageLabel={t('common.languageToggle')}
            onToggleLanguage={toggleLanguage}
            onProfileClick={onSignOut}
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

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <FilterTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
        {onNavigatePeople && (
          <button
            type="button"
            onClick={onNavigatePeople}
            className="rounded-lg border border-sky-400/40 bg-sky-400/10 px-3 py-2 text-xs font-semibold text-sky-300 transition hover:bg-sky-400/20"
          >
            {'👤 Create Person Reminder'}
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        activeTab === 'person' ? (
          <EmptyState
            icon={<RemindersIcon className="h-5 w-5" />}
            title="No person reminders yet"
            description="Create one to be reminded when someone is nearby."
            actionLabel={onNavigatePeople ? 'Create Person Reminder' : undefined}
            onAction={onNavigatePeople}
          />
        ) : (
          <EmptyState
            icon={<RemindersIcon className="h-5 w-5" />}
            title={search ? t('dashboard.noResults') : t('dashboard.noReminders')}
            description={search ? t('dashboard.tryDifferentSearch') : t('dashboard.createFirstReminder')}
            actionLabel={search ? undefined : t('dashboard.newReminder')}
            onAction={search ? undefined : onCreate}
          />
        )
      ) : (
        <section className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {filtered.map((reminder) => (
            <ReminderCard
              key={reminder.id}
              reminder={reminder}
              onPress={() => onSelect(reminder.id)}
              onToggle={() => onToggle(reminder.id)}
            />
          ))}
        </section>
      )}
    </AppLayout>
  )
}
