import { useEffect, useState, type MouseEvent } from 'react'
import { AppLayout, PageHeader, TopActionBar, type SidebarNavHandlers } from '../components/layout'
import {
  TaskDependenciesWorkflowModal,
  type DependencyTask,
} from '../components/TaskDependenciesWorkflowModal'
import {
  TaskRecurrenceModal,
  createRecurrenceSummary,
  getNextOccurrenceLabel,
  type RecurrenceSettings,
} from '../components/TaskRecurrenceModal'
import { TaskStatusWorkflowModal, type TaskStatus } from '../components/TaskStatusWorkflowModal'
import { useLanguage } from '../i18n/LanguageContext'
import { useTheme } from '../theme/ThemeContext'
import {
  addDependencies,
  addSubtask,
  addTaskLabel,
  changeTaskStatus,
  deleteAttachment,
  deleteSubtask,
  getAttachments,
  getDependencies,
  getRecurrence,
  getSubtasks,
  getTaskActivity,
  getTaskLabels,
  openAttachment,
  removeDependency,
  removeTaskLabel,
  removeRecurrence,
  replaceDependency,
  recurrenceToApi,
  recurrenceToUi,
  saveRecurrence,
  toApiStatus,
  toUiPriority,
  toUiStatus,
  updateSubtask,
  updateTask,
  uploadAttachment,
  type ApiTask,
  type ApiTaskActivity,
  type ApiSubtask,
  type ApiTaskLabel,
  type ApiTaskAttachment,
} from '../lib/tasksApi'

type TaskDetailsScreenProps = SidebarNavHandlers & {
  task?: ApiTask | null
  tasks?: ApiTask[]
  accessToken?: string
  onTaskUpdated?: (task: ApiTask) => void
  onRefresh?: () => void
  onBack?: () => void
  onEdit?: () => void
  onDelete?: () => void
  onMarkDone?: () => void
  onSignOut?: () => void
}

export default function TaskDetailsScreen({
  task,
  tasks = [],
  accessToken = '',
  onTaskUpdated,
  onBack,
  onEdit,
  onDelete,
  onMarkDone,
  onSignOut,
  ...nav
}: TaskDetailsScreenProps) {
  const { t, toggleLanguage } = useLanguage()
  const { mode, toggleTheme } = useTheme()
  const [search, setSearch] = useState('')
  const currentTaskId = task?.id ?? ''
  const [status, setStatus] = useState<TaskStatus>(toTaskStatus(task))
  const [progress, setProgress] = useState(task?.progress ?? 0)
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false)
  const [dependencies, setDependencies] = useState<DependencyTask[]>(
    task ? toDependencyTasks(task.dependencies) : [],
  )
  const [recurrence, setRecurrence] = useState<RecurrenceSettings | null>(
    task ? recurrenceToUi(task.recurrence) : null,
  )
  const [labels, setLabels] = useState<ApiTaskLabel[]>(toLabelDetails(task))
  const [subtaskItems, setSubtaskItems] = useState<ApiSubtask[]>(task?.subtasks ?? [])
  const [activityItems, setActivityItems] = useState<ApiTaskActivity[]>(task?.activities ?? [])
  const [attachmentItems, setAttachmentItems] = useState<ApiTaskAttachment[]>(task?.attachments ?? [])
  const [isRecurrenceModalOpen, setIsRecurrenceModalOpen] = useState(false)
  const [error, setError] = useState('')
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [dependencyModal, setDependencyModal] = useState<{
    mode: 'add' | 'edit' | 'remove'
    dependency?: DependencyTask | null
  } | null>(null)
  const availableDependencies = tasks.length ? toDependencyTasks(tasks) : []
  const displaySubtasks = subtaskItems.map(toUiSubtask)
  const displayActivities = activityItems
  const displayAttachments = attachmentItems
  const completedSubtasksCount = subtaskItems.filter((subtask) => subtask.isDone).length
  const dependenciesComplete = dependencies.length > 0 && dependencies.every((item) => item.status === 'Done')
  const recurrenceSummary = task?.recurrence?.summary ?? createRecurrenceSummary(recurrence)
  const nextOccurrence =
    task?.recurrence?.nextOccurrenceDate
      ? `Next occurrence: ${formatDate(task.recurrence.nextOccurrenceDate)}`
      : getNextOccurrenceLabel(recurrence)
  const reminderText = task?.reminderEnabled
    ? `${task.reminderBeforeMinutes ?? 30} minutes before due date`
    : 'No reminder set'

  useEffect(() => {
    if (!task) return

    setStatus(toTaskStatus(task))
    setProgress(task.progress)
    setDependencies(toDependencyTasks(task.dependencies))
    setRecurrence(recurrenceToUi(task.recurrence))
    setLabels(toLabelDetails(task))
    setSubtaskItems(task.subtasks)
    setActivityItems(task.activities)
    setAttachmentItems(task.attachments)
  }, [task])

  useEffect(() => {
    if (!task || !accessToken) return

    Promise.all([
      getTaskLabels(accessToken, task.id),
      getSubtasks(accessToken, task.id),
      getDependencies(accessToken, task.id),
      getRecurrence(accessToken, task.id),
      getTaskActivity(accessToken, task.id),
      getAttachments(accessToken, task.id),
    ])
      .then(([nextLabels, nextSubtasks, nextDependencies, nextRecurrence, nextActivity, nextAttachments]) => {
        setLabels(nextLabels)
        setSubtaskItems(nextSubtasks)
        setDependencies(toDependencyTasks(nextDependencies))
        setRecurrence(recurrenceToUi(nextRecurrence))
        setActivityItems(nextActivity)
        setAttachmentItems(nextAttachments)
      })
      .catch((taskDetailsError: unknown) => {
        console.error('[BeePlan Tasks] Unable to load task details sections', taskDetailsError)
      })
  }, [accessToken, task?.id])

  async function handleAddLabel() {
    if (!task || !accessToken) return
    const name = window.prompt('Label name')
    if (!name?.trim()) return

    try {
      const updatedLabels = await addTaskLabel(accessToken, task.id, name)
      setLabels(updatedLabels)
      getTaskActivity(accessToken, task.id).then(setActivityItems).catch(() => undefined)
      onTaskUpdated?.({ ...task, labels: updatedLabels.map((label) => label.name), labelDetails: updatedLabels })
    } catch (labelError) {
      setError(labelError instanceof Error ? labelError.message : 'Unable to add label.')
    }
  }

  async function handleRemoveLabel(label: ApiTaskLabel) {
    if (!task || !accessToken) return

    try {
      const updatedLabels = await removeTaskLabel(accessToken, task.id, label.id)
      setLabels(updatedLabels)
      getTaskActivity(accessToken, task.id).then(setActivityItems).catch(() => undefined)
      onTaskUpdated?.({ ...task, labels: updatedLabels.map((item) => item.name), labelDetails: updatedLabels })
    } catch (labelError) {
      setError(labelError instanceof Error ? labelError.message : 'Unable to remove label.')
    }
  }

  async function handleUploadAttachment(fileList: FileList | null) {
    const file = fileList?.[0]
    if (!task || !accessToken || !file) return

    setUploadingAttachment(true)
    setError('')
    try {
      const uploaded = await uploadAttachment(accessToken, task.id, file)
      setAttachmentItems((current) => [...current, uploaded])
      getTaskActivity(accessToken, task.id).then(setActivityItems).catch(() => undefined)
    } catch (attachmentError) {
      setError(attachmentError instanceof Error ? attachmentError.message : 'Unable to upload attachment.')
    } finally {
      setUploadingAttachment(false)
    }
  }

  async function handleOpenAttachment(attachment: ApiTaskAttachment) {
    if (!task || !accessToken || !attachment.id) return

    try {
      await openAttachment(accessToken, task.id, attachment)
    } catch (attachmentError) {
      setError(attachmentError instanceof Error ? attachmentError.message : 'Unable to open attachment.')
    }
  }

  async function handleDeleteAttachment(attachment: ApiTaskAttachment) {
    if (!task || !accessToken || !attachment.id) return

    try {
      await deleteAttachment(accessToken, task.id, attachment.id)
      setAttachmentItems((current) => current.filter((item) => item.id !== attachment.id))
      getTaskActivity(accessToken, task.id).then(setActivityItems).catch(() => undefined)
    } catch (attachmentError) {
      setError(attachmentError instanceof Error ? attachmentError.message : 'Unable to delete attachment.')
    }
  }

  async function handleAddSubtask() {
    if (!task || !accessToken) return
    const title = window.prompt('Subtask title')
    if (!title?.trim()) return

    try {
      const updatedTask = await addSubtask(accessToken, task.id, { title })
      setSubtaskItems(updatedTask.subtasks)
      setActivityItems(updatedTask.activities)
      setProgress(updatedTask.progress)
      onTaskUpdated?.(updatedTask)
    } catch (subtaskError) {
      setError(subtaskError instanceof Error ? subtaskError.message : 'Unable to add subtask.')
    }
  }

  async function handleToggleSubtask(subtask: ApiSubtask) {
    if (!task || !accessToken) return

    try {
      const updatedTask = await updateSubtask(accessToken, task.id, subtask.id, {
        isDone: !subtask.isDone,
        status: subtask.isDone ? 'todo' : 'done',
      })
      setSubtaskItems(updatedTask.subtasks)
      setActivityItems(updatedTask.activities)
      setProgress(updatedTask.progress)
      onTaskUpdated?.(updatedTask)
    } catch (subtaskError) {
      setError(subtaskError instanceof Error ? subtaskError.message : 'Unable to update subtask.')
    }
  }

  async function handleDeleteSubtask(subtask: ApiSubtask) {
    if (!task || !accessToken) return

    try {
      const updatedTask = await deleteSubtask(accessToken, task.id, subtask.id)
      setSubtaskItems(updatedTask.subtasks)
      setActivityItems(updatedTask.activities)
      setProgress(updatedTask.progress)
      onTaskUpdated?.(updatedTask)
    } catch (subtaskError) {
      setError(subtaskError instanceof Error ? subtaskError.message : 'Unable to delete subtask.')
    }
  }

  async function handleToggleReminder() {
    if (!task || !accessToken) return

    try {
      const updatedTask = await updateTask(accessToken, task.id, {
        reminderEnabled: !task.reminderEnabled,
        reminderBeforeMinutes: task.reminderEnabled ? task.reminderBeforeMinutes : (task.reminderBeforeMinutes ?? 30),
      })
      setActivityItems(updatedTask.activities)
      onTaskUpdated?.(updatedTask)
    } catch (reminderError) {
      setError(reminderError instanceof Error ? reminderError.message : 'Unable to update reminder.')
    }
  }

  async function saveStatus(nextStatus: {
    status: TaskStatus
    progress: number
    completionDate?: string
    missedReason?: string
  }) {
    setError('')
    setStatus(nextStatus.status)
    setProgress(nextStatus.progress)

    if (task && accessToken) {
      try {
        const updatedTask = await changeTaskStatus(accessToken, task.id, {
          status: toApiStatus(nextStatus.status),
          progress: nextStatus.progress,
          completionDate: nextStatus.completionDate,
          missedReason: nextStatus.missedReason,
        })
        setActivityItems(updatedTask.activities)
        onTaskUpdated?.(updatedTask)
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : 'Unable to change task status.')
      }
    }

    setIsStatusModalOpen(false)
  }

  async function handleAddDependencies(nextDependencies: DependencyTask[]) {
    const filtered = nextDependencies.filter((item) => item.id !== currentTaskId)
    if (!filtered.length) return

    setError('')

    if (task && accessToken) {
      try {
        const updatedTask = await addDependencies(
          accessToken,
          task.id,
          filtered.map((item) => item.id),
        )
        onTaskUpdated?.(updatedTask)
        setDependencies(toDependencyTasks(updatedTask.dependencies))
        setActivityItems(updatedTask.activities)
        return
      } catch (dependencyError) {
        setError(dependencyError instanceof Error ? dependencyError.message : 'Unable to add dependency.')
      }
    }

    setDependencies((current) => {
      const currentIds = new Set(current.map((item) => item.id))
      return [...current, ...filtered.filter((item) => !currentIds.has(item.id))]
    })
  }

  async function handleReplaceDependency(oldDependencyId: string, replacement: DependencyTask) {
    setError('')

    if (task && accessToken) {
      try {
        const updatedTask = await replaceDependency(accessToken, task.id, oldDependencyId, replacement.id)
        onTaskUpdated?.(updatedTask)
        setDependencies(toDependencyTasks(updatedTask.dependencies))
        setActivityItems(updatedTask.activities)
        return
      } catch (dependencyError) {
        setError(dependencyError instanceof Error ? dependencyError.message : 'Unable to update dependency.')
      }
    }

    setDependencies((current) => current.map((item) => (item.id === oldDependencyId ? replacement : item)))
  }

  async function handleRemoveDependency(dependencyId: string) {
    setError('')

    if (task && accessToken) {
      try {
        const updatedTask = await removeDependency(accessToken, task.id, dependencyId)
        onTaskUpdated?.(updatedTask)
        setDependencies(toDependencyTasks(updatedTask.dependencies))
        setActivityItems(updatedTask.activities)
        return
      } catch (dependencyError) {
        setError(dependencyError instanceof Error ? dependencyError.message : 'Unable to remove dependency.')
      }
    }

    setDependencies((current) => current.filter((item) => item.id !== dependencyId))
  }

  async function handleSaveRecurrence(nextRecurrence: RecurrenceSettings | null) {
    setError('')
    setRecurrence(nextRecurrence)

    if (task && accessToken) {
      try {
        const apiRecurrence = recurrenceToApi(nextRecurrence)
        const updatedTask = apiRecurrence
          ? await saveRecurrence(accessToken, task.id, apiRecurrence)
          : await removeRecurrence(accessToken, task.id)
        setActivityItems(updatedTask.activities)
        onTaskUpdated?.(updatedTask)
      } catch (recurrenceError) {
        setError(recurrenceError instanceof Error ? recurrenceError.message : 'Unable to save recurrence.')
      }
    }
  }

  async function handleRemoveRecurrence() {
    setError('')
    setRecurrence(null)

    if (task && accessToken) {
      try {
        const updatedTask = await removeRecurrence(accessToken, task.id)
        setActivityItems(updatedTask.activities)
        onTaskUpdated?.(updatedTask)
      } catch (recurrenceError) {
        setError(recurrenceError instanceof Error ? recurrenceError.message : 'Unable to remove recurrence.')
      }
    }
  }

  return (
    <>
      <AppLayout
        active="tasks"
        onNavigateDashboard={nav.onNavigateDashboard}
        onNavigateTasks={onBack}
        onNavigateReminders={nav.onNavigateReminders}
        onNavigateCalendar={nav.onNavigateCalendar}
        onNavigateNotes={nav.onNavigateNotes}
        onNavigateAnalytics={nav.onNavigateAnalytics}
        panelTitle="Keep going!"
        panelCaption="You're doing great today."
        panelPercent={64}
      >
          <div className="mb-4 flex items-center gap-2 text-sm text-slate-400">
            <button type="button" onClick={onBack} className="hover:text-[var(--bp-text)]">
              Back
            </button>
            <span>Tasks</span>
            <span>/</span>
            <span className="text-[var(--bp-text)]">Task Details</span>
          </div>

          <PageHeader
            title="Task Details"
            subtitle="View and manage your task"
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

          <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
            <section className="space-y-6">
              <section className="rounded-3xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-7">
                <div className="mb-8 flex justify-between">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setIsStatusModalOpen(true)}
                      className="rounded-lg transition active:scale-95"
                      aria-label="Change task status"
                    >
                      <Badge color={statusColor(status)}>{status}</Badge>
                    </button>
                  <Badge color="red">{task ? toUiPriority(task.priority) : 'Medium'}</Badge>
                  <Badge color="yellow">{task?.category || 'Uncategorized'}</Badge>
                  </div>
                  <span className="text-2xl font-black text-[var(--bp-accent)]">{task?.isFavorite ? 'STAR' : 'TASK'}</span>
                </div>

                <h2 className="mb-4 text-2xl font-black">{task?.title ?? 'No task selected'}</h2>
                <p className="max-w-4xl leading-7 text-slate-400">
                  {task?.description || 'No description provided.'}
                </p>

                <div className="mt-7 grid gap-4 md:grid-cols-4">
                  <InfoBox title="Created" value={formatDate(task?.createdAt) || 'Not available'} />
                  <InfoBox title="Updated" value={formatDate(task?.updatedAt) || 'Not available'} />
                  <InfoBox title="Due Date" value={formatDate(task?.dueDate) || 'No due date'} />
                  <InfoBox title="Due Time" value={task?.dueTime || 'No due time'} />
                </div>
              </section>

              <section className="rounded-3xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-7">
                <div className="mb-5 flex items-center justify-between">
                  <h3 className="font-black">Progress</h3>
                  <span className="text-3xl font-black text-[var(--bp-accent)]">{progress}%</span>
                </div>
                <div className="h-3 rounded-full bg-[var(--bp-border)]">
                  <div className="h-3 rounded-full bg-[var(--bp-accent)]" style={{ width: `${progress}%` }} />
                </div>

                <div className="mt-5 space-y-4 text-sm">
                  <ProgressRow icon="DONE" label={`${completedSubtasksCount} of ${subtaskItems.length} subtasks completed`} />
                  <ProgressRow icon="EST" label="Estimated" value={formatMinutes(task?.estimatedTimeMinutes, '0h')} />
                  <ProgressRow icon="SPENT" label="Spent" value={formatMinutes(task?.spentTimeMinutes, '0h')} blue />
                  <ProgressRow icon="LEFT" label="Remaining" value={formatMinutes(task?.remainingTimeMinutes, '0h')} yellow />
                </div>
              </section>

              <section className="rounded-3xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-7">
                <div className="mb-6 flex justify-between">
                  <div>
                    <h3 className="font-black">Subtasks</h3>
                    <p className="text-sm text-slate-500">
                      {completedSubtasksCount} of {subtaskItems.length} completed
                    </p>
                  </div>
                  <button onClick={() => void handleAddSubtask()} className="font-bold text-[var(--bp-accent)]">+ Add Subtask</button>
                </div>

                <div className="space-y-2">
                  {displaySubtasks.length ? (
                    displaySubtasks.map((item) => (
                      <Subtask
                        key={item.id}
                        {...item}
                        onToggle={() => void handleToggleSubtask(item.source)}
                        onDelete={() => void handleDeleteSubtask(item.source)}
                      />
                    ))
                  ) : (
                    <div className="rounded-3xl border border-dashed border-[var(--bp-border)] bg-[var(--bp-bg)] p-6 text-center">
                      <p className="font-black text-[var(--bp-text)]">No subtasks yet</p>
                      <p className="mt-2 text-sm text-slate-500">Add smaller steps to track progress.</p>
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-3xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-7">
                <div className="mb-6 flex justify-between">
                  <h3 className="font-black">Dependencies</h3>
                  <button
                    type="button"
                    onClick={() => setDependencyModal({ mode: 'add' })}
                    className="font-bold text-[var(--bp-accent)] transition hover:text-yellow-200 active:scale-95"
                  >
                    + Add Dependency
                  </button>
                </div>

                {dependencies.length ? (
                  <div
                    className={`mb-5 rounded-2xl border px-4 py-3 text-sm font-semibold ${
                      dependenciesComplete
                        ? 'border-green-500/30 bg-green-500/10 text-green-300'
                        : 'border-[var(--bp-accent)]/30 bg-[var(--bp-accent)]/10 text-[var(--bp-accent)]'
                    }`}
                  >
                    {dependenciesComplete
                      ? 'All dependencies are completed. This task is ready to start.'
                      : 'This task cannot start until all dependencies are completed.'}
                  </div>
                ) : null}

                {dependencies.length ? (
                  dependencies.map((dependency, index) => (
                    <div key={dependency.id}>
                      <Dependency
                        task={dependency}
                        onEdit={() => setDependencyModal({ mode: 'edit', dependency })}
                        onRemove={(event) => {
                          event.stopPropagation()
                          setDependencyModal({ mode: 'remove', dependency })
                        }}
                      />
                      {index < dependencies.length - 1 ? <Arrow /> : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-3xl border border-dashed border-[var(--bp-border)] bg-[var(--bp-bg)] p-6 text-center">
                    <p className="font-black text-[var(--bp-text)]">No dependencies yet</p>
                    <p className="mt-2 text-sm text-slate-500">Add tasks that must be completed first.</p>
                  </div>
                )}
              </section>

              <div className="grid gap-5 md:grid-cols-2">
                <section className="rounded-3xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-7">
                  <div className="mb-5 flex items-center justify-between">
                    <h3 className="font-black">Reminder</h3>
                    <button
                      type="button"
                      onClick={() => void handleToggleReminder()}
                      className={`flex h-7 w-12 items-center rounded-full p-1 transition ${
                        task?.reminderEnabled ? 'justify-end bg-[var(--bp-accent)]' : 'justify-start bg-[var(--bp-border)]'
                      }`}
                      aria-label="Toggle reminder"
                    >
                      <span className="h-5 w-5 rounded-full bg-white" />
                    </button>
                  </div>
                  <p className="text-sm text-slate-400">{reminderText}</p>
                </section>

                <section className="rounded-3xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-7">
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-black">Recurring</h3>
                      <p className="mt-1 text-sm text-slate-400">
                        {recurrence ? 'Next occurrence' : 'Repeat schedule'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsRecurrenceModalOpen(true)}
                      className="font-bold text-[var(--bp-accent)] transition hover:text-yellow-200 active:scale-95"
                    >
                      {recurrence ? 'Edit Recurrence' : 'Set Recurrence'}
                    </button>
                  </div>
                  <p className="font-bold text-purple-400">{recurrenceSummary}</p>
                  <p className="mt-2 text-sm text-slate-500">{nextOccurrence}</p>
                </section>
              </div>

              <section className="rounded-3xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-7">
                <div className="mb-4 flex justify-between">
                  <h3 className="font-black">Notes</h3>
                  <button className="text-sm text-slate-400">Edit</button>
                </div>
                <p className="leading-7 text-slate-400">
                  {task?.notes || 'No notes yet.'}
                </p>
              </section>

              <section className="rounded-3xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-7">
                <div className="mb-5 flex justify-between">
                  <div>
                    <h3 className="font-black">Attachments</h3>
                    <p className="text-sm text-slate-500">{displayAttachments.length} files</p>
                  </div>
                  <label className="cursor-pointer font-bold text-[var(--bp-accent)] transition hover:text-yellow-200 aria-disabled:cursor-not-allowed aria-disabled:opacity-60">
                    {uploadingAttachment ? 'Uploading...' : '+ Add'}
                    <input
                      type="file"
                      className="hidden"
                      disabled={uploadingAttachment || !task}
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                      onChange={(event) => {
                        void handleUploadAttachment(event.target.files)
                        event.target.value = ''
                      }}
                    />
                  </label>
                </div>

                {displayAttachments.length ? (
                  <div className="space-y-3">
                    {displayAttachments.map((file, index) => (
                      <Attachment
                        key={file.id ?? `${file.name}-${index}`}
                        file={file}
                        onOpen={() => void handleOpenAttachment(file)}
                        onDelete={() => void handleDeleteAttachment(file)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex h-28 items-center justify-center rounded-2xl border border-dashed border-[var(--bp-border)] px-5 text-center text-slate-500">
                    No attachments yet. Add images, PDFs, or documents.
                  </div>
                )}
              </section>

              <section className="rounded-3xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-7">
                <h3 className="mb-6 font-black">Activity Timeline</h3>
                {displayActivities.length ? (
                  displayActivities.map((activity) => (
                    <Timeline
                      key={activity.id}
                      title={formatActivityTitle(activity.action)}
                      desc={`${activity.description} - ${formatDate(activity.createdAt)}`}
                      color={activityColor(activity.action)}
                    />
                  ))
                ) : (
                  <div className="rounded-3xl border border-dashed border-[var(--bp-border)] bg-[var(--bp-bg)] p-6 text-center">
                    <p className="font-black text-[var(--bp-text)]">No activity yet</p>
                    <p className="mt-2 text-sm text-slate-500">Changes will appear here as you update the task.</p>
                  </div>
                )}
              </section>

              <div className="grid gap-5 md:grid-cols-2">
                <section className="rounded-3xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-7">
                  <div className="mb-6 flex justify-between">
                    <h3 className="font-black">Labels</h3>
                    <button onClick={() => void handleAddLabel()} className="font-bold text-[var(--bp-accent)]">+ Add Label</button>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {labels.length ? (
                      labels.map((label, index) => (
                        <button
                          key={label.id}
                          type="button"
                          title="Remove label"
                          onClick={() => void handleRemoveLabel(label)}
                        >
                          <Badge color={labelColors[index % labelColors.length]}>{label.name}</Badge>
                        </button>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">No labels attached.</p>
                    )}
                  </div>
                </section>

                <section className="rounded-3xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-7">
                  <h3 className="mb-6 font-black">Time Estimation</h3>
                  <div className="h-3 rounded-full bg-[var(--bp-border)]">
                    <div className="h-3 rounded-full bg-blue-400" style={{ width: `${clampPercent(task?.progressPercentage ?? 0)}%` }} />
                  </div>
                  <div className="mt-6 grid grid-cols-3 text-center">
                    <Time value={formatHours(task?.estimatedHours, formatMinutes(task?.estimatedTimeMinutes, '0h'))} label="Estimated" />
                    <Time value={formatHours(task?.spentHours, formatMinutes(task?.spentTimeMinutes, '0h'))} label="Spent" blue />
                    <Time value={formatHours(task?.remainingHours, formatMinutes(task?.remainingTimeMinutes, '0h'))} label="Remaining" yellow />
                  </div>
                </section>
              </div>
            </section>

            <aside className="hidden space-y-4 xl:block">
              <SideCard title="Priority" value={task ? toUiPriority(task.priority) : 'Medium'} red />
              <SideCard title="Status" value={status} blue onClick={() => setIsStatusModalOpen(true)} />
              <SideCard title="Category" value={task?.category || 'Uncategorized'} yellow />
              <SideCard title="Due Date" value={`${formatDate(task?.dueDate) || 'No due date'}\n${task?.dueTime || 'No due time'}`} />
              <SideCard title="Reminder" value={reminderText} />
              <SideCard title="Recurring" value={recurrenceSummary} onClick={() => setIsRecurrenceModalOpen(true)} />
              <SideCard title="Time Estimate" value={formatMinutes(task?.estimatedTimeMinutes, '0h')} />
            </aside>
          </div>

          {error ? <p className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-300">{error}</p> : null}

          <footer className="mt-8 border-t border-[var(--bp-border)] pt-6">
          <div className="flex justify-between gap-4">
            <button onClick={onDelete} className="rounded-xl border border-red-500/50 px-8 py-3 font-bold text-red-400">
              Delete Task
            </button>
            <div className="flex gap-4">
              <button onClick={onEdit} className="rounded-xl bg-[var(--bp-border)] px-10 py-3 font-bold text-[var(--bp-text)]">
                Edit Task
              </button>
              <button onClick={onMarkDone} className="rounded-xl bg-[var(--bp-accent)] px-10 py-3 font-black text-[var(--bp-accent-text)]">
                Mark as Done
              </button>
            </div>
          </div>
          </footer>
      </AppLayout>
      <TaskStatusWorkflowModal
        open={isStatusModalOpen}
        status={status}
        progress={progress}
        onClose={() => setIsStatusModalOpen(false)}
        onSave={(nextStatus) => void saveStatus(nextStatus)}
      />
      <TaskDependenciesWorkflowModal
        open={Boolean(dependencyModal)}
        mode={dependencyModal?.mode ?? 'add'}
        currentTaskId={currentTaskId}
        availableTasks={availableDependencies}
        dependencies={dependencies}
        dependency={dependencyModal?.dependency}
        onClose={() => setDependencyModal(null)}
        onAdd={(tasks) => void handleAddDependencies(tasks)}
        onSaveReplacement={(oldDependencyId, replacement) => void handleReplaceDependency(oldDependencyId, replacement)}
        onRemove={(dependencyId) => void handleRemoveDependency(dependencyId)}
      />
      <TaskRecurrenceModal
        open={isRecurrenceModalOpen}
        mode={recurrence ? 'edit' : 'create'}
        recurrence={recurrence}
        onClose={() => setIsRecurrenceModalOpen(false)}
        onSave={(nextRecurrence) => void handleSaveRecurrence(nextRecurrence)}
        onRemove={() => void handleRemoveRecurrence()}
      />
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

  return <span className={`rounded-lg px-3 py-2 text-sm font-bold ${colors[color]}`}>{children}</span>
}

function InfoBox({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[var(--bp-surface)] p-4">
      <p className="text-xs font-black uppercase text-slate-500">{title}</p>
      <p className="mt-2 font-bold text-[var(--bp-text)]">{value}</p>
    </div>
  )
}

function ProgressRow({ icon, label, value, blue, yellow }: { icon: string; label: string; value?: string; blue?: boolean; yellow?: boolean }) {
  return (
    <div className="flex justify-between text-slate-400">
      <span>{icon} {label}</span>
      {value ? <span className={`font-bold ${blue ? 'text-blue-400' : yellow ? 'text-[var(--bp-accent)]' : 'text-[var(--bp-text)]'}`}>{value}</span> : null}
    </div>
  )
}

function Subtask({
  title,
  date,
  done,
  onToggle,
  onDelete,
}: {
  title: string
  date: string
  done: boolean
  source: ApiSubtask
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <div className="grid grid-cols-[24px_1fr_120px_50px_70px_70px] items-center gap-4 rounded-xl px-4 py-3">
      <button
        type="button"
        onClick={onToggle}
        className={`h-5 w-5 rounded-md border text-[9px] font-black ${done ? 'border-green-400 bg-green-400 text-black' : 'border-slate-500'}`}
        aria-label={done ? 'Mark subtask incomplete' : 'Mark subtask complete'}
      >
        {done ? 'OK' : ''}
      </button>
      <p className={done ? 'text-slate-500 line-through' : 'text-[var(--bp-text)]'}>{title}</p>
      <p className="text-sm text-slate-500">{date}</p>
      <span className="rounded-full bg-[var(--bp-accent)]/20 px-2 py-1 text-center text-xs font-bold text-[var(--bp-accent)]">AC</span>
      <span className={`text-sm font-bold ${done ? 'text-green-400' : 'text-slate-500'}`}>{done ? 'Done' : 'Open'}</span>
      <button type="button" onClick={onDelete} className="text-sm font-bold text-red-300">
        Delete
      </button>
    </div>
  )
}

function Dependency({
  task,
  onEdit,
  onRemove,
}: {
  task: DependencyTask
  onEdit: () => void
  onRemove: (event: MouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onEdit()
      }}
      className="grid w-full gap-4 rounded-2xl bg-[var(--bp-bg)] px-5 py-4 text-start transition hover:bg-[var(--bp-surface)] active:scale-[0.99] md:grid-cols-[1fr_auto]"
    >
      <div className="flex min-w-0 items-start gap-4">
        <span className={`mt-2 h-3 w-3 shrink-0 rounded-full ${dependencyDotColor(task.status)}`} />
        <div className="min-w-0">
          <p className="font-bold text-[var(--bp-text)]">{task.title}</p>
          <p className="mt-1 text-sm text-slate-500">
            {task.category} - Due {task.dueDate}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        <Badge color={dependencyBadgeColor(task.status)}>{task.status}</Badge>
        <span className="rounded-lg bg-[var(--bp-surface)] px-3 py-2 text-sm font-bold text-slate-300">{task.priority}</span>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-lg bg-red-500/15 px-3 py-2 text-sm font-bold text-red-300 transition hover:bg-red-500/25"
        >
          Remove
        </button>
      </div>
    </div>
  )
}

function Arrow() {
  return <div className="py-2 text-center text-slate-500">v</div>
}

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

function Attachment({
  file,
  onOpen,
  onDelete,
}: {
  file: ApiTaskAttachment
  onOpen?: () => void
  onDelete?: () => void
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-[var(--bp-surface)] p-4">
      <button
        type="button"
        onClick={onOpen}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[10px] font-black text-white ${attachmentColor(file.type)}`}
      >
        FILE
      </button>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-start">
        <p className="truncate font-bold text-[var(--bp-text)] hover:underline">{file.name}</p>
        <p className="text-sm text-slate-500">{formatFileSize(file.size) || file.type || 'Attached file'}</p>
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="shrink-0 rounded-lg bg-red-500/15 px-3 py-2 text-xs font-bold text-red-300 transition hover:bg-red-500/25"
      >
        Remove
      </button>
    </div>
  )
}

function formatFileSize(size?: string) {
  const bytes = Number(size)
  if (!size || Number.isNaN(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function Timeline({ title, desc, color }: { title: string; desc: string; color: string }) {
  return (
    <div className="relative mb-8 flex gap-5">
      <span className={`mt-1 h-6 w-6 rounded-full ${color}`} />
      <div>
        <p className="font-bold text-[var(--bp-text)]">{title}</p>
        <p className="text-sm text-slate-500">{desc}</p>
      </div>
    </div>
  )
}

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

function attachmentColor(type?: string) {
  const normalized = type?.toLocaleLowerCase() ?? ''
  if (normalized.includes('pdf')) return 'bg-red-500'
  if (normalized.includes('image') || normalized.includes('jpg') || normalized.includes('png')) return 'bg-green-500'
  if (normalized.includes('sheet') || normalized.includes('excel') || normalized.includes('csv')) return 'bg-blue-500'
  return 'bg-orange-500'
}

function Time({ value, label, blue, yellow }: { value: string; label: string; blue?: boolean; yellow?: boolean }) {
  return (
    <div>
      <p className={`text-xl font-black ${blue ? 'text-blue-400' : yellow ? 'text-[var(--bp-accent)]' : 'text-[var(--bp-text)]'}`}>{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  )
}

function SideCard({
  title,
  value,
  red,
  blue,
  yellow,
  onClick,
}: {
  title: string
  value: string
  red?: boolean
  blue?: boolean
  yellow?: boolean
  onClick?: () => void
}) {
  const content = (
    <>
      <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">{title}</p>
      <p className={`whitespace-pre-line font-bold ${red ? 'text-red-400' : blue ? 'text-blue-400' : yellow ? 'text-[var(--bp-accent)]' : 'text-[var(--bp-text)]'}`}>
        {value}
      </p>
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full rounded-3xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-5 text-start transition hover:border-[var(--bp-accent)]/50 active:scale-[0.99]"
      >
        {content}
      </button>
    )
  }

  return (
    <div className="rounded-3xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-5">
      {content}
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

function toUiSubtask(subtask: ApiTask['subtasks'][number]) {
  return {
    id: subtask.id,
    title: subtask.title,
    date: formatDate(subtask.dueDate) || 'No due date',
    done: subtask.isDone,
    source: subtask,
  }
}

function toLabelDetails(task?: ApiTask | null): ApiTaskLabel[] {
  if (!task) return []
  if (task.labelDetails?.length) return task.labelDetails

  return task.labels.map((label) => ({
    id: toLabelId(label),
    name: label,
  }))
}

function toLabelId(label: string) {
  return label
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/gi, '-')
    .replace(/^-+|-+$/g, '') || encodeURIComponent(label)
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

function formatMinutes(value?: number, fallback = '0h') {
  if (value === undefined || value === null) return fallback
  if (value <= 0) return '0h'
  const hours = Math.floor(value / 60)
  const minutes = value % 60
  if (!hours) return `${minutes}m`
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`
}

function formatHours(value?: number, fallback = '0h') {
  if (value === undefined || value === null) return fallback
  if (value <= 0) return '0h'
  return Number.isInteger(value) ? `${value}h` : `${value.toFixed(1)}h`
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(Math.round(value), 100))
}

const labelColors = ['purple', 'yellow', 'blue', 'red', 'green']

