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
import type { ApiTask } from '../lib/tasksApi'
import type { Reminder } from '../features/reminders'

type AnalyticsScreenProps = SidebarNavHandlers & {
  tasks?: ApiTask[]
  reminders?: Reminder[]
  onSignOut?: () => void
}

export default function AnalyticsScreen({ tasks = [], reminders = [], onSignOut, ...nav }: AnalyticsScreenProps) {
  const { t, toggleLanguage } = useLanguage()
  const { mode, toggleTheme } = useTheme()

  const totalTasks = tasks.length
  const completedTasks = tasks.filter((task) => task.status === 'done').length
  const missedTasks = tasks.filter((task) => task.status === 'missed').length
  const completionRate = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100)

  const byCategory = groupCount(tasks, (task) => task.category || 'Uncategorized')
  const byPriority = groupCount(tasks, (task) => task.priority)

  return (
    <AppLayout
      active="analytics"
      {...nav}
      panelTitle="Keep going!"
      panelCaption="You're doing great today."
      panelPercent={completionRate}
    >
      <PageHeader
        title="Analytics"
        subtitle="Track your productivity over time"
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

      <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatsCard icon={<TasksIcon className="h-5 w-5" />} value={String(completedTasks)} title="Completed Tasks" desc="Tasks marked done" />
        <StatsCard icon={<TasksIcon className="h-5 w-5" />} value={String(missedTasks)} title="Missed Tasks" desc="Tasks past their due date" />
        <StatsCard icon={<AnalyticsIcon className="h-5 w-5" />} value={`${completionRate}%`} title="Completion Rate" desc="Completed of all tasks" />
        <StatsCard icon={<RemindersIcon className="h-5 w-5" />} value={String(reminders.length)} title="Reminders" desc="Active and completed" />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard>
          <h2 className="mb-4 font-bold">Tasks by Category</h2>
          <BreakdownList entries={byCategory} total={totalTasks} />
        </SectionCard>

        <SectionCard>
          <h2 className="mb-4 font-bold">Tasks by Priority</h2>
          <BreakdownList entries={byPriority} total={totalTasks} labelize={capitalize} />
        </SectionCard>
      </div>
    </AppLayout>
  )
}

function groupCount<T>(items: T[], key: (item: T) => string): [string, number][] {
  const counts = new Map<string, number>()
  for (const item of items) {
    const label = key(item)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function BreakdownList({
  entries,
  total,
  labelize = (value: string) => value,
}: {
  entries: [string, number][]
  total: number
  labelize?: (value: string) => string
}) {
  if (!entries.length) {
    return <p className="text-sm text-slate-400">No tasks yet — create one to see a breakdown here.</p>
  }

  return (
    <div className="space-y-3">
      {entries.map(([label, count]) => {
        const percent = total === 0 ? 0 : Math.round((count / total) * 100)
        return (
          <div key={label}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-semibold text-[var(--bp-text)]">{labelize(label)}</span>
              <span className="text-slate-400">{count} - {percent}%</span>
            </div>
            <div className="h-2 rounded-full bg-[var(--bp-bg)]">
              <div className="h-2 rounded-full bg-[var(--bp-accent)]" style={{ width: `${percent}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
