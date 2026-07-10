import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { AppLayout, PageHeader, TopActionBar, type SidebarNavHandlers } from '../components/layout'
import { DangerButton, OutlineButton, PrimaryButton } from '../components/layout/Buttons'
import AttachmentPreviewModal from '../components/AttachmentPreviewModal'
import SubtaskDetailModal from '../components/SubtaskDetailModal'
import SubtaskFormModal from '../components/SubtaskFormModal'
import RecurrenceSuggestionCard from '../components/RecurrenceSuggestionCard'
import {
  formatDuration,
  getSubtaskIndicator,
  SUBTASK_INDICATOR_META,
  SUBTASK_PRIORITY_CLASS,
  SUBTASK_PRIORITY_LABEL,
  SUBTASK_STATUS_CLASS,
  SUBTASK_STATUS_LABEL,
} from '../lib/subtaskDisplay'
import { type DependencyTask } from '../components/TaskDependenciesWorkflowModal'
import { TaskStatusWorkflowModal, type TaskStatus } from '../components/TaskStatusWorkflowModal'
import { useLanguage } from '../i18n/LanguageContext'
import { useTheme } from '../theme/ThemeContext'
import {
  changeTaskStatus,
  getAttachments,
  recurrenceToUi,
  toApiStatus,
  toUiPriority,
  toUiStatus,
  updateSubtask,
  type ApiTask,
  type ApiTaskActivity,
  type ApiSubtask,
  type ApiTaskAttachment,
  type RecurrenceSuggestion,
  type UiRecurrence,
} from '../lib/tasksApi'

type TaskDetailsScreenProps = SidebarNavHandlers & {
  task?: ApiTask | null
  tasks?: ApiTask[]
  accessToken?: string
  recurrenceSuggestions?: RecurrenceSuggestion[]
  onTaskUpdated?: (task: ApiTask) => void
  onRefresh?: () => void
  onBack?: () => void
  onEdit?: () => void
  onDelete?: () => void
  onMarkDone?: () => void
  onMakeRecurringSuggestion?: (suggestion: RecurrenceSuggestion) => void
  onDismissRecurrenceSuggestion?: (suggestion: RecurrenceSuggestion) => void
  onSignOut?: () => void
}

export default function TaskDetailsScreen({
  task,
  tasks = [],
  accessToken = '',
  recurrenceSuggestions = [],
  onTaskUpdated,
  onBack,
  onEdit,
  onDelete,
  onMakeRecurringSuggestion,
  onDismissRecurrenceSuggestion,
  onSignOut,
  ...nav
}: TaskDetailsScreenProps) {
  const { t, toggleLanguage } = useLanguage()
  const { mode, toggleTheme } = useTheme()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<TaskStatus>(toTaskStatus(task))
  const [progress, setProgress] = useState(task?.progress ?? 0)
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false)
  const [dependencies, setDependencies] = useState<DependencyTask[]>(
    task ? toDependencyTasks(task.dependencies) : [],
  )
  const [recurrence, setRecurrence] = useState(task ? recurrenceToUi(task.recurrence) : null)
  const [subtaskItems, setSubtaskItems] = useState<ApiSubtask[]>(task?.subtasks ?? [])
  const [detailSubtaskId, setDetailSubtaskId] = useState<string | null>(null)
  const [editSubtaskId, setEditSubtaskId] = useState<string | null>(null)
  const [activityItems, setActivityItems] = useState<ApiTaskActivity[]>(task?.activities ?? [])
  const [attachmentItems, setAttachmentItems] = useState<ApiTaskAttachment[]>([])
  const [previewAttachment, setPreviewAttachment] = useState<ApiTaskAttachment | null>(null)
  const [error, setError] = useState('')

  const latestActivity = useMemo(
    () =>
      [...activityItems].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0],
    [activityItems],
  )
  const completedSubtasksCount = useMemo(
    () => subtaskItems.filter((subtask) => subtask.isDone).length,
    [subtaskItems],
  )
  const detailSubtask = useMemo(
    () => subtaskItems.find((item) => item.id === detailSubtaskId) ?? null,
    [subtaskItems, detailSubtaskId],
  )
  const editSubtask = useMemo(
    () => subtaskItems.find((item) => item.id === editSubtaskId) ?? null,
    [subtaskItems, editSubtaskId],
  )
  const syncTaskFromModal = useCallback(
    (updated: ApiTask) => {
      setSubtaskItems(updated.subtasks)
      setProgress(updated.progress)
      setStatus(toTaskStatus(updated))
      onTaskUpdated?.(updated)
    },
    [onTaskUpdated],
  )
  const dependenciesComplete = useMemo(
    () => dependencies.length > 0 && dependencies.every((item) => item.status === 'Done'),
    [dependencies],
  )
  const isBlocked = dependencies.length > 0 && !dependenciesComplete
  const reminderText = task?.reminderEnabled
    ? `${task.reminderBeforeMinutes ?? 30} minutes before due date`
    : 'No reminder set'
  const focusText = task?.isFocusTask ? 'Enabled' : 'Not set'

  useEffect(() => {
    if (!task) return

    setStatus(toTaskStatus(task))
    setProgress(task.progress)
    setDependencies(toDependencyTasks(task.dependencies))
    setRecurrence(recurrenceToUi(task.recurrence))
    setSubtaskItems(task.subtasks)
    setActivityItems(task.activities)
  }, [task])

  useEffect(() => {
    if (!task || !accessToken) return
    let cancelled = false

    getAttachments(accessToken, task.id)
      .then((items) => {
        if (!cancelled) setAttachmentItems(items)
      })
      .catch((fetchError: unknown) => {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : 'Unable to load attachments.')
        }
      })

    return () => {
      cancelled = true
    }
  }, [task, accessToken])

  const handleOpenAttachment = useCallback(
    (attachment: ApiTaskAttachment) => {
      if (!task || !accessToken || !attachment.id) return
      setPreviewAttachment(attachment)
    },
    [task, accessToken],
  )

  const handleToggleSubtask = useCallback(
    async (subtask: ApiSubtask) => {
      if (!task || !accessToken) return

      // Optimistic update: flip the subtask and recompute progress locally
      // right away, then reconcile with the server response in the
      // background. Roll back only this subtask if the request fails.
      const nextIsDone = !subtask.isDone
      const previousSubtaskItems = subtaskItems
      const previousProgress = progress
      const optimisticSubtasks: ApiSubtask[] = subtaskItems.map((item) =>
        item.id === subtask.id
          ? { ...item, isDone: nextIsDone, status: nextIsDone ? 'done' : 'todo' }
          : item,
      )
      const optimisticProgress = optimisticSubtasks.length
        ? Math.round((optimisticSubtasks.filter((item) => item.isDone).length / optimisticSubtasks.length) * 100)
        : progress

      setSubtaskItems(optimisticSubtasks)
      setProgress(optimisticProgress)
      setError('')

      try {
        const updatedTask = await updateSubtask(accessToken, task.id, subtask.id, {
          isDone: nextIsDone,
          status: nextIsDone ? 'done' : 'todo',
        })
        setSubtaskItems(updatedTask.subtasks)
        setActivityItems(updatedTask.activities)
        setProgress(updatedTask.progress)
        onTaskUpdated?.(updatedTask)
      } catch (subtaskError) {
        setSubtaskItems(previousSubtaskItems)
        setProgress(previousProgress)
        setError(subtaskError instanceof Error ? subtaskError.message : 'Unable to update subtask.')
      }
    },
    [task, accessToken, subtaskItems, progress, onTaskUpdated],
  )

  const saveStatus = useCallback(
    async (nextStatus: {
      status: TaskStatus
      progress: number
      completionDate?: string
      missedReason?: string
    }) => {
      if (
        isBlocked &&
        (nextStatus.status === 'In Progress' || nextStatus.status === 'Done') &&
        nextStatus.status !== status
      ) {
        setError('This task cannot start until all its dependencies are completed.')
        setIsStatusModalOpen(false)
        return
      }

      const subtasksIncomplete = subtaskItems.length > 0 && completedSubtasksCount < subtaskItems.length
      if (nextStatus.status === 'Done' && subtasksIncomplete) {
        setError('Complete all subtasks before marking this task as Done.')
        setIsStatusModalOpen(false)
        return
      }

      setError('')

      if (task && accessToken) {
        // Optimistic update: reflect the new status/progress immediately and
        // close the sheet right away; roll back if the server rejects it.
        const previousStatus = status
        const previousProgress = progress
        setStatus(nextStatus.status)
        setProgress(nextStatus.progress)
        setIsStatusModalOpen(false)

        const payload = {
          status: toApiStatus(nextStatus.status),
          progress: nextStatus.progress,
          ...(nextStatus.status === 'Done' && nextStatus.completionDate
            ? { completionDate: nextStatus.completionDate }
            : {}),
          ...(nextStatus.status === 'Missed' && nextStatus.missedReason?.trim()
            ? { missedReason: nextStatus.missedReason.trim() }
            : {}),
        }
        try {
          const updatedTask = await changeTaskStatus(accessToken, task.id, payload)
          setStatus(toTaskStatus(updatedTask))
          setProgress(updatedTask.progress)
          setActivityItems(updatedTask.activities)
          onTaskUpdated?.(updatedTask)
        } catch (saveError) {
          setStatus(previousStatus)
          setProgress(previousProgress)
          setError(saveError instanceof Error ? saveError.message : 'Unable to change task status.')
        }
      }
    },
    [isBlocked, status, subtaskItems, completedSubtasksCount, task, accessToken, progress, onTaskUpdated],
  )

  return (
    <>
      <AppLayout
        active="tasks"
        {...nav}
        onNavigateTasks={onBack}
        panelTitle="Keep going!"
        panelCaption="You're doing great today."
        panelPercent={64}
      >
        <div className="mb-3 flex items-center gap-2 text-xs text-slate-400">
          <button type="button" onClick={onBack} className="hover:text-[var(--bp-text)]">
            Back
          </button>
          <span>Tasks</span>
          <span>/</span>
          <span className="text-[var(--bp-text)]">Task Details</span>
        </div>

        <PageHeader
          title="Task Details"
          subtitle="View your task at a glance"
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
        />

        <section className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap gap-1.5">
                <Badge color={statusColor(status)}>{status}</Badge>
                <Badge color="red">{task ? toUiPriority(task.priority) : 'Medium'}</Badge>
                <Badge color="yellow">{task?.category || 'Uncategorized'}</Badge>
              </div>
              <h2 className="mb-1.5 text-lg font-black">{task?.title ?? 'No task selected'}</h2>
              <p className="max-w-3xl text-sm leading-6 text-slate-400">
                {task?.description || 'No description provided.'}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              <PrimaryButton size="sm" onClick={onEdit}>Edit Task</PrimaryButton>
              <OutlineButton size="sm" onClick={() => setIsStatusModalOpen(true)}>Change Status</OutlineButton>
              <DangerButton size="sm" onClick={onDelete}>Delete Task</DangerButton>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <InfoBox title="Created" value={formatDate(task?.createdAt) || 'Not available'} />
            <InfoBox title="Updated" value={formatDate(task?.updatedAt) || 'Not available'} />
            <InfoBox
              title="Due Date"
              value={`${formatDate(task?.dueDate) || 'No due date'}${task?.dueTime ? ` - ${task.dueTime}` : ''}`}
            />
          </div>
        </section>

        {recurrenceSuggestions.length ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
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

        <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_240px]">
          <section className="space-y-4">
            <SectionBlock title="Progress">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  {completedSubtasksCount} of {subtaskItems.length} subtasks completed
                </p>
                <span className="text-lg font-black text-[var(--bp-accent)]">{progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-[var(--bp-border)]">
                <div className="h-2 rounded-full bg-[var(--bp-accent)]" style={{ width: `${progress}%` }} />
              </div>
            </SectionBlock>

            <div className="grid gap-4 lg:grid-cols-2">
              <SectionBlock title="Subtasks" subtitle={`${completedSubtasksCount} of ${subtaskItems.length} completed`}>
                {subtaskItems.length ? (
                  <div className="space-y-2">
                    {subtaskItems.map((item) => (
                      <Subtask
                        key={item.id}
                        subtask={item}
                        onToggle={handleToggleSubtask}
                        onOpen={() => setDetailSubtaskId(item.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyBlock title="No subtasks yet" description="Steps will appear here once added from Edit Task." />
                )}
              </SectionBlock>

              <SectionBlock title="Dependencies">
                {dependencies.length ? (
                  <>
                    <div
                      className={`mb-3 rounded-xl border px-3 py-2 text-xs font-semibold ${
                        dependenciesComplete
                          ? 'border-green-500/30 bg-green-500/10 text-green-300'
                          : 'border-[var(--bp-accent)]/30 bg-[var(--bp-accent)]/10 text-[var(--bp-accent)]'
                      }`}
                    >
                      {dependenciesComplete
                        ? 'All dependencies are completed. This task is ready to start.'
                        : 'This task cannot start until all dependencies are completed.'}
                    </div>
                    <div className="space-y-2">
                      {dependencies.map((dependency) => (
                        <Dependency key={dependency.id} task={dependency} />
                      ))}
                    </div>
                  </>
                ) : (
                  <EmptyBlock title="No dependencies" description="Tasks that must finish first will appear here." />
                )}
              </SectionBlock>
            </div>

            <SectionBlock title="Recurring">
              <RecurrenceDetails
                recurrence={recurrence}
                nextOccurrenceDate={task?.recurrence?.nextOccurrenceDate}
                dueTime={task?.dueTime}
              />
            </SectionBlock>

            <div className="grid gap-4 lg:grid-cols-2">
              <SectionBlock title="Automation">
                <div className="divide-y divide-[var(--bp-border)]">
                  <AutomationRow label="Reminder" value={reminderText} />
                  <AutomationRow label="Focus" value={focusText} />
                </div>
              </SectionBlock>

              <SectionBlock title="Notes">
                <p className="text-sm leading-6 text-slate-400">{task?.notes || 'No notes yet.'}</p>
              </SectionBlock>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <SectionBlock title="Time Tracking">
                <div className="divide-y divide-[var(--bp-border)]">
                  <AutomationRow label="Estimated" value={`${task?.estimatedHours ?? 0}h`} />
                  <AutomationRow label="Spent" value={`${task?.spentHours ?? 0}h`} />
                  <AutomationRow label="Remaining" value={`${task?.remainingHours ?? 0}h`} />
                </div>
              </SectionBlock>

              <SectionBlock title="Attachments" subtitle={`${attachmentItems.length} files`}>
                {attachmentItems.length ? (
                  <div className="space-y-2">
                    {attachmentItems.map((file, index) => (
                      <Attachment key={file.id ?? `${file.fileName ?? file.name}-${index}`} file={file} onOpen={handleOpenAttachment} />
                    ))}
                  </div>
                ) : (
                  <EmptyBlock title="No attachments" description="Files added from Edit Task will appear here." />
                )}
              </SectionBlock>

              <SectionBlock title="Latest Activity">
                {latestActivity ? (
                  <Timeline
                    title={formatActivityTitle(latestActivity.action)}
                    desc={`${latestActivity.description} - ${formatActivityDateTime(latestActivity.createdAt)}`}
                    color={activityColor(latestActivity.action)}
                  />
                ) : (
                  <EmptyBlock title="No activity yet" description="Changes will appear here as you update the task." />
                )}
              </SectionBlock>
            </div>
          </section>

          <aside className="hidden xl:block">
            <SectionBlock title="Details">
              <div className="divide-y divide-[var(--bp-border)]">
                <MetaRow label="Status" value={status} color="blue" />
                <MetaRow label="Priority" value={task ? toUiPriority(task.priority) : 'Medium'} color="red" />
                <MetaRow label="Category" value={task?.category || 'Uncategorized'} color="yellow" />
                <MetaRow
                  label="Due Date"
                  value={formatDate(task?.dueDate) || 'No due date'}
                  secondaryValue={task?.dueTime || 'No due time'}
                />
              </div>
            </SectionBlock>
          </aside>
        </div>

        {error ? (
          <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300">
            {error}
          </p>
        ) : null}
      </AppLayout>
      <TaskStatusWorkflowModal
        open={isStatusModalOpen}
        status={status}
        progress={progress}
        hasSubtasks={subtaskItems.length > 0}
        subtasksComplete={subtaskItems.length === 0 || completedSubtasksCount === subtaskItems.length}
        subtaskProgress={subtaskItems.length ? Math.round((completedSubtasksCount / subtaskItems.length) * 100) : 0}
        completedSubtasksCount={completedSubtasksCount}
        totalSubtasksCount={subtaskItems.length}
        onClose={() => setIsStatusModalOpen(false)}
        onSave={(nextStatus) => void saveStatus(nextStatus)}
      />
      <AttachmentPreviewModal
        open={Boolean(previewAttachment && task && accessToken)}
        accessToken={accessToken}
        taskId={task?.id ?? ''}
        attachment={previewAttachment}
        onClose={() => setPreviewAttachment(null)}
        onError={setError}
      />
      {task && detailSubtask ? (
        <SubtaskDetailModal
          task={{ ...task, subtasks: subtaskItems }}
          subtask={detailSubtask}
          accessToken={accessToken}
          onClose={() => setDetailSubtaskId(null)}
          onEdit={() => {
            setEditSubtaskId(detailSubtask.id)
            setDetailSubtaskId(null)
          }}
          onTaskUpdated={syncTaskFromModal}
        />
      ) : null}
      {task && editSubtask ? (
        <SubtaskFormModal
          mode="edit"
          siblings={subtaskItems.filter((item) => item.id !== editSubtask.id)}
          initialSubtask={editSubtask}
          onCancel={() => setEditSubtaskId(null)}
          onBack={() => setEditSubtaskId(null)}
          onSubmit={async (payload) => {
            try {
              const updated = await updateSubtask(accessToken, task.id, editSubtask.id, payload)
              syncTaskFromModal(updated)
              setEditSubtaskId(null)
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Unable to update subtask.')
            }
          }}
        />
      ) : null}
    </>
  )
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-500/20 text-blue-400',
    red: 'bg-red-500/20 text-red-400',
    yellow: 'bg-yellow-500/20 text-[var(--bp-accent)]',
    green: 'bg-green-500/20 text-green-400',
    purple: 'bg-purple-500/20 text-purple-400',
  }

  return <span className={`rounded-md px-2 py-1 text-xs font-bold ${colors[color]}`}>{children}</span>
}

function InfoBox({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--bp-bg)] p-3">
      <p className="text-[10px] font-black uppercase text-slate-500">{title}</p>
      <p className="mt-1 text-sm font-bold text-[var(--bp-text)]">{value}</p>
    </div>
  )
}

function SectionBlock({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4">
      <div className="mb-3">
        <h3 className="text-sm font-black">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  )
}

function EmptyBlock({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--bp-border)] bg-[var(--bp-bg)] p-4 text-center">
      <p className="text-sm font-black text-[var(--bp-text)]">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
    </div>
  )
}

function RecurrenceDetails({
  recurrence,
  nextOccurrenceDate,
  dueTime,
}: {
  recurrence: UiRecurrence | null
  nextOccurrenceDate?: string | null
  dueTime?: string
}) {
  if (!recurrence || recurrence.frequency === 'Never') {
    return (
      <EmptyBlock
        title="Not a recurring task"
        description="Set a repeat schedule from Edit Task to see it here."
      />
    )
  }

  const daysValue = formatRecurrenceWeekdays(recurrence.weekdays)
  const nextOccurrence = formatOccurrence(nextOccurrenceDate, dueTime)

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <InfoBox title="Frequency" value={formatRecurrenceFrequency(recurrence)} />
      {daysValue ? <InfoBox title="Days" value={daysValue} /> : null}
      <InfoBox title="Ends" value={formatRecurrenceEnd(recurrence)} />
      <InfoBox title="Next occurrence" value={nextOccurrence || 'No upcoming occurrences'} />
    </div>
  )
}

const WEEKDAY_ORDER = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

function formatRecurrenceFrequency(recurrence: UiRecurrence) {
  if (recurrence.frequency === 'Custom') {
    const unit =
      recurrence.customInterval === 1 ? recurrence.customUnit.replace(/s$/, '') : recurrence.customUnit
    return `Every ${recurrence.customInterval} ${unit}`
  }
  return recurrence.frequency
}

function formatRecurrenceWeekdays(weekdays: string[]) {
  return [...weekdays]
    .sort((a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b))
    .join(' • ')
}

function formatRecurrenceEnd(recurrence: UiRecurrence) {
  if (recurrence.endType === 'onDate' && recurrence.endDate) {
    return formatLocaleDate(recurrence.endDate) || 'Never ends'
  }
  if (recurrence.endType === 'after' && recurrence.occurrences > 0) {
    return `After ${recurrence.occurrences} occurrence${recurrence.occurrences === 1 ? '' : 's'}`
  }
  return 'Never ends'
}

function AutomationRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
      <span className="text-sm font-bold text-[var(--bp-text)]">{label}</span>
      <span className="text-end text-xs text-slate-400">{value}</span>
    </div>
  )
}

const Subtask = memo(function Subtask({
  subtask,
  onToggle,
  onOpen,
}: {
  subtask: ApiSubtask
  onToggle: (subtask: ApiSubtask) => void
  onOpen: () => void
}) {
  const done = subtask.isDone || subtask.status === 'done'
  const indicator = getSubtaskIndicator(subtask)
  const meta = SUBTASK_INDICATOR_META[indicator]
  const estimate = formatDuration(subtask.estimatedDurationMinutes)
  const due = formatSubtaskDue(subtask.dueDate)

  return (
    <div className="group flex items-start gap-3 rounded-xl bg-[var(--bp-bg)] px-3 py-2.5">
      <button
        type="button"
        onClick={() => onToggle(subtask)}
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[8px] font-black ${
          done ? 'border-green-400 bg-green-400 text-black' : 'border-slate-500'
        }`}
        aria-label={done ? 'Mark subtask incomplete' : 'Mark subtask complete'}
      >
        {done ? '✓' : ''}
      </button>

      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-start">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} aria-hidden title={meta.label} />
          <span
            className={`truncate text-sm font-semibold ${done ? 'text-slate-500 line-through' : 'text-[var(--bp-text)]'}`}
          >
            {subtask.title}
          </span>
        </div>

        {(due || estimate) && !done ? (
          <p className="mt-1 text-xs text-slate-400">
            {due}
            {due && estimate ? ' • ' : ''}
            {estimate ? `Est. ${estimate}` : ''}
          </p>
        ) : null}

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${SUBTASK_PRIORITY_CLASS[subtask.priority]}`}>
            {SUBTASK_PRIORITY_LABEL[subtask.priority]}
          </span>
          <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${SUBTASK_STATUS_CLASS[subtask.status]}`}>
            {SUBTASK_STATUS_LABEL[subtask.status]}
          </span>
          {subtask.estimatedDurationSource === 'ai' && subtask.estimatedDurationMinutes ? (
            <span className="rounded-md bg-[var(--bp-accent)]/15 px-1.5 py-0.5 text-[10px] font-bold text-[var(--bp-accent)]">
              AI Estimate
            </span>
          ) : null}
        </div>
      </button>

      <button
        type="button"
        onClick={onOpen}
        className="shrink-0 self-center rounded-lg border border-[var(--bp-border)] px-2.5 py-1 text-xs font-bold text-slate-400 opacity-0 transition group-hover:opacity-100 hover:text-[var(--bp-text)]"
      >
        Open
      </button>
    </div>
  )
})

function formatSubtaskDue(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (sameDay) return `Today • ${time}`
  return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} • ${time}`
}

const Dependency = memo(function Dependency({ task }: { task: DependencyTask }) {
  return (
    <div className="grid w-full gap-3 rounded-xl bg-[var(--bp-bg)] px-3 py-2.5 md:grid-cols-[1fr_auto]">
      <div className="flex min-w-0 items-start gap-3">
        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dependencyDotColor(task.status)}`} />
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--bp-text)]">{task.title}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {task.category} - Due {task.dueDate}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
        <Badge color={dependencyBadgeColor(task.status)}>{task.status}</Badge>
        <span className="rounded-md bg-[var(--bp-surface)] px-2 py-1 text-xs font-bold text-slate-300">{task.priority}</span>
      </div>
    </div>
  )
})

function dependencyDotColor(status: DependencyTask['status']) {
  if (status === 'Done') return 'bg-green-400'
  if (status === 'Missed' || status === 'Blocked') return 'bg-red-400'
  if (status === 'In Progress') return 'bg-blue-400'
  return 'bg-slate-400'
}

function dependencyBadgeColor(status: DependencyTask['status']) {
  if (status === 'Done') return 'green'
  if (status === 'Missed' || status === 'Blocked') return 'red'
  if (status === 'In Progress') return 'blue'
  return 'purple'
}

const Attachment = memo(function Attachment({
  file,
  onOpen,
}: {
  file: ApiTaskAttachment
  onOpen?: (file: ApiTaskAttachment) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(file)}
      className="flex w-full items-center gap-3 rounded-xl bg-[var(--bp-bg)] p-2.5 text-start transition hover:bg-[var(--bp-border)]/30"
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[9px] font-black text-white ${attachmentColor(file.fileType ?? file.type, file.fileName ?? file.name)}`}>
        {attachmentLabel(file.fileType ?? file.type, file.fileName ?? file.name)}
      </span>
      <span className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-[var(--bp-text)]">{file.fileName ?? file.name}</p>
        <p className="text-xs text-slate-500">
          {formatFileSize(file.fileSize ?? file.size) || (file.fileType ?? file.type) || 'Attached file'}
        </p>
      </span>
    </button>
  )
})

function formatFileSize(size?: string | number) {
  const bytes = typeof size === 'string' ? Number(size) : size
  if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const Timeline = memo(function Timeline({ title, desc, color }: { title: string; desc: string; color: string }) {
  return (
    <div className="flex gap-3">
      <span className={`mt-1 h-4 w-4 shrink-0 rounded-full ${color}`} />
      <div>
        <p className="text-sm font-bold text-[var(--bp-text)]">{title}</p>
        <p className="text-xs text-slate-500">{desc}</p>
      </div>
    </div>
  )
})

function formatActivityTitle(action: string) {
  return action
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function activityColor(action: string) {
  if (action.includes('created')) return 'bg-green-400'
  if (action.includes('status')) return 'bg-blue-400'
  if (action.includes('subtask')) return 'bg-purple-400'
  if (action.includes('dependency')) return 'bg-orange-400'
  if (action.includes('recurrence')) return 'bg-[var(--bp-accent)]'
  if (action.includes('label')) return 'bg-pink-400'
  return 'bg-slate-400'
}

function attachmentLabel(type?: string, fileName?: string) {
  const normalized = `${type ?? ''} ${fileName ?? ''}`.toLocaleLowerCase()
  if (normalized.includes('pdf')) return 'PDF'
  if (normalized.includes('image') || normalized.match(/\.(png|jpe?g|gif|webp)$/)) return 'IMG'
  if (normalized.match(/\.(docx?|txt)$/) || normalized.includes('word')) return 'DOC'
  if (normalized.match(/\.(xlsx?|csv)$/) || normalized.includes('sheet') || normalized.includes('excel')) return 'XLS'
  if (normalized.match(/\.(pptx?)$/) || normalized.includes('powerpoint')) return 'SLD'
  return 'FILE'
}

function attachmentColor(type?: string, fileName?: string) {
  const normalized = `${type ?? ''} ${fileName ?? ''}`.toLocaleLowerCase()
  if (normalized.includes('pdf')) return 'bg-red-500'
  if (normalized.includes('image') || normalized.includes('jpg') || normalized.includes('png')) return 'bg-green-500'
  if (normalized.includes('sheet') || normalized.includes('excel') || normalized.includes('csv')) return 'bg-blue-500'
  if (normalized.includes('word') || normalized.includes('doc')) return 'bg-indigo-500'
  return 'bg-orange-500'
}

function MetaRow({
  label,
  value,
  secondaryValue,
  color,
}: {
  label: string
  value: string
  secondaryValue?: string
  color?: 'red' | 'blue' | 'yellow'
}) {
  const valueColor =
    color === 'red' ? 'text-red-400' : color === 'blue' ? 'text-blue-400' : color === 'yellow' ? 'text-[var(--bp-accent)]' : 'text-[var(--bp-text)]'

  return (
    <div className="py-2.5 first:pt-0 last:pb-0">
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-sm font-bold ${valueColor}`}>{value}</p>
      {secondaryValue ? <p className="mt-0.5 text-xs text-slate-500">{secondaryValue}</p> : null}
    </div>
  )
}

function statusColor(status: TaskStatus) {
  if (status === 'Done') return 'green'
  if (status === 'Missed') return 'red'
  if (status === 'To Do') return 'purple'
  return 'blue'
}

function toTaskStatus(task?: ApiTask | null): TaskStatus {
  return task ? (toUiStatus(task.status) as TaskStatus) : 'In Progress'
}

function toDependencyTasks(items: ApiTask[] | ApiTask['dependencies']): DependencyTask[] {
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    category: item.category || 'General',
    status: toUiStatus(item.status) as DependencyTask['status'],
    dueDate: formatDate(item.dueDate) || 'No due date',
    priority: normalizeDependencyPriority(toUiPriority(item.priority)),
  }))
}

function normalizeDependencyPriority(priority: string): DependencyTask['priority'] {
  if (priority === 'Low' || priority === 'High') return priority
  return 'Medium'
}

function formatDate(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

// Anchor date-only strings (YYYY-MM-DD) to local midnight so locale formatting
// doesn't shift them across a day boundary in the user's timezone.
function toLocalDate(value?: string | null) {
  if (!value) return null
  const raw = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatLocaleDate(value?: string | null) {
  const date = toLocalDate(value)
  if (!date) return ''
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function formatClockTime(time?: string) {
  if (!time) return ''
  const match = /^(\d{1,2}):(\d{2})/.exec(time)
  if (!match) return ''
  const date = new Date()
  date.setHours(Number(match[1]), Number(match[2]), 0, 0)
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)
}

function formatOccurrence(value?: string | null, time?: string) {
  const date = toLocalDate(value)
  if (!date) return ''
  const datePart = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
  const timePart = formatClockTime(time)
  return timePart ? `${datePart} • ${timePart}` : datePart
}

function formatActivityDateTime(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}
