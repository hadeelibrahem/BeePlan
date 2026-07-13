import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AppLayout,
  EmptyState,
  FilterTabs,
  FloatingActionButton,
  PageHeader,
  SecondaryButton,
  SectionCard,
  StatsCard,
  TopActionBar,
  type SidebarNavHandlers,
} from '../components/layout'
import RecurrenceSuggestionCard from '../components/RecurrenceSuggestionCard'
import { SharedBadge } from '../features/collaboration/components/SharedBadge'
import { useSharedTaskIds } from '../features/collaboration/useSharedTaskIds'
import { useLanguage } from '../i18n/LanguageContext'
import { useTheme } from '../theme/ThemeContext'
import {
  getTaskFilterSummary,
  getTasks,
  toUiPriority,
  toUiStatus,
  type ApiTask,
  type ApiTaskStatus,
  type RecurrenceSuggestion,
  type TaskDueFilter,
  type TaskFilters,
} from '../lib/tasksApi'
import { queryKeys } from '../lib/queryKeys'

type AllTasksScreenProps = SidebarNavHandlers & {
  onBackDashboard?: () => void
  onCreateTask?: () => void
  onCreateTaskAi?: () => void
  onViewTaskDetails?: (taskId: string) => void
  onSignOut?: () => void
  accessToken?: string | null
  tasks?: ApiTask[]
  recurrenceSuggestions?: RecurrenceSuggestion[]
  loading?: boolean
  error?: string
  onMakeRecurringSuggestion?: (suggestion: RecurrenceSuggestion) => void
  onDismissRecurrenceSuggestion?: (suggestion: RecurrenceSuggestion) => void
}

type Task = {
  id: string
  title: string
  category: string
  due: string
  priority: 'High' | 'Medium' | 'Low' | 'Urgent'
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

function mapTabToApiStatus(tab: TaskFilter): ApiTaskStatus | undefined {
  if (tab === 'todo') return 'todo'
  if (tab === 'inProgress') return 'in_progress'
  if (tab === 'done') return 'done'
  if (tab === 'missed') return 'missed'
  return undefined
}

const DUE_FILTER_LABELS: Record<TaskDueFilter, string> = {
  today: 'Today',
  upcoming: 'Upcoming',
  overdue: 'Overdue',
}

export default function AllTasksScreen({
  onBackDashboard,
  onCreateTask,
  onCreateTaskAi,
  onViewTaskDetails,
  onSignOut,
  accessToken,
  tasks: apiTasks = [],
  recurrenceSuggestions = [],
  loading = false,
  error = '',
  onMakeRecurringSuggestion,
  onDismissRecurrenceSuggestion,
  ...nav
}: AllTasksScreenProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<TaskFilter>('all')
  const [dueFilter, setDueFilter] = useState<TaskDueFilter | null>(null)
  const [focusActive, setFocusActive] = useState(false)
  const [completedActive, setCompletedActive] = useState(false)
  const [highPriorityActive, setHighPriorityActive] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [addTaskChooserOpen, setAddTaskChooserOpen] = useState(false)
  const { t, toggleLanguage } = useLanguage()
  const { mode, toggleTheme } = useTheme()

  const filters: TaskFilters = useMemo(() => {
    const next: TaskFilters = {}
    const status = mapTabToApiStatus(statusFilter)
    if (status) next.status = status
    if (dueFilter) next.due = dueFilter
    if (focusActive) next.focus = true
    if (completedActive) next.completed = true
    if (highPriorityActive) next.priority = 'high'
    if (categoryFilter) next.category = categoryFilter
    return next
  }, [statusFilter, dueFilter, focusActive, completedActive, highPriorityActive, categoryFilter])

  const hasActiveFilters =
    statusFilter !== 'all' ||
    Boolean(dueFilter) ||
    focusActive ||
    completedActive ||
    highPriorityActive ||
    Boolean(categoryFilter)

  const tasksQuery = useQuery({
    queryKey: queryKeys.tasks.list(filters),
    queryFn: () => getTasks(accessToken ?? '', filters),
    enabled: Boolean(accessToken),
  })

  const sharedTaskIds = useSharedTaskIds(accessToken)

  const summaryQuery = useQuery({
    queryKey: queryKeys.tasks.filterSummary,
    queryFn: () => getTaskFilterSummary(accessToken ?? ''),
    enabled: Boolean(accessToken),
  })

  const mappedTasks = apiTasks.map(fromApiTask)
  const allCount = mappedTasks.length
  const todoCount = mappedTasks.filter((task) => task.status === 'To Do').length
  const inProgressCount = mappedTasks.filter((task) => task.status === 'In Progress').length
  const doneCount = mappedTasks.filter((task) => task.status === 'Done').length
  const missedCount = mappedTasks.filter((task) => task.status === 'Missed').length

  const filteredTasks = (tasksQuery.data ?? [])
    .map(fromApiTask)
    .filter((task) => task.title.toLowerCase().includes(search.toLowerCase()))

  const counts = summaryQuery.data?.counts
  const categories = summaryQuery.data?.categories ?? []

  function clearFilters() {
    setStatusFilter('all')
    setDueFilter(null)
    setFocusActive(false)
    setCompletedActive(false)
    setHighPriorityActive(false)
    setCategoryFilter(null)
  }

  function toggleDueFilter(value: TaskDueFilter) {
    setDueFilter((current) => (current === value ? null : value))
  }

  const activeChips: { key: string; label: string; onRemove: () => void }[] = []
  if (statusFilter !== 'all') {
    activeChips.push({
      key: 'status',
      label: FILTERS.find((filter) => filter.value === statusFilter)?.label ?? statusFilter,
      onRemove: () => setStatusFilter('all'),
    })
  }
  if (dueFilter) {
    activeChips.push({ key: 'due', label: DUE_FILTER_LABELS[dueFilter], onRemove: () => setDueFilter(null) })
  }
  if (focusActive) {
    activeChips.push({ key: 'focus', label: 'Focus Tasks', onRemove: () => setFocusActive(false) })
  }
  if (completedActive) {
    activeChips.push({ key: 'completed', label: 'Completed', onRemove: () => setCompletedActive(false) })
  }
  if (highPriorityActive) {
    activeChips.push({ key: 'highPriority', label: 'High Priority', onRemove: () => setHighPriorityActive(false) })
  }
  if (categoryFilter) {
    activeChips.push({ key: 'category', label: categoryFilter, onRemove: () => setCategoryFilter(null) })
  }

  const listError = error || (tasksQuery.error instanceof Error ? tasksQuery.error.message : '')
  const listLoading = loading || tasksQuery.isLoading

  return (
    <AppLayout
      active="tasks"
      {...nav}
      onNavigateDashboard={onBackDashboard}
      panelTitle="Keep going!"
      panelCaption="You're doing great today."
      panelPercent={64}
      fab={<FloatingActionButton onClick={() => setAddTaskChooserOpen(true)} />}
    >
      {addTaskChooserOpen ? (
        <AddTaskModeChooser
          onClose={() => setAddTaskChooserOpen(false)}
          onManual={() => {
            setAddTaskChooserOpen(false)
            onCreateTask?.()
          }}
          onAiPlan={() => {
            setAddTaskChooserOpen(false)
            onCreateTaskAi?.()
          }}
        />
      ) : null}
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

      {recurrenceSuggestions.length ? (
        <div className="mb-4 grid gap-3 lg:grid-cols-2">
          {recurrenceSuggestions.map((suggestion) => (
            <RecurrenceSuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              onMakeRecurring={(item) => onMakeRecurringSuggestion?.(item)}
              onDismiss={(item) => onDismissRecurrenceSuggestion?.(item)}
            />
          ))}
        </div>
      ) : null}

      <div className="mb-4">
        <FilterTabs tabs={FILTERS} active={statusFilter} onChange={setStatusFilter} />
      </div>

      <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatsCard icon="ALL" value={String(allCount)} title="All Tasks" desc="Every task you've created" />
        <StatsCard icon="TODO" value={String(todoCount)} title="To Do" desc="Not started yet" />
        <StatsCard icon="MOVE" value={String(inProgressCount)} title="In Progress" desc="Currently working on" />
        <StatsCard icon="DONE" value={String(doneCount)} title="Done" desc="Completed tasks" />
        <StatsCard icon="LATE" value={String(missedCount)} title="Missed" desc="Past their due date" />
      </section>

      {listError ? <p className="mb-3 text-sm font-semibold text-red-300">{listError}</p> : null}
      {listLoading ? <p className="mb-3 text-sm text-slate-400">Loading tasks...</p> : null}

      {activeChips.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {activeChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.onRemove}
              className="flex items-center gap-1.5 rounded-full bg-[var(--bp-accent)]/15 px-3 py-1 text-xs font-semibold text-[var(--bp-accent)] transition hover:bg-[var(--bp-accent)]/25"
            >
              {chip.label}
              <span aria-hidden>&times;</span>
            </button>
          ))}
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-full border border-[var(--bp-border)] px-3 py-1 text-xs font-semibold text-slate-400 transition hover:border-[var(--bp-accent)]/40 hover:text-[var(--bp-text)]"
          >
            Clear Filters
          </button>
        </div>
      )}

      <div className="grid gap-3 xl:grid-cols-[1fr_240px]">
        <section className="space-y-3">
          {!listLoading && filteredTasks.length === 0 ? (
            <EmptyState
              icon="EMPTY"
              title="No tasks match the selected filters."
              description={
                hasActiveFilters || search
                  ? 'Try clearing a filter or adjusting your search.'
                  : "You don't have any tasks yet — create one to get started."
              }
            />
          ) : (
            <TaskGroup title="Tasks" count={`${filteredTasks.length} tasks`} tasks={filteredTasks} sharedTaskIds={sharedTaskIds} onViewTaskDetails={onViewTaskDetails} />
          )}
        </section>

        <aside className="space-y-3">
          <Panel title="Quick Filters">
            <FilterRow
              label="Overdue"
              count={counts?.overdue ?? 0}
              color="bg-red-400"
              active={dueFilter === 'overdue'}
              onClick={() => toggleDueFilter('overdue')}
            />
            <FilterRow
              label="Due Today"
              count={counts?.today ?? 0}
              color="bg-[var(--bp-accent)]"
              active={dueFilter === 'today'}
              onClick={() => toggleDueFilter('today')}
            />
            <FilterRow
              label="Upcoming"
              count={counts?.upcoming ?? 0}
              color="bg-blue-400"
              active={dueFilter === 'upcoming'}
              onClick={() => toggleDueFilter('upcoming')}
            />
            <FilterRow
              label="Focus Tasks"
              count={counts?.focus ?? 0}
              color="bg-purple-400"
              active={focusActive}
              onClick={() => setFocusActive((value) => !value)}
            />
            <FilterRow
              label="Completed"
              count={counts?.completed ?? 0}
              color="bg-green-400"
              active={completedActive}
              onClick={() => setCompletedActive((value) => !value)}
            />
            <FilterRow
              label="High Priority"
              count={counts?.highPriority ?? 0}
              color="bg-orange-400"
              active={highPriorityActive}
              onClick={() => setHighPriorityActive((value) => !value)}
            />
          </Panel>

          <Panel title="Categories">
            {categories.length === 0 ? (
              <p className="text-xs text-slate-400">No categories yet.</p>
            ) : (
              categories.map((category, index) => (
                <FilterRow
                  key={category.name}
                  label={category.name}
                  count={category.count}
                  color={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                  active={categoryFilter === category.name}
                  onClick={() => setCategoryFilter((current) => (current === category.name ? null : category.name))}
                />
              ))
            )}
          </Panel>
        </aside>
      </div>
    </AppLayout>
  )
}

const CATEGORY_COLORS = ['bg-blue-400', 'bg-purple-400', 'bg-green-400', 'bg-red-400', 'bg-orange-400', 'bg-[var(--bp-accent)]']

function AddTaskModeChooser({
  onClose,
  onManual,
  onAiPlan,
}: {
  onClose: () => void
  onManual: () => void
  onAiPlan: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Add task"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-black text-[var(--bp-text)]">Add Task</h3>
          <button type="button" onClick={onClose} className="text-slate-400 transition hover:text-[var(--bp-text)]">
            &times;
          </button>
        </div>

        <button
          type="button"
          onClick={onManual}
          className="mb-3 w-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-bg)] px-4 py-3.5 text-start transition hover:border-[var(--bp-accent)]/60"
        >
          <p className="font-bold text-[var(--bp-text)]">Manual Task</p>
          <p className="mt-1 text-xs text-slate-400">Fill in the task details yourself.</p>
        </button>

        <button
          type="button"
          onClick={onAiPlan}
          className="w-full rounded-xl border border-[var(--bp-accent)]/40 bg-[var(--bp-accent)]/10 px-4 py-3.5 text-start transition hover:border-[var(--bp-accent)]"
        >
          <p className="font-bold text-[var(--bp-accent)]">AI Plan Task</p>
          <p className="mt-1 text-xs text-slate-400">
            Describe a big goal and let AI break it into subtasks, focus sessions, and reminders.
          </p>
        </button>
      </div>
    </div>
  )
}

function TaskGroup({
  title,
  count,
  tasks,
  sharedTaskIds,
  onViewTaskDetails,
}: {
  title: string
  count: string
  tasks: Task[]
  sharedTaskIds?: Set<string>
  onViewTaskDetails?: (taskId: string) => void
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-bold">
        {title} <span className="text-xs text-slate-400">- {count}</span>
      </h3>

      <div className="overflow-hidden rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)]">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            isShared={sharedTaskIds?.has(task.id) ?? false}
            onViewTaskDetails={onViewTaskDetails}
          />
        ))}
      </div>
    </div>
  )
}

function TaskRow({
  task,
  isShared,
  onViewTaskDetails,
}: {
  task: Task
  isShared?: boolean
  onViewTaskDetails?: (taskId: string) => void
}) {
  const { isRTL } = useLanguage()

  return (
    <button
      type="button"
      onClick={() => onViewTaskDetails?.(task.id)}
      className="grid w-full cursor-pointer grid-cols-[24px_1fr_110px_110px_140px_20px] items-center gap-3 border-b border-[var(--bp-border)] px-3 py-2.5 text-start transition hover:bg-[var(--bp-bg)] last:border-b-0"
    >
      <div className={`h-4 w-4 rounded border ${task.done ? 'border-green-400 bg-green-400' : 'border-slate-500'}`} />

      <div className="min-w-0">
        <p className={`flex items-center gap-1.5 text-sm font-semibold text-[var(--bp-text)] ${task.done ? 'text-slate-500 line-through' : ''}`}>
          <span className="truncate">{task.title}</span>
          {isShared ? <SharedBadge /> : null}
        </p>
        <p className="text-xs text-slate-400">{task.category} - {task.due}</p>
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

function fromApiTask(task: ApiTask): Task {
  return {
    id: task.id,
    title: task.title,
    category: task.category || 'General',
    due: formatDue(task.dueDate),
    priority: toUiPriority(task.priority) as Task['priority'],
    status: toUiStatus(task.status) as Task['status'],
    progress: task.progress,
    done: task.status === 'done',
  }
}

function formatDue(value?: string) {
  if (!value) return 'No due date'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value))
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

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <SectionCard>
      <h3 className="mb-3 text-sm font-bold">{title}</h3>
      {children}
    </SectionCard>
  )
}

function FilterRow({
  label,
  count,
  color,
  active,
  onClick,
}: {
  label: string
  count: number
  color: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mb-3 flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm transition last:mb-0 ${
        active ? 'bg-[var(--bp-accent)]/15 text-[var(--bp-text)]' : 'text-slate-300 hover:bg-[var(--bp-bg)]'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${color}`} />
        <span className="text-sm">{label}</span>
      </div>
      <span
        className={`rounded-full px-2 py-0.5 text-xs ${
          active ? 'bg-[var(--bp-accent)] text-[var(--bp-accent-text)]' : 'bg-[var(--bp-border)]'
        }`}
      >
        {count}
      </span>
    </button>
  )
}
