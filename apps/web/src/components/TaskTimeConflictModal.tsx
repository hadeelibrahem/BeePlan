import { useEffect, useRef, useState } from 'react'
import type { ScheduledTaskCandidate, TaskTimeConflict } from '../lib/tasksApi'

export function TaskTimeConflictModal({ conflict, busy, onMoveExisting, onMoveNew, onCancelExisting, onCancelNew, onCancelChanges }: {
  conflict: TaskTimeConflict | null
  busy?: boolean
  onMoveExisting: (mode: 'auto' | 'manual', schedule?: ScheduleChoice) => void
  onMoveNew: (mode: 'auto' | 'manual', schedule?: ScheduleChoice) => void
  onCancelExisting: () => void
  onCancelNew: () => void
  onCancelChanges: () => void
}) {
  const first = useRef<HTMLButtonElement>(null)
  const [moving, setMoving] = useState<'existing' | 'new' | null>(null)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  useEffect(() => { if (conflict) first.current?.focus() }, [conflict])
  if (!conflict) return null
  const target = moving === 'existing' ? conflict.existingTask : conflict.proposedTask
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onKeyDown={(event) => event.key === 'Escape' && onCancelChanges()}>
    <section role="dialog" aria-modal="true" aria-labelledby="task-time-conflict-title" aria-describedby="task-time-conflict-description" className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-5 text-start">
      <h2 id="task-time-conflict-title" className="text-xl font-black text-[var(--bp-text)]">Task Time Conflict</h2>
      <p id="task-time-conflict-description" className="mt-2 text-[var(--bp-muted)]">These two tasks are scheduled at the same time. What would you like to do?</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><TaskBlock label="Existing Task" task={conflict.existingTask} /><TaskBlock label="New or Edited Task" task={conflict.proposedTask} /></div>
      <p className="mt-3 font-bold text-red-300">Exact overlap: {conflict.overlapMinutes} minutes</p>
      {moving ? <div className="mt-4 rounded-xl border border-[var(--bp-border)] p-3">
        <p className="font-black text-[var(--bp-text)]">Where should “{target.title}” move?</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => moving === 'existing' ? onMoveExisting('auto') : onMoveNew('auto')} className="rounded-lg bg-[var(--bp-accent)] px-3 py-2 font-bold">Move automatically to nearest available slot</button>
          <label className="text-xs text-[var(--bp-muted)]">Date<input aria-label="Move date" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="block rounded border bg-transparent p-2 text-[var(--bp-text)]" /></label>
          <label className="text-xs text-[var(--bp-muted)]">Start time<input aria-label="Move start time" type="time" value={time} onChange={(event) => setTime(event.target.value)} className="block rounded border bg-transparent p-2 text-[var(--bp-text)]" /></label>
          <button type="button" disabled={busy || !date || !time} onClick={() => {
            const end = addMinutes(time, target.durationMinutes)
            const schedule = { scheduledDate: date, scheduledStartTime: time, scheduledEndTime: end }
            moving === 'existing' ? onMoveExisting('manual', schedule) : onMoveNew('manual', schedule)
          }} className="rounded-lg border px-3 py-2 font-bold text-[var(--bp-text)]">Preview manual move</button>
        </div>
      </div> : null}
      <div className="mt-5 grid gap-2">
        <button ref={first} type="button" onClick={() => setMoving('existing')} className="rounded-xl bg-[var(--bp-accent)] px-4 py-3 font-black">Move Existing Task</button>
        <button type="button" onClick={() => setMoving('new')} className="rounded-xl border px-4 py-3 font-black text-[var(--bp-text)]">Move New Task</button>
        <button type="button" onClick={onCancelExisting} className="rounded-xl border border-red-500/50 px-4 py-3 font-black text-red-300">Cancel Existing Task</button>
        <button type="button" onClick={onCancelNew} className="rounded-xl border px-4 py-3 font-black text-[var(--bp-text)]">Cancel New Task</button>
        <button type="button" onClick={onCancelChanges} className="rounded-xl px-4 py-2 font-bold text-[var(--bp-muted)]">Cancel Changes</button>
      </div>
    </section>
  </div>
}

export type ScheduleChoice = { scheduledDate: string; scheduledStartTime: string; scheduledEndTime: string }

function TaskBlock({ label, task }: { label: string; task: ScheduledTaskCandidate }) {
  return <div className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-bg)] p-3"><p className="text-xs font-black uppercase text-[var(--bp-muted)]">{label}</p><p className="font-black text-[var(--bp-text)]">{task.title}</p><p className="text-sm text-[var(--bp-muted)]">{task.scheduledDate} · {task.scheduledStartTime}–{task.scheduledEndTime}</p><p className="text-xs text-[var(--bp-muted)]">{task.durationMinutes} min · Priority: {task.priority} · Due: {task.dueDate ?? 'None'}</p></div>
}

function addMinutes(start: string, duration: number) {
  const [hour, minute] = start.split(':').map(Number)
  const total = hour * 60 + minute + duration
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
