import { useCallback, useEffect, useState } from 'react'
import { Alert, Pressable, Text, View } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { acceptDailyPlan, generateDailyPlan, getDailyPlanAcceptance, resolveScheduleConflict, skipCommitmentOccurrence, type ScheduleConflict } from '../lib/plannerApi'
import { changeTaskStatus, getNearestTaskSchedule, resolveTaskScheduleConflict, updateTask, type TaskTimeConflict } from '../lib/tasksApi'
import { useTheme } from '../theme/useTheme'
import { ScheduleConflictModal } from './ScheduleConflictModal'
import { TaskTimeConflictModal, type MobileScheduleChoice } from './TaskTimeConflictModal'

export function ExistingScheduleConflict({ accessToken, date = new Date().toISOString().slice(0, 10), taskId, onResolved }: { accessToken: string; date?: string; taskId?: string; onResolved?: () => void }) {
  const { theme } = useTheme()
  const [conflict, setConflict] = useState<ScheduleConflict | null>(null)
  const [taskConflict, setTaskConflict] = useState<TaskTimeConflict | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [postponing, setPostponing] = useState(false)
  const [target, setTarget] = useState(new Date())
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    if (!accessToken) return
    const accepted = await getDailyPlanAcceptance(accessToken, date)
    setConflict(accepted?.plan.conflicts.find((item) => !taskId || item.task.taskId === taskId) ?? null)
    setTaskConflict(accepted?.plan.taskConflicts?.find((item) => !taskId || item.existingTask.id === taskId || item.proposedTask.id === taskId) ?? null)
  }, [accessToken, date, taskId])
  useEffect(() => { void load() }, [load])
  const resolved = async (resolution: 'keep_commitment' | 'keep_task' | 'postpone_task' | 'cancel_task') => {
    if (!conflict) return
    await resolveScheduleConflict(accessToken, { conflictKey: conflict.id, date, taskId: conflict.task.taskId, commitmentId: conflict.commitment.id, resolution })
    setConflict(null); onResolved?.()
  }
  const keepCommitment = async () => {
    if (!conflict) return
    setBusy(true)
    try {
      const proposed = await generateDailyPlan(accessToken, date)
      const moved = Object.values(proposed.sections).flat().find((item) => item.taskId === conflict.task.taskId)
      if (!moved) throw new Error('No free slot found.')
      Alert.alert('New Schedule', `${date} ${moved.startTime}–${moved.endTime}`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Apply', onPress: () => void acceptDailyPlan(accessToken, proposed).then(() => resolved('keep_commitment')) },
      ])
    } catch (cause) { Alert.alert('Unable to move task', cause instanceof Error ? cause.message : 'Please try again.') } finally { setBusy(false) }
  }
  const keepTask = async () => {
    if (!conflict) return
    setBusy(true)
    try { await skipCommitmentOccurrence(accessToken, conflict.commitment.id, date); await resolved('keep_task') } finally { setBusy(false) }
  }
  const postpone = async () => {
    if (!conflict) return
    const nextDate = target.toISOString().slice(0, 10)
    const start = `${String(target.getHours()).padStart(2, '0')}:${String(target.getMinutes()).padStart(2, '0')}`
    setBusy(true)
    try {
      const total = target.getHours() * 60 + target.getMinutes() + conflict.task.durationMinutes
      if (total >= 1440) throw new Error('The task must end on the same day.')
      const end = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
      const proposed = await generateDailyPlan(accessToken, nextDate, [{ taskId: conflict.task.taskId, startTime: start, endTime: end }])
      if (proposed.conflicts.some((item) => item.task.taskId === conflict.task.taskId)) throw new Error('That slot conflicts with a commitment.')
      Alert.alert('New Schedule', `${nextDate} ${start}–${end}`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Apply', onPress: () => void acceptDailyPlan(accessToken, proposed).then(() => resolved('postpone_task')) }])
    } catch (cause) { Alert.alert('Invalid slot', cause instanceof Error ? cause.message : 'Please choose another time.') } finally { setBusy(false) }
  }
  const cancelTask = () => {
    if (!conflict?.task.taskId) return
    Alert.alert('Cancel task?', 'The task will be marked missed and will not be deleted.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Mark missed', style: 'destructive', onPress: () => void changeTaskStatus(accessToken, conflict.task.taskId!, { status: 'missed' }).then(() => resolved('cancel_task')) }])
  }
  const moveTaskConflict = async (side: 'existing' | 'new', mode: 'auto' | 'manual', manual?: MobileScheduleChoice) => {
    if (!taskConflict) return
    const targetTask = side === 'existing' ? taskConflict.existingTask : taskConflict.proposedTask
    const schedule = mode === 'manual' ? manual : (await getNearestTaskSchedule(accessToken, targetTask)).schedule
    if (!schedule) return Alert.alert('No available slot', 'Please choose another time.')
    Alert.alert('Proposed schedule', `${targetTask.scheduledDate} ${targetTask.scheduledStartTime}–${targetTask.scheduledEndTime}\n→\n${schedule.scheduledDate} ${schedule.scheduledStartTime}–${schedule.scheduledEndTime}`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Apply', onPress: () => void updateTask(accessToken, targetTask.id, schedule).then(() => resolveTaskScheduleConflict(accessToken, { conflictKey: taskConflict.id, date, taskId: targetTask.id, resolution: side === 'existing' ? (mode === 'auto' ? 'move_existing_auto' : 'move_existing_manual') : (mode === 'auto' ? 'move_new_auto' : 'move_new_manual') })).then(() => { setTaskConflict(null); onResolved?.() }) }])
  }
  if (!conflict && !taskConflict) return null
  if (!conflict && taskConflict && dismissed) return <View className="mb-3 rounded-xl border p-3" style={{ borderColor: theme.colors.warning }}><Text accessibilityRole="alert" style={{ color: theme.colors.text }}>Unresolved Task Time Conflict: {taskConflict.existingTask.title} overlaps {taskConflict.proposedTask.title}.</Text><Pressable onPress={() => setDismissed(false)}><Text style={{ color: theme.colors.accent }}>Resolve now</Text></Pressable></View>
  if (!conflict && taskConflict) return <View className="mb-3 rounded-xl border p-3" style={{ borderColor: theme.colors.warning }}><Text accessibilityRole="alert" style={{ color: theme.colors.text }}>Unresolved Task Time Conflict: {taskConflict.existingTask.title} overlaps {taskConflict.proposedTask.title} by {taskConflict.overlapMinutes} minutes.</Text><TaskTimeConflictModal conflict={taskConflict} onMoveExisting={(mode, schedule) => void moveTaskConflict('existing', mode, schedule)} onMoveNew={(mode, schedule) => void moveTaskConflict('new', mode, schedule)} onCancelExisting={() => Alert.alert('Cancel existing task?', 'It will be marked missed and not deleted.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Mark missed', style: 'destructive', onPress: () => void changeTaskStatus(accessToken, taskConflict.existingTask.id, { status: 'missed' }).then(() => setTaskConflict(null)) }])} onCancelNew={() => setDismissed(true)} onCancelChanges={() => setDismissed(true)} /></View>
  if (!conflict) return null
  return <View className="mb-3 rounded-xl border p-3" style={{ borderColor: theme.colors.warning }}>
    <Text accessibilityRole="alert" style={{ color: theme.colors.text }}>Unresolved Schedule Conflict: {conflict.task.title} overlaps {conflict.commitment.title} by {conflict.conflictMinutes} minutes.</Text>
    {dismissed ? <Pressable accessibilityRole="button" accessibilityLabel="Resolve schedule conflict" onPress={() => setDismissed(false)}><Text style={{ color: theme.colors.accent }}>Resolve now</Text></Pressable> : null}
    {postponing ? <View><Text style={{ color: theme.colors.text }}>When would you like to move this task?</Text><DateTimePicker value={target} mode="date" onChange={(_, value) => value && setTarget(value)} /><DateTimePicker value={target} mode="time" onChange={(_, value) => value && setTarget(value)} /><Pressable onPress={() => void postpone()}><Text style={{ color: theme.colors.accent }}>Preview new slot</Text></Pressable></View> : null}
    {!dismissed ? <ScheduleConflictModal conflict={conflict} busy={busy} onKeepCommitment={() => void keepCommitment()} onKeepTask={() => void keepTask()} onManual={() => setPostponing(true)} onCancel={() => setDismissed(true)} /> : null}
    {!dismissed ? <View className="mt-2 flex-row gap-3"><Pressable onPress={() => setPostponing(true)}><Text style={{ color: theme.colors.accent }}>Postpone Task</Text></Pressable><Pressable onPress={cancelTask}><Text style={{ color: theme.colors.error }}>Cancel Task</Text></Pressable></View> : null}
  </View>
}
