import { Modal, Pressable, Text, View } from 'react-native'
import type { TaskCommitmentConflict } from '../lib/tasksApi'
import { useTheme } from '../theme/useTheme'

export function TaskCommitmentConflictModal({ conflict, busy, onKeepCommitment, onKeepTask, onChooseAnotherTime, onCancel }: {
  conflict: TaskCommitmentConflict | null
  busy?: boolean
  onKeepCommitment: () => void
  onKeepTask: () => void
  onChooseAnotherTime: () => void
  onCancel: () => void
}) {
  const { theme: { colors } } = useTheme()
  if (!conflict) return null
  return <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
    <View className="flex-1 justify-center bg-black/70 p-4">
      <View accessibilityViewIsModal className="rounded-2xl border p-5" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
        <Text accessibilityRole="header" className="text-xl font-black" style={{ color: colors.text }}>Task conflicts with a fixed commitment</Text>
        <Text className="mt-2" style={{ color: colors.secondaryText }}>This task overlaps with a recurring commitment from your Settings.</Text>
        <Text className="mt-4 font-black" style={{ color: colors.text }}>Task: {conflict.proposedTask.title}</Text>
        <Text style={{ color: colors.secondaryText }}>{conflict.proposedTask.scheduledDate} · {conflict.proposedTask.scheduledStartTime}–{conflict.proposedTask.scheduledEndTime}</Text>
        <Text className="mt-3 font-black" style={{ color: colors.text }}>Commitment: {conflict.commitment.title}</Text>
        <Text style={{ color: colors.secondaryText }}>{conflict.commitment.date} · {conflict.commitment.startTime}–{conflict.commitment.endTime}</Text>
        <Text className="my-4 font-bold" style={{ color: colors.danger }}>Conflict duration: {conflict.overlapMinutes} minutes</Text>
        <Action label="Keep Commitment (Recommended)" disabled={busy} onPress={onKeepCommitment} />
        <Action label="Keep Task" disabled={busy} onPress={onKeepTask} />
        <Action label="Choose Another Time" disabled={busy} onPress={onChooseAnotherTime} />
        <Action label="Cancel" disabled={busy} onPress={onCancel} />
      </View>
    </View>
  </Modal>
}

function Action({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) {
  const { theme: { colors } } = useTheme()
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} className="mb-2 rounded-xl border p-3" style={{ borderColor: colors.border }}><Text className="text-center font-black" style={{ color: colors.text }}>{label}</Text></Pressable>
}
