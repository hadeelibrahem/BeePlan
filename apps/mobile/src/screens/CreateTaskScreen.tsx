import { useEffect, useRef, useState, type ReactNode } from 'react'
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { Alert, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import {
  TaskRecurrenceSheet,
  createRecurrenceSummary,
  type RecurrenceSettings,
} from '../components/TaskRecurrenceSheet'
import TaskAttachmentPicker from '../components/TaskAttachmentPicker'
import { addDependencies, addSubtask, changeTaskStatus, getNearestTaskSchedule, recurrenceToApi, resolveTaskScheduleConflict, toUiPriority, toUiStatus, updateTask, validateTaskSchedule, type ApiTask, type TaskDestination, type TaskPayload, type TaskCommitmentConflict, type TaskTimeConflict, uploadAttachment } from '../lib/tasksApi'
import { TaskTimeConflictModal, type MobileScheduleChoice } from '../components/TaskTimeConflictModal'
import { TaskCommitmentConflictModal } from '../components/TaskCommitmentConflictModal'
import { WeatherTravelTaskFields } from '../components/WeatherTravelTaskFields'
import { skipCommitmentOccurrence } from '../lib/plannerApi'
import { DraftSubtasksSection } from '../components/DraftSubtasksSection'
import { persistDraftSubtasks, validateDraftSubtasks, type DraftSubtask } from './createTaskSubtasks'
import { TaskDependenciesWorkflowSheet, type DependencyTask } from '../components/TaskDependenciesWorkflowSheet'
import { normalizeDraftDependencyIds } from './createTaskDependencies'
import { createTaskInitialDate } from './createTaskInitialDate'
import {
  AppScreen,
  BottomActionBar,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
} from '../components/layout'
import { useTheme } from '../theme/useTheme'
import { useUnsavedBackGuard } from '../navigation/useUnsavedBackGuard'
import { createTaskPayload, isCreateTaskDirty, validateCreateTask } from './createTaskForm'
import { canValidateTaskSchedule } from './taskScheduleValidation'
import { useLanguage } from '../i18n/LanguageContext'

const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'] as const
const STATUSES = ['To Do', 'In Progress', 'Done', 'Missed'] as const
const CATEGORIES = ['Work', 'Personal', 'Study', 'Health', 'Finance', 'General'] as const
function formatDateLabel(date: Date | undefined, language: 'en' | 'ar', emptyLabel: string) {
  if (!date) return emptyLabel
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(date)
}

function formatTimeLabel(time: string, language: 'en' | 'ar') {
  if (!time) return '--:--'
  const [hours, minutes] = time.split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return time
  const date = new Date(2000, 0, 1, hours, minutes)
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar' : 'en-US', { hour: 'numeric', minute: '2-digit' }).format(date)
}

type Props = {
  accessToken?: string
  tasks?: ApiTask[]
  initialDueDate?: string
  onCancel: () => void
  onSave: (payload: TaskPayload) => Promise<ApiTask | undefined> | ApiTask | void
  onCreated?: (task: ApiTask) => void
  onLifecycleChange?: (state: CreateTaskLifecycleState) => void
}

export type CreateTaskLifecycleState = {
  isDirty: boolean
  isSubmitting: boolean
  error: string
}

export default function CreateTaskScreen({ accessToken, tasks = [], initialDueDate, onCancel, onSave, onCreated, onLifecycleChange }: Props) {
  const { theme } = useTheme()
  const { colors } = theme
  const { t, language } = useLanguage()
  const reminderOptions = [
    { label: t('createTask.reminderMinutesBefore', { count: 10 }), value: 10 },
    { label: t('createTask.reminderMinutesBefore', { count: 30 }), value: 30 },
    { label: t('createTask.reminderHourBefore'), value: 60 },
    { label: t('createTask.reminderDayBefore'), value: 1440 },
  ]
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>('Medium')
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('To Do')
  const [category, setCategory] = useState('')
  // Deliberately initialise once: navigation supplies a calendar default, but
  // it must never replace a date the person has subsequently chosen.
  const [dueDate, setDueDate] = useState<Date | undefined>(() => createTaskInitialDate(initialDueDate))
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
  const [estimatedHours, setEstimatedHours] = useState('')
  const [labelsText, setLabelsText] = useState('')
  const [iosPicker, setIosPicker] = useState<'date' | 'time' | 'scheduledDate' | 'scheduledStart' | 'scheduledEnd' | null>(null)
  const [showNotes, setShowNotes] = useState(false)
  const [moreOptions, setMoreOptions] = useState(false)
  const [error, setError] = useState('')
  const [scheduleError, setScheduleError] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploadingAttachments, setUploadingAttachments] = useState(false)
  const [recurrence, setRecurrence] = useState<RecurrenceSettings | null>(null)
  const [isRecurrenceSheetVisible, setIsRecurrenceSheetVisible] = useState(false)
  const [attachments, setAttachments] = useState<DocumentPicker.DocumentPickerAsset[]>([])
  const [draftSubtasks, setDraftSubtasks] = useState<DraftSubtask[]>([])
  const [createdParent, setCreatedParent] = useState<ApiTask | null>(null)
  const [persistedDraftIds, setPersistedDraftIds] = useState<Set<string>>(new Set())
  const [draftDependencies, setDraftDependencies] = useState<DependencyTask[]>([])
  const [dependenciesPersisted, setDependenciesPersisted] = useState(false)
  const [dependenciesSheetVisible, setDependenciesSheetVisible] = useState(false)
  const submissionRef = useRef(false)
  const parentTaskRef = useRef<ApiTask | null>(null)
  const recurrenceSummary = createRecurrenceSummary(recurrence)

  // Protect unsaved edits from an Android hardware-back press.
  const formValues = { title, description, notes, priority, status, category, dueDate, dueTime, scheduledDate, scheduledStartTime, scheduledEndTime, reminderEnabled, reminderBeforeMinutes, estimatedHours, labelsText }
  const hasUnsavedChanges = isCreateTaskDirty(formValues, attachments.length > 0, Boolean(recurrence)) || draftSubtasks.length > 0 || draftDependencies.length > 0
  const dependencyOptions: DependencyTask[] = tasks.map((task) => ({ id: task.id, title: task.title, category: task.category || 'General', status: toUiStatus(task.status) as DependencyTask['status'], dueDate: task.dueDate ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(task.dueDate)) : 'No due date', priority: (toUiPriority(task.priority) === 'High' ? 'High' : toUiPriority(task.priority) === 'Low' ? 'Low' : 'Medium') }))
  const { confirmLeave } = useUnsavedBackGuard({
    isDirty: hasUnsavedChanges && !saving,
    onLeave: onCancel,
    title: 'Discard new task?',
    message: 'This task has not been saved yet. Discard it?',
  })

  useEffect(() => {
    onLifecycleChange?.({ isDirty: hasUnsavedChanges, isSubmitting: saving || uploadingAttachments, error })
  }, [error, hasUnsavedChanges, onLifecycleChange, saving, uploadingAttachments])

  const openDatePicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: dueDate ?? new Date(), mode: 'date', onChange: (event: DateTimePickerEvent, selected?: Date) => {
        if (event.type === 'set' && selected) setDueDate(selected)
      } })
      return
    }
    setIosPicker('date')
  }

  const openTimePicker = () => {
    const initial = new Date()
    if (dueTime) {
      const [hours, minutes] = dueTime.split(':').map(Number)
      if (!Number.isNaN(hours)) initial.setHours(hours, minutes || 0, 0, 0)
    }
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: initial, mode: 'time', is24Hour: false, onChange: (event: DateTimePickerEvent, selected?: Date) => {
        if (event.type === 'set' && selected) setDueTime(`${String(selected.getHours()).padStart(2, '0')}:${String(selected.getMinutes()).padStart(2, '0')}`)
      } })
      return
    }
    setIosPicker('time')
  }

  const openScheduledDatePicker = () => {
    const value = scheduledDate ? new Date(`${scheduledDate}T12:00:00`) : new Date()
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value, mode: 'date', onChange: (event, selected) => { if (event.type === 'set' && selected) setScheduledDate(selected.toISOString().slice(0, 10)) } })
      return
    }
    setIosPicker('scheduledDate')
  }

  const openScheduledTimePicker = (which: 'scheduledStart' | 'scheduledEnd') => {
    const value = new Date()
    const current = which === 'scheduledStart' ? scheduledStartTime : scheduledEndTime
    if (current) { const [hours, minutes] = current.split(':').map(Number); if (!Number.isNaN(hours)) value.setHours(hours, minutes || 0, 0, 0) }
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value, mode: 'time', is24Hour: false, onChange: (event, selected) => { if (event.type === 'set' && selected) { const next = `${String(selected.getHours()).padStart(2, '0')}:${String(selected.getMinutes()).padStart(2, '0')}`; if (which === 'scheduledStart') setScheduledStartTime(next); else setScheduledEndTime(next) } } })
      return
    }
    setIosPicker(which)
  }

  async function handleSave() {
    if (submissionRef.current || saving) return
    const validationError = validateCreateTask(formValues)
    if (validationError) {
      setScheduleError(validationError.includes('scheduled') || validationError.includes('end time') ? validationError : '')
      setError(validationError)
      return
    }
    const subtaskValidationError = validateDraftSubtasks(draftSubtasks)
    if (subtaskValidationError) { setError(subtaskValidationError); return }

    submissionRef.current = true
    setSaving(true)
    setError('')
    setScheduleError('')

    try {
      const payload = createTaskPayload(formValues, recurrenceToApi(recurrence))
      payload.destination = destination.displayName && Number.isFinite(destination.latitude) && Number.isFinite(destination.longitude) ? destination as TaskDestination : undefined
      payload.weatherTravelEnabled = weatherTravelEnabled
      payload.travelMode = travelMode
      if (!parentTaskRef.current && accessToken && canValidateTaskSchedule({ scheduledDate, scheduledStartTime, scheduledEndTime, estimatedTimeMinutes: payload.estimatedTimeMinutes })) {
        const validation = await validateTaskSchedule(accessToken, { title: payload.title ?? title, priority: payload.priority, dueDate: payload.dueDate, estimatedTimeMinutes: payload.estimatedTimeMinutes, scheduledDate, scheduledStartTime, scheduledEndTime: scheduledEndTime || undefined })
        if (validation.commitmentConflicts.length) { setCommitmentConflict(validation.commitmentConflicts[0]); submissionRef.current = false; setSaving(false); return }
        if (validation.conflicts.length) { setTimeConflict(validation.conflicts[0]); submissionRef.current = false; setSaving(false); return }
      }
      const createdTask = parentTaskRef.current ?? await onSave(payload)

      if (!createdTask) return
      if (!parentTaskRef.current) { parentTaskRef.current = createdTask; setCreatedParent(createdTask) }

      const nextPersisted = await persistDraftSubtasks(draftSubtasks, persistedDraftIds, (payload) => addSubtask(accessToken ?? '', createdTask.id, payload), setPersistedDraftIds)
      setPersistedDraftIds(nextPersisted)

      if (draftDependencies.length && !dependenciesPersisted) {
        const dependencyIds = normalizeDraftDependencyIds(draftDependencies.map((dependency) => dependency.id), createdTask.id)
        if (dependencyIds.length !== draftDependencies.length) throw new Error('A duplicate or self-dependency was blocked. Review the selected dependencies and retry.')
        await addDependencies(accessToken ?? '', createdTask.id, dependencyIds)
        setDependenciesPersisted(true)
      }

      if (attachments.length && accessToken) {
        setUploadingAttachments(true)
        for (const file of attachments) {
          await uploadAttachment(accessToken, createdTask.id, {
            uri: file.uri,
            name: file.name ?? 'attachment',
            type: file.mimeType ?? 'application/octet-stream',
          })
        }
      }

      onCreated?.(createdTask)
    } catch (saveError) {
      const parentCreated = Boolean(parentTaskRef.current)
      setError(parentCreated ? `Task was created, but one or more draft subtasks or dependencies could not be saved. Save Task to retry. ${saveError instanceof Error ? saveError.message : ''}` : (saveError instanceof Error ? saveError.message : 'Unable to create task.'))
    } finally {
      setUploadingAttachments(false)
      setSaving(false)
      submissionRef.current = false
    }
  }

  async function moveConflictTask(which: 'existing' | 'new', mode: 'auto' | 'manual', manual?: MobileScheduleChoice) {
    if (!timeConflict || !accessToken) return
    const target = which === 'existing' ? timeConflict.existingTask : timeConflict.proposedTask
    const schedule = mode === 'manual' ? manual : (await getNearestTaskSchedule(accessToken, target)).schedule
    if (!schedule) return Alert.alert('No available slot', 'Please choose another date or time.')
    Alert.alert('Proposed schedule', `${target.title}\n${target.scheduledDate} ${target.scheduledStartTime}–${target.scheduledEndTime}\n→\n${schedule.scheduledDate} ${schedule.scheduledStartTime}–${schedule.scheduledEndTime}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Apply', onPress: () => void (async () => {
        if (which === 'existing') {
          await updateTask(accessToken, target.id, schedule)
          await resolveTaskScheduleConflict(accessToken, { conflictKey: timeConflict.id, date: target.scheduledDate, taskId: target.id, resolution: mode === 'auto' ? 'move_existing_auto' : 'move_existing_manual' })
        } else {
          setScheduledDate(schedule.scheduledDate); setScheduledStartTime(schedule.scheduledStartTime); setScheduledEndTime(schedule.scheduledEndTime)
        }
        setTimeConflict(null)
      })() },
    ])
  }

  return (
    <AppScreen
      keyboardAvoiding
      footer={
        <BottomActionBar>
          <SecondaryButton onPress={confirmLeave} className="flex-1">
            {t('common.cancel')}
          </SecondaryButton>
          <PrimaryButton onPress={() => void handleSave()} className="flex-1" disabled={saving || uploadingAttachments}>
            {saving || uploadingAttachments ? t('createTask.saving') : t('createTask.saveTask')}
          </PrimaryButton>
        </BottomActionBar>
      }
    >
      <PageHeader title={t('createTask.title')} subtitle={t('createTask.subtitle')} onBack={confirmLeave} />

      <Card title={t('createTask.information')} icon="📋">
        <Label text={t('createTask.taskTitleRequired')} />
        <TextInput
          placeholder={t('createTask.taskTitlePlaceholder')}
          value={title}
          onChangeText={setTitle}
          placeholderTextColor={colors.placeholder}
          className="mb-3 rounded-xl border px-3 py-2.5 text-sm"
          style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }}
        />

        <Label text={t('createTask.description')} />
        <TextInput
          multiline
          placeholder={t('createTask.descriptionPlaceholder')}
          value={description}
          onChangeText={setDescription}
          placeholderTextColor={colors.placeholder}
          textAlignVertical="top"
          className="mb-3 h-24 rounded-xl border px-3 py-2.5 text-sm"
          style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }}
        />

        <Label text={t('createTask.subtasks')} />
        <DraftSubtasksSection items={draftSubtasks} onChange={setDraftSubtasks} disabled={saving || uploadingAttachments || Boolean(createdParent)} />

        {!showNotes ? <Pressable accessibilityRole="button" onPress={() => setShowNotes(true)} className="mb-2 rounded-xl border border-dashed p-3" style={{ borderColor: colors.border }}><Text className="text-sm font-bold" style={{ color: colors.accent }}>+ {t('createTask.addNotes')}</Text></Pressable> : <TextInput
          multiline
          placeholder={t('createTask.notesPlaceholder')}
          value={notes}
          onChangeText={setNotes}
          placeholderTextColor={colors.placeholder}
          textAlignVertical="top"
          className="h-20 rounded-xl border px-3 py-2.5 text-sm"
          style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }}
        />}
        {error ? <Text className="mt-2 text-sm font-bold text-red-300">{error}</Text> : null}
      </Card>

      <Card title={t('createTask.settings')} icon="⚙️">
        <Label text={t('createTask.priority')} />
        <View className="mb-3 flex-row gap-2">
          {PRIORITIES.map((item) => <Segment key={item} label={t(`taskLabels.priority.${item.toLowerCase()}`)} active={priority === item} color={item === 'Low' ? colors.success : item === 'High' || item === 'Urgent' ? colors.error : colors.accent} onPress={() => setPriority(item)} />)}
        </View>

        <Label text={t('createTask.category')} />
        <Select label={category ? t(`createTask.category${category}`) : t('createTask.selectCategory')} onPress={() => Alert.alert(t('createTask.category'), t('createTask.chooseCategory'), CATEGORIES.map((item) => ({ text: t(`createTask.category${item}`), onPress: () => setCategory(item) })))} />

      </Card>

      <Card title={t('createTask.whenWhere')} icon="📅">
        <Text className="mb-2 text-xs" style={{ color: colors.secondaryText }}>{t('createTask.scheduleHelp')}</Text>
        <View className="flex-row gap-2"><View className="flex-1"><Select label={scheduledDate ? formatDateLabel(new Date(`${scheduledDate}T12:00:00`), language, t('createTask.selectDate')) : t('createTask.addDate')} onPress={openScheduledDatePicker} /></View><View className="flex-1"><Select label={scheduledStartTime ? `${formatTimeLabel(scheduledStartTime, language)}${scheduledEndTime ? ` – ${formatTimeLabel(scheduledEndTime, language)}` : ''}` : t('createTask.addTime')} onPress={() => openScheduledTimePicker('scheduledStart')} /></View></View>
        {scheduledStartTime ? <Pressable accessibilityRole="button" onPress={() => openScheduledTimePicker('scheduledEnd')} className="mt-2"><Text className="text-xs font-bold" style={{ color: colors.accent }}>{t('createTask.setEndTime')}</Text></Pressable> : null}
        {scheduleError ? <Text className="mt-2 text-sm font-bold" style={{ color: colors.error }}>{scheduleError}</Text> : null}
        <View className="mt-4"><Text className="mb-2 text-xs" style={{ color: colors.secondaryText }}>{t('createTask.deadlineHelp')}</Text><View className="flex-row gap-2"><View className="flex-1"><Select label={formatDateLabel(dueDate, language, t('createTask.selectDate'))} onPress={openDatePicker} /></View><View className="flex-1"><Select label={dueTime ? formatTimeLabel(dueTime, language) : t('createTask.optionalTime')} onPress={openTimePicker} /></View></View></View>
        <WeatherTravelTaskFields accessToken={accessToken} destination={destination} enabled={weatherTravelEnabled} travelMode={travelMode} onDestination={setDestination} onEnabled={setWeatherTravelEnabled} onTravelMode={setTravelMode} />
      </Card>

      <Card title={t('createTask.reminder')} icon="🔔">
        <View className="mb-3 flex-row items-center justify-between">
          <View>
            <Text className="text-sm font-bold" style={{ color: colors.text }}>{t('createTask.enableReminder')}</Text>
            <Text className="text-xs" style={{ color: colors.secondaryText }}>{t('createTask.reminderHelp')}</Text>
          </View>

          <Pressable accessibilityRole="switch" accessibilityState={{ checked: reminderEnabled }} accessibilityLabel={t('createTask.enableReminder')} onPress={() => setReminderEnabled((enabled) => !enabled)} className={`h-6 w-11 justify-center rounded-full px-1 ${reminderEnabled ? 'items-end' : 'items-start'}`} style={{ backgroundColor: reminderEnabled ? colors.accent : colors.border }}><View className="h-4 w-4 rounded-full bg-white" /></Pressable>
        </View>

        {reminderEnabled ? <><Label text={t('createTask.reminderTime')} /><Select label={reminderOptions.find((option) => option.value === reminderBeforeMinutes)?.label ?? t('createTask.reminderMinutesBefore', { count: 30 })} onPress={() => Alert.alert(t('createTask.reminderTime'), t('createTask.chooseReminderTime'), reminderOptions.map((option) => ({ text: option.label, onPress: () => setReminderBeforeMinutes(option.value) })))} /></> : null}
      </Card>

      <Pressable accessibilityRole="button" onPress={() => setMoreOptions((value) => !value)} className="mb-3 flex-row items-center justify-between rounded-2xl border p-4" style={{ borderColor: colors.border, backgroundColor: colors.card }}><Text className="font-black" style={{ color: colors.text }}>{t('createTask.moreOptions')}</Text><Text style={{ color: colors.secondaryText }}>{moreOptions ? '⌃' : '›'}</Text></Pressable>

      <Card title={t('createTask.timeLabels')} icon="⏱️">
        {moreOptions ? <>
        <Label text={t('createTask.estimatedHours')} />
        <TextInput value={estimatedHours} onChangeText={setEstimatedHours} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.placeholder} className="mb-3 rounded-xl border px-3 py-2.5 text-sm" style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }} />
        <Label text={t('createTask.labels')} />
        <TextInput value={labelsText} onChangeText={setLabelsText} placeholder={t('createTask.labelsPlaceholder')} placeholderTextColor={colors.placeholder} className="rounded-xl border px-3 py-2.5 text-sm" style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }} />
        </> : <Text className="text-sm" style={{ color: colors.secondaryText }}>{t('createTask.moreOptionsHelp')}</Text>}
      </Card>

      {moreOptions ? <Card title={t('createTask.recurringDependencies')} icon="🔁">
        <Label text={t('createTask.recurringTask')} />
        <Select label={recurrenceSummary} onPress={() => setIsRecurrenceSheetVisible(true)} />

        <View className="mt-3">
          <Label text={t('createTask.dependencies')} />
          {draftDependencies.map((dependency) => <View key={dependency.id} className="mb-2 rounded-xl p-3" style={{ backgroundColor: colors.background }}><Text className="font-bold" style={{ color: colors.text }}>{dependency.title}</Text><Text className="mt-1 text-xs" style={{ color: colors.secondaryText }}>{dependency.category} · {dependency.status}</Text></View>)}
          <Pressable disabled={saving || uploadingAttachments || Boolean(createdParent)} accessibilityRole="button" accessibilityLabel={t('createTask.addDependency')} onPress={() => setDependenciesSheetVisible(true)} className="rounded-xl border border-dashed py-3 active:opacity-70" style={{ borderColor: colors.border, backgroundColor: colors.background, opacity: createdParent ? 0.5 : 1 }}><Text className="text-center text-sm font-bold" style={{ color: colors.accentInk }}>+ {t('createTask.addDependency')}</Text></Pressable>
        </View>
      </Card> : null}

      {moreOptions ? <Card title={t('createTask.attachments')} icon="📎">
      <TaskAttachmentPicker
          files={attachments}
          onChange={setAttachments}
          disabled={saving || uploadingAttachments}
          onValidationError={setError}
        />
      </Card> : null}
      <TaskRecurrenceSheet
        visible={isRecurrenceSheetVisible}
        mode={recurrence ? 'edit' : 'create'}
        recurrence={recurrence}
        accessToken={accessToken}
        onClose={() => setIsRecurrenceSheetVisible(false)}
        onSave={setRecurrence}
        onRemove={() => setRecurrence(null)}
      />

      <TaskDependenciesWorkflowSheet visible={dependenciesSheetVisible} mode="add" currentTaskId="draft-task" availableTasks={dependencyOptions} dependencies={draftDependencies} onClose={() => setDependenciesSheetVisible(false)} onAdd={(selected) => setDraftDependencies((current) => {
        const byId = new Map(current.map((item) => [item.id, item])); selected.forEach((item) => byId.set(item.id, item)); return [...byId.values()]
      })} onSaveReplacement={() => undefined} onRemove={() => undefined} />
      {iosPicker ? <Modal transparent animationType="slide" visible onRequestClose={() => setIosPicker(null)}><Pressable className="flex-1 justify-end bg-black/40" onPress={() => setIosPicker(null)}><Pressable className="p-4" style={{ backgroundColor: colors.surface }} onPress={() => undefined}><DateTimePicker value={iosPicker === 'date' || iosPicker === 'scheduledDate' ? dueDate ?? new Date() : new Date()} mode={iosPicker === 'scheduledDate' ? 'date' : 'time'} display="spinner" onChange={(_, selected) => { if (!selected) return; if (iosPicker === 'date') setDueDate(selected); else if (iosPicker === 'scheduledDate') setScheduledDate(selected.toISOString().slice(0, 10)); else { const next = `${String(selected.getHours()).padStart(2, '0')}:${String(selected.getMinutes()).padStart(2, '0')}`; if (iosPicker === 'time') setDueTime(next); else if (iosPicker === 'scheduledStart') setScheduledStartTime(next); else setScheduledEndTime(next) } }} /><PrimaryButton onPress={() => setIosPicker(null)}>Done</PrimaryButton></Pressable></Pressable></Modal> : null}
      <TaskTimeConflictModal conflict={timeConflict} onMoveExisting={(mode, schedule) => void moveConflictTask('existing', mode, schedule)} onMoveNew={(mode, schedule) => void moveConflictTask('new', mode, schedule)} onCancelExisting={() => {
        if (!timeConflict || !accessToken) return
        Alert.alert('Cancel existing task?', 'It will be marked missed and not deleted.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Mark missed', style: 'destructive', onPress: () => void changeTaskStatus(accessToken, timeConflict.existingTask.id, { status: 'missed' }).then(() => setTimeConflict(null)) }])
      }} onCancelNew={() => { setTimeConflict(null); onCancel() }} onCancelChanges={() => setTimeConflict(null)} />
      <TaskCommitmentConflictModal conflict={commitmentConflict} onKeepCommitment={() => void (async () => {
        if (!commitmentConflict || !accessToken) return
        const schedule = (await getNearestTaskSchedule(accessToken, commitmentConflict.proposedTask)).schedule
        if (!schedule) return Alert.alert('No available slot', 'Choose another time.')
        Alert.alert('Proposed schedule', `${scheduledDate} ${scheduledStartTime}–${scheduledEndTime}\n→\n${schedule.scheduledDate} ${schedule.scheduledStartTime}–${schedule.scheduledEndTime}`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Apply', onPress: () => { setScheduledDate(schedule.scheduledDate); setScheduledStartTime(schedule.scheduledStartTime); setScheduledEndTime(schedule.scheduledEndTime); setCommitmentConflict(null) } }])
      })()} onKeepTask={() => void (async () => {
        if (!commitmentConflict || !accessToken) return
        await skipCommitmentOccurrence(accessToken, commitmentConflict.commitment.commitmentId, commitmentConflict.commitment.date)
        await resolveTaskScheduleConflict(accessToken, { conflictKey: commitmentConflict.id, date: commitmentConflict.commitment.date, commitmentId: commitmentConflict.commitment.commitmentId, resolution: 'keep_task' })
        setCommitmentConflict(null)
      })()} onChooseAnotherTime={() => setCommitmentConflict(null)} onCancel={() => setCommitmentConflict(null)} />
    </AppScreen>
  )
}

function Card({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
  const { theme } = useTheme()
  const { colors } = theme

  return (
    <SectionCard className="mb-3">
      <Text className="mb-3 text-base font-black" style={{ color: colors.text }}>
        <Text style={{ color: colors.accentInk }}>{icon} </Text>
        {title}
      </Text>
      {children}
    </SectionCard>
  )
}

function Label({ text }: { text: string }) {
  const { theme } = useTheme()

  return (
    <Text className="mb-1.5 text-xs font-black uppercase tracking-wide" style={{ color: theme.colors.secondaryText }}>
      {text}
    </Text>
  )
}

function Segment({ label, active, color, onPress }: { label: string; active?: boolean; color: string; onPress?: () => void }) {
  const { theme } = useTheme()
  const { colors } = theme

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="flex-1 rounded-xl border px-2 py-2 active:opacity-80"
      style={{
        borderColor: active ? colors.accent : colors.border,
        backgroundColor: active ? colors.accentSoft : colors.background,
      }}
    >
      <Text className="text-center text-xs font-bold" style={{ color }}>{label}</Text>
    </Pressable>
  )
}

function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  const { theme } = useTheme()
  const { colors } = theme

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="rounded-full px-3 py-2 active:opacity-80"
      style={{ backgroundColor: active ? colors.accent : colors.background }}
    >
      <Text className="text-xs font-bold" style={{ color: active ? colors.accentText : colors.text }}>{label}</Text>
    </Pressable>
  )
}

function Select({ label, onPress }: { label: string; onPress?: () => void }) {
  const { theme } = useTheme()
  const { colors } = theme

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="rounded-xl border px-3 py-2.5 active:opacity-80"
      style={{ borderColor: colors.border, backgroundColor: colors.input }}
    >
      <Text className="text-sm" style={{ color: colors.secondaryText }}>{label}</Text>
    </Pressable>
  )
}
