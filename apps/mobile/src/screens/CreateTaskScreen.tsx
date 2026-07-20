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
import { addDependencies, addSubtask, recurrenceToApi, toUiPriority, toUiStatus, type ApiTask, type TaskPayload, uploadAttachment } from '../lib/tasksApi'
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

const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'] as const
const STATUSES = ['To Do', 'In Progress', 'Done', 'Missed'] as const
const CATEGORIES = ['Work', 'Personal', 'Study', 'Health', 'Finance', 'General'] as const
const REMINDER_OPTIONS = [
  { label: '10 minutes before', value: 10 },
  { label: '30 minutes before', value: 30 },
  { label: '1 hour before', value: 60 },
  { label: '1 day before', value: 1440 },
] as const

function formatDateLabel(date: Date | undefined) {
  if (!date) return 'dd/mm/yyyy'
  return new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric' }).format(date)
}

function formatTimeLabel(time: string) {
  if (!time) return '--:--'
  const [hours, minutes] = time.split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return time
  const period = hours >= 12 ? 'PM' : 'AM'
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${period}`
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
  const [reminderEnabled, setReminderEnabled] = useState(true)
  const [reminderBeforeMinutes, setReminderBeforeMinutes] = useState(30)
  const [estimatedHours, setEstimatedHours] = useState('')
  const [labelsText, setLabelsText] = useState('')
  const [iosPicker, setIosPicker] = useState<'date' | 'time' | null>(null)
  const [error, setError] = useState('')
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
  const formValues = { title, description, notes, priority, status, category, dueDate, dueTime, reminderEnabled, reminderBeforeMinutes, estimatedHours, labelsText }
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

  async function handleSave() {
    if (submissionRef.current || saving) return
    const validationError = validateCreateTask(formValues)
    if (validationError) {
      setError(validationError)
      return
    }
    const subtaskValidationError = validateDraftSubtasks(draftSubtasks)
    if (subtaskValidationError) { setError(subtaskValidationError); return }

    submissionRef.current = true
    setSaving(true)
    setError('')

    try {
      const createdTask = parentTaskRef.current ?? await onSave(createTaskPayload(formValues, recurrenceToApi(recurrence)))

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

  return (
    <AppScreen
      keyboardAvoiding
      footer={
        <BottomActionBar>
          <SecondaryButton onPress={confirmLeave} className="flex-1">
            Cancel
          </SecondaryButton>
          <PrimaryButton onPress={() => void handleSave()} className="flex-1" disabled={saving || uploadingAttachments}>
            {saving || uploadingAttachments ? 'Saving...' : 'Save Task'}
          </PrimaryButton>
        </BottomActionBar>
      }
    >
      <PageHeader title="Create Task" subtitle="Organize your work" onBack={confirmLeave} />

      <Card title="Task Information" icon="📋">
        <Label text="Task Title *" />
        <TextInput
          placeholder="Enter task title..."
          value={title}
          onChangeText={setTitle}
          placeholderTextColor={colors.placeholder}
          className="mb-3 rounded-xl border px-3 py-2.5 text-sm"
          style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }}
        />

        <Label text="Description" />
        <TextInput
          multiline
          placeholder="Describe your task..."
          value={description}
          onChangeText={setDescription}
          placeholderTextColor={colors.placeholder}
          textAlignVertical="top"
          className="mb-3 h-24 rounded-xl border px-3 py-2.5 text-sm"
          style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }}
        />

        <Label text="Subtasks" />
        <DraftSubtasksSection items={draftSubtasks} onChange={setDraftSubtasks} disabled={saving || uploadingAttachments || Boolean(createdParent)} />

        <Label text="Notes" />
        <TextInput
          multiline
          placeholder="Additional notes..."
          value={notes}
          onChangeText={setNotes}
          placeholderTextColor={colors.placeholder}
          textAlignVertical="top"
          className="h-20 rounded-xl border px-3 py-2.5 text-sm"
          style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }}
        />
        {error ? <Text className="mt-2 text-sm font-bold text-red-300">{error}</Text> : null}
      </Card>

      <Card title="Task Settings" icon="⚙️">
        <Label text="Priority" />
        <View className="mb-3 flex-row gap-2">
          {PRIORITIES.map((item) => <Segment key={item} label={item} active={priority === item} color={item === 'Low' ? colors.success : item === 'High' || item === 'Urgent' ? colors.error : colors.accent} onPress={() => setPriority(item)} />)}
        </View>

        <Label text="Status" />
        <View className="mb-3 flex-row flex-wrap gap-2">
          {STATUSES.map((item) => <Chip key={item} label={item} active={status === item} onPress={() => setStatus(item)} />)}
        </View>

        <Label text="Category" />
        <Select label={category || 'Select category...'} onPress={() => Alert.alert('Category', 'Choose a category', CATEGORIES.map((item) => ({ text: item, onPress: () => setCategory(item) })))} />

        <View className="mt-3 flex-row gap-2">
          <View className="flex-1">
            <Label text="Due Date" />
            <Select label={formatDateLabel(dueDate)} onPress={openDatePicker} />
          </View>
          <View className="flex-1">
            <Label text="Due Time" />
            <Select label={formatTimeLabel(dueTime)} onPress={openTimePicker} />
          </View>
        </View>
      </Card>

      <Card title="Reminder" icon="🔔">
        <View className="mb-3 flex-row items-center justify-between">
          <View>
            <Text className="text-sm font-bold" style={{ color: colors.text }}>Enable Reminder</Text>
            <Text className="text-xs" style={{ color: colors.secondaryText }}>Remind before due date</Text>
          </View>

          <Pressable accessibilityRole="switch" accessibilityState={{ checked: reminderEnabled }} accessibilityLabel="Enable reminder" onPress={() => setReminderEnabled((enabled) => !enabled)} className={`h-6 w-11 justify-center rounded-full px-1 ${reminderEnabled ? 'items-end' : 'items-start'}`} style={{ backgroundColor: reminderEnabled ? colors.accent : colors.border }}><View className="h-4 w-4 rounded-full bg-white" /></Pressable>
        </View>

        <Label text="Reminder Time" />
        <Select label={REMINDER_OPTIONS.find((option) => option.value === reminderBeforeMinutes)?.label ?? '30 minutes before'} onPress={() => reminderEnabled && Alert.alert('Reminder time', 'Choose when to be reminded', REMINDER_OPTIONS.map((option) => ({ text: option.label, onPress: () => setReminderBeforeMinutes(option.value) })))} />
      </Card>

      <Card title="Time & Labels" icon="â±ï¸">
        <Label text="Estimated Hours" />
        <TextInput value={estimatedHours} onChangeText={setEstimatedHours} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.placeholder} className="mb-3 rounded-xl border px-3 py-2.5 text-sm" style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }} />
        <Label text="Labels" />
        <TextInput value={labelsText} onChangeText={setLabelsText} placeholder="Comma-separated labels" placeholderTextColor={colors.placeholder} className="rounded-xl border px-3 py-2.5 text-sm" style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }} />
      </Card>

      <Card title="Recurring & Dependencies" icon="🔁">
        <Label text="Recurring Task" />
        <Select label={recurrenceSummary} onPress={() => setIsRecurrenceSheetVisible(true)} />

        <View className="mt-3">
          <Label text="Dependencies" />
          {draftDependencies.map((dependency) => <View key={dependency.id} className="mb-2 rounded-xl p-3" style={{ backgroundColor: colors.background }}><Text className="font-bold" style={{ color: colors.text }}>{dependency.title}</Text><Text className="mt-1 text-xs" style={{ color: colors.secondaryText }}>{dependency.category} · {dependency.status}</Text></View>)}
          <Pressable disabled={saving || uploadingAttachments || Boolean(createdParent)} accessibilityRole="button" accessibilityLabel="Add dependency" onPress={() => setDependenciesSheetVisible(true)} className="rounded-xl border border-dashed py-3 active:opacity-70" style={{ borderColor: colors.border, backgroundColor: colors.background, opacity: createdParent ? 0.5 : 1 }}><Text className="text-center text-sm font-bold" style={{ color: colors.accent }}>+ Add Dependency</Text></Pressable>
        </View>
      </Card>

      <Card title="Attachments" icon="📎">
      <TaskAttachmentPicker
          files={attachments}
          onChange={setAttachments}
          disabled={saving || uploadingAttachments}
          onValidationError={setError}
        />
      </Card>
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
      {iosPicker ? <Modal transparent animationType="slide" visible onRequestClose={() => setIosPicker(null)}><Pressable className="flex-1 justify-end bg-black/40" onPress={() => setIosPicker(null)}><Pressable className="p-4" style={{ backgroundColor: colors.surface }} onPress={() => undefined}><DateTimePicker value={iosPicker === 'date' ? dueDate ?? new Date() : (() => { const date = new Date(); const [hours, minutes] = dueTime.split(':').map(Number); if (!Number.isNaN(hours)) date.setHours(hours, minutes || 0, 0, 0); return date })()} mode={iosPicker} display="spinner" onChange={(_, selected) => { if (!selected) return; if (iosPicker === 'date') setDueDate(selected); else setDueTime(`${String(selected.getHours()).padStart(2, '0')}:${String(selected.getMinutes()).padStart(2, '0')}`) }} /><PrimaryButton onPress={() => setIosPicker(null)}>Done</PrimaryButton></Pressable></Pressable></Modal> : null}
    </AppScreen>
  )
}

function Card({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
  const { theme } = useTheme()
  const { colors } = theme

  return (
    <SectionCard className="mb-3">
      <Text className="mb-3 text-base font-black" style={{ color: colors.text }}>
        <Text style={{ color: colors.accent }}>{icon} </Text>
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
