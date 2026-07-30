import { useState } from 'react'
import { Modal, Pressable, Text, View } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import type { TaskTimeConflict } from '../lib/tasksApi'
import { useTheme } from '../theme/useTheme'

export type MobileScheduleChoice = { scheduledDate: string; scheduledStartTime: string; scheduledEndTime: string }

export function TaskTimeConflictModal({ conflict, onMoveExisting, onMoveNew, onCancelExisting, onCancelNew, onCancelChanges }: {
  conflict: TaskTimeConflict | null
  onMoveExisting: (mode: 'auto' | 'manual', schedule?: MobileScheduleChoice) => void
  onMoveNew: (mode: 'auto' | 'manual', schedule?: MobileScheduleChoice) => void
  onCancelExisting: () => void
  onCancelNew: () => void
  onCancelChanges: () => void
}) {
  const { theme } = useTheme()
  const [moving, setMoving] = useState<'existing' | 'new' | null>(null)
  const [targetDate, setTargetDate] = useState(new Date())
  if (!conflict) return null
  const target = moving === 'existing' ? conflict.existingTask : conflict.proposedTask
  const manual = () => {
    const start = `${String(targetDate.getHours()).padStart(2, '0')}:${String(targetDate.getMinutes()).padStart(2, '0')}`
    const total = targetDate.getHours() * 60 + targetDate.getMinutes() + target.durationMinutes
    const schedule = { scheduledDate: targetDate.toISOString().slice(0, 10), scheduledStartTime: start, scheduledEndTime: `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}` }
    moving === 'existing' ? onMoveExisting('manual', schedule) : onMoveNew('manual', schedule)
  }
  return <Modal visible transparent animationType="fade" accessibilityViewIsModal onRequestClose={onCancelChanges}>
    <View className="flex-1 justify-center bg-black/70 p-4"><View className="max-h-[95%] rounded-2xl border p-4" style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.border }}>
      <Text accessibilityRole="header" className="text-xl font-black" style={{ color: theme.colors.text }}>Task Time Conflict</Text>
      <Text style={{ color: theme.colors.secondaryText }}>These two tasks are scheduled at the same time. What would you like to do?</Text>
      <TaskBlock label="Existing Task" task={conflict.existingTask} />
      <TaskBlock label="New or Edited Task" task={conflict.proposedTask} />
      <Text className="my-2 font-bold" style={{ color: theme.colors.error }}>Exact overlap: {conflict.overlapMinutes} minutes</Text>
      {moving ? <View><Text style={{ color: theme.colors.text }}>Where should {target.title} move?</Text><Action label="Move automatically to nearest available slot" onPress={() => moving === 'existing' ? onMoveExisting('auto') : onMoveNew('auto')} /><DateTimePicker value={targetDate} mode="date" onChange={(_, value) => value && setTargetDate(value)} /><DateTimePicker value={targetDate} mode="time" onChange={(_, value) => value && setTargetDate(value)} /><Action label="Preview manual move" onPress={manual} /></View> : null}
      <Action label="Move Existing Task" onPress={() => setMoving('existing')} />
      <Action label="Move New Task" onPress={() => setMoving('new')} />
      <Action label="Cancel Existing Task" onPress={onCancelExisting} />
      <Action label="Cancel New Task" onPress={onCancelNew} />
      <Action label="Cancel Changes" onPress={onCancelChanges} />
    </View></View>
  </Modal>
}

function TaskBlock({ label, task }: { label: string; task: TaskTimeConflict['existingTask'] }) {
  const { theme } = useTheme()
  return <View className="mt-2 rounded-xl border p-2" style={{ borderColor: theme.colors.border }}><Text className="text-xs font-black" style={{ color: theme.colors.secondaryText }}>{label}</Text><Text className="font-black" style={{ color: theme.colors.text }}>{task.title}</Text><Text style={{ color: theme.colors.secondaryText }}>{task.scheduledDate} · {task.scheduledStartTime}–{task.scheduledEndTime} · {task.durationMinutes} min</Text><Text style={{ color: theme.colors.secondaryText }}>Priority: {task.priority} · Due: {task.dueDate ?? 'None'}</Text></View>
}
function Action({ label, onPress }: { label: string; onPress: () => void }) {
  const { theme } = useTheme()
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} className="mt-2 rounded-xl border p-3" style={{ borderColor: theme.colors.border }}><Text className="text-center font-bold" style={{ color: theme.colors.text }}>{label}</Text></Pressable>
}
