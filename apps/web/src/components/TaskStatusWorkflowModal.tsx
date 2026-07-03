import { useEffect, useMemo, useState } from 'react'
import { PrimaryButton, SecondaryButton } from './layout'

export type TaskStatus = 'To Do' | 'In Progress' | 'Done' | 'Missed'

type TaskStatusWorkflowModalProps = {
  open: boolean
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
  title: string
  description: string
  tone: string
}[] = [
  {
    value: 'To Do',
    icon: 'TD',
    title: 'To Do',
    description: 'Task has not been started yet.',
    tone: 'text-slate-300',
  },
  {
    value: 'In Progress',
    icon: 'IP',
    title: 'In Progress',
    description: 'Task is currently being worked on.',
    tone: 'text-blue-300',
  },
  {
    value: 'Done',
    icon: 'DN',
    title: 'Done',
    description: 'Task has been completed successfully.',
    tone: 'text-green-300',
  },
  {
    value: 'Missed',
    icon: 'MS',
    title: 'Missed',
    description: 'Task was not completed before its due date.',
    tone: 'text-red-300',
  },
]

export function TaskStatusWorkflowModal({
  open,
  status,
  progress,
  onClose,
  onSave,
}: TaskStatusWorkflowModalProps) {
  const [selectedStatus, setSelectedStatus] = useState<TaskStatus>(status)
  const [progressValue, setProgressValue] = useState(progress)
  const [completionDate, setCompletionDate] = useState('')
  const [missedReason, setMissedReason] = useState('')

  useEffect(() => {
    if (!open) return

    setSelectedStatus(status)
    setProgressValue(progress)
    setCompletionDate('')
    setMissedReason('')
  }, [open, progress, status])

  const helperText = useMemo(() => {
    if (selectedStatus === 'Done') return 'Completion details will be saved with this status.'
    if (selectedStatus === 'Missed') return 'Add a short reason so the timeline stays useful.'
    return 'Adjust progress before saving if the task moved forward.'
  }, [selectedStatus])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 px-4 py-0 backdrop-blur-[2px] md:items-center md:py-8">
      <div className="w-full max-w-xl animate-[statusSheetIn_180ms_ease-out] rounded-t-[28px] border border-[var(--bp-border)] bg-[var(--bp-surface-elevated)] p-5 shadow-2xl md:rounded-[28px] md:p-6">
        <div className="mx-auto mb-5 h-1.5 w-14 rounded-full bg-[var(--bp-border)]" />

        <header className="mb-5 text-center">
          <h2 className="text-2xl font-black text-[var(--bp-text)]">Change Status</h2>
          <p className="mt-2 text-sm text-[var(--bp-muted)]">Select the current status of this task</p>
        </header>

        <div className="space-y-3">
          {statusOptions.map((option) => {
            const isSelected = selectedStatus === option.value

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setSelectedStatus(option.value)}
                className={`flex w-full items-center gap-4 rounded-[20px] border p-4 text-start transition duration-200 active:scale-[0.99] ${
                  isSelected
                    ? 'border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] shadow-lg shadow-black/20'
                    : 'border-[var(--bp-border)] bg-[var(--bp-bg)] hover:border-[var(--bp-accent)]/50'
                }`}
                aria-pressed={isSelected}
              >
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-xs font-black ${
                    isSelected
                      ? 'border-[var(--bp-accent)] bg-[var(--bp-accent)] text-[var(--bp-accent-text)]'
                      : `border-[var(--bp-border)] bg-[var(--bp-surface)] ${option.tone}`
                  }`}
                >
                  {option.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-black text-[var(--bp-text)]">{option.title}</span>
                  <span className="mt-1 block text-sm leading-5 text-[var(--bp-muted)]">{option.description}</span>
                </span>
                <span
                  className={`h-5 w-5 rounded-full border transition ${
                    isSelected ? 'border-[var(--bp-accent)] bg-[var(--bp-accent)]' : 'border-[var(--bp-border)]'
                  }`}
                />
              </button>
            )
          })}
        </div>

        <section className="mt-5 rounded-[20px] border border-[var(--bp-border)] bg-[var(--bp-bg)] p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-[var(--bp-text)]">Progress Percentage</p>
              <p className="mt-1 text-xs text-[var(--bp-muted)]">{helperText}</p>
            </div>
            <span className="text-2xl font-black text-[var(--bp-accent)]">{progressValue}%</span>
          </div>

          <input
            aria-label="Progress percentage"
            type="range"
            min="0"
            max="100"
            value={progressValue}
            onChange={(event) => setProgressValue(Number(event.target.value))}
            className="w-full accent-[var(--bp-accent)]"
          />

          {selectedStatus === 'Done' ? (
            <label className="mt-4 block">
              <span className="text-xs font-black uppercase tracking-wide text-[var(--bp-muted)]">Completion Date</span>
              <input
                type="date"
                value={completionDate}
                onChange={(event) => setCompletionDate(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-4 py-3 text-sm font-semibold text-[var(--bp-text)] outline-none transition focus:border-[var(--bp-accent)]"
              />
            </label>
          ) : null}

          {selectedStatus === 'Missed' ? (
            <label className="mt-4 block">
              <span className="text-xs font-black uppercase tracking-wide text-[var(--bp-muted)]">Missed Reason</span>
              <textarea
                value={missedReason}
                onChange={(event) => setMissedReason(event.target.value)}
                placeholder="Add a short reason..."
                rows={3}
                className="mt-2 w-full resize-none rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-4 py-3 text-sm font-semibold text-[var(--bp-text)] outline-none transition placeholder:text-[var(--bp-placeholder)] focus:border-[var(--bp-accent)]"
              />
            </label>
          ) : null}
        </section>

        <footer className="mt-5 grid grid-cols-2 gap-3">
          <SecondaryButton onClick={onClose} className="w-full">
            Cancel
          </SecondaryButton>
          <PrimaryButton
            onClick={() =>
              onSave({
                status: selectedStatus,
                progress: progressValue,
                completionDate,
                missedReason,
              })
            }
            className="w-full"
          >
            Save Status
          </PrimaryButton>
        </footer>
      </div>
    </div>
  )
}
