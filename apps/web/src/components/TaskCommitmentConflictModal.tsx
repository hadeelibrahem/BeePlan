import type { TaskCommitmentConflict } from '../lib/tasksApi'

type Props = {
  conflict: TaskCommitmentConflict | null
  busy?: boolean
  onKeepCommitment: () => void
  onKeepTask: () => void
  onChooseAnotherTime: () => void
  onCancel: () => void
}

export function TaskCommitmentConflictModal({ conflict, busy, onKeepCommitment, onKeepTask, onChooseAnotherTime, onCancel }: Props) {
  if (!conflict) return null
  const { proposedTask: task, commitment } = conflict
  return <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/65 p-4" role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby="task-commitment-title" aria-describedby="task-commitment-message" className="w-full max-w-xl rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-5 text-start shadow-2xl">
      <h2 id="task-commitment-title" className="text-xl font-black text-[var(--bp-text)]">Task conflicts with a fixed commitment</h2>
      <p id="task-commitment-message" className="mt-2 text-sm text-[var(--bp-muted)]">This task overlaps with a recurring commitment from your Settings.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Block label="Task" title={task.title} date={task.scheduledDate} start={task.scheduledStartTime} end={task.scheduledEndTime} />
        <Block label="Commitment" title={commitment.title} date={commitment.date} start={commitment.startTime} end={commitment.endTime} />
      </div>
      <p className="mt-3 rounded-xl bg-red-500/10 p-3 font-bold text-red-300">Conflict duration: {conflict.overlapMinutes} minutes</p>
      <div className="mt-5 grid gap-2">
        <button autoFocus disabled={busy} onClick={onKeepCommitment} className="rounded-xl bg-[var(--bp-accent)] px-4 py-3 font-black text-[var(--bp-accent-text)]">Keep Commitment (Recommended)</button>
        <button disabled={busy} onClick={onKeepTask} className="rounded-xl border border-[var(--bp-border)] px-4 py-3 font-black text-[var(--bp-text)]">Keep Task</button>
        <button disabled={busy} onClick={onChooseAnotherTime} className="rounded-xl border border-[var(--bp-border)] px-4 py-3 font-black text-[var(--bp-text)]">Choose Another Time</button>
        <button disabled={busy} onClick={onCancel} className="rounded-xl px-4 py-2 font-bold text-[var(--bp-muted)]">Cancel</button>
      </div>
    </section>
  </div>
}

function Block({ label, title, date, start, end }: { label: string; title: string; date: string; start: string; end: string }) {
  return <div className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-bg)] p-3"><p className="text-xs font-black uppercase text-[var(--bp-muted)]">{label}</p><p className="font-black text-[var(--bp-text)]">{title}</p><p className="text-sm text-[var(--bp-muted)]">{date} · {start}–{end}</p></div>
}
