import { useState, type ReactNode } from 'react'
import {
  AppLayout,
  FilterTabs,
  FloatingActionButton,
  PageHeader,
  SecondaryButton,
  SectionCard,
  StatsCard,
  TopActionBar,
  type SidebarNavHandlers,
} from '../components/layout'
import { useLanguage } from '../i18n/LanguageContext'
import { useTheme } from '../theme/ThemeContext'

type AllTasksScreenProps = SidebarNavHandlers & {
  onBackDashboard?: () => void
  onCreateTask?: () => void
  onViewTaskDetails?: () => void
  onSignOut?: () => void
}

type Task = {
  title: string
  category: string
  due: string
  priority: 'High' | 'Medium' | 'Low'
  status: 'To Do' | 'In Progress' | 'Done' | 'Missed'
  progress: number
  done?: boolean
}

type TaskFilter = 'all' | 'todo' | 'inProgress' | 'done' | 'missed'

const FILTERS: { value: TaskFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'todo', label: 'To Do' },
  { value: 'inProgress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
  { value: 'missed', label: 'Missed' },
]

const tasks: Task[] = [
  {
    title: 'Design new landing page hero section',
    category: 'Design',
    due: 'Today',
    priority: 'High',
    status: 'In Progress',
    progress: 65,
  },
  {
    title: 'Review mobile app design mockups',
    category: 'Design',
    due: 'Today',
    priority: 'Medium',
    status: 'To Do',
    progress: 0,
  },
  {
    title: 'Team sync - weekly standup notes',
    category: 'Meeting',
    due: 'Today',
    priority: 'Low',
    status: 'Done',
    progress: 100,
    done: true,
  },
  {
    title: 'Code review for payment module PR',
    category: 'Development',
    due: 'Tomorrow',
    priority: 'High',
    status: 'To Do',
    progress: 0,
  },
  {
    title: 'Bug fix - login page validation',
    category: 'Development',
    due: 'Tomorrow',
    priority: 'High',
    status: 'In Progress',
    progress: 30,
  },
  {
    title: 'Finalize Q3 marketing strategy deck',
    category: 'Marketing',
    due: 'Jun 7',
    priority: 'High',
    status: 'In Progress',
    progress: 72,
  },
  {
    title: 'Set up CI/CD pipeline for staging',
    category: 'Development',
    due: 'Jun 8',
    priority: 'High',
    status: 'In Progress',
    progress: 90,
  },
  {
    title: 'Research competitor pricing models',
    category: 'Research',
    due: 'Jul 1',
    priority: 'Medium',
    status: 'In Progress',
    progress: 60,
  },
]

export default function AllTasksScreen({
  onBackDashboard,
  onCreateTask,
  onViewTaskDetails,
  onSignOut,
  ...nav
}: AllTasksScreenProps) {
  const [search, setSearch] = useState('')
  const { t, toggleLanguage } = useLanguage()
  const { mode, toggleTheme } = useTheme()

  return (
    <AppLayout
      active="tasks"
      onNavigateDashboard={onBackDashboard}
      onNavigateReminders={nav.onNavigateReminders}
      onNavigateCalendar={nav.onNavigateCalendar}
      onNavigateNotes={nav.onNavigateNotes}
      onNavigateAnalytics={nav.onNavigateAnalytics}
      panelTitle="Keep going!"
      panelCaption="You're doing great today."
      panelPercent={64}
      fab={<FloatingActionButton onClick={onCreateTask} />}
    >
      <PageHeader
        title="All Tasks"
        subtitle="Manage, filter, and track all your tasks"
        toolbar={
          <TopActionBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search tasks..."
            themeMode={mode}
            onToggleTheme={toggleTheme}
            languageLabel={t('common.languageToggle')}
            onToggleLanguage={toggleLanguage}
            onProfileClick={onSignOut}
          />
        }
        pageActions={<SecondaryButton>Sort: Due Date</SecondaryButton>}
      />

      <div className="mb-6">
        <FilterTabs tabs={FILTERS} active="all" onChange={() => {}} />
      </div>

      <section className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatsCard icon="ALL" value="24" title="All Tasks" desc="Every task you've created" />
        <StatsCard icon="TODO" value="8" title="To Do" desc="Not started yet" />
        <StatsCard icon="MOVE" value="5" title="In Progress" desc="Currently working on" />
        <StatsCard icon="DONE" value="7" title="Done" desc="Completed tasks" />
        <StatsCard icon="LATE" value="4" title="Missed" desc="Past their due date" />
      </section>

      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <section className="space-y-4">
          <TaskGroup title="Today" count="5 tasks" tasks={tasks.slice(0, 3)} onViewTaskDetails={onViewTaskDetails} />
          <TaskGroup title="Tomorrow" count="3 tasks" tasks={tasks.slice(3, 5)} onViewTaskDetails={onViewTaskDetails} />
          <TaskGroup title="This Week" count="4 tasks" tasks={tasks.slice(5)} onViewTaskDetails={onViewTaskDetails} />
        </section>

        <aside className="space-y-4">
          <Panel title="Quick Filters">
            <FilterRow label="Overdue" count="3" color="bg-red-400" />
            <FilterRow label="Due Today" count="5" color="bg-[var(--bp-accent)]" />
            <FilterRow label="Due This Week" count="9" color="bg-blue-400" />
          </Panel>

          <Panel title="My Filters">
            <FilterRow label="Important" count="6" color="bg-[var(--bp-accent)]" />
            <FilterRow label="Personal Tasks" count="4" color="bg-purple-400" />
          </Panel>

          <Panel title="Categories">
            <FilterRow label="Work" count="12" color="bg-blue-400" />
            <FilterRow label="Personal" count="6" color="bg-purple-400" />
            <FilterRow label="Study" count="3" color="bg-green-400" />
            <FilterRow label="Health" count="2" color="bg-red-400" />
          </Panel>
        </aside>
      </div>
    </AppLayout>
  )
}

function TaskGroup({
  title,
  count,
  tasks,
  onViewTaskDetails,
}: {
  title: string
  count: string
  tasks: Task[]
  onViewTaskDetails?: () => void
}) {
  return (
    <div>
      <h3 className="mb-3 font-bold">
        {title} <span className="text-sm text-slate-400">- {count}</span>
      </h3>

      <div className="overflow-hidden rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)]">
        {tasks.map((task) => (
          <TaskRow key={task.title} task={task} onViewTaskDetails={onViewTaskDetails} />
        ))}
      </div>
    </div>
  )
}

function TaskRow({
  task,
  onViewTaskDetails,
}: {
  task: Task
  onViewTaskDetails?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onViewTaskDetails}
      className="grid w-full cursor-pointer grid-cols-[28px_1fr_120px_120px_160px_24px] items-center gap-4 border-b border-[var(--bp-border)] px-5 py-4 text-left transition hover:bg-[var(--bp-bg)] last:border-b-0"
    >
      <div className={`h-5 w-5 rounded-md border ${task.done ? 'border-green-400 bg-green-400' : 'border-slate-500'}`} />

      <div>
        <p className={`font-semibold text-[var(--bp-text)] ${task.done ? 'text-slate-500 line-through' : ''}`}>{task.title}</p>
        <p className="text-xs text-slate-400">{task.category} - {task.due}</p>
      </div>

      <Badge label={task.priority} type={task.priority} />
      <Badge label={task.status} type={task.status} />

      <div>
        <div className="h-2 rounded-full bg-[var(--bp-bg)]">
          <div
            className={`h-2 rounded-full ${
              task.progress === 100 ? 'bg-green-400' : task.progress === 0 ? 'bg-slate-600' : 'bg-[var(--bp-accent)]'
            }`}
            style={{ width: `${task.progress}%` }}
          />
        </div>
        <p className="mt-1 text-right text-xs text-slate-400">{task.progress}%</p>
      </div>

      <span className="text-slate-400">&gt;</span>
    </button>
  )
}

function Badge({ label, type }: { label: string; type: string }) {
  const color =
    type === 'High' || type === 'Missed'
      ? 'bg-red-500/20 text-red-300'
      : type === 'Medium'
        ? 'bg-orange-500/20 text-orange-300'
        : type === 'Low' || type === 'Done'
          ? 'bg-green-500/20 text-green-300'
          : type === 'In Progress'
            ? 'bg-blue-500/20 text-blue-300'
            : 'bg-slate-500/20 text-slate-300'

  return <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${color}`}>{label}</span>
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <SectionCard className="p-5">
      <h3 className="mb-4 font-bold">{title}</h3>
      {children}
    </SectionCard>
  )
}

function FilterRow({ label, count, color }: { label: string; count: string; color: string }) {
  return (
    <div className="mb-4 flex items-center justify-between text-sm last:mb-0">
      <div className="flex items-center gap-3">
        <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
        <span className="text-slate-300">{label}</span>
      </div>
      <span className="rounded-full bg-[var(--bp-border)] px-2 py-1 text-xs">{count}</span>
    </div>
  )
}
