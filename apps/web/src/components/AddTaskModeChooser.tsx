type AddTaskModeChooserProps = {
  onClose: () => void
  onManual: () => void
  onAiPlan: () => void
}

/**
 * Modal that lets the user pick how to create a task — manually or via the AI
 * planner. Shared by the Dashboard and All Tasks screens so the "Add Task"
 * entry point behaves identically wherever it's opened.
 */
export function AddTaskModeChooser({ onClose, onManual, onAiPlan }: AddTaskModeChooserProps) {
  const manualRef = useRef<HTMLButtonElement>(null)
  return (
    <Modal open title="Add Task" description="Choose how you want to plan this task." onClose={onClose} initialFocusRef={manualRef}>
      <div className="mt-4">
        <button
          ref={manualRef}
          type="button"
          onClick={onManual}
          className="mb-3 w-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-bg)] px-4 py-3.5 text-start transition hover:border-[var(--bp-accent)]/60"
        >
          <p className="font-bold text-[var(--bp-text)]">Manual Task</p>
          <p className="mt-1 text-xs text-slate-400">Fill in the task details yourself.</p>
        </button>

        <button
          type="button"
          onClick={onAiPlan}
          className="w-full rounded-xl border border-[var(--bp-accent)]/40 bg-[var(--bp-accent)]/10 px-4 py-3.5 text-start transition hover:border-[var(--bp-accent)]"
        >
          <p className="font-bold text-[var(--bp-accent)]">AI Plan Task</p>
          <p className="mt-1 text-xs text-slate-400">
            Describe a big goal and let AI break it into subtasks, focus sessions, and reminders.
          </p>
        </button>
      </div>
    </Modal>
  )
}
import { useRef } from 'react'
import { Modal } from './layout/Modal'
