import { useEffect, useMemo, useState } from 'react'
import DeleteSubtaskModal from '../components/DeleteSubtaskModal'
import DeleteTaskModal from '../components/DeleteTaskModal'
import { ConfirmDestructiveModal } from '../components/ConfirmDestructiveModal'
import { AppLayout, PageHeader, TopActionBar, type SidebarNavHandlers } from '../components/layout'
import TaskAttachmentPicker from '../components/TaskAttachmentPicker'
import AttachmentPreviewModal from '../components/AttachmentPreviewModal'
import SubtaskFormModal from '../components/SubtaskFormModal'
import {
  TaskRecurrenceModal,
  createRecurrenceSummary,
  type RecurrenceSettings,
} from '../components/TaskRecurrenceModal'
import { TaskDependenciesWorkflowModal, type DependencyTask } from '../components/TaskDependenciesWorkflowModal'
import { useLanguage } from '../i18n/LanguageContext'
import { useTheme } from '../theme/ThemeContext'
import { SharedBadge } from '../features/collaboration/components/SharedBadge'
import { displaySubtaskTitle } from '../lib/subtaskDisplay'
import { useUnsavedChangesGuard } from '../lib/useUnsavedChangesGuard'
import { TaskTimeConflictModal, type ScheduleChoice } from '../components/TaskTimeConflictModal'
import { TaskCommitmentConflictModal } from '../components/TaskCommitmentConflictModal'
import { WeatherTravelTaskFields } from '../components/WeatherTravelTaskFields'
import { canValidateTaskSchedule, taskScheduleValidationError } from '../lib/taskScheduleValidation'
import { skipCommitmentOccurrence } from '../lib/plannerApi'
import { ManageMembersSection } from '../features/collaboration/components/ManageMembersSection'
import { ReminderAudienceSection } from '../features/collaboration/components/ReminderAudienceSection'
import { FocusAudienceSection } from '../features/collaboration/components/FocusAudienceSection'
import { Toast } from '../features/collaboration/components/Toast'
import { useTaskDeleteConfirmation } from '../features/tasks/taskDeleteConfirmation'
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
  updateTask,
  changeTaskStatus,
  validateTaskSchedule,
  getNearestTaskSchedule,
  resolveTaskScheduleConflict,
  uploadAttachment,
  type ApiDependency,
  type ApiSubtask,
  type ApiTask,
  type ApiTaskAttachment,
  type SubtaskPayload,
  type TaskPayload,
  type TaskTimeConflict,
  type TaskCommitmentConflict,
  type TaskDestination,
} from '../lib/tasksApi'

type EditTaskScreenProps = SidebarNavHandlers & {
  task: ApiTask
  tasks?: ApiTask[]
  accessToken?: string
  currentUserId?: string
  onRefresh?: () => void
  onBack?: () => void
  onCancel?: () => void
  onOpenAiCollaboration?: () => void
  onDelete?: () => Promise<void> | void
  onSave?: (payload: TaskPayload) => Promise<ApiTask | undefined> | ApiTask | void
  onSaved?: (task: ApiTask) => void
  onTaskUpdated?: (task: ApiTask) => void
  onSignOut?: () => void
  onPermissionDenied?: () => void
}

const REMINDER_OPTIONS = [10, 30, 60, 1440]

export default function EditTaskScreen({
  task,
  tasks = [],
  accessToken,
  currentUserId = '',
  onRefresh,
  onBack,
  onCancel,
  onOpenAiCollaboration,
  onDelete,
  onSave,
  onSaved,
  onTaskUpdated,
  onSignOut,
  onPermissionDenied,
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
  const [scheduledDate, setScheduledDate] = useState(task.scheduledDate ?? '')
  const [scheduledStartTime, setScheduledStartTime] = useState(task.scheduledStartTime ?? '')
  const [scheduledEndTime, setScheduledEndTime] = useState(task.scheduledEndTime ?? '')
  const [timeConflict, setTimeConflict] = useState<TaskTimeConflict | null>(null)
  const [commitmentConflict, setCommitmentConflict] = useState<TaskCommitmentConflict | null>(null)
  const [destination, setDestination] = useState<Partial<TaskDestination>>(task.destination ?? {})
  const [weatherTravelEnabled, setWeatherTravelEnabled] = useState(Boolean(task.weatherTravelEnabled))
  const [travelMode, setTravelMode] = useState<'driving'|'walking'|'cycling'>(task.travelMode ?? 'driving')
  const [notes, setNotes] = useState(task.notes)
  const [reminderEnabled, setReminderEnabled] = useState(task.reminderEnabled)
  const [reminderBeforeMinutes, setReminderBeforeMinutes] = useState(task.reminderBeforeMinutes ?? 30)
  const [focusEnabled, setFocusEnabled] = useState(task.isFocusTask)
  const [notice, setNotice] = useState('')
  const [estimatedHours, setEstimatedHours] = useState(String(task.estimatedHours))
  const [spentHours, setSpentHours] = useState(String(task.manualSpentHours ?? task.spentHours))
  const [errorKey, setErrorKey] = useState('')
  const error = errorKey ? t(errorKey) : ''
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState(task.progress)
  const [subtasks, setSubtasks] = useState<ApiSubtask[]>(task.subtasks)
  const [dependencies, setDependencies] = useState<ApiDependency[]>(task.dependencies)
  const [attachments, setAttachments] = useState<ApiTaskAttachment[]>([])
  const [attachmentToDelete, setAttachmentToDelete] = useState<ApiTaskAttachment | null>(null)
  const [isDeletingAttachment, setIsDeletingAttachment] = useState(false)
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
  const [moreOptions, setMoreOptions] = useState(false)
  const recurrenceSummary = createRecurrenceSummary(recurrence, t)
  const recurrenceState = JSON.stringify(recurrence)

  // Warn before leaving with unsaved edits (compared against the task as first
  // loaded). Pending attachment uploads count as changes too.
  const initialValues = useMemo(
    () => ({
      title: task.title,
      description: task.description,
      category: task.category || 'General',
      status: toUiStatus(task.status),
      priority: toUiPriority(task.priority),
      dueDate: toDateInput(task.dueDate),
      dueTime: task.dueTime,
      scheduledDate: task.scheduledDate ?? '',
      scheduledStartTime: task.scheduledStartTime ?? '',
      scheduledEndTime: task.scheduledEndTime ?? '',
      notes: task.notes,
      reminderEnabled: task.reminderEnabled,
      reminderBeforeMinutes: task.reminderBeforeMinutes ?? 30,
      focusEnabled: task.isFocusTask,
      estimatedHours: String(task.estimatedHours),
      spentHours: String(task.manualSpentHours ?? task.spentHours),
      recurrenceState: JSON.stringify(recurrenceToUi(task.recurrence)),
    }),
    [task],
  )
  const isDirty =
    title !== initialValues.title ||
    description !== initialValues.description ||
    category !== initialValues.category ||
    status !== initialValues.status ||
    priority !== initialValues.priority ||
    dueDate !== initialValues.dueDate ||
    dueTime !== initialValues.dueTime ||
    scheduledDate !== initialValues.scheduledDate ||
    scheduledStartTime !== initialValues.scheduledStartTime ||
    scheduledEndTime !== initialValues.scheduledEndTime ||
    notes !== initialValues.notes ||
    reminderEnabled !== initialValues.reminderEnabled ||
    reminderBeforeMinutes !== initialValues.reminderBeforeMinutes ||
    focusEnabled !== initialValues.focusEnabled ||
    estimatedHours !== initialValues.estimatedHours ||
    spentHours !== initialValues.spentHours ||
    recurrenceState !== initialValues.recurrenceState ||
    draftAttachments.length > 0
  const { markSaved } = useUnsavedChangesGuard(isDirty, { message: t('editTaskFeedback.unsavedChanges') })

  const {
    isOpen: isDeleteDialogOpen,
    isDeleting: isDeletingTask,
    error: deleteError,
    openDeleteDialog,
    closeDeleteDialog,
    confirmDelete,
  } = useTaskDeleteConfirmation(onDelete)

  useEffect(() => {
    if (!task) return

    setTitle(task.title)
    setDescription(task.description)
    setCategory(task.category || 'General')
    setStatus(toUiStatus(task.status))
    setPriority(toUiPriority(task.priority))
    setDueDate(toDateInput(task.dueDate))
    setDueTime(task.dueTime)
    setScheduledDate(task.scheduledDate ?? '')
    setScheduledStartTime(task.scheduledStartTime ?? '')
    setScheduledEndTime(task.scheduledEndTime ?? '')
    setNotes(task.notes)
    setReminderEnabled(task.reminderEnabled)
    setReminderBeforeMinutes(task.reminderBeforeMinutes ?? 30)
    setFocusEnabled(task.isFocusTask)
    setEstimatedHours(String(task.estimatedHours))
    setSpentHours(String(task.manualSpentHours ?? task.spentHours))
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
      .catch(() => {
        if (!cancelled) {
          setErrorKey('editTaskFeedback.loadAttachmentsFailed')
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
    setErrorKey('')
    onTaskUpdated?.(updatedTask)
  }

  async function handleAddSubtask(payload: SubtaskPayload) {
    if (!accessToken || !payload.title?.trim()) return

    try {
      const updatedTask = await addSubtask(accessToken, task.id, { ...payload, title: payload.title.trim() })
      applyUpdatedTask(updatedTask)
      setAddingSubtask(false)
    } catch (subtaskError) {
      setErrorKey('editTaskFeedback.addSubtaskFailed')
    }
  }

  async function handleEditSubtask(payload: SubtaskPayload) {
    if (!accessToken || editingSubtaskId === null) return

    try {
      const updatedTask = await updateSubtask(accessToken, task.id, editingSubtaskId, payload)
      applyUpdatedTask(updatedTask)
      setEditingSubtaskId(null)
    } catch (subtaskError) {
      setErrorKey('editTaskFeedback.updateSubtaskFailed')
    }
  }

  async function handleConfirmDelete() {
    if (!accessToken || deletingSubtaskId === null) return

    try {
      const updatedTask = await deleteSubtask(accessToken, task.id, deletingSubtaskId)
      applyUpdatedTask(updatedTask)
    } catch (subtaskError) {
      setErrorKey('editTaskFeedback.deleteSubtaskFailed')
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
      setErrorKey('editTaskFeedback.updateSubtaskFailed')
    }
  }

  async function handleAddDependencies(selected: DependencyTask[]) {
    if (!accessToken || !selected.length) return

    try {
      const updatedTask = await addDependencies(accessToken, task.id, selected.map((item) => item.id))
      applyUpdatedTask(updatedTask)
    } catch (dependencyError) {
      setErrorKey('editTaskFeedback.addDependencyFailed')
    }
  }

  async function handleRemoveDependency(dependencyId: string) {
    if (!accessToken) return

    try {
      const updatedTask = await removeDependency(accessToken, task.id, dependencyId)
      applyUpdatedTask(updatedTask)
    } catch (dependencyError) {
      setErrorKey('editTaskFeedback.removeDependencyFailed')
    }
  }

  async function handleReplaceDependency(oldDependencyId: string, replacement: DependencyTask) {
    if (!accessToken) return

    try {
      const updatedTask = await replaceDependency(accessToken, task.id, oldDependencyId, replacement.id)
      applyUpdatedTask(updatedTask)
    } catch (dependencyError) {
      setErrorKey('editTaskFeedback.replaceDependencyFailed')
    }
  }

  async function handleDeleteAttachment(attachment: ApiTaskAttachment) {
    if (!accessToken || !attachment.id || isDeletingAttachment) return
    setIsDeletingAttachment(true)
    const previous = attachments
    setAttachments((current) => current.filter((item) => item.id !== attachment.id))

    try {
      await deleteAttachment(accessToken, task.id, attachment.id)
    } catch (deleteError) {
      setAttachments(previous)
      setErrorKey('editTaskFeedback.deleteAttachmentFailed')
    } finally {
      setIsDeletingAttachment(false)
      setAttachmentToDelete(null)
    }
  }

  async function handleSave() {
    if (!title.trim()) {
      setErrorKey('editTaskFeedback.titleRequired')
      return
    }

    if (dueTime && !dueDate) {
      setErrorKey('editTaskFeedback.dueDateRequired')
      return
    }

    if (status === 'Done' && subtasks.some((item) => !item.isDone)) {
      setErrorKey('editTaskFeedback.completeSubtasks')
      return
    }

    const estimatedTimeMinutes = Math.round((Number(estimatedHours) || 0) * 60)
    const spentTimeMinutes = Math.round((Number(spentHours) || 0) * 60)
    const scheduleValidationError = taskScheduleValidationError({ scheduledDate, scheduledStartTime, scheduledEndTime, estimatedTimeMinutes })
    if (scheduleValidationError) {
      setErrorKey('editTaskFeedback.invalidSchedule')
      return
    }
    if (accessToken && canValidateTaskSchedule({ scheduledDate, scheduledStartTime, scheduledEndTime, estimatedTimeMinutes })) {
      const validation = await validateTaskSchedule(accessToken, { id: task.id, title: title.trim(), priority: toApiPriority(priority), dueDate: dueDate || undefined, scheduledDate, scheduledStartTime, scheduledEndTime: scheduledEndTime || undefined, estimatedTimeMinutes })
      if (validation.commitmentConflicts.length) { setCommitmentConflict(validation.commitmentConflicts[0]); return }
      if (validation.conflicts.length) { setTimeConflict(validation.conflicts[0]); return }
      if (!scheduledEndTime && validation.normalizedSchedule) setScheduledEndTime(validation.normalizedSchedule.scheduledEndTime)
    }
    setSaving(true)
    setErrorKey('')

    try {
      const updatedTask = await onSave?.({
        title: title.trim(),
        description: description.trim(),
        category: category.trim(),
        status: toApiStatus(status),
        priority: toApiPriority(priority),
        dueDate: dueDate || undefined,
        dueTime,
        scheduledDate: scheduledDate || undefined,
        scheduledStartTime: scheduledStartTime || undefined,
        scheduledEndTime: scheduledEndTime || undefined,
        destination: destination.displayName && Number.isFinite(destination.latitude) && Number.isFinite(destination.longitude) ? destination as TaskDestination : undefined,
        weatherTravelEnabled,
        travelMode,
        notes: notes.trim(),
        estimatedTimeMinutes,
        spentTimeMinutes,
        remainingTimeMinutes: Math.max(estimatedTimeMinutes - spentTimeMinutes, 0),
        reminderEnabled,
        reminderBeforeMinutes,
        isFocusTask: focusEnabled,
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

      markSaved()
      onSaved?.(updatedTask)
    } catch (saveError) {
      setErrorKey('editTaskFeedback.saveFailed')
    } finally {
      setUploadingAttachments(false)
      setSaving(false)
    }
  }

  async function moveConflictTask(which: 'existing' | 'new', mode: 'auto' | 'manual', manual?: ScheduleChoice) {
    if (!timeConflict || !accessToken) return
    const target = which === 'existing' ? timeConflict.existingTask : timeConflict.proposedTask
    const schedule = mode === 'manual' ? manual : (await getNearestTaskSchedule(accessToken, target)).schedule
    if (!schedule) { setErrorKey('editTaskFeedback.invalidSchedule'); return }
    const validation = await validateTaskSchedule(accessToken, { ...target, ...schedule })
    if (validation.conflicts.length) { setErrorKey('editTaskFeedback.invalidSchedule'); return }
    if (!window.confirm(`Current schedule → Proposed schedule\n${target.title}: ${target.scheduledDate} ${target.scheduledStartTime}–${target.scheduledEndTime} → ${schedule.scheduledDate} ${schedule.scheduledStartTime}–${schedule.scheduledEndTime}`)) return
    if (which === 'existing') {
      await updateTask(accessToken, target.id, schedule)
      await resolveTaskScheduleConflict(accessToken, { conflictKey: timeConflict.id, date: target.scheduledDate, taskId: target.id, resolution: mode === 'auto' ? 'move_existing_auto' : 'move_existing_manual' })
    } else {
      setScheduledDate(schedule.scheduledDate); setScheduledStartTime(schedule.scheduledStartTime); setScheduledEndTime(schedule.scheduledEndTime)
    }
    setTimeConflict(null)
  }

  async function keepCommitment() {
    if (!commitmentConflict || !accessToken) return
    const schedule = (await getNearestTaskSchedule(accessToken, commitmentConflict.proposedTask)).schedule
    if (!schedule || !window.confirm(`Current schedule → Proposed schedule\n${scheduledDate} ${scheduledStartTime}–${scheduledEndTime} → ${schedule.scheduledDate} ${schedule.scheduledStartTime}–${schedule.scheduledEndTime}`)) return
    setScheduledDate(schedule.scheduledDate); setScheduledStartTime(schedule.scheduledStartTime); setScheduledEndTime(schedule.scheduledEndTime)
    setCommitmentConflict(null)
  }

  async function keepTask() {
    if (!commitmentConflict || !accessToken) return
    await skipCommitmentOccurrence(accessToken, commitmentConflict.commitment.commitmentId, commitmentConflict.commitment.date)
    await resolveTaskScheduleConflict(accessToken, { conflictKey: commitmentConflict.id, date: commitmentConflict.commitment.date, taskId: task.id, commitmentId: commitmentConflict.commitment.commitmentId, resolution: 'keep_task' })
    setCommitmentConflict(null)
  }

  function handlePreviewAttachment(attachment: ApiTaskAttachment) {
    if (!accessToken || !attachment.id) return
    setPreviewAttachment(attachment)
  }

  const canEditShared =
    task.viewerRole === 'owner' || task.viewerRole === 'editor' || task.canEdit === true
  const reminderMinuteOptions = REMINDER_OPTIONS.includes(reminderBeforeMinutes)
    ? REMINDER_OPTIONS
    : [...REMINDER_OPTIONS, reminderBeforeMinutes].sort((a, b) => a - b)
  const remainingHoursDisplay = Math.max((Number(estimatedHours) || 0) - (Number(spentHours) || 0), 0)
  const completedSubtasksCount = subtasks.filter((item) => item.isDone).length

  // Viewers can never reach this screen intentionally (the Edit button and
  // the openEditTask() gate both hide it), but this is the last line of
  // defense: any other path that lands here with a non-editor role bounces
  // straight back out before rendering an editable form.
  useEffect(() => {
    if (!canEditShared) {
      onPermissionDenied?.()
    }
  }, [canEditShared, onPermissionDenied])

  if (!canEditShared) {
    return null
  }

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
          <div className="mb-3 flex items-center gap-2 text-xs text-[var(--bp-muted)]">
            <button type="button" onClick={onBack} className="hover:text-[var(--bp-text)]">{t('taskForm.back')}</button>
            <span>Tasks</span>
            <span>/</span>
            <span className="text-[var(--bp-text)]">{t('taskForm.editTask')}</span>
          </div>

          <PageHeader
            title={t('taskUi.edit.title')}
            subtitle={t('taskUi.edit.subtitle')}
            toolbar={
              <TopActionBar pageOnly
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
          />

          <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
            <section className="space-y-3">
              <Card title={t('createTask.information')} code="INFO">
                <FieldLabel label={t('taskForm.taskTitle')} required htmlFor="edit-task-title" />
                <input id="edit-task-title" required aria-required="true" aria-invalid={Boolean(error && !title.trim())} aria-describedby={error ? 'edit-task-error' : undefined} className={inputClass} value={title} onChange={(event) => setTitle(event.target.value)} />

                <FieldLabel label={t('taskForm.description')} htmlFor="edit-task-description" />
                <textarea
                  id="edit-task-description"
                  className={`${inputClass} min-h-28 resize-none`}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <FieldLabel label={t('createTask.category')} htmlFor="edit-task-category" />
                    <input
                      id="edit-task-category"
                      className={inputClass}
                      value={category}
                      onChange={(event) => setCategory(event.target.value)}
                      placeholder={t('createTask.selectCategory')}
                    />
                  </div>
                  <div>
                    <FieldLabel label={t('taskForm.status')} htmlFor="edit-task-status" />
                    <select id="edit-task-status" className={inputClass} value={status} onChange={(event) => setStatus(event.target.value)}>
                      <option value="To Do">{t('taskLabels.status.todo')}</option>
                      <option value="In Progress">{t('taskLabels.status.inProgress')}</option>
                      <option value="Done">{t('taskLabels.status.done')}</option>
                      <option value="Missed">{t('taskLabels.status.missed')}</option>
                    </select>
                  </div>
                </div>
              </Card>

              <Card title={t('editTaskForm.subtasks')} action={t('editTaskForm.addSubtask')} onAction={() => setAddingSubtask(true)}>
                <div className="space-y-2">
                  {subtasks.map((item) => (
                    <div key={item.id} className="grid gap-2 rounded-xl bg-[var(--bp-surface)] p-3 md:grid-cols-[28px_1fr_auto_auto] md:items-center">
                      <button
                        type="button"
                        onClick={() => void handleToggleSubtask(item)}
                        aria-label={item.isDone ? t('editTaskForm.markSubtaskIncomplete') : t('editTaskForm.markSubtaskComplete')}
                        className={`h-5 w-5 rounded border text-[10px] font-black ${item.isDone ? 'border-green-400 bg-green-400 text-[#1F2937]' : 'border-slate-500'}`}
                      >
                        {item.isDone ? 'OK' : ''}
                      </button>
                      <div className="min-w-0 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <p className={`truncate text-sm ${item.isDone ? 'text-[var(--bp-muted)] line-through' : 'text-[var(--bp-text)]'}`}>
                            {displaySubtaskTitle(item)}
                          </p>
                          {item.isShared ? <SharedBadge /> : null}
                        </div>
                        {item.assigneeUserId && item.assignee ? (
                          <p className="mt-0.5 text-xs text-[var(--bp-muted)]">{t('editTaskForm.assignedTo', { name: item.assignee })}</p>
                        ) : !item.assigneeUserId && !item.isShared ? (
                          <p className="mt-0.5 text-xs text-[var(--bp-muted)]">{t('editTaskForm.unassigned')}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingSubtaskId(item.id)}
                        className="rounded-lg bg-[var(--bp-border)] px-3 py-2 text-xs font-bold text-[var(--bp-text)]"
                      >
                        {t('editTaskForm.edit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingSubtaskId(item.id)}
                        className="rounded-lg border border-red-500/40 px-3 py-2 text-xs font-bold text-red-300"
                      >
                        {t('editTaskForm.delete')}
                      </button>
                    </div>
                  ))}
                  {!subtasks.length ? <p className="text-sm text-[var(--bp-muted)]">{t('editTaskForm.noSubtasks')}</p> : null}
                </div>
              </Card>

              <Card title={t('taskForm.notes')}>
                <textarea
                  className={`${inputClass} min-h-20 resize-none`}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder={t('taskForm.notesPlaceholder')}
                  aria-label={t('taskForm.notes')}
                />
              </Card>

              <Card title={t('createTask.attachments')}>
                <TaskAttachmentPicker
                  files={draftAttachments}
                  onChange={setDraftAttachments}
                  disabled={saving || uploadingAttachments}
                  onValidationError={() => setErrorKey('editTaskFeedback.attachmentInvalid')}
                />
                <div className="mt-4 space-y-2">
                  {attachments.map((file) => (
                    <div key={file.id ?? file.fileName ?? file.name} className="flex items-center gap-3 rounded-xl bg-[var(--bp-surface)] p-3">
                      <button
                        type="button"
                        onClick={() => handlePreviewAttachment(file)}
                        aria-label={t('editTaskForm.viewAttachment', { name: file.fileName ?? file.name ?? '' })}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-black text-white ${attachmentColor(file.fileType ?? file.type, file.fileName ?? file.name)}`}>
                          {attachmentLabel(file.fileType ?? file.type, file.fileName ?? file.name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-[var(--bp-text)]">{file.fileName ?? file.name}</p>
                          <p className="text-xs text-[var(--bp-muted)]">
                            {formatFileSize(file.fileSize ?? file.size) || (file.fileType ?? file.type) || 'Attached file'}
                          </p>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAttachmentToDelete(file)}
                        className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-bold text-red-300"
                      >
                        {t('editTaskForm.removeAttachment')}
                      </button>
                    </div>
                  ))}
                  {!attachments.length ? <p className="text-sm text-[var(--bp-muted)]">{t('editTaskForm.noAttachments')}</p> : null}
                </div>
              </Card>

              {accessToken &&
              currentUserId &&
              (task.viewerRole === 'owner' ||
                task.viewerRole === 'editor' ||
                task.canEdit === true ||
                task.canManageMembers === true) ? (
                <ManageMembersSection
                  task={task}
                  accessToken={accessToken}
                  currentUserId={currentUserId}
                  onRefresh={onRefresh}
                />
              ) : null}

              {accessToken && currentUserId && task.viewerRole === 'owner' ? (
                <Card title="AI Collaboration" code="AI">
                  <p className="mb-3 text-sm text-[var(--bp-muted)]">
                    Open the AI Collaboration screen to split work fairly, track today's plan, and review
                    suggestions with your team.
                  </p>
                  <button
                    type="button"
                    onClick={onOpenAiCollaboration}
                    className="w-full rounded-lg border border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] px-4 py-2 text-sm font-black text-black"
                  >
                    Open AI Collaboration
                  </button>
                </Card>
              ) : null}
            </section>

            <aside className="space-y-3">
              <Card title={t('createTask.settings')} code="SET">
                <FieldLabel label="Priority" />
                <div className="mb-3 grid grid-cols-3 gap-2">
                  <Segment active={priority === 'Low'} label="Low" color="text-green-400" onClick={() => setPriority('Low')} />
                  <Segment active={priority === 'Medium'} label="Medium" color="text-orange-400" onClick={() => setPriority('Medium')} />
                  <Segment active={priority === 'High'} label="High" color="text-red-400" onClick={() => setPriority('High')} />
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                  <div>
                    <FieldLabel label={`${t('createTask.deadline')} · ${t('createTask.deadlineHelp')}`} htmlFor="edit-task-due-date" />
                    <input id="edit-task-due-date" type="date" aria-label={t('taskForm.dueDate')} className={inputClass} value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                  </div>
                  <div>
                    <FieldLabel label={t('createTask.deadlineTime')} htmlFor="edit-task-due-time" />
                    <input id="edit-task-due-time" type="time" aria-label={t('editTaskControls.dueTime')} className={inputClass} value={dueTime} onChange={(event) => setDueTime(event.target.value)} />
                  </div>
                </div>
                <div className="mt-3 grid gap-3">
                  <div><FieldLabel label={`${t('createTask.schedule')} · ${t('createTask.scheduleHelp')}`} htmlFor="edit-task-scheduled-date" /><input id="edit-task-scheduled-date" type="date" aria-label={t('taskForm.startDate')} className={inputClass} value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} /></div>
                  <div><FieldLabel label={t('createTask.startTime')} htmlFor="edit-task-scheduled-start" /><input id="edit-task-scheduled-start" type="time" aria-label={t('createTask.startTime')} className={inputClass} value={scheduledStartTime} onChange={(event) => setScheduledStartTime(event.target.value)} /></div>
                  <div><FieldLabel label={t('createTask.endTime')} htmlFor="edit-task-scheduled-end" /><input id="edit-task-scheduled-end" type="time" aria-label={t('createTask.endTime')} className={inputClass} value={scheduledEndTime} onChange={(event) => setScheduledEndTime(event.target.value)} /></div>
                </div>
                <WeatherTravelTaskFields accessToken={accessToken} destination={destination} enabled={weatherTravelEnabled} travelMode={travelMode} onDestination={setDestination} onEnabled={setWeatherTravelEnabled} onTravelMode={setTravelMode} />
              </Card>

              <button type="button" onClick={() => setMoreOptions((value) => !value)} className="flex w-full items-center justify-between rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)]/50 p-4 text-start font-black text-[var(--bp-text)]">More options <span className="text-[var(--bp-muted)]">{moreOptions ? '⌃' : '›'}</span></button>
              {moreOptions ? <Card title="Progress Overview" code={`${progress}`}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-[var(--bp-muted)]">
                    {t('editTaskForm.subtasksCompleted', { completed: completedSubtasksCount, total: subtasks.length })}
                  </span>
                  <span className="text-lg font-black text-[var(--bp-accent-ink)]">{progress}%</span>
                </div>
                <div role="progressbar" aria-label="Task progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="h-2 rounded-full bg-[var(--bp-border)]">
                  <div className="h-2 rounded-full bg-[var(--bp-accent)]" style={{ width: `${progress}%` }} />
                </div>
              </Card> : null}

              <Card title={t('editTaskControls.reminderAndRecurrence')}>
                <FieldLabel label={t('createTask.reminder')} />
                <label className="mb-3 flex items-center gap-2 text-sm text-[var(--bp-subtle)]">
                  <input
                    type="checkbox"
                    checked={reminderEnabled}
                    onChange={(event) => setReminderEnabled(event.target.checked)}
                  />
                  {t('editTaskControls.enableReminder')}
                </label>
                <select
                  className={inputClass}
                  value={reminderBeforeMinutes}
                  disabled={!reminderEnabled}
                  onChange={(event) => setReminderBeforeMinutes(Number(event.target.value))}
                >
                  {reminderMinuteOptions.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {formatReminderLabel(minutes, t)}
                    </option>
                  ))}
                </select>

                {accessToken ? (
                  <div className="mb-3 border-t border-[var(--bp-border)] pt-3">
                    <ReminderAudienceSection
                      taskId={task.id}
                      accessToken={accessToken}
                      canEditShared={canEditShared}
                      onError={() => setErrorKey('editTaskFeedback.reminderFailed')}
                      onNotice={setNotice}
                    />
                  </div>
                ) : null}

                <FieldLabel label={t('editTaskControls.recurrence')} />
                <button
                  type="button"
                  onClick={() => setIsRecurrenceModalOpen(true)}
                  className={`${inputClass} text-start font-bold`}
                >
                  {recurrenceSummary}
                </button>
              </Card>

              <Card title="Focus">
                {accessToken ? (
                  <FocusAudienceSection
                    taskId={task.id}
                    accessToken={accessToken}
                    canEditShared={canEditShared}
                    focusEnabled={focusEnabled}
                    onFocusEnabledChange={setFocusEnabled}
                    onError={() => setErrorKey('editTaskFeedback.saveFailed')}
                  />
                ) : null}
              </Card>

              <Card title={t('createTask.dependencies')} action={t('createTask.addDependency')} onAction={() => setDependencyModalMode('add')}>
                {dependencies.map((dependency) => (
                  <Dependency
                    key={dependency.id}
                    label={dependency.title}
                    status={toUiStatus(dependency.status)}
                    t={t}
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
                {!dependencies.length ? <p className="text-sm text-[var(--bp-muted)]">No dependencies yet.</p> : null}
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
                    <FieldLabel label="Manual Spent Hours" />
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      className={inputClass}
                      value={spentHours}
                      onChange={(event) => setSpentHours(event.target.value)}
                    />
                    <p className="mt-1.5 text-xs text-[var(--bp-muted)]">
                      Time you log by hand. Focus Sessions are tracked automatically and added on
                      top — the total spent time appears on the task details.
                    </p>
                  </div>
                </div>
                <InfoRow label="Remaining Time" value={`${remainingHoursDisplay}h`} />
              </Card>
            </aside>
          </div>

          <footer className="mt-6 flex flex-col gap-4 border-t border-[var(--bp-border)] pt-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <button onClick={onCancel} className="rounded-lg bg-[var(--bp-border)] px-6 py-2.5 text-sm font-bold text-[var(--bp-text)]">
                {t('taskConflict.cancelChanges')}
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className="rounded-lg border border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] px-6 py-2.5 text-sm font-black text-[var(--bp-accent-text)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? t('taskForm.saving') : t('taskForm.saveChanges')}
              </button>
            </div>
            <div className="border-t border-red-500/25 pt-4"><p className="mb-2 text-xs font-black uppercase tracking-wide text-red-400">Danger zone</p><button onClick={openDeleteDialog} className="rounded-lg border border-red-500/50 px-5 py-2.5 text-sm font-bold text-red-400">Delete Task</button></div>
          </footer>
          {error ? <p id="edit-task-error" role="alert" aria-live="assertive" className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-300">{error}</p> : null}
      </AppLayout>

      <Toast message={notice} tone="success" onDone={() => setNotice('')} />
      <TaskTimeConflictModal
        conflict={timeConflict}
        busy={saving}
        onMoveExisting={(mode, schedule) => void moveConflictTask('existing', mode, schedule)}
        onMoveNew={(mode, schedule) => void moveConflictTask('new', mode, schedule)}
        onCancelExisting={() => {
          if (!timeConflict || !accessToken || !window.confirm('Cancel the existing task? It will be marked missed and not deleted.')) return
          void changeTaskStatus(accessToken, timeConflict.existingTask.id, { status: 'missed' }).then(() => resolveTaskScheduleConflict(accessToken, { conflictKey: timeConflict.id, date: timeConflict.existingTask.scheduledDate, taskId: timeConflict.existingTask.id, resolution: 'cancel_existing' })).then(() => setTimeConflict(null))
        }}
        onCancelNew={() => { setScheduledDate(initialValues.scheduledDate); setScheduledStartTime(initialValues.scheduledStartTime); setScheduledEndTime(initialValues.scheduledEndTime); setTimeConflict(null) }}
        onCancelChanges={() => setTimeConflict(null)}
      />
      <TaskCommitmentConflictModal conflict={commitmentConflict} busy={saving} onKeepCommitment={() => void keepCommitment()} onKeepTask={() => void keepTask()} onChooseAnotherTime={() => { setCommitmentConflict(null); document.getElementById('edit-task-scheduled-date')?.focus() }} onCancel={() => setCommitmentConflict(null)} />

      {addingSubtask ? (
        <SubtaskFormModal
          mode="add"
          siblings={subtasks}
          onCancel={() => setAddingSubtask(false)}
          onBack={() => setAddingSubtask(false)}
          onSubmit={(payload) => void handleAddSubtask(payload)}
        />
      ) : null}

      {editingSubtaskId !== null ? (
        <SubtaskFormModal
          mode="edit"
          siblings={subtasks.filter((item) => item.id !== editingSubtaskId)}
          initialSubtask={subtasks.find((item) => item.id === editingSubtaskId)}
          onCancel={() => setEditingSubtaskId(null)}
          onBack={() => setEditingSubtaskId(null)}
          onDelete={() => {
            setDeletingSubtaskId(editingSubtaskId)
            setEditingSubtaskId(null)
          }}
          onSubmit={(payload) => void handleEditSubtask(payload)}
        />
      ) : null}

      {deletingSubtaskId !== null ? (
        <DeleteSubtaskModal
          subtaskTitle={subtasks.find((item) => item.id === deletingSubtaskId)?.title}
          onCancel={() => setDeletingSubtaskId(null)}
          onConfirm={() => void handleConfirmDelete()}
        />
      ) : null}
      {isDeleteDialogOpen ? (
        <DeleteTaskModal
          taskTitle={task.title}
          error={deleteError}
          isDeleting={isDeletingTask}
          onCancel={closeDeleteDialog}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
      <ConfirmDestructiveModal open={attachmentToDelete !== null} title="Delete attachment?" message={`"${attachmentToDelete?.fileName ?? attachmentToDelete?.name ?? 'This file'}" cannot be recovered after deletion.`} confirmLabel="Delete attachment" isConfirming={isDeletingAttachment} onCancel={() => !isDeletingAttachment && setAttachmentToDelete(null)} onConfirm={() => attachmentToDelete && void handleDeleteAttachment(attachmentToDelete)} />

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
        accessToken={accessToken}
        onClose={() => setIsRecurrenceModalOpen(false)}
        onSave={setRecurrence}
        onRemove={() => setRecurrence(null)}
        onApplyTime={setDueTime}
      />
      <AttachmentPreviewModal
        open={Boolean(previewAttachment && accessToken)}
        accessToken={accessToken ?? ''}
        taskId={task.id}
        attachment={previewAttachment}
        onClose={() => setPreviewAttachment(null)}
        onError={() => setErrorKey('editTaskFeedback.attachmentInvalid')}
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
          {code ? <span className="text-[var(--bp-accent-ink)]">{code}</span> : null}
          {title}
        </h3>
        {action ? (
          <button onClick={onAction} className="text-sm font-bold text-[var(--bp-accent-ink)]">
            {action}
          </button>
        ) : null}
      </div>
      {children}
    </section>
  )
}

function FieldLabel({ label, required, htmlFor }: { label: string; required?: boolean; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-xs font-black uppercase tracking-wide text-[var(--bp-subtle)]">
      {label} {required ? <span className="text-red-400">*</span> : null}
    </label>
  )
}

function Segment({ label, active, color, onClick }: { label: string; active?: boolean; color: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-sm font-bold ${active ? 'border-[var(--bp-accent)] bg-[var(--bp-accent)]/10 text-[var(--bp-accent-ink)]' : `border-[var(--bp-border)] bg-[var(--bp-surface)] ${color}`}`}
    >
      {label}
    </button>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-2 flex items-center justify-between rounded-xl bg-[var(--bp-surface)] px-3 py-2">
      <span className="text-[10px] font-black uppercase tracking-wide text-[var(--bp-muted)]">{label}</span>
      <span className="text-sm font-bold text-[var(--bp-text)]">{value}</span>
    </div>
  )
}

function Dependency({
  label,
  status,
  onReplace,
  onRemove,
  t,
}: {
  label: string
  status: string
  onReplace: () => void
  onRemove: () => void
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-[var(--bp-surface)] p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-[var(--bp-text)]">{label}</p>
        <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-bold text-blue-300">{status}</span>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <button type="button" onClick={onReplace} className="rounded-lg bg-[var(--bp-border)] px-2.5 py-1.5 text-xs font-bold text-[var(--bp-text)]">
          {t('editTaskForm.replace')}
        </button>
        <button type="button" onClick={onRemove} className="rounded-lg border border-red-500/40 px-2.5 py-1.5 text-xs font-bold text-red-300">
          {t('editTaskForm.remove')}
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

function formatReminderLabel(minutes: number, t: (key: string, params?: Record<string, string | number>) => string) {
  if (minutes === 60) return t('editTaskControls.hoursBefore', { count: 1 })
  if (minutes === 1440) return t('editTaskControls.daysBefore', { count: 1 })
  return t('editTaskControls.minutesBefore', { count: minutes })
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
