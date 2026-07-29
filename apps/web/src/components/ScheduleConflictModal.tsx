import { useEffect, useRef } from 'react'
import type { ScheduleConflict } from '../lib/plannerApi'

type Props = {
  conflict: ScheduleConflict | null
  oldTime?: { startTime: string; endTime: string }
  date?: string
  proposedTime?: { date: string; startTime: string; endTime: string }
  busy?: boolean
  onKeepCommitment: () => void
  onKeepTask: () => void
  onManual: () => void
  onPostponeTask?: () => void
  onCancelTask?: () => void
  onCancel: () => void
}

export function ScheduleConflictModal({
  conflict,
  oldTime,
  date,
  busy,
  onKeepCommitment,
  onKeepTask,
  onManual,
  onPostponeTask,
  onCancelTask,
  onCancel,
}: Props) {
  const recommendedRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (conflict) recommendedRef.current?.focus()
  }, [conflict])
  if (!conflict) return null

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-conflict-title"
        aria-describedby="schedule-conflict-description"
        className="max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-5 text-start shadow-2xl"
      >
        <h2 id="schedule-conflict-title" className="text-xl font-black text-[var(--bp-text)]">
          Schedule Conflict
        </h2>
        <p id="schedule-conflict-description" className="mt-2 text-sm text-[var(--bp-muted)]">
          This task overlaps with your fixed commitment.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <ConflictBlock label="Task" title={conflict.task.title} start={conflict.task.startTime} end={conflict.task.endTime} date={date} changed />
          <ConflictBlock label="Commitment" title={conflict.commitment.title} start={conflict.commitment.startTime} end={conflict.commitment.endTime} date={date} />
        </div>
        <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-sm font-bold text-red-300">
          Conflict duration: {conflict.conflictMinutes} minutes
        </p>

        <div className="mt-4 rounded-xl border border-[var(--bp-border)] bg-[var(--bp-bg)] p-3">
          <p className="text-xs font-black uppercase tracking-wide text-[var(--bp-muted)]">Preview</p>
          <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
            <div>
              <p className="text-[10px] font-black uppercase text-[var(--bp-muted)]">Old Schedule</p>
              <p className="font-bold text-[var(--bp-text)]">{oldTime ? `${oldTime.startTime}–${oldTime.endTime}` : 'Unchanged plan'}</p>
            </div>
            <span aria-hidden className="text-[var(--bp-accent)]">↓</span>
            <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-2">
              <p className="text-[10px] font-black uppercase text-amber-300">New Schedule</p>
              <p className="font-bold text-[var(--bp-text)]">{conflict.task.startTime}–{conflict.task.endTime}</p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-2">
          <button ref={recommendedRef} type="button" disabled={busy} onClick={onKeepCommitment} className="rounded-xl bg-[var(--bp-accent)] px-4 py-3 text-sm font-black text-[var(--bp-accent-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bp-accent)]">
            Keep Commitment (Recommended)
          </button>
          <button type="button" disabled={busy} onClick={onKeepTask} className="rounded-xl border border-[var(--bp-border)] px-4 py-3 text-sm font-black text-[var(--bp-text)] focus-visible:ring-2 focus-visible:ring-[var(--bp-accent)]">
            Keep Task
          </button>
          <button type="button" disabled={busy} onClick={onManual} className="rounded-xl border border-[var(--bp-border)] px-4 py-3 text-sm font-black text-[var(--bp-text)] focus-visible:ring-2 focus-visible:ring-[var(--bp-accent)]">
            Reschedule Manually
          </button>
          {onPostponeTask ? <button type="button" disabled={busy} onClick={onPostponeTask} className="rounded-xl border border-[var(--bp-border)] px-4 py-3 text-sm font-black text-[var(--bp-text)]">Postpone Task</button> : null}
          {onCancelTask ? <button type="button" disabled={busy} onClick={onCancelTask} className="rounded-xl border border-red-500/50 px-4 py-3 text-sm font-black text-red-300">Cancel Task</button> : null}
          <button type="button" disabled={busy} onClick={onCancel} className="rounded-xl px-4 py-2 text-sm font-bold text-[var(--bp-muted)] focus-visible:ring-2 focus-visible:ring-[var(--bp-accent)]">
            Cancel
          </button>
        </div>
      </section>
    </div>
  )
}

function ConflictBlock({ label, title, start, end, date, changed = false }: { label: string; title: string; start: string; end: string; date?: string; changed?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${changed ? 'border-amber-400/40 bg-amber-400/10' : 'border-[var(--bp-border)] bg-[var(--bp-bg)]'}`}>
      <p className="text-[10px] font-black uppercase text-[var(--bp-muted)]">{label}</p>
      <p className="mt-1 font-black text-[var(--bp-text)]">{title}</p>
      {date ? <p className="text-xs text-[var(--bp-muted)]">{date}</p> : null}
      <p className="text-sm text-[var(--bp-muted)]">{start}–{end}</p>
    </div>
  )
}
