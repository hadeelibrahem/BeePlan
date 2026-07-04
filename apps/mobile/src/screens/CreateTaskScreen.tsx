import { useState, type ReactNode } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import {
  TaskRecurrenceSheet,
  createRecurrenceSummary,
  type RecurrenceSettings,
} from '../components/TaskRecurrenceSheet'
import { recurrenceToApi, type TaskPayload } from '../lib/tasksApi'
import {
  AppScreen,
  BottomActionBar,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
} from '../components/layout'
import { useTheme } from '../theme/useTheme'

type Props = {
  onCancel: () => void
  onSave: (payload: TaskPayload) => Promise<void> | void
}

export default function CreateTaskScreen({ onCancel, onSave }: Props) {
  const { theme } = useTheme()
  const { colors } = theme
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [recurrence, setRecurrence] = useState<RecurrenceSettings | null>(null)
  const [isRecurrenceSheetVisible, setIsRecurrenceSheetVisible] = useState(false)
  const recurrenceSummary = createRecurrenceSummary(recurrence)

  async function handleSave() {
    if (!title.trim()) {
      setError('Task title is required.')
      return
    }

    setSaving(true)
    setError('')

    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        notes: notes.trim(),
        priority: 'medium',
        status: 'todo',
        category: 'General',
        reminderEnabled: true,
        reminderBeforeMinutes: 30,
        recurrence: recurrenceToApi(recurrence),
      })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to create task.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppScreen
      keyboardAvoiding
      footer={
        <BottomActionBar>
          <SecondaryButton onPress={onCancel} className="flex-1">
            Cancel
          </SecondaryButton>
          <PrimaryButton onPress={() => void handleSave()} className="flex-1" disabled={saving}>
            {saving ? 'Saving...' : 'Save Task'}
          </PrimaryButton>
        </BottomActionBar>
      }
    >
      <PageHeader title="Create Task" subtitle="Organize your work" onBack={onCancel} />

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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add subtask"
          className="mb-3 rounded-xl border border-dashed py-3 active:opacity-70"
          style={{ borderColor: colors.border, backgroundColor: colors.background }}
        >
          <Text className="text-center text-sm font-bold" style={{ color: colors.accent }}>+ Add Subtask</Text>
        </Pressable>

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
          <Segment label="Low" color={colors.success} />
          <Segment active label="Medium" color={colors.accent} />
          <Segment label="High" color={colors.error} />
        </View>

        <Label text="Status" />
        <View className="mb-3 flex-row flex-wrap gap-2">
          <Chip active label="To Do" />
          <Chip label="In Progress" />
          <Chip label="Done" />
          <Chip label="Missed" />
        </View>

        <Label text="Category" />
        <Select label="Select category..." />

        <View className="mt-3 flex-row gap-2">
          <View className="flex-1">
            <Label text="Due Date" />
            <Select label="dd/mm/yyyy" />
          </View>
          <View className="flex-1">
            <Label text="Due Time" />
            <Select label="--:--" />
          </View>
        </View>
      </Card>

      <Card title="Reminder" icon="🔔">
        <View className="mb-3 flex-row items-center justify-between">
          <View>
            <Text className="text-sm font-bold" style={{ color: colors.text }}>Enable Reminder</Text>
            <Text className="text-xs" style={{ color: colors.secondaryText }}>Remind before due date</Text>
          </View>

          <View className="h-6 w-11 items-end justify-center rounded-full px-1" style={{ backgroundColor: colors.accent }}>
            <View className="h-4 w-4 rounded-full bg-white" />
          </View>
        </View>

        <Label text="Reminder Time" />
        <Select label="30 minutes before" />
      </Card>

      <Card title="Recurring & Dependencies" icon="🔁">
        <Label text="Recurring Task" />
        <Select label={recurrenceSummary} onPress={() => setIsRecurrenceSheetVisible(true)} />

        <View className="mt-3">
          <Label text="Dependencies" />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add dependency"
            className="rounded-xl border border-dashed py-3 active:opacity-70"
            style={{ borderColor: colors.border, backgroundColor: colors.background }}
          >
            <Text className="text-center text-sm font-bold" style={{ color: colors.accent }}>+ Add Dependency</Text>
          </Pressable>
        </View>
      </Card>

      <Card title="Attachments" icon="📎">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Upload files"
          className="h-24 items-center justify-center rounded-xl border border-dashed active:opacity-70"
          style={{ borderColor: colors.border, backgroundColor: colors.background }}
        >
          <Text className="text-xl">☁️</Text>
          <Text className="mt-1.5 text-sm" style={{ color: colors.secondaryText }}>Upload files</Text>
          <Text className="text-xs" style={{ color: colors.secondaryText }}>Images, PDF, Documents</Text>
        </Pressable>
      </Card>
      <TaskRecurrenceSheet
        visible={isRecurrenceSheetVisible}
        mode={recurrence ? 'edit' : 'create'}
        recurrence={recurrence}
        onClose={() => setIsRecurrenceSheetVisible(false)}
        onSave={setRecurrence}
        onRemove={() => setRecurrence(null)}
      />
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

function Segment({ label, active, color }: { label: string; active?: boolean; color: string }) {
  const { theme } = useTheme()
  const { colors } = theme

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
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

function Chip({ label, active }: { label: string; active?: boolean }) {
  const { theme } = useTheme()
  const { colors } = theme

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
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
