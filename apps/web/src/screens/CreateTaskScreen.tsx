import { useState } from 'react'
import { AppLayout, PageHeader, TopActionBar, type SidebarNavHandlers } from '../components/layout'
import TaskAttachmentPicker from '../components/TaskAttachmentPicker'
import {
  TaskRecurrenceModal,
  createRecurrenceSummary,
  type RecurrenceSettings,
} from '../components/TaskRecurrenceModal'
import {
  TaskDependenciesWorkflowModal,
  type DependencyTask,
} from '../components/TaskDependenciesWorkflowModal'
import SubtaskFormModal from '../components/SubtaskFormModal'
import { useLanguage } from '../i18n/LanguageContext'
import { useTheme } from '../theme/ThemeContext'
import { useUnsavedChangesGuard } from '../lib/useUnsavedChangesGuard'
import { TaskTimeConflictModal, type ScheduleChoice } from '../components/TaskTimeConflictModal'
import { TaskCommitmentConflictModal } from '../components/TaskCommitmentConflictModal'
import { WeatherTravelTaskFields } from '../components/WeatherTravelTaskFields'
import { canValidateTaskSchedule, taskScheduleValidationError } from '../lib/taskScheduleValidation'
import { skipCommitmentOccurrence } from '../lib/plannerApi'
import {
  recurrenceToApi,
  uploadAttachment,
  toApiPriority,
  toApiStatus,
  toUiPriority,
  toUiStatus,
  type ApiTask,
  type SubtaskPayload,
  type TaskPayload,
  type TaskTimeConflict,
  type TaskCommitmentConflict,
  type TaskDestination,
  validateTaskSchedule,
  getNearestTaskSchedule,
  resolveTaskScheduleConflict,
  updateTask,
  changeTaskStatus,
} from '../lib/tasksApi'

type CreateTaskScreenProps = SidebarNavHandlers & {
  tasks?: ApiTask[]
  accessToken?: string
  initialDueDate?: string
  onCancel?: () => void
  onSave?: (payload: TaskPayload) => Promise<ApiTask | undefined> | ApiTask | void
  onCreated?: (task: ApiTask) => void
  onSignOut?: () => void
}

export default function CreateTaskScreen({
  tasks = [],
  accessToken,
  initialDueDate,
  onCancel,
  onSave,
  onCreated,
  onSignOut,
  ...nav
}: CreateTaskScreenProps) {
  const { t, toggleLanguage } = useLanguage()
  const { mode, toggleTheme } = useTheme()
  const [search, setSearch] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [priority, setPriority] = useState('Medium')
  const [status] = useState('To Do')
  const [category, setCategory] = useState('')
  const [dueDate, setDueDate] = useState(initialDueDate ?? '')
  const [dueTime, setDueTime] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledStartTime, setScheduledStartTime] = useState('')
  const [scheduledEndTime, setScheduledEndTime] = useState('')
  const [timeConflict, setTimeConflict] = useState<TaskTimeConflict | null>(null)
  const [commitmentConflict, setCommitmentConflict] = useState<TaskCommitmentConflict | null>(null)
  const [destination, setDestination] = useState<Partial<TaskDestination>>({})
  const [weatherTravelEnabled, setWeatherTravelEnabled] = useState(false)
  const [travelMode, setTravelMode] = useState<'driving'|'walking'|'cycling'>('driving')
  const [reminderEnabled, setReminderEnabled] = useState(true)
  const [reminderBeforeMinutes, setReminderBeforeMinutes] = useState(30)
  const [subtasks, setSubtasks] = useState<(SubtaskPayload & { title: string })[]>([])
  const [isSubtaskModalOpen, setIsSubtaskModalOpen] = useState(false)
  const [dependencyModalOpen, setDependencyModalOpen] = useState(false)
  const [dependencies, setDependencies] = useState<DependencyTask[]>([])
  const [attachments, setAttachments] = useState<File[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploadingAttachments, setUploadingAttachments] = useState(false)
  const [recurrence, setRecurrence] = useState<RecurrenceSettings | null>(null)
  const [isRecurrenceModalOpen, setIsRecurrenceModalOpen] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [moreOptions, setMoreOptions] = useState(false)
  const [estimatedHours, setEstimatedHours] = useState('')
  const [labelsText, setLabelsText] = useState('')
  const recurrenceSummary = createRecurrenceSummary(recurrence)
  const availableDependencies = tasks.map(toDependencyTask)

  // Warn before leaving (cancel / back / sidebar nav / tab close) once the user
  // has entered anything. `markSaved()` suppresses the warning for the
  // navigation that follows a successful create.
  const isDirty = Boolean(
    title.trim() ||
      description.trim() ||
      notes.trim() ||
      category.trim() ||
      dueDate ||
      dueTime ||
      scheduledDate ||
      scheduledStartTime ||
      scheduledEndTime ||
      subtasks.length ||
      dependencies.length ||
      attachments.length ||
      recurrence ||
      estimatedHours.trim() ||
      labelsText.trim() ||
      priority !== 'Medium' ||
      status !== 'To Do' ||
      !reminderEnabled ||
      reminderBeforeMinutes !== 30,
  )
  const { markSaved } = useUnsavedChangesGuard(isDirty)

  async function handleSave() {
    if (!title.trim()) {
      setError('createTask.titleRequired')
      return
    }

    const estimatedTimeMinutes = Math.round((Number(estimatedHours) || 0) * 60)
    const scheduleValidationError = taskScheduleValidationError({ scheduledDate, scheduledStartTime, scheduledEndTime, estimatedTimeMinutes })
    if (scheduleValidationError) {
      setError(scheduleValidationError.includes('required together') ? 'createTask.scheduleFieldsRequired' : 'createTask.scheduleDurationRequired')
      return
    }
    const schedulePayload = { title: title.trim(), priority: toApiPriority(priority), dueDate: dueDate ? new Date(`${dueDate}T00:00:00`).toISOString() : undefined, estimatedTimeMinutes, scheduledDate: scheduledDate || undefined, scheduledStartTime: scheduledStartTime || undefined, scheduledEndTime: scheduledEndTime || undefined }
    if (accessToken && canValidateTaskSchedule({ scheduledDate, scheduledStartTime, scheduledEndTime, estimatedTimeMinutes })) {
      const validation = await validateTaskSchedule(accessToken, schedulePayload)
      if (validation.commitmentConflicts.length) {
        setCommitmentConflict(validation.commitmentConflicts[0])
        return
      }
      if (validation.conflicts.length) {
        setTimeConflict(validation.conflicts[0])
        return
      }
    }
    setSaving(true)
    setError('')

    try {
      const createdTask = await onSave?.({
        title: title.trim(),
        description,
        notes,
        priority: toApiPriority(priority),
        status: toApiStatus(status),
        category,
        dueDate: dueDate ? new Date(`${dueDate}T00:00:00`).toISOString() : undefined,
        dueTime,
        scheduledDate: scheduledDate || undefined,
        scheduledStartTime: scheduledStartTime || undefined,
        scheduledEndTime: scheduledEndTime || undefined,
        destination: destination.displayName && Number.isFinite(destination.latitude) && Number.isFinite(destination.longitude) ? destination as TaskDestination : undefined,
        weatherTravelEnabled,
        travelMode,
        reminderEnabled,
        reminderBeforeMinutes: reminderEnabled ? reminderBeforeMinutes : undefined,
        recurrence: recurrenceToApi(recurrence),
        subtasks,
        estimatedTimeMinutes: Math.round((Number(estimatedHours) || 0) * 60),
        labels: labelsText.split(',').map((label) => label.trim()).filter(Boolean),
      })

      if (!createdTask) return

      if (attachments.length && accessToken) {
        setUploadingAttachments(true)
        for (const file of attachments) {
          await uploadAttachment(accessToken, createdTask.id, file)
        }
      }

      markSaved()
      onCreated?.(createdTask)
    } catch (err) {
      console.error('Unable to save task', err)
      setError('createTask.saveFailed')
    } finally {
      setUploadingAttachments(false)
      setSaving(false)
    }
  }

  async function moveConflictTask(which: 'existing' | 'new', mode: 'auto' | 'manual', manual?: ScheduleChoice) {
    if (!timeConflict || !accessToken) return
    const target = which === 'existing' ? timeConflict.existingTask : timeConflict.proposedTask
    const schedule = mode === 'manual' ? manual : (await getNearestTaskSchedule(accessToken, target)).schedule
    if (!schedule) { setError('createTask.noAvailableSlot'); return }
    const validation = await validateTaskSchedule(accessToken, { ...target, ...schedule })
    if (validation.conflicts.some((item) => item.existingTask.id !== (which === 'existing' ? timeConflict.proposedTask.id : timeConflict.existingTask.id))) {
      setError('createTask.slotConflict'); return
    }
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
    await resolveTaskScheduleConflict(accessToken, { conflictKey: commitmentConflict.id, date: commitmentConflict.commitment.date, commitmentId: commitmentConflict.commitment.commitmentId, resolution: 'keep_task' })
    setCommitmentConflict(null)
  }

  return (
    <>
      <AppLayout
        active="tasks"
        {...nav}
        onNavigateTasks={onCancel}
        panelTitle={t('createTask.keepGoing')}
        panelCaption={t('createTask.doingGreat')}
        panelPercent={0}
      >
          <div className="mb-3 flex items-center gap-2 text-xs text-[var(--bp-muted)]">
            <button type="button" onClick={onCancel} className="hover:text-[var(--bp-text)]">
              {t('taskForm.back')}
            </button>
            <span>{t('createTask.tasks')}</span>
            <span>/</span>
            <span className="text-[var(--bp-text)]">{t('createTask.createNew')}</span>
          </div>

          <PageHeader
            title={t('taskUi.create.title')}
            subtitle={t('taskUi.create.subtitle')}
            toolbar={
              <TopActionBar pageOnly
                searchValue={search}
                onSearchChange={setSearch}
                searchPlaceholder={t('allTasksUi.searchPlaceholder')}
                themeMode={mode}
                onToggleTheme={toggleTheme}
                languageLabel={t('common.languageToggle')}
                onToggleLanguage={toggleLanguage}
                onOpenNotifications={nav.onNavigateNotifications}
                onSignOut={onSignOut}
              />
            }
          />

          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <section className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)]/50 p-4 shadow-2xl">
              <SectionTitle icon="INFO" title={t('createTask.information')} />

              <FieldLabel label={t('taskForm.taskTitle')} required htmlFor="create-task-title" />
              <input
                id="create-task-title"
                required
                aria-required="true"
                aria-invalid={Boolean(error && !title.trim())}
                aria-describedby={error && !title.trim() ? 'create-task-error' : undefined}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="mb-4 w-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 py-2.5 text-[var(--bp-text)] outline-none placeholder:text-[var(--bp-placeholder)] focus:border-[var(--bp-accent)]"
                placeholder={t('taskForm.taskTitlePlaceholder')}
              />

              <FieldLabel label={t('taskForm.description')} htmlFor="create-task-description" />
              <textarea
                id="create-task-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="mb-1.5 min-h-28 w-full resize-none rounded-xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 py-2.5 text-[var(--bp-text)] outline-none placeholder:text-[var(--bp-placeholder)] focus:border-[var(--bp-accent)]"
                placeholder={t('createTask.descriptionPlaceholder')}
              />
              <p className="mb-4 text-end text-xs text-[var(--bp-muted)]">{description.length}/500</p>

              <div className="mb-4 border-t border-[var(--bp-border)] pt-4">
                <FieldLabel label={t('createTask.subtasks')} />
                <p className="mb-3 text-sm text-[var(--bp-muted)]">{t('createTask.subtasksHelp')}</p>
                <button
                  type="button"
                  onClick={() => setIsSubtaskModalOpen(true)}
                  className="w-full rounded-xl border border-dashed border-[var(--bp-border)] bg-[var(--bp-bg)] px-3 py-2.5 font-bold text-[var(--bp-accent-ink)] transition hover:border-[var(--bp-accent)]/60"
                >
                  + {t('createTask.addSubtask')}
                </button>
                {subtasks.length ? (
                  <div className="mt-3 space-y-2">
                    {subtasks.map((subtask, index) => (
                      <div key={`${subtask.title}-${index}`} className="flex items-center justify-between rounded-xl bg-[var(--bp-bg)] px-4 py-3 text-sm text-[var(--bp-text)]">
                        <span>{subtask.title}</span>
                        <button
                          type="button"
                          onClick={() => setSubtasks((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                          className="text-xs font-black text-red-300"
                        >
                          {t('createTask.remove')}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              {!showNotes ? <button type="button" onClick={() => setShowNotes(true)} className="mb-4 w-full rounded-xl border border-dashed border-[var(--bp-border)] px-3 py-2.5 text-start text-sm font-bold text-[var(--bp-accent-ink)]">+ {t('createTask.addNotes')}</button> : <div className="mb-4 border-t border-[var(--bp-border)] pt-4"><FieldLabel label={t('taskForm.notes')} htmlFor="create-task-notes" /><textarea
                  id="create-task-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="min-h-20 w-full resize-none rounded-xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 py-2.5 text-[var(--bp-text)] outline-none placeholder:text-[var(--bp-placeholder)] focus:border-[var(--bp-accent)]"
                  placeholder={t('taskForm.notesPlaceholder')}
                /></div>}

              {moreOptions ? <div className="border-t border-[var(--bp-border)] pt-4">
                <FieldLabel label={t('createTask.attachments')} />
                <TaskAttachmentPicker
                  files={attachments}
                  onChange={setAttachments}
                  disabled={saving || uploadingAttachments}
                  onValidationError={setError}
                />
              </div> : null}
            </section>

            <section className="space-y-3">
              <div className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)]/50 p-4">
                <SectionTitle icon="SET" title={t('createTask.settings')} />

                <FieldLabel label={t('taskForm.priority')} />
                <div className="mb-4 grid grid-cols-3 gap-2">
                  {(['Low', 'Medium', 'High'] as const).map((item) => (
                    <Segment key={item} active={priority === item} label={t(`taskLabels.priority.${item.toLowerCase()}`)} color={item === 'Low' ? 'text-green-400' : item === 'High' ? 'text-red-400' : 'text-orange-400'} onClick={() => setPriority(item)} />
                  ))}
                </div>

                <FieldLabel label={t('createTask.category')} htmlFor="create-task-category" />
                <select id="create-task-category" value={category} onChange={(event) => setCategory(event.target.value)} className="mb-4 w-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 py-2.5 text-[var(--bp-text)] outline-none focus:border-[var(--bp-accent)]">
                  <option value="">{t('createTask.selectCategory')}</option>
                  <option value="Work">{t('createTask.work')}</option>
                  <option value="Personal">{t('createTask.personal')}</option>
                  <option value="Study">{t('createTask.study')}</option>
                  <option value="Health">{t('createTask.health')}</option>
                </select>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <FieldLabel label={`${t('createTask.deadline')} · ${t('createTask.deadlineHelp')}`} htmlFor="create-task-due-date" />
                    <input
                      id="create-task-due-date"
                      type="date"
                      value={dueDate}
                      onChange={(event) => setDueDate(event.target.value)}
                      className="w-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 py-2.5 text-[var(--bp-text)] outline-none focus:border-[var(--bp-accent)]"
                    />
                  </div>
                  <div>
                    <FieldLabel label={t('createTask.deadlineTime')} htmlFor="create-task-due-time" />
                    <input
                      id="create-task-due-time"
                      type="time"
                      value={dueTime}
                      onChange={(event) => setDueTime(event.target.value)}
                      className="w-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 py-2.5 text-[var(--bp-text)] outline-none focus:border-[var(--bp-accent)]"
                    />
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div><FieldLabel label={`${t('createTask.schedule')} · ${t('createTask.scheduleHelp')}`} htmlFor="create-task-scheduled-date" /><input id="create-task-scheduled-date" aria-label={t('createTask.schedule')} type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} className="w-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 py-2.5 text-[var(--bp-text)]" /></div>
                  <div><FieldLabel label={t('createTask.startTime')} htmlFor="create-task-scheduled-start" /><input id="create-task-scheduled-start" aria-label={t('createTask.startTime')} type="time" value={scheduledStartTime} onChange={(event) => setScheduledStartTime(event.target.value)} className="w-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 py-2.5 text-[var(--bp-text)]" /></div>
                  <div><FieldLabel label={t('createTask.endTime')} htmlFor="create-task-scheduled-end" /><input id="create-task-scheduled-end" aria-label={t('createTask.endTime')} type="time" value={scheduledEndTime} onChange={(event) => setScheduledEndTime(event.target.value)} className="w-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 py-2.5 text-[var(--bp-text)]" /></div>
                </div>
                <WeatherTravelTaskFields accessToken={accessToken} destination={destination} enabled={weatherTravelEnabled} travelMode={travelMode} onDestination={setDestination} onEnabled={setWeatherTravelEnabled} onTravelMode={setTravelMode} />
              </div>

              <button type="button" onClick={() => setMoreOptions((value) => !value)} className="flex w-full items-center justify-between rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)]/50 p-4 text-start font-black text-[var(--bp-text)]">{t('createTask.moreOptions')} <span className="text-[var(--bp-muted)]">{moreOptions ? '⌃' : '›'}</span></button>
              {moreOptions ? <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)]/50 p-4"><FieldLabel label={t('createTask.estimatedDuration')} htmlFor="create-task-estimated-hours" /><input id="create-task-estimated-hours" type="number" min="0" step="0.25" value={estimatedHours} onChange={(event) => setEstimatedHours(event.target.value)} placeholder={t('createTask.hours')} className="w-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 py-2.5 text-[var(--bp-text)]" /></div>
                <div className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)]/50 p-4"><FieldLabel label={t('createTask.labels')} htmlFor="create-task-labels" /><input id="create-task-labels" value={labelsText} onChange={(event) => setLabelsText(event.target.value)} placeholder={t('createTask.labelsPlaceholder')} className="w-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 py-2.5 text-[var(--bp-text)]" /></div>
                <div className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)]/50 p-4">
                  <FieldLabel label={t('createTask.recurring')} />
                  <button
                    type="button"
                    onClick={() => setIsRecurrenceModalOpen(true)}
                    className="w-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 py-2.5 text-start font-bold text-[var(--bp-text)] outline-none transition hover:border-[var(--bp-accent)]"
                  >
                    {recurrenceSummary}
                  </button>
                </div>

                <div className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)]/50 p-4">
                  <FieldLabel label={t('createTask.dependencies')} />
                  <p className="mb-3 text-sm text-[var(--bp-muted)]">{t('createTask.dependenciesHelp')}</p>
                  <button
                    type="button"
                    onClick={() => setDependencyModalOpen(true)}
                    className="w-full rounded-xl border border-dashed border-[var(--bp-border)] bg-[var(--bp-bg)] px-3 py-2.5 font-bold text-[var(--bp-accent-ink)] transition hover:border-[var(--bp-accent)]/60 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!availableDependencies.length}
                  >
                    + {t('createTask.addDependency')}
                  </button>
                  {dependencies.length ? (
                    <div className="mt-4 space-y-2">
                      {dependencies.map((dependency) => (
                        <div key={dependency.id} className="rounded-xl bg-[var(--bp-bg)] px-4 py-3">
                          <p className="font-bold text-[var(--bp-text)]">{dependency.title}</p>
                          <p className="mt-1 text-xs text-[var(--bp-muted)]">
                            {dependency.category} - {dependency.status}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-[var(--bp-muted)]">
                      {availableDependencies.length ? t('createTask.noDependencies') : t('createTask.createDependencyFirst')}
                    </p>
                  )}
                </div>
              </div> : null}

              <div className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)]/50 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <label htmlFor="create-task-reminder-toggle" className="mb-2 block text-xs font-black uppercase tracking-wide text-[var(--bp-subtle)]">
                      {t('createTask.reminder')}
                    </label>
                    <p className="text-sm text-[var(--bp-muted)]">{t('createTask.reminderHelp')}</p>
                  </div>
                  <button
                    id="create-task-reminder-toggle"
                    type="button"
                    role="switch"
                    aria-checked={reminderEnabled}
                    onClick={() => setReminderEnabled((current) => !current)}
                    className={`flex h-6 w-11 shrink-0 items-center rounded-full p-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--bp-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bp-surface)] ${
                      reminderEnabled ? 'justify-end bg-[var(--bp-accent)]' : 'justify-start bg-[var(--bp-border)]'
                    }`}
                  >
                    <span className="h-4 w-4 rounded-full bg-white transition-transform" />
                  </button>
                </div>

                <FieldLabel label={t('createTask.reminderTime')} htmlFor="create-task-reminder-time" />
                <select
                  id="create-task-reminder-time"
                  aria-label={t('createTask.reminderTime')}
                  value={reminderBeforeMinutes}
                  disabled={!reminderEnabled}
                  onChange={(event) => setReminderBeforeMinutes(Number(event.target.value))}
                  className="w-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 py-2.5 text-[var(--bp-text)] outline-none focus:border-[var(--bp-accent)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value={30}>{t('createTask.reminderMinutesBefore', { count: 30 })}</option>
                  <option value={10}>{t('createTask.reminderMinutesBefore', { count: 10 })}</option>
                  <option value={60}>{t('createTask.reminderHourBefore')}</option>
                  <option value={1440}>{t('createTask.reminderDayBefore')}</option>
                </select>
              </div>

              <div className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)]/50 p-4">
                <FieldLabel label={t('createTask.quickTip')} />
                <p className="text-sm leading-6 text-[var(--bp-muted)]">
                  {t('createTask.quickTipText')}
                </p>
              </div>
            </section>
          </div>

          <div className="mt-6 flex justify-end gap-3 border-t border-[var(--bp-border)] pt-4">
          {error ? <p id="create-task-error" role="alert" aria-live="assertive" className="me-auto self-center text-sm font-semibold text-red-300">{error.startsWith('createTask.') ? t(error) : error}</p> : null}
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-6 py-2.5 font-bold text-[var(--bp-text)] hover:bg-[var(--bp-border)]"
            >
              {t('taskForm.cancel')}
            </button>

            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || uploadingAttachments}
              className="rounded-xl border border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] px-6 py-2.5 font-black text-[var(--bp-accent-text)] shadow-lg shadow-[var(--bp-accent)]/20 disabled:opacity-60"
            >
              {saving || uploadingAttachments ? t('taskForm.saving') : t('taskForm.saveTask')}
            </button>
          </div>
        <TaskTimeConflictModal
          conflict={timeConflict}
          busy={saving}
          onMoveExisting={(mode, schedule) => void moveConflictTask('existing', mode, schedule)}
          onMoveNew={(mode, schedule) => void moveConflictTask('new', mode, schedule)}
          onCancelExisting={() => {
            if (!timeConflict || !accessToken || !window.confirm('Cancel the existing task? It will be marked missed and not deleted.')) return
            void changeTaskStatus(accessToken, timeConflict.existingTask.id, { status: 'missed' }).then(() => resolveTaskScheduleConflict(accessToken, { conflictKey: timeConflict.id, date: timeConflict.existingTask.scheduledDate, taskId: timeConflict.existingTask.id, resolution: 'cancel_existing' })).then(() => setTimeConflict(null))
          }}
          onCancelNew={() => { setTimeConflict(null); onCancel?.() }}
          onCancelChanges={() => setTimeConflict(null)}
        />
        <TaskCommitmentConflictModal conflict={commitmentConflict} busy={saving} onKeepCommitment={() => void keepCommitment()} onKeepTask={() => void keepTask()} onChooseAnotherTime={() => { setCommitmentConflict(null); document.getElementById('create-task-scheduled-date')?.focus() }} onCancel={() => setCommitmentConflict(null)} />
      </AppLayout>
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
      <TaskDependenciesWorkflowModal
        open={dependencyModalOpen}
        mode="add"
        currentTaskId="new-task-draft"
        availableTasks={availableDependencies}
        dependencies={dependencies}
        onClose={() => setDependencyModalOpen(false)}
        onAdd={(selectedTasks) => {
          setDependencies((current) => {
            const currentIds = new Set(current.map((item) => item.id))
            return [...current, ...selectedTasks.filter((item) => !currentIds.has(item.id))]
          })
        }}
        onSaveReplacement={() => undefined}
        onRemove={(dependencyId) => setDependencies((current) => current.filter((item) => item.id !== dependencyId))}
      />
      {isSubtaskModalOpen ? (
        <SubtaskFormModal
          mode="add"
          onBack={() => setIsSubtaskModalOpen(false)}
          onCancel={() => setIsSubtaskModalOpen(false)}
          onSubmit={(payload) => {
            if (!payload.title?.trim()) return
            setSubtasks((current) => [...current, { ...payload, title: payload.title!.trim() }])
            setIsSubtaskModalOpen(false)
          }}
        />
      ) : null}
    </>
  )
}

function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <h3 className="mb-4 flex items-center gap-2 text-base font-black">
      <span className="text-[var(--bp-accent-ink)]">{icon}</span>
      {title}
    </h3>
  )
}

function FieldLabel({ label, required, htmlFor }: { label: string; required?: boolean; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-xs font-black uppercase tracking-wide text-[var(--bp-subtle)]">
      {label} {required ? <span className="text-red-400">*</span> : null}
    </label>
  )
}

function Segment({
  label,
  active,
  color,
  onClick,
}: {
  label: string
  active?: boolean
  color: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-sm font-bold transition ${
        active
          ? 'border-[var(--bp-accent)] bg-[var(--bp-accent)]/10 text-[var(--bp-accent-ink)]'
          : `border-[var(--bp-border)] bg-[var(--bp-surface)] ${color}`
      }`}
    >
      {label}
    </button>
  )
}

function toDependencyTask(task: ApiTask): DependencyTask {
  return {
    id: task.id,
    title: task.title,
    category: task.category || 'General',
    status: toUiStatus(task.status) as DependencyTask['status'],
    dueDate: formatDate(task.dueDate) || 'No due date',
    priority: normalizePriority(toUiPriority(task.priority)),
  }
}

function normalizePriority(priority: string): DependencyTask['priority'] {
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




