import type { SubtaskFilter } from '../../../lib/subtaskDisplay'

export type SubtaskMemberOption = { userId: string; name: string }

type Props = {
  filter: SubtaskFilter
  onFilterChange: (filter: SubtaskFilter) => void
  /** Owner-only filters (By Member) are hidden for non-owners. */
  isOwner: boolean
  memberOptions: SubtaskMemberOption[]
  memberId: string
  onMemberChange: (memberId: string) => void
}

const BASE_CHIPS: { value: SubtaskFilter; label: string }[] = [
  { value: 'mine', label: 'My Tasks' },
  { value: 'team', label: 'All Team Tasks' },
  { value: 'shared', label: 'Shared' },
  { value: 'unassigned', label: 'Unassigned' },
]

/**
 * Filter chips for the subtask list. The backend already restricts what each
 * role receives (an editor never gets another member's personal subtasks), so
 * these chips only refine an already-authorized set. "By Member" is owner-only.
 */
export function SubtaskVisibilityFilter({
  filter,
  onFilterChange,
  isOwner,
  memberOptions,
  memberId,
  onMemberChange,
}: Props) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      {BASE_CHIPS.map((chip) => (
        <button
          key={chip.value}
          type="button"
          onClick={() => onFilterChange(chip.value)}
          className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
            filter === chip.value
              ? 'bg-[var(--bp-accent)] text-black'
              : 'border border-[var(--bp-border)] text-slate-400 hover:text-[var(--bp-text)]'
          }`}
        >
          {chip.label}
        </button>
      ))}

      {isOwner && memberOptions.length ? (
        <select
          aria-label="Filter subtasks by member"
          value={filter === 'member' ? memberId : ''}
          onChange={(event) => {
            const value = event.target.value
            if (value) {
              onMemberChange(value)
              onFilterChange('member')
            } else {
              onFilterChange('team')
            }
          }}
          className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
            filter === 'member'
              ? 'border-[var(--bp-accent)] text-[var(--bp-accent)]'
              : 'border-[var(--bp-border)] text-slate-400'
          } bg-[var(--bp-bg)]`}
        >
          <option value="">By Member…</option>
          {memberOptions.map((option) => (
            <option key={option.userId} value={option.userId}>
              {option.name}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  )
}
