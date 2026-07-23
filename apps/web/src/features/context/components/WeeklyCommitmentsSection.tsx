import { useState } from 'react'
import { SectionCard } from '../../../components/layout'
import { ConfirmDestructiveModal } from '../../../components/ConfirmDestructiveModal'
import { formatDays, formatTimeRange } from '../dayOfWeek'
import { useCommitmentMutations, useCommitments, useSavedPlaces } from '../hooks'
import type { RecurringCommitment, RecurringCommitmentInput } from '../types'
import { CommitmentEditorModal } from './CommitmentEditorModal'

type Props = { accessToken: string | undefined }

/**
 * "Weekly Commitments" section. Each row shows the recurring block; an active
 * toggle disables it temporarily; the AI planner enforces active commitments as
 * hard busy time.
 */
export function WeeklyCommitmentsSection({ accessToken }: Props) {
  const { data: commitments = [], isLoading } = useCommitments(accessToken)
  const { data: places = [] } = useSavedPlaces(accessToken)
  const { create, update, remove } = useCommitmentMutations(accessToken)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<RecurringCommitment | null>(null)
  const [toDelete, setToDelete] = useState<RecurringCommitment | null>(null)

  const openCreate = () => {
    setEditing(null)
    setEditorOpen(true)
  }
  const openEdit = (commitment: RecurringCommitment) => {
    setEditing(commitment)
    setEditorOpen(true)
  }

  const handleSubmit = (input: RecurringCommitmentInput) => {
    const mutation = editing
      ? update.mutateAsync({ id: editing.id, input })
      : create.mutateAsync(input)
    void mutation.then(() => setEditorOpen(false))
  }

  const toggleActive = (commitment: RecurringCommitment) => {
    void update.mutateAsync({ id: commitment.id, input: { isActive: !commitment.isActive } })
  }

  return (
    <SectionCard>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-black text-[var(--bp-text)]">Weekly Commitments</h3>
          <p className="text-xs text-[var(--bp-muted)]">Fixed recurring time the planner keeps clear.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          aria-label="Add commitment"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bp-accent)] text-lg font-black text-black hover:opacity-90"
        >
          +
        </button>
      </div>

      {isLoading ? (
        <p className="py-4 text-sm text-[var(--bp-muted)]">Loading…</p>
      ) : commitments.length === 0 ? (
        <p className="py-4 text-sm text-[var(--bp-muted)]">
          No commitments yet. Add classes, work shifts, or anything recurring.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--bp-border)]">
          {commitments.map((commitment) => (
            <li key={commitment.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-bold ${commitment.isActive ? 'text-[var(--bp-text)]' : 'text-[var(--bp-muted)] line-through'}`}>
                  {commitment.title}
                </p>
                <p className="truncate text-xs text-[var(--bp-muted)]">
                  {formatDays(commitment.daysOfWeek)} · {formatTimeRange(commitment.startTime, commitment.endTime)}
                  {commitment.savedLocationName ? ` · ${commitment.savedLocationName}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => toggleActive(commitment)}
                aria-label={commitment.isActive ? `Disable ${commitment.title}` : `Enable ${commitment.title}`}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  commitment.isActive ? 'bg-[var(--bp-accent)]/15 text-[var(--bp-accent)]' : 'bg-[var(--bp-bg)] text-[var(--bp-muted)]'
                }`}
              >
                {commitment.isActive ? 'Active' : 'Paused'}
              </button>
              <button
                type="button"
                onClick={() => openEdit(commitment)}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-[var(--bp-muted)] hover:bg-[var(--bp-bg)] hover:text-[var(--bp-text)]"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setToDelete(commitment)}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/10"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      {editorOpen ? (
        <CommitmentEditorModal
          open={editorOpen}
          initial={editing}
          places={places}
          saving={create.isPending || update.isPending}
          onClose={() => setEditorOpen(false)}
          onSubmit={handleSubmit}
        />
      ) : null}

      <ConfirmDestructiveModal
        open={Boolean(toDelete)}
        title="Delete commitment?"
        message={toDelete ? `"${toDelete.title}" will no longer block time in your plans.` : ''}
        confirmLabel="Delete"
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) void remove.mutateAsync(toDelete.id).finally(() => setToDelete(null))
        }}
      />
    </SectionCard>
  )
}
