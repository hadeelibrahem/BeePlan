import { useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AppLayout,
  DirectionalChevron,
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
import { AddTaskModeChooser } from '../components/AddTaskModeChooser'
import { SharedBadge } from '../features/collaboration/components/SharedBadge'
import { useSharedTaskIds } from '../features/collaboration/useSharedTaskIds'
import { useLanguage } from '../i18n/LanguageContext'
import { useTheme } from '../theme/ThemeContext'
import {
  changeTaskStatus,
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
import { useToast } from '../components/feedback/ToastProvider'
import { CoreListSkeleton, useDelayedSkeleton } from '../components/feedback/CoreListSkeleton'

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
  onTaskUpdated?: (task: ApiTask) => void
}

type Task = {
  id: string
  title: string
  category: string
  due: string
  dueDate?: string
  createdAt?: string
  priority: 'High' | 'Medium' | 'Low' | 'Urgent'
  status: 'To Do' | 'In Progress' | 'Done' | 'Missed'
  progress: number
  done?: boolean
  isBlocked: boolean
}

type TaskFilter = 'all' | 'todo' | 'inProgress' | 'done' | 'missed'
type SortField = 'due' | 'priority' | 'created' | 'title'
type SortDirection = 'asc' | 'desc'

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
const SORT_STORAGE_KEY = 'beeplan-task-sort'
const PRIORITY_RANK: Record<Task['priority'], number> = { Low: 1, Medium: 2, High: 3, Urgent: 4 }

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
  onTaskUpdated,
  ...nav
}: AllTasksScreenProps) {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(() => new Set())
  const [completionErrors, setCompletionErrors] = useState<Record<string, string>>({})
  const [statusSuccesses, setStatusSuccesses] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<TaskFilter>('all')
  const [dueFilter, setDueFilter] = useState<TaskDueFilter | null>(null)
  const [focusActive, setFocusActive] = useState(false)
  const [completedActive, setCompletedActive] = useState(false)
  const [highPriorityActive, setHighPriorityActive] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [addTaskChooserOpen, setAddTaskChooserOpen] = useState(false)
  const [sort, setSort] = useState<{ field: SortField; direction: SortDirection }>(() => {
    try {
      const saved = window.localStorage.getItem(SORT_STORAGE_KEY)
      return saved ? JSON.parse(saved) : { field: 'due', direction: 'asc' }
    } catch { return { field: 'due', direction: 'asc' } }
  })
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

  // This is the same unfiltered query the app shell, dashboard, and mutations
  // use. It gives the stat cards the same source as the list without another
  // fetch or a competing App-level copy of tasks.
  const baseTasksQuery = useQuery({
    queryKey: queryKeys.tasks.list({}),
    queryFn: () => getTasks(accessToken ?? ''),
    enabled: Boolean(accessToken),
  })

  const sharedTaskIds = useSharedTaskIds(accessToken)

  const summaryQuery = useQuery({
    queryKey: queryKeys.tasks.filterSummary,
    queryFn: () => getTaskFilterSummary(accessToken ?? ''),
    enabled: Boolean(accessToken),
  })

  async function toggleTaskCompletion(task: Task) {
    // Prevent double-submits: ignore clicks while this row's request is in flight.
    if (!accessToken || pendingTaskIds.has(task.id)) return

    const goingDone = !task.done

    // Respect dependency rules — a blocked task can't be completed until its
    // dependencies are done. Reopening is always allowed.
    if (goingDone && task.isBlocked) {
      setCompletionErrors((current) => ({
        ...current,
        [task.id]: 'Complete this task’s dependencies before marking it done.',
      }))
      return
    }

    clearCompletionError(task.id)
    setPendingTaskIds((current) => new Set(current).add(task.id))

    const listKey = queryKeys.tasks.list(filters)
    const previous = queryClient.getQueryData<ApiTask[]>(listKey)

    // Optimistically flip the row in the active list cache so the UI responds
    // instantly; roll back to `previous` if the server rejects the change.
    queryClient.setQueryData<ApiTask[]>(listKey, (current) =>
      current?.map((item) =>
        item.id === task.id
          ? { ...item, status: goingDone ? 'done' : 'todo', progress: goingDone ? 100 : 0 }
          : item,
      ),
    )

    try {
      const updated = await changeTaskStatus(accessToken, task.id, {
        status: goingDone ? 'done' : 'todo',
        progress: goingDone ? 100 : 0,
      })
      // Reconcile every task cache (including stat-card source data) so server
      // truth replaces the optimistic filtered-list value.
      onTaskUpdated?.(updated)
      showToast({ tone: 'success', message: goingDone ? 'Task completed.' : 'Task reopened.' })
    } catch (mutationError) {
      if (previous) queryClient.setQueryData(listKey, previous)
      setCompletionErrors((current) => ({
        ...current,
        [task.id]: mutationError instanceof Error ? mutationError.message : 'Unable to update this task.',
      }))
      showToast({ tone: 'error', message: mutationError instanceof Error ? mutationError.message : 'Unable to update this task.' })
    } finally {
      setPendingTaskIds((current) => {
        const next = new Set(current)
        next.delete(task.id)
        return next
      })
    }
  }

  async function changeSimpleTaskStatus(task: Task, nextStatus: 'To Do' | 'In Progress') {
    if (!accessToken || pendingTaskIds.has(task.id) || task.status === nextStatus) return

    if (nextStatus === 'In Progress' && task.isBlocked) {
      setCompletionErrors((current) => ({
        ...current,
        [task.id]: 'Complete this task\'s dependencies before starting it.',
      }))
      return
    }

    clearCompletionError(task.id)
    setStatusSuccesses((current) => {
      const next = { ...current }
      delete next[task.id]
      return next
    })
    setPendingTaskIds((current) => new Set(current).add(task.id))
    const listKey = queryKeys.tasks.list(filters)
    const previous = queryClient.getQueryData<ApiTask[]>(listKey)
    const apiStatus = nextStatus === 'To Do' ? 'todo' : 'in_progress'

    queryClient.setQueryData<ApiTask[]>(listKey, (current) =>
      current?.map((item) => (item.id === task.id ? { ...item, status: apiStatus } : item)),
    )

    try {
      const updated = await changeTaskStatus(accessToken, task.id, { status: apiStatus, progress: task.progress })
      onTaskUpdated?.(updated)
      setStatusSuccesses((current) => ({ ...current, [task.id]: `Status updated to ${nextStatus}.` }))
      showToast({ tone: 'success', message: `Status updated to ${nextStatus}.` })
    } catch (mutationError) {
      if (previous) queryClient.setQueryData(listKey, previous)
      setCompletionErrors((current) => ({
        ...current,
        [task.id]: mutationError instanceof Error ? mutationError.message : 'Unable to update this task.',
      }))
      showToast({ tone: 'error', message: mutationError instanceof Error ? mutationError.message : 'Unable to update this task.' })
    } finally {
      setPendingTaskIds((current) => {
        const next = new Set(current)
        next.delete(task.id)
        return next
      })
    }
  }

  function clearCompletionError(taskId: string) {
    setCompletionErrors((current) => {
      if (!current[taskId]) return current
      const next = { ...current }
      delete next[taskId]
      return next
    })
  }

  const mappedTasks = (baseTasksQuery.data ?? apiTasks).map(fromApiTask)
  const allCount = mappedTasks.length
  const todoCount = mappedTasks.filter((task) => task.status === 'To Do').length
  const inProgressCount = mappedTasks.filter((task) => task.status === 'In Progress').length
  const doneCount = mappedTasks.filter((task) => task.status === 'Done').length
  const missedCount = mappedTasks.filter((task) => task.status === 'Missed').length

  const filteredTasks = (tasksQuery.data ?? [])
    .map(fromApiTask)
    .filter((task) => task.title.toLowerCase().includes(search.toLowerCase()))
    .map((task, index) => ({ task, index }))
    .sort((left, right) => {
      const a = left.task
      const b = right.task
      let comparison = 0
      if (sort.field === 'title') comparison = a.title.localeCompare(b.title)
      else if (sort.field === 'priority') comparison = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
      else {
        const aValue = Date.parse(sort.field === 'due' ? a.dueDate ?? '' : a.createdAt ?? '')
        const bValue = Date.parse(sort.field === 'due' ? b.dueDate ?? '' : b.createdAt ?? '')
        comparison = (Number.isNaN(aValue) ? Number.MAX_SAFE_INTEGER : aValue) - (Number.isNaN(bValue) ? Number.MAX_SAFE_INTEGER : bValue)
      }
      return comparison === 0 ? left.index - right.index : sort.direction === 'asc' ? comparison : -comparison
    })
    .map(({ task }) => task)

  function updateSort(field: SortField) {
    const next: { field: SortField; direction: SortDirection } = field === sort.field ? { field, direction: sort.direction === 'asc' ? 'desc' : 'asc' } : { field, direction: field === 'priority' ? 'desc' : 'asc' }
    setSort(next)
    window.localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(next))
  }

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
  const listLoading = loading || tasksQuery.isLoading || baseTasksQuery.isLoading
  const showListSkeleton = useDelayedSkeleton(listLoading)

  return (
    <AppLayout
      active="tasks"
      {...nav}
      onNavigateDashboard={onBackDashboard}
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
        title={t('taskUi.allTasks.title')}
        subtitle={t('taskUi.allTasks.subtitle')}
        toolbar={
          <TopActionBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search tasks..."
            themeMode={mode}
            onToggleTheme={toggleTheme}
            languageLabel={t('common.languageToggle')}
            onToggleLanguage={toggleLanguage}
            onOpenNotifications={nav.onNavigateNotifications}
            onSignOut={onSignOut}
          />
        }
        pageActions={<div className="flex items-center gap-2"><label htmlFor="task-sort" className="text-xs font-bold text-slate-400">Sort</label><select id="task-sort" value={sort.field} onChange={(event) => updateSort(event.target.value as SortField)} className="rounded-lg border border-[var(--bp-border)] bg-[var(--bp-surface)] px-2 py-1.5 text-sm text-[var(--bp-text)]"><option value="due">Due date</option><option value="priority">Priority</option><option value="created">Created date</option><option value="title">Title</option></select><SecondaryButton onClick={() => updateSort(sort.field)}>{sort.direction === 'asc' ? 'Ascending' : 'Descending'}</SecondaryButton></div>}
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
        <StatsCard icon="To Do" value={String(todoCount)} title="To Do" desc="Not started yet" />
        <StatsCard icon="MOVE" value={String(inProgressCount)} title="In Progress" desc="Currently working on" />
        <StatsCard icon="DONE" value={String(doneCount)} title="Done" desc="Completed tasks" />
        <StatsCard icon="LATE" value={String(missedCount)} title="Missed" desc="Past their due date" />
      </section>

      {listError ? <p className="mb-3 text-sm font-semibold text-red-300">{listError}</p> : null}
      {listLoading && !showListSkeleton ? <p className="mb-3 text-sm text-[var(--bp-muted)]">Loading tasks...</p> : null}

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
          {showListSkeleton ? <CoreListSkeleton variant="tasks" /> : !listLoading && filteredTasks.length === 0 ? (
            <EmptyState
              icon="EMPTY"
              variant={hasActiveFilters || search ? 'filtered' : 'first-run'}
              title={t('taskUi.allTasks.emptyTitle')}
              description={
                hasActiveFilters || search
                  ? 'Try clearing a filter or adjusting your search.'
                  : "You don't have any tasks yet — create one to get started."
              }
            />
          ) : (
            <TaskGroup
              title="Tasks"
              count={`${filteredTasks.length} tasks`}
              tasks={filteredTasks}
              sharedTaskIds={sharedTaskIds}
              onViewTaskDetails={onViewTaskDetails}
        onToggleComplete={toggleTaskCompletion}
        onChangeSimpleStatus={changeSimpleTaskStatus}
              pendingTaskIds={pendingTaskIds}
              completionErrors={completionErrors}
              statusSuccesses={statusSuccesses}
            />
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

function TaskGroup({
  title,
  count,
  tasks,
  sharedTaskIds,
  onViewTaskDetails,
  onToggleComplete,
  onChangeSimpleStatus,
  pendingTaskIds,
  completionErrors,
  statusSuccesses,
}: {
  title: string
  count: string
  tasks: Task[]
  sharedTaskIds?: Set<string>
  onViewTaskDetails?: (taskId: string) => void
  onToggleComplete?: (task: Task) => void
  onChangeSimpleStatus?: (task: Task, status: 'To Do' | 'In Progress') => void
  pendingTaskIds?: Set<string>
  completionErrors?: Record<string, string>
  statusSuccesses?: Record<string, string>
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
            onToggleComplete={onToggleComplete}
            onChangeSimpleStatus={onChangeSimpleStatus}
            pending={pendingTaskIds?.has(task.id) ?? false}
            completionError={completionErrors?.[task.id]}
            statusSuccess={statusSuccesses?.[task.id]}
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
  onToggleComplete,
  onChangeSimpleStatus,
  pending = false,
  completionError,
  statusSuccess,
}: {
  task: Task
  isShared?: boolean
  onViewTaskDetails?: (taskId: string) => void
  onToggleComplete?: (task: Task) => void
  onChangeSimpleStatus?: (task: Task, status: 'To Do' | 'In Progress') => void
  pending?: boolean
  completionError?: string
  statusSuccess?: string
}) {
  const { isRTL } = useLanguage()
  const checkboxLabel = pending
    ? 'Updating task…'
    : task.done
      ? `Reopen task ${task.title}`
      : `Mark task ${task.title} as complete`

  return (
    <div className="grid grid-cols-[24px_1fr] items-start gap-3 border-b border-[var(--bp-border)] px-3 py-2.5 transition last:border-b-0 hover:bg-[var(--bp-bg)]">
      <button
        type="button"
        role="checkbox"
        aria-checked={task.done ?? false}
        aria-label={checkboxLabel}
        aria-busy={pending}
        disabled={pending}
        onClick={() => onToggleComplete?.(task)}
        className={`mt-0.5 flex h-4 w-4 items-center justify-center rounded border transition disabled:cursor-not-allowed disabled:opacity-60 ${
          task.done ? 'border-green-400 bg-green-400 text-[var(--bp-surface)]' : 'border-slate-500 hover:border-green-400'
        }`}
      >
        {task.done ? (
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path d="M2 6l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </button>

      <button
        type="button"
        onClick={() => onViewTaskDetails?.(task.id)}
        className="flex w-full cursor-pointer flex-col gap-2 text-start sm:grid sm:grid-cols-[minmax(0,1fr)_110px_110px_140px_20px] sm:items-center sm:gap-3"
      >
        <div className="min-w-0">
          <p className={`flex items-center gap-1.5 text-sm font-semibold text-[var(--bp-text)] ${task.done ? 'text-slate-500 line-through' : ''}`}>
            <span className="truncate">{task.title}</span>
            {isShared ? <SharedBadge /> : null}
          </p>
          <p className="truncate text-xs text-slate-400">{task.category} - {task.due}</p>
          {completionError ? <p className="mt-1 text-xs font-semibold text-red-300">{completionError}</p> : null}
          {statusSuccess ? <p className="mt-1 text-xs font-semibold text-green-400">{statusSuccess}</p> : null}
        </div>

        {/* On narrow widths these collapse into a wrapping row beneath the title;
            from `sm` up, `sm:contents` promotes them back into the dense grid columns. */}
        <div className="flex flex-wrap items-center gap-2 sm:contents">
          <Badge label={task.priority} type={task.priority} />
          <Badge label={task.status} type={task.status} />

          <div className="w-full min-w-[120px] sm:w-auto">
            <div role="progressbar" aria-label={`Progress for ${task.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={task.progress} className="h-1.5 rounded-full bg-[var(--bp-bg)]">
              <div
                className={`h-1.5 rounded-full ${
                  task.progress === 100 ? 'bg-green-400' : task.progress === 0 ? 'bg-slate-600' : 'bg-[var(--bp-accent)]'
                }`}
                style={{ width: `${task.progress}%` }}
              />
            </div>
            <p className="mt-1 text-end text-xs text-slate-400">{task.progress}%</p>
          </div>

          <DirectionalChevron
            direction="forward"
            isRTL={isRTL}
            className="hidden h-4 w-4 text-slate-400 sm:block"
          />
        </div>
      </button>
      <label className="col-start-2 flex w-fit items-center gap-2 text-xs font-semibold text-[var(--bp-muted)]">
        <span>Status</span>
        <select
          aria-label={`Change status for ${task.title}`}
          value={task.status === 'In Progress' ? 'In Progress' : 'To Do'}
          disabled={pending || task.status === 'Done' || task.status === 'Missed'}
          onChange={(event) => onChangeSimpleStatus?.(task, event.target.value as 'To Do' | 'In Progress')}
          className="rounded-md border border-[var(--bp-border)] bg-[var(--bp-surface)] px-2 py-1 text-xs font-semibold text-[var(--bp-text)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="To Do">To Do</option>
          <option value="In Progress">In Progress</option>
        </select>
      </label>
    </div>
  )
}

function fromApiTask(task: ApiTask): Task {
  return {
    id: task.id,
    title: task.title,
    category: task.category || 'General',
    due: formatDue(task.dueDate),
    dueDate: task.dueDate,
    createdAt: task.createdAt,
    priority: toUiPriority(task.priority) as Task['priority'],
    status: toUiStatus(task.status) as Task['status'],
    progress: task.progress,
    done: task.status === 'done',
    isBlocked: task.isBlocked ?? false,
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
