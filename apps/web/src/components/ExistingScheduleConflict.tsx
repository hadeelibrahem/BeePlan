import { useCallback, useEffect, useState } from 'react'
import { acceptDailyPlan, generateDailyPlan, getDailyPlanAcceptance, resolveScheduleConflict, skipCommitmentOccurrence, type DailyPlan, type ScheduleConflict } from '../lib/plannerApi'
import { changeTaskStatus } from '../lib/tasksApi'
import { ScheduleConflictModal } from './ScheduleConflictModal'

export function ExistingScheduleConflict({ accessToken, date = new Date().toISOString().slice(0, 10), taskId, onResolved }: {
  accessToken: string
  date?: string
  taskId?: string
  onResolved?: () => void
}) {
  const [conflict, setConflict] = useState<ScheduleConflict | null>(null)
  const [plan, setPlan] = useState<DailyPlan | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [postponing, setPostponing] = useState(false)
  const [newDate, setNewDate] = useState(date)
  const [newTime, setNewTime] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!accessToken) return
    const accepted = await getDailyPlanAcceptance(accessToken, date)
    const found = accepted?.plan.conflicts.find((item) => !taskId || item.task.taskId === taskId) ?? null
    setPlan(accepted?.plan ?? null)
    setConflict(found)
    if (found) setDismissed(false)
  }, [accessToken, date, taskId])

  useEffect(() => { void load() }, [load])

  const persist = async (resolution: 'keep_commitment' | 'keep_task' | 'postpone_task' | 'cancel_task') => {
    if (!conflict) return
    await resolveScheduleConflict(accessToken, {
      conflictKey: conflict.id,
      date,
      taskId: conflict.task.taskId,
      commitmentId: conflict.commitment.id,
      resolution,
    })
    setConflict(null)
    setDismissed(false)
    onResolved?.()
  }

  const keepCommitment = async () => {
    if (!conflict || !plan) return
    setBusy(true); setError('')
    try {
      const locks = Object.values(plan.sections).flat()
        .filter((item) => (item.type === 'task' || item.type === 'reminder') && item.id !== conflict.task.itemId)
        .map((item) => ({ taskId: item.taskId, reminderId: item.reminderId, startTime: item.startTime, endTime: item.endTime }))
      const proposed = await generateDailyPlan(accessToken, { date, lockedItems: locks })
      const moved = Object.values(proposed.sections).flat().find((item) => item.taskId === conflict.task.taskId)
      if (!moved) throw new Error('No valid free slot was found.')
      if (!window.confirm(`Proposed schedule: ${date} ${moved.startTime}–${moved.endTime}. Apply this change?`)) return
      await acceptDailyPlan(accessToken, proposed)
      await persist('keep_commitment')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to move the task.')
    } finally { setBusy(false) }
  }

  const keepTask = async () => {
    if (!conflict) return
    setBusy(true)
    try {
      await skipCommitmentOccurrence(accessToken, conflict.commitment.id, date)
      await persist('keep_task')
    } finally { setBusy(false) }
  }

  const postpone = async () => {
    if (!conflict || !newDate || !newTime) return
    setBusy(true); setError('')
    try {
      const duration = conflict.task.durationMinutes
      const start = clockMinutes(newTime)
      const end = `${String(Math.floor((start + duration) / 60)).padStart(2, '0')}:${String((start + duration) % 60).padStart(2, '0')}`
      if (start + duration >= 24 * 60) throw new Error('The selected task time must end on the same day.')
      const proposed = await generateDailyPlan(accessToken, {
        date: newDate,
        lockedItems: [{ taskId: conflict.task.taskId, startTime: newTime, endTime: end }],
      })
      if (proposed.conflicts.some((item) => item.task.taskId === conflict.task.taskId)) throw new Error('That slot overlaps another fixed commitment.')
      if (!window.confirm(`Move this task to ${newDate} ${newTime}–${end}?`)) return
      await acceptDailyPlan(accessToken, proposed)
      await persist('postpone_task')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to postpone the task.')
    } finally { setBusy(false) }
  }

  const cancelTask = async () => {
    if (!conflict?.task.taskId || !window.confirm('Cancel this task? It will be marked missed and will not be deleted.')) return
    setBusy(true)
    try {
      await changeTaskStatus(accessToken, conflict.task.taskId, { status: 'missed' })
      await persist('cancel_task')
    } finally { setBusy(false) }
  }

  if (!conflict) return null
  return <>
    <div role="alert" className="mb-4 rounded-xl border border-amber-400/50 bg-amber-400/10 p-3 text-sm text-[var(--bp-text)]">
      <strong>Unresolved Schedule Conflict:</strong> {conflict.task.title} overlaps {conflict.commitment.title} by {conflict.conflictMinutes} minutes.
      {dismissed ? <button type="button" className="ms-2 underline" onClick={() => setDismissed(false)}>Resolve now</button> : null}
      {postponing ? <div className="mt-3 flex flex-wrap items-end gap-2"><label>When would you like to move this task?<input aria-label="New task date" type="date" value={newDate} onChange={(event) => setNewDate(event.target.value)} className="block rounded border bg-transparent p-2" /></label><input aria-label="New task time" type="time" value={newTime} onChange={(event) => setNewTime(event.target.value)} className="rounded border bg-transparent p-2" /><button type="button" onClick={() => void postpone()} className="rounded bg-[var(--bp-accent)] px-3 py-2">Preview</button></div> : null}
      {error ? <p className="mt-2 text-red-300">{error}</p> : null}
    </div>
    {!dismissed ? <ScheduleConflictModal conflict={conflict} date={date} busy={busy} onKeepCommitment={() => void keepCommitment()} onKeepTask={() => void keepTask()} onManual={() => setPostponing(true)} onPostponeTask={() => setPostponing(true)} onCancelTask={() => void cancelTask()} onCancel={() => setDismissed(true)} /> : null}
  </>
}

function clockMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}
