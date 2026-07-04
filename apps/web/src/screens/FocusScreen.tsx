import { useState } from 'react'
import {
  AppLayout,
  PageHeader,
  TopActionBar,
  type SidebarNavHandlers,
} from '../components/layout'
import { useLanguage } from '../i18n/LanguageContext'
import { useTheme } from '../theme/ThemeContext'
import { toUiPriority, toUiStatus, type ApiTask } from '../lib/tasksApi'

type FocusScreenProps = SidebarNavHandlers & {
  onBackDashboard?: () => void
  onViewTaskDetails?: (taskId: string) => void
  onSignOut?: () => void
  tasks?: ApiTask[]
}

type FocusTask = {
  id: string
  title: string
  category: string
  due: string
  priority: 'High' | 'Medium' | 'Low' | 'Urgent'
  status: 'To Do' | 'In Progress' | 'Done' | 'Missed'
  progress: number
  remainingHours?: number
}

export default function FocusScreen({
  onBackDashboard,
  onViewTaskDetails,
  onSignOut,
  tasks: apiTasks = [],
  ...nav
}: FocusScreenProps) {
  const [search, setSearch] = useState('')
  const { t, toggleLanguage } = useLanguage()
  const { mode, toggleTheme } = useTheme()
  const focusTasks = apiTasks
    .filter((task) => task.isFocusTask)
    .map(fromApiTask)
    .filter((task) => task.title.toLowerCase().includes(search.toLowerCase()))

  return (
    <AppLayout
      active="focus"
      onNavigateDashboard={onBackDashboard}
      onNavigateTasks={nav.onNavigateTasks}
      onNavigateFocus={nav.onNavigateFocus}
      onNavigateReminders={nav.onNavigateReminders}
      onNavigateCalendar={nav.onNavigateCalendar}
      onNavigateNotes={nav.onNavigateNotes}
      onNavigateAnalytics={nav.onNavigateAnalytics}
      panelTitle="Stay focused"
      panelCaption="Tasks ready for a focus session."
      panelPercent={focusTasks.length ? 100 : 0}
    >
      <PageHeader
        title="Focus"
        subtitle="Tasks marked for a dedicated focus session"
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

      <div>
        <h3 className="mb-2 text-sm font-bold">
          Focus Queue <span className="text-xs text-slate-400">- {focusTasks.length} tasks</span>
        </h3>

        {focusTasks.length ? (
          <div className="overflow-hidden rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)]">
            {focusTasks.map((task) => (
              <FocusRow key={task.id} task={task} onViewTaskDetails={onViewTaskDetails} />
            ))}
          </div>
        ) : (
          <div className="flex h-32 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--bp-border)] px-4 text-center text-slate-500">
            <p className="text-sm font-black text-[var(--bp-text)]">No focus tasks yet</p>
            <p className="mt-1 text-xs">Turn on Focus Task from a task's details to add it here.</p>
          </div>
        )}
      </div>
    </AppLayout>
  )
}

function FocusRow({
  task,
  onViewTaskDetails,
}: {
  task: FocusTask
  onViewTaskDetails?: (taskId: string) => void
}) {
  const { isRTL } = useLanguage()

  return (
    <button
      type="button"
      onClick={() => onViewTaskDetails?.(task.id)}
      className="grid w-full cursor-pointer grid-cols-[1fr_110px_110px_140px_20px] items-center gap-3 border-b border-[var(--bp-border)] px-3 py-2.5 text-start transition hover:bg-[var(--bp-bg)] last:border-b-0"
    >
      <div>
        <p className="text-sm font-semibold text-[var(--bp-text)]">{task.title}</p>
        <p className="text-xs text-slate-400">
          {task.category} - {task.due}
          {task.remainingHours !== undefined ? ` - ${task.remainingHours}h remaining` : ''}
        </p>
      </div>

      <Badge label={task.priority} type={task.priority} />
      <Badge label={task.status} type={task.status} />

      <div>
        <div className="h-1.5 rounded-full bg-[var(--bp-bg)]">
          <div
            className={`h-1.5 rounded-full ${
              task.progress === 100 ? 'bg-green-400' : task.progress === 0 ? 'bg-slate-600' : 'bg-[var(--bp-accent)]'
            }`}
            style={{ width: `${task.progress}%` }}
          />
        </div>
        <p className="mt-1 text-end text-xs text-slate-400">{task.progress}%</p>
      </div>

      <span className="text-slate-400">{isRTL ? '<' : '>'}</span>
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

  return <span className={`w-fit rounded-full px-2 py-1 text-[11px] font-bold ${color}`}>{label}</span>
}

function fromApiTask(task: ApiTask): FocusTask {
  return {
    id: task.id,
    title: task.title,
    category: task.category || 'General',
    due: formatDue(task.dueDate),
    priority: toUiPriority(task.priority) as FocusTask['priority'],
    status: toUiStatus(task.status) as FocusTask['status'],
    progress: task.progress,
    remainingHours: task.estimatedTimeMinutes > 0 ? task.remainingHours : undefined,
  }
}

function formatDue(value?: string) {
  if (!value) return 'No due date'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value))
}
