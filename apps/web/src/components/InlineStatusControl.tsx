import type { TaskStatus } from './TaskStatusWorkflowModal'

const STATUS_ORDER: TaskStatus[] = ['To Do', 'In Progress', 'Done', 'Missed']

/**
 * "Simple" statuses carry no extra data and can be applied inline. Done/Missed
 * need metadata (completion date / missed reason), so they route to the modal.
 */
export function statusNeedsMetadata(status: TaskStatus): boolean {
  return status === 'Done' || status === 'Missed'
}

type InlineStatusControlProps = {
  status: TaskStatus
  /** Dependency guard: a blocked task can't be started or completed. */
  blocked?: boolean
  /** Permission guard: viewers can't change status. */
  disabled?: boolean
  /** A change is in flight. */
  busy?: boolean
  /** Apply a simple status (To Do / In Progress) directly. */
  onSimpleChange: (status: TaskStatus) => void
  /** Open the metadata modal for Done / Missed. */
  onNeedsMetadata: (status: TaskStatus) => void
}

/**
 * Inline segmented control for changing a task's status without the modal.
 * To Do / In Progress apply immediately; Done / Missed open the richer modal
 * because they need extra input. Respects dependency and permission guards.
 */
export function InlineStatusControl({
  status,
  blocked = false,
  disabled = false,
  busy = false,
  onSimpleChange,
  onNeedsMetadata,
}: InlineStatusControlProps) {
  return (
    <div role="group" aria-label="Change status" className="inline-flex flex-wrap gap-1 rounded-xl border border-[var(--bp-border)] bg-[var(--bp-bg)] p-1">
      {STATUS_ORDER.map((option) => {
        const isCurrent = option === status
        // Starting or completing a dependency-blocked task is disallowed unless
        // it's already in that state.
        const blockedByDeps = blocked && (option === 'In Progress' || option === 'Done') && !isCurrent
        const isDisabled = disabled || busy || blockedByDeps

        return (
          <button
            key={option}
            type="button"
            aria-pressed={isCurrent}
            disabled={isDisabled}
            title={blockedByDeps ? 'Complete this task’s dependencies first.' : undefined}
            onClick={() => {
              if (isCurrent) return
              if (statusNeedsMetadata(option)) onNeedsMetadata(option)
              else onSimpleChange(option)
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
              isCurrent
                ? 'bg-[var(--bp-accent)] text-[var(--bp-accent-text)]'
                : 'text-[var(--bp-muted)] hover:bg-[var(--bp-surface)] hover:text-[var(--bp-text)]'
            }`}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}
