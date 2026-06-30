import type { ReactNode } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
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
  onSave: () => void
}

export default function CreateTaskScreen({ onCancel, onSave }: Props) {
  const { theme } = useTheme()
  const { colors } = theme

  return (
    <AppScreen
      keyboardAvoiding
      footer={
        <BottomActionBar>
          <SecondaryButton onPress={onCancel} className="flex-1">
            Cancel
          </SecondaryButton>
          <PrimaryButton onPress={onSave} className="flex-1">
            Save Task
          </PrimaryButton>
        </BottomActionBar>
      }
    >
      <PageHeader title="Create Task" subtitle="Organize your work" onBack={onCancel} />

      <Card title="Task Information" icon="📋">
        <Label text="Task Title *" />
        <TextInput
          placeholder="Enter task title..."
          placeholderTextColor={colors.placeholder}
          className="mb-5 rounded-2xl border px-4 py-4 text-sm"
          style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }}
        />

        <Label text="Description" />
        <TextInput
          multiline
          placeholder="Describe your task..."
          placeholderTextColor={colors.placeholder}
          textAlignVertical="top"
          className="mb-5 h-32 rounded-2xl border px-4 py-4 text-sm"
          style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }}
        />

        <Label text="Subtasks" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add subtask"
          className="mb-5 rounded-2xl border border-dashed py-4 active:opacity-70"
          style={{ borderColor: colors.border, backgroundColor: colors.background }}
        >
          <Text className="text-center font-bold" style={{ color: colors.accent }}>+ Add Subtask</Text>
        </Pressable>

        <Label text="Notes" />
        <TextInput
          multiline
          placeholder="Additional notes..."
          placeholderTextColor={colors.placeholder}
          textAlignVertical="top"
          className="h-24 rounded-2xl border px-4 py-4 text-sm"
          style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }}
        />
      </Card>

      <Card title="Task Settings" icon="⚙️">
        <Label text="Priority" />
        <View className="mb-5 flex-row gap-2">
          <Segment label="Low" color={colors.success} />
          <Segment active label="Medium" color={colors.accent} />
          <Segment label="High" color={colors.error} />
        </View>

        <Label text="Status" />
        <View className="mb-5 flex-row flex-wrap gap-2">
          <Chip active label="To Do" />
          <Chip label="In Progress" />
          <Chip label="Done" />
          <Chip label="Missed" />
        </View>

        <Label text="Category" />
        <Select label="Select category..." />

        <View className="mt-5 flex-row gap-3">
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
        <View className="mb-4 flex-row items-center justify-between">
          <View>
            <Text className="font-bold" style={{ color: colors.text }}>Enable Reminder</Text>
            <Text className="text-xs" style={{ color: colors.secondaryText }}>Remind before due date</Text>
          </View>

          <View className="h-8 w-14 items-end justify-center rounded-full px-1" style={{ backgroundColor: colors.accent }}>
            <View className="h-6 w-6 rounded-full bg-white" />
          </View>
        </View>

        <Label text="Reminder Time" />
        <Select label="30 minutes before" />
      </Card>

      <Card title="Recurring & Dependencies" icon="🔁">
        <Label text="Recurring Task" />
        <Select label="None" />

        <View className="mt-5">
          <Label text="Dependencies" />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add dependency"
            className="rounded-2xl border border-dashed py-4 active:opacity-70"
            style={{ borderColor: colors.border, backgroundColor: colors.background }}
          >
            <Text className="text-center font-bold" style={{ color: colors.accent }}>+ Add Dependency</Text>
          </Pressable>
        </View>
      </Card>

      <Card title="Attachments" icon="📎">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Upload files"
          className="h-28 items-center justify-center rounded-2xl border border-dashed active:opacity-70"
          style={{ borderColor: colors.border, backgroundColor: colors.background }}
        >
          <Text className="text-2xl">☁️</Text>
          <Text className="mt-2 text-sm" style={{ color: colors.secondaryText }}>Upload files</Text>
          <Text className="text-xs" style={{ color: colors.secondaryText }}>Images, PDF, Documents</Text>
        </Pressable>
      </Card>
    </AppScreen>
  )
}

function Card({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
  const { theme } = useTheme()
  const { colors } = theme

  return (
    <SectionCard className="mb-5">
      <Text className="mb-5 text-lg font-black" style={{ color: colors.text }}>
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
    <Text className="mb-2 text-xs font-black uppercase tracking-wide" style={{ color: theme.colors.secondaryText }}>
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
      className="flex-1 rounded-2xl border px-3 py-3 active:opacity-80"
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
      className="rounded-full px-4 py-3 active:opacity-80"
      style={{ backgroundColor: active ? colors.accent : colors.background }}
    >
      <Text className="text-xs font-bold" style={{ color: active ? colors.accentText : colors.text }}>{label}</Text>
    </Pressable>
  )
}

function Select({ label }: { label: string }) {
  const { theme } = useTheme()
  const { colors } = theme

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      className="rounded-2xl border px-4 py-4 active:opacity-80"
      style={{ borderColor: colors.border, backgroundColor: colors.input }}
    >
      <Text style={{ color: colors.secondaryText }}>{label}</Text>
    </Pressable>
  )
}
