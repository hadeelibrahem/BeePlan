import { useEffect, useMemo, useState } from 'react'
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { PrimaryButton, SecondaryButton } from './layout'
import { useTheme } from '../theme/useTheme'

export type TaskStatus = 'To Do' | 'In Progress' | 'Done' | 'Missed'

type TaskStatusWorkflowSheetProps = {
  visible: boolean
  status: TaskStatus
  progress: number
  onClose: () => void
  onSave: (next: {
    status: TaskStatus
    progress: number
    completionDate?: string
    missedReason?: string
  }) => void
}

const statusOptions: {
  value: TaskStatus
  icon: string
  description: string
  tone: 'muted' | 'primary' | 'success' | 'danger'
}[] = [
  {
    value: 'To Do',
    icon: 'TD',
    description: 'Task has not been started yet.',
    tone: 'muted',
  },
  {
    value: 'In Progress',
    icon: 'IP',
    description: 'Task is currently being worked on.',
    tone: 'primary',
  },
  {
    value: 'Done',
    icon: 'DN',
    description: 'Task has been completed successfully.',
    tone: 'success',
  },
  {
    value: 'Missed',
    icon: 'MS',
    description: 'Task was not completed before its due date.',
    tone: 'danger',
  },
]

export function TaskStatusWorkflowSheet({
  visible,
  status,
  progress,
  onClose,
  onSave,
}: TaskStatusWorkflowSheetProps) {
  const { theme } = useTheme()
  const { colors } = theme
  const [selectedStatus, setSelectedStatus] = useState<TaskStatus>(status)
  const [progressValue, setProgressValue] = useState(progress)
  const [completionDate, setCompletionDate] = useState('')
  const [missedReason, setMissedReason] = useState('')

  useEffect(() => {
    if (!visible) return

    setSelectedStatus(status)
    setProgressValue(progress)
    setCompletionDate('')
    setMissedReason('')
  }, [progress, status, visible])

  const helperText = useMemo(() => {
    if (selectedStatus === 'Done') return 'Completion details will be saved with this status.'
    if (selectedStatus === 'Missed') return 'Add a short reason so the timeline stays useful.'
    return 'Adjust progress before saving if the task moved forward.'
  }, [selectedStatus])

  const toneColor = (tone: (typeof statusOptions)[number]['tone']) => {
    if (tone === 'primary') return colors.primary
    if (tone === 'success') return colors.success
    if (tone === 'danger') return colors.error
    return colors.secondaryText
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <Pressable className="flex-1" onPress={onClose} accessibilityRole="button" accessibilityLabel="Close status sheet" />

        <View
          className="rounded-t-[28px] border px-5 pb-5 pt-3"
          style={{
            maxHeight: '88%',
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
            shadowColor: theme.cardShadow.color,
            shadowOpacity: theme.cardShadow.opacity,
            shadowRadius: theme.cardShadow.radius,
            elevation: theme.cardShadow.elevation,
          }}
        >
          <View className="mx-auto mb-5 h-1.5 w-14 rounded-full" style={{ backgroundColor: colors.border }} />

          <View className="mb-5 items-center">
            <Text className="text-2xl font-black" style={{ color: colors.text }}>
              Change Status
            </Text>
            <Text className="mt-2 text-center text-sm" style={{ color: colors.secondaryText }}>
              Select the current status of this task
            </Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
            <View className="gap-3">
              {statusOptions.map((option) => {
                const isSelected = selectedStatus === option.value
                const color = toneColor(option.tone)

                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setSelectedStatus(option.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isSelected }}
                    className="flex-row items-center gap-4 rounded-3xl border p-4 active:scale-[0.99] active:opacity-90"
                    style={{
                      backgroundColor: isSelected ? colors.accentSoft : colors.background,
                      borderColor: isSelected ? colors.accent : colors.border,
                    }}
                  >
                    <View
                      className="h-12 w-12 items-center justify-center rounded-2xl border"
                      style={{
                        backgroundColor: isSelected ? colors.accent : colors.card,
                        borderColor: isSelected ? colors.accent : colors.border,
                      }}
                    >
                      <Text className="text-xs font-black" style={{ color: isSelected ? colors.accentText : color }}>
                        {option.icon}
                      </Text>
                    </View>

                    <View className="flex-1">
                      <Text className="font-black" style={{ color: colors.text }}>
                        {option.value}
                      </Text>
                      <Text className="mt-1 text-sm leading-5" style={{ color: colors.secondaryText }}>
                        {option.description}
                      </Text>
                    </View>

                    <View
                      className="h-5 w-5 rounded-full border"
                      style={{
                        borderColor: isSelected ? colors.accent : colors.border,
                        backgroundColor: isSelected ? colors.accent : 'transparent',
                      }}
                    />
                  </Pressable>
                )
              })}
            </View>

            <View className="mt-5 rounded-3xl border p-4" style={{ backgroundColor: colors.background, borderColor: colors.border }}>
              <View className="mb-4 flex-row items-start justify-between gap-4">
                <View className="flex-1">
                  <Text className="font-black" style={{ color: colors.text }}>
                    Progress Percentage
                  </Text>
                  <Text className="mt-1 text-xs leading-5" style={{ color: colors.secondaryText }}>
                    {helperText}
                  </Text>
                </View>
                <Text className="text-3xl font-black" style={{ color: colors.accent }}>
                  {progressValue}%
                </Text>
              </View>

              <View className="h-3 overflow-hidden rounded-full" style={{ backgroundColor: colors.progressTrack }}>
                <View className="h-full rounded-full" style={{ width: `${progressValue}%`, backgroundColor: colors.accent }} />
              </View>

              <View className="mt-4 flex-row gap-2">
                {[0, 25, 50, 75, 100].map((value) => (
                  <Pressable
                    key={value}
                    onPress={() => setProgressValue(value)}
                    accessibilityRole="button"
                    accessibilityLabel={`Set progress to ${value} percent`}
                    className="flex-1 items-center rounded-2xl py-3 active:opacity-80"
                    style={{ backgroundColor: progressValue === value ? colors.accent : colors.card }}
                  >
                    <Text className="text-xs font-black" style={{ color: progressValue === value ? colors.accentText : colors.text }}>
                      {value}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {selectedStatus === 'Done' ? (
                <View className="mt-4">
                  <Text className="text-xs font-black uppercase tracking-wide" style={{ color: colors.secondaryText }}>
                    Completion Date
                  </Text>
                  <TextInput
                    value={completionDate}
                    onChangeText={setCompletionDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.placeholder}
                    className="mt-2 rounded-2xl border px-4 py-4 font-bold"
                    style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }}
                  />
                </View>
              ) : null}

              {selectedStatus === 'Missed' ? (
                <View className="mt-4">
                  <Text className="text-xs font-black uppercase tracking-wide" style={{ color: colors.secondaryText }}>
                    Missed Reason
                  </Text>
                  <TextInput
                    value={missedReason}
                    onChangeText={setMissedReason}
                    placeholder="Add a short reason..."
                    placeholderTextColor={colors.placeholder}
                    multiline
                    textAlignVertical="top"
                    className="mt-2 min-h-24 rounded-2xl border px-4 py-4 font-bold"
                    style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }}
                  />
                </View>
              ) : null}
            </View>
          </ScrollView>

          <View className="mt-3 flex-row gap-3">
            <SecondaryButton onPress={onClose} className="flex-1">
              Cancel
            </SecondaryButton>
            <PrimaryButton
              onPress={() =>
                onSave({
                  status: selectedStatus,
                  progress: progressValue,
                  completionDate,
                  missedReason,
                })
              }
              className="flex-1"
            >
              Save Status
            </PrimaryButton>
          </View>
        </View>
      </View>
    </Modal>
  )
}
