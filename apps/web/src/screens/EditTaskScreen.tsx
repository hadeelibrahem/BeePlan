import { useEffect, useState } from 'react'
import DeleteSubtaskModal from '../components/DeleteSubtaskModal'
import { AppLayout, PageHeader, TopActionBar, type SidebarNavHandlers } from '../components/layout'
import TaskAttachmentPicker from '../components/TaskAttachmentPicker'
import AttachmentPreviewModal from '../components/AttachmentPreviewModal'
import SubtaskFormModal, { type SubtaskFormValues } from '../components/SubtaskFormModal'
import {
  TaskRecurrenceModal,
  createRecurrenceSummary,
  type RecurrenceSettings,
} from '../components/TaskRecurrenceModal'
import { TaskDependenciesWorkflowModal, type DependencyTask } from '../components/TaskDependenciesWorkflowModal'
import { useLanguage } from '../i18n/LanguageContext'
import { useTheme } from '../theme/ThemeContext'
import {
  addDependencies,
  addSubtask,
  deleteAttachment,
  deleteSubtask,
  getAttachments,
  recurrenceToApi,
  recurrenceToUi,
  removeDependency,
  replaceDependency,
  toApiPriority,
  toApiStatus,
  toUiPriority,
  toUiStatus,
  updateSubtask,
  uploadAttachment,
  type ApiDependency,
  type ApiSubtask,
  type ApiTask,
  type ApiTaskAttachment,
  type TaskPayload,
} from '../lib/tasksApi'

type EditTaskScreenProps = SidebarNavHandlers & {
  task: ApiTask
  tasks?: ApiTask[]
  accessToken?: string
  onBack?: () => void
  onCancel?: () => void
  onDelete?: () => void
  onSave?: (payload: TaskPayload) => Promise<ApiTask | undefined> | ApiTask | void
  onSaved?: (task: ApiTask) => void
  onTaskUpdated?: (task: ApiTask) => void
  onSignOut?: () => void
}

const REMINDER_OPTIONS = [10, 30, 60, 1440]

export default function EditTaskScreen({
  task,
  tasks = [],
  accessToken,
  onBack,
  onCancel,
  onDelete,
  onSave,
  onSaved,
  onTaskUpdated,
  onSignOut,
  ...nav
}: EditTaskScreenProps) {
  const { t, toggleLanguage } = useLanguage()
  const { mode, toggleTheme } = useTheme()
  const [search, setSearch] = useState('')
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description)
  const [category, setCategory] = useState(task.category || 'General')
  const [status, setStatus] = useState(toUiStatus(task.status))
  const [priority, setPriority] = useState(toUiPriority(task.priority))
  const [dueDate, setDueDate] = useState(toDateInput(task.dueDate))
  const [dueTime, setDueTime] = useState(task.dueTime)
  const [notes, setNotes] = useState(task.notes)
  const [reminderEnabled, setReminderEnabled] = useState(task.reminderEnabled)
  const [reminderBeforeMinutes, setReminderBeforeMinutes] = useState(task.reminderBeforeMinutes ?? 30)
  const [estimatedHours, setEstimatedHours] = useState(String(task.estimatedHours))
  const [spentHours, setSpentHours] = useState(String(task.spentHours))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState(task.progress)
  const [subtasks, setSubtasks] = useState<ApiSubtask[]>(task.subtasks)
  const [dependencies, setDependencies] = useState<ApiDependency[]>(task.dependencies)
  const [attachments, setAttachments] = useState<ApiTaskAttachment[]>([])
  const [previewAttachment, setPreviewAttachment] = useState<ApiTaskAttachment | null>(null)
  const [draftAttachments, setDraftAttachments] = useState<File[]>([])
  const [uploadingAttachments, setUploadingAttachments] = useState(false)
  const [addingSubtask, setAddingSubtask] = useState(false)
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null)
  const [deletingSubtaskId, setDeletingSubtaskId] = useState<string | null>(null)
  const [dependencyModalMode, setDependencyModalMode] = useState<'add' | 'edit' | 'remove' | null>(null)
  const [selectedDependency, setSelectedDependency] = useState<ApiDependency | null>(null)
  const [recurrence, setRecurrence] = useState<RecurrenceSettings | null>(recurrenceToUi(task.recurrence))
  const [isRecurrenceModalOpen, setIsRecurrenceModalOpen] = useState(false)
  const recurrenceSummary = createRecurrenceSummary(recurrence)

  useEffect(() => {
    if (!task) return

    setTitle(task.title)
    setDescription(task.description)
    setCategory(task.category || 'General')
    setStatus(toUiStatus(task.status))
    setPriority(toUiPriority(task.priority))
    setDueDate(toDateInput(task.dueDate))
    setDueTime(task.dueTime)
    setNotes(task.notes)
    setReminderEnabled(task.reminderEnabled)
    setReminderBeforeMinutes(task.reminderBeforeMinutes ?? 30)
    setEstimatedHours(String(task.estimatedHours))
    setSpentHours(String(task.spentHours))
    setProgress(task.progress)
    setRecurrence(recurrenceToUi(task.recurrence))
    setSubtasks(task.subtasks)
    setDependencies(task.dependencies)
  }, [task])

  useEffect(() => {
    if (!accessToken || !task.id) return
    let cancelled = false

    getAttachments(accessToken, task.id)
      .then((items) => {
        if (!cancelled) setAttachments(items)
      })
      .catch((fetchError: unknown) => {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : 'Unable to load attachments.')
        }
      })

    return () => {
      cancelled = true
    }
  }, [accessToken, task.id])

  function applyUpdatedTask(updatedTask: ApiTask) {
    setSubtasks(updatedTask.subtasks)
    setDependencies(updatedTask.dependencies)
    setProgress(updatedTask.progress)
    setError('')
    onTaskUpdated?.(updatedTask)
  }

  async function handleAddSubtask(values: SubtaskFormValues) {
    if (!accessToken) return

    try {
      const updatedTask = await addSubtask(accessToken, task.id, { title: values.title.trim() })
      applyUpdatedTask(updatedTask)
      setAddingSubtask(false)
    } catch (subtaskError) {
      setError(subtaskError instanceof Error ? subtaskError.message : 'Unable to add subtask.')
    }
  }

  async function handleEditSubtask(values: SubtaskFormValues) {
    if (!accessToken || editingSubtaskId === null) return

    try {
      const updatedTask = await updateSubtask(accessToken, task.id, editingSubtaskId, { title: values.title.trim() })
      applyUpdatedTask(updatedTask)
      setEditingSubtaskId(null)
    } catch (subtaskError) {
      setError(subtaskError instanceof Error ? subtaskError.message : 'Unable to update subtask.')
    }
  }

  async function handleConfirmDelete() {
    if (!accessToken || deletingSubtaskId === null) return

    try {
      const updatedTask = await deleteSubtask(accessToken, task.id, deletingSubtaskId)
      applyUpdatedTask(updatedTask)
    } catch (subtaskError) {
      setError(subtaskError instanceof Error ? subtaskError.message : 'Unable to delete subtask.')
    } finally {
      setDeletingSubtaskId(null)
    }
  }

  async function handleToggleSubtask(subtask: ApiSubtask) {
    if (!accessToken) return
    const nextIsDone = !subtask.isDone

    try {
      const updatedTask = await updateSubtask(accessToken, task.id, subtask.id, {
        isDone: nextIsDone,
        status: nextIsDone ? 'done' : 'todo',
      })
      applyUpdatedTask(updatedTask)
    } catch (subtaskError) {
      setError(subtaskError instanceof Error ? subtaskError.message : 'Unable to update subtask.')
    }
  }

  async function handleAddDependencies(selected: DependencyTask[]) {
    if (!accessToken || !selected.length) return

    try {
      const updatedTask = await addDependencies(accessToken, task.id, selected.map((item) => item.id))
      applyUpdatedTask(updatedTask)
    } catch (dependencyError) {
      setError(dependencyError instanceof Error ? dependencyError.message : 'Unable to add dependency.')
    }
  }

  async function handleRemoveDependency(dependencyId: string) {
    if (!accessToken) return

    try {
      const updatedTask = await removeDependency(accessToken, task.id, dependencyId)
      applyUpdatedTask(updatedTask)
    } catch (dependencyError) {
      setError(dependencyError instanceof Error ? dependencyError.message : 'Unable to remove dependency.')
    }
  }

  async function handleReplaceDependency(oldDependencyId: string, replacement: DependencyTask) {
    if (!accessToken) return

    try {
      const updatedTask = await replaceDependency(accessToken, task.id, oldDependencyId, replacement.id)
      applyUpdatedTask(updatedTask)
    } catch (dependencyError) {
      setError(dependencyError instanceof Error ? dependencyError.message : 'Unable to replace dependency.')
    }
  }

  async function handleDeleteAttachment(attachment: ApiTaskAttachment) {
    if (!accessToken || !attachment.id) return
    const previous = attachments
    setAttachments((current) => current.filter((item) => item.id !== attachment.id))

    try {
      await deleteAttachment(accessToken, task.id, attachment.id)
    } catch (deleteError) {
      setAttachments(previous)
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete attachment.')
    }
  }

  async function handleSave() {
    if (!title.trim()) {
      setError('Task title is required.')
      return
    }

    if (dueTime && !dueDate) {
      setError('Due time requires a due date.')
      return
    }

    if (status === 'Done' && subtasks.some((item) => !item.isDone)) {
      setError('Complete all subtasks before marking this task as Done.')
      return
    }

    setSaving(true)
    setError('')

    const estimatedTimeMinutes = Math.round((Number(estimatedHours) || 0) * 60)
    const spentTimeMinutes = Math.round((Number(spentHours) || 0) * 60)

    try {
      const updatedTask = await onSave?.({
        title: title.trim(),
        description: description.trim(),
        category: category.trim(),
        status: toApiStatus(status),
        priority: toApiPriority(priority),
        dueDate: dueDate || undefined,
        dueTime,
        notes: notes.trim(),
        estimatedTimeMinutes,
        spentTimeMinutes,
        remainingTimeMinutes: Math.max(estimatedTimeMinutes - spentTimeMinutes, 0),
        reminderEnabled,
        reminderBeforeMinutes,
        recurrence: recurrenceToApi(recurrence),
      })

      if (!updatedTask) return

      if (draftAttachments.length && accessToken) {
        setUploadingAttachments(true)
        for (const file of draftAttachments) {
          await uploadAttachment(accessToken, task.id, file)
        }
        const refreshedAttachments = await getAttachments(accessToken, task.id)
        setAttachments(refreshedAttachments)
        setDraftAttachments([])
      }

      onSaved?.(updatedTask)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save task changes.')
    } finally {
      setUploadingAttachments(false)
      setSaving(false)
    }
  }

  function handlePreviewAttachment(attachment: ApiTaskAttachment) {
    if (!accessToken || !attachment.id) return
    setPreviewAttachment(attachment)
  }

  const reminderMinuteOptions = REMINDER_OPTIONS.includes(reminderBeforeMinutes)
    ? REMINDER_OPTIONS
    : [...REMINDER_OPTIONS, reminderBeforeMinutes].sort((a, b) => a - b)
  const remainingHoursDisplay = Math.max((Number(estimatedHours) || 0) - (Number(spentHours) || 0), 0)
  const completedSubtasksCount = subtasks.filter((item) => item.isDone).length

  return (
    <>
      <AppLayout
        active="tasks"
        {...nav}
        onNavigateTasks={onCancel}
        panelTitle="Editing task"
        panelCaption="Last updated today."
        panelPercent={task.progress}
      >
          <div className="mb-3 flex items-center gap-2 text-xs text-slate-400">
            <button type="button" onClick={onBack} className="hover:text-[var(--bp-text)]">Back</button>
            <span>Tasks</span>
            <span>/</span>
            <span className="text-[var(--bp-text)]">Edit Task</span>
          </div>

          <PageHeader
            title="Edit Task"
            subtitle="Update task details, timing, progress, and supporting files."
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

          <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
            <section className="space-y-3">
              <Card title="Task Information" code="INFO">
                <FieldLabel label="Task Title" required />
                <input className={inputClass} value={title} onChange={(event) => setTitle(event.target.value)} />

                <FieldLabel label="Description" />
                <textarea
                  className={`${inputClass} min-h-28 resize-none`}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <FieldLabel label="Category" />
                    <input
                      className={inputClass}
                      value={category}
                      onChange={(event) => setCategory(event.target.value)}
                      placeholder="e.g. Work, Study, Personal"
                    />
                  </div>
                  <div>
                    <FieldLabel label="Status" />
                    <select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value)}>
                      <option>To Do</option>
                      <option>In Progress</option>
                      <option>Done</option>
                      <option>Missed</option>
                    </select>
                  </div>
                </div>
              </Card>

              <Card title="Editable Subtasks" action="+ Add Subtask" onAction={() => setAddingSubtask(true)}>
                <div className="space-y-2">
                  {subtasks.map((item) => (
                    <div key={item.id} className="grid gap-2 rounded-xl bg-[var(--bp-surface)] p-3 md:grid-cols-[28px_1fr_auto_auto] md:items-center">
                      <button
                        type="button"
                        onClick={() => void handleToggleSubtask(item)}
                        aria-label={item.isDone ? 'Mark subtask incomplete' : 'Mark subtask complete'}
                        className={`h-5 w-5 rounded border text-[10px] font-black ${item.isDone ? 'border-green-400 bg-green-400 text-[#1F2937]' : 'border-slate-500'}`}
                      >
                        {item.isDone ? 'OK' : ''}
                      </button>
                      <p className={`truncate px-3 py-2 text-sm ${item.isDone ? 'text-slate-500 line-through' : 'text-[var(--bp-text)]'}`}>
                        {item.title}
                      </p>
                      <button
                        type="button"
                        onClick={() => setEditingSubtaskId(item.id)}
                        className="rounded-lg bg-[var(--bp-border)] px-3 py-2 text-xs font-bold text-[var(--bp-text)]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingSubtaskId(item.id)}
                        className="rounded-lg border border-red-500/40 px-3 py-2 text-xs font-bold text-red-300"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                  {!subtasks.length ? <p className="text-sm text-slate-400">No subtasks yet.</p> : null}
                </div>
              </Card>

              <Card title="Notes">
                <textarea
                  className={`${inputClass} min-h-20 resize-none`}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </Card>

              <Card title="Attachments">
                <TaskAttachmentPicker
                  files={draftAttachments}
                  onChange={setDraftAttachments}
                  disabled={saving || uploadingAttachments}
                  onValidationError={setError}
                />
                <div className="mt-4 space-y-2">
                  {attachments.map((file) => (
                    <div key={file.id ?? file.fileName ?? file.name} className="flex items-center gap-3 rounded-xl bg-[var(--bp-surface)] p-3">
                      <button
                        type="button"
                        onClick={() => handlePreviewAttachment(file)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-black text-white ${attachmentColor(file.fileType ?? file.type, file.fileName ?? file.name)}`}>
                          {attachmentLabel(file.fileType ?? file.type, file.fileName ?? file.name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-[var(--bp-text)]">{file.fileName ?? file.name}</p>
                          <p className="text-xs text-slate-500">
                            {formatFileSize(file.fileSize ?? file.size) || (file.fileType ?? file.type) || 'Attached file'}
                          </p>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteAttachment(file)}
                        className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-bold text-red-300"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                  {!attachments.length ? <p className="text-sm text-slate-400">No attachments yet.</p> : null}
                </div>
              </Card>
            </section>

            <aside className="space-y-3">
              <Card title="Task Settings" code="SET">
                <FieldLabel label="Priority" />
                <div className="mb-3 grid grid-cols-3 gap-2">
                  <Segment active={priority === 'Low'} label="Low" color="text-green-400" onClick={() => setPriority('Low')} />
                  <Segment active={priority === 'Medium'} label="Medium" color="text-orange-400" onClick={() => setPriority('Medium')} />
                  <Segment active={priority === 'High'} label="High" color="text-red-400" onClick={() => setPriority('High')} />
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                  <div>
                    <FieldLabel label="Due Date" />
                    <input type="date" className={inputClass} value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                  </div>
                  <div>
                    <FieldLabel label="Due Time" />
                    <input type="time" className={inputClass} value={dueTime} onChange={(event) => setDueTime(event.target.value)} />
                  </div>
                </div>
              </Card>

              <Card title="Progress Overview" code={`${progress}`}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-slate-400">
                    {completedSubtasksCount} of {subtasks.length} subtasks completed
                  </span>
                  <span className="text-lg font-black text-[var(--bp-accent)]">{progress}%</span>
                </div>
                <div className="h-2 rounded-full bg-[var(--bp-border)]">
                  <div className="h-2 rounded-full bg-[var(--bp-accent)]" style={{ width: `${progress}%` }} />
                </div>
              </Card>

              <Card title="Reminder & Recurring">
                <FieldLabel label="Reminder" />
                <label className="mb-3 flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={reminderEnabled}
                    onChange={(event) => setReminderEnabled(event.target.checked)}
                  />
                  Enable reminder
                </label>
                <select
                  className={inputClass}
                  value={reminderBeforeMinutes}
                  disabled={!reminderEnabled}
                  onChange={(event) => setReminderBeforeMinutes(Number(event.target.value))}
                >
                  {reminderMinuteOptions.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {formatReminderLabel(minutes)}
                    </option>
                  ))}
                </select>

                <FieldLabel label="Recurring" />
                <button
                  type="button"
                  onClick={() => setIsRecurrenceModalOpen(true)}
                  className={`${inputClass} text-start font-bold`}
                >
                  {recurrenceSummary}
                </button>
              </Card>

              <Card title="Dependencies" action="+ Add" onAction={() => setDependencyModalMode('add')}>
                {dependencies.map((dependency) => (
                  <Dependency
                    key={dependency.id}
                    label={dependency.title}
                    status={toUiStatus(dependency.status)}
                    onReplace={() => {
                      setSelectedDependency(dependency)
                      setDependencyModalMode('edit')
                    }}
                    onRemove={() => {
                      setSelectedDependency(dependency)
                      setDependencyModalMode('remove')
                    }}
                  />
                ))}
                {!dependencies.length ? <p className="text-sm text-slate-400">No dependencies yet.</p> : null}
              </Card>

              <Card title="Activity Information">
                <InfoRow label="Created Date" value={formatDate(task.createdAt)} />
                <InfoRow label="Last Updated" value={formatDate(task.updatedAt)} />
              </Card>

              <Card title="Time Tracking">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <FieldLabel label="Estimated Hours" />
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      className={inputClass}
                      value={estimatedHours}
                      onChange={(event) => setEstimatedHours(event.target.value)}
                    />
                  </div>
                  <div>
                    <FieldLabel label="Spent Hours" />
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      className={inputClass}
                      value={spentHours}
                      onChange={(event) => setSpentHours(event.target.value)}
                    />
                  </div>
                </div>
                <InfoRow label="Remaining Time" value={`${remainingHoursDisplay}h`} />
              </Card>
            </aside>
          </div>

          <footer className="mt-6 flex flex-col gap-2 border-t border-[var(--bp-border)] pt-4 md:flex-row md:items-center md:justify-between">
            <button onClick={onDelete} className="rounded-lg border border-red-500/50 px-5 py-2.5 text-sm font-bold text-red-400">
              Delete Task
            </button>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button onClick={onCancel} className="rounded-lg bg-[var(--bp-border)] px-6 py-2.5 text-sm font-bold text-[var(--bp-text)]">
                Cancel Changes
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className="rounded-lg bg-[var(--bp-accent)] px-6 py-2.5 text-sm font-black text-[var(--bp-accent-text)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </footer>
          {error ? <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-300">{error}</p> : null}
      </AppLayout>

      {addingSubtask ? (
        <SubtaskFormModal
          mode="add"
          onCancel={() => setAddingSubtask(false)}
          onBack={() => setAddingSubtask(false)}
          onSubmit={(values) => void handleAddSubtask(values)}
        />
      ) : null}

      {editingSubtaskId !== null ? (
        <SubtaskFormModal
          mode="edit"
          initialValues={{ title: subtasks.find((item) => item.id === editingSubtaskId)?.title }}
          onCancel={() => setEditingSubtaskId(null)}
          onBack={() => setEditingSubtaskId(null)}
          onDelete={() => {
            setDeletingSubtaskId(editingSubtaskId)
            setEditingSubtaskId(null)
          }}
          onSubmit={(values) => void handleEditSubtask(values)}
        />
      ) : null}

      {deletingSubtaskId !== null ? (
        <DeleteSubtaskModal
          subtaskTitle={subtasks.find((item) => item.id === deletingSubtaskId)?.title}
          onCancel={() => setDeletingSubtaskId(null)}
          onConfirm={() => void handleConfirmDelete()}
        />
      ) : null}

      <TaskDependenciesWorkflowModal
        open={dependencyModalMode !== null}
        mode={dependencyModalMode ?? 'add'}
        currentTaskId={task.id}
        availableTasks={tasks.map(toDependencyOption)}
        dependencies={dependencies.map(toDependencyOption)}
        dependency={selectedDependency ? toDependencyOption(selectedDependency) : null}
        onClose={() => {
          setDependencyModalMode(null)
          setSelectedDependency(null)
        }}
        onAdd={(selected) => void handleAddDependencies(selected)}
        onSaveReplacement={(oldId, replacement) => void handleReplaceDependency(oldId, replacement)}
        onRemove={(dependencyId) => void handleRemoveDependency(dependencyId)}
      />

      <TaskRecurrenceModal
        open={isRecurrenceModalOpen}
        mode={recurrence ? 'edit' : 'create'}
        recurrence={recurrence}
        onClose={() => setIsRecurrenceModalOpen(false)}
        onSave={setRecurrence}
        onRemove={() => setRecurrence(null)}
      />
      <AttachmentPreviewModal
        open={Boolean(previewAttachment && accessToken)}
        accessToken={accessToken ?? ''}
        taskId={task.id}
        attachment={previewAttachment}
        onClose={() => setPreviewAttachment(null)}
        onError={setError}
      />
    </>
  )
}

const inputClass =
  'mb-3 w-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 py-2.5 text-[var(--bp-text)] outline-none focus:border-[var(--bp-accent)]'

function Card({
  title,
  code,
  action,
  onAction,
  children,
}: {
  title: string
  code?: string
  action?: string
  onAction?: () => void
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)]/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-base font-black">
          {code ? <span className="text-[var(--bp-accent)]">{code}</span> : null}
          {title}
        </h3>
        {action ? (
          <button onClick={onAction} className="text-sm font-bold text-[var(--bp-accent)]">
            {action}
          </button>
        ) : null}
      </div>
      {children}
    </section>
  )
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-300">
      {label} {required ? <span className="text-red-400">*</span> : null}
    </label>
  )
}

function Segment({ label, active, color, onClick }: { label: string; active?: boolean; color: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-sm font-bold ${active ? 'border-[var(--bp-accent)] bg-[var(--bp-accent)]/10 text-[var(--bp-accent)]' : `border-[var(--bp-border)] bg-[var(--bp-surface)] ${color}`}`}
    >
      {label}
    </button>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-2 flex items-center justify-between rounded-xl bg-[var(--bp-surface)] px-3 py-2">
      <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-sm font-bold text-[var(--bp-text)]">{value}</span>
    </div>
  )
}

function Dependency({
  label,
  status,
  onReplace,
  onRemove,
}: {
  label: string
  status: string
  onReplace: () => void
  onRemove: () => void
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-[var(--bp-surface)] p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-[var(--bp-text)]">{label}</p>
        <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-bold text-blue-300">{status}</span>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <button type="button" onClick={onReplace} className="rounded-lg bg-[var(--bp-border)] px-2.5 py-1.5 text-xs font-bold text-[var(--bp-text)]">
          Replace
        </button>
        <button type="button" onClick={onRemove} className="rounded-lg border border-red-500/40 px-2.5 py-1.5 text-xs font-bold text-red-300">
          Remove
        </button>
      </div>
    </div>
  )
}

function toDateInput(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function formatDate(value?: string) {
  if (!value) return 'Not available'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not available'
  return date.toISOString().slice(0, 10)
}

function formatFileSize(size?: number | string) {
  const value = typeof size === 'string' ? Number(size) : size
  if (!value || Number.isNaN(value)) return ''
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function attachmentLabel(type?: string, fileName?: string) {
  const normalized = `${type ?? ''} ${fileName ?? ''}`.toLowerCase()
  if (normalized.includes('pdf')) return 'PDF'
  if (normalized.includes('image') || normalized.match(/\.(png|jpe?g|gif|webp)$/)) return 'IMG'
  if (normalized.match(/\.(docx?|txt)$/) || normalized.includes('word')) return 'DOC'
  if (normalized.match(/\.(xlsx?|csv)$/) || normalized.includes('sheet') || normalized.includes('excel')) return 'XLS'
  if (normalized.match(/\.(pptx?)$/) || normalized.includes('powerpoint')) return 'SLD'
  return 'FILE'
}

function attachmentColor(type?: string, fileName?: string) {
  const normalized = `${type ?? ''} ${fileName ?? ''}`.toLowerCase()
  if (normalized.includes('pdf')) return 'bg-red-500'
  if (normalized.includes('image') || normalized.match(/\.(png|jpe?g|gif|webp)$/)) return 'bg-green-500'
  if (normalized.match(/\.(xlsx?|csv)$/) || normalized.includes('sheet') || normalized.includes('excel')) return 'bg-blue-500'
  if (normalized.match(/\.(docx?|txt)$/) || normalized.includes('word')) return 'bg-indigo-500'
  return 'bg-orange-500'
}

function formatReminderLabel(minutes: number) {
  if (minutes === 10) return '10 minutes before'
  if (minutes === 30) return '30 minutes before'
  if (minutes === 60) return '1 hour before'
  if (minutes === 1440) return '1 day before'
  return `${minutes} minutes before`
}

type DependencySource = Pick<ApiTask, 'id' | 'title' | 'category' | 'status' | 'dueDate' | 'priority'>

function toDependencyOption(task: DependencySource): DependencyTask {
  return {
    id: task.id,
    title: task.title,
    category: task.category || 'General',
    status: toUiStatus(task.status) as DependencyTask['status'],
    dueDate: formatDependencyDueDate(task.dueDate),
    priority: normalizeDependencyPriority(toUiPriority(task.priority)),
  }
}

function formatDependencyDueDate(value?: string) {
  if (!value) return 'No due date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No due date'
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function normalizeDependencyPriority(priority: string): DependencyTask['priority'] {
  if (priority === 'Low' || priority === 'High') return priority
  return 'Medium'
}
