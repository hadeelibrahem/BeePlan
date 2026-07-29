import { useCallback, useEffect, useState } from 'react'
import { getDailyPlanAcceptance, type DailyPlan } from '../lib/plannerApi'
import { changeTaskStatus, getNearestTaskSchedule, resolveTaskScheduleConflict, updateTask, validateTaskSchedule, type TaskTimeConflict } from '../lib/tasksApi'
import { TaskTimeConflictModal, type ScheduleChoice } from './TaskTimeConflictModal'

export function ExistingTaskTimeConflict({ accessToken, date = new Date().toISOString().slice(0, 10), taskId, plan, onResolved }: { accessToken: string; date?: string; taskId?: string; plan?: DailyPlan | null; onResolved?: () => void }) {
  const [conflict, setConflict] = useState<TaskTimeConflict | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const load = useCallback(async () => {
    if (!accessToken) return
    const loadedPlan = plan !== undefined ? plan : (await getDailyPlanAcceptance(accessToken, date))?.plan
    setConflict(loadedPlan?.taskConflicts?.find((item) => !taskId || item.existingTask.id === taskId || item.proposedTask.id === taskId) ?? null)
  }, [accessToken, date, taskId, plan])
  useEffect(() => { void load() }, [load])
  const move = async (side: 'existing' | 'new', mode: 'auto' | 'manual', manual?: ScheduleChoice) => {
    if (!conflict) return
    const target = side === 'existing' ? conflict.existingTask : conflict.proposedTask
    const schedule = mode === 'manual' ? manual : (await getNearestTaskSchedule(accessToken, target)).schedule
    if (!schedule) return
    const validation = await validateTaskSchedule(accessToken, { ...target, ...schedule })
    if (validation.conflicts.length) return
    if (!window.confirm(`Current schedule → Proposed schedule\n${target.scheduledDate} ${target.scheduledStartTime}–${target.scheduledEndTime} → ${schedule.scheduledDate} ${schedule.scheduledStartTime}–${schedule.scheduledEndTime}`)) return
    await updateTask(accessToken, target.id, schedule)
    await resolveTaskScheduleConflict(accessToken, { conflictKey: conflict.id, date, taskId: target.id, resolution: side === 'existing' ? (mode === 'auto' ? 'move_existing_auto' : 'move_existing_manual') : (mode === 'auto' ? 'move_new_auto' : 'move_new_manual') })
    setConflict(null); onResolved?.()
  }
  if (!conflict) return null
  return <><div role="alert" className="mb-3 rounded-xl border border-amber-400/50 bg-amber-400/10 p-3 text-[var(--bp-text)]"><strong>Unresolved Task Time Conflict:</strong> {conflict.existingTask.title} overlaps {conflict.proposedTask.title} by {conflict.overlapMinutes} minutes. {dismissed ? <button className="underline" onClick={() => setDismissed(false)}>Resolve now</button> : null}</div>{!dismissed ? <TaskTimeConflictModal conflict={conflict} onMoveExisting={(mode, schedule) => void move('existing', mode, schedule)} onMoveNew={(mode, schedule) => void move('new', mode, schedule)} onCancelExisting={() => {
    if (!window.confirm('Cancel the existing task? It will be marked missed and not deleted.')) return
    void changeTaskStatus(accessToken, conflict.existingTask.id, { status: 'missed' }).then(() => resolveTaskScheduleConflict(accessToken, { conflictKey: conflict.id, date, taskId: conflict.existingTask.id, resolution: 'cancel_existing' })).then(() => { setConflict(null); onResolved?.() })
  }} onCancelNew={() => setDismissed(true)} onCancelChanges={() => setDismissed(true)} /> : null}</>
}
