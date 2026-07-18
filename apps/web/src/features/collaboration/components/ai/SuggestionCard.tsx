import { SecondaryButton, OutlineButton } from '../../../../components/layout/Buttons'
import type { Suggestion } from '../../api/ai-collaboration.api'

type Props = {
  suggestion: Suggestion
  onApprove: () => void
  onDismiss: () => void
  approving: boolean
  dismissing: boolean
}

const RESOLVED_META: Record<string, string> = {
  approved: 'Approved',
  dismissed: 'Dismissed',
  auto_resolved: 'Resolved automatically',
}

const KIND_LABEL: Record<Suggestion['kind'], string> = {
  ahead_of_pace: 'Ahead of pace',
  inactive_member: 'Quiet member',
  deadline_risk: 'Deadline risk',
  workload_imbalance: 'Workload imbalance',
}

/** One suggestion card. Pending suggestions get Approve/Dismiss; resolved
 * ones render de-emphasized with their resolution state. */
export function SuggestionCard({ suggestion, onApprove, onDismiss, approving, dismissing }: Props) {
  const isPending = suggestion.status === 'pending'

  return (
    <li
      className={`rounded-xl border p-3 ${
        isPending ? 'border-[var(--bp-border)]' : 'border-[var(--bp-border)]/60 opacity-60'
      }`}
    >
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-[var(--bp-accent)]/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[var(--bp-accent)]">
          {KIND_LABEL[suggestion.kind]}
        </span>
        {!isPending ? (
          <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">
            {RESOLVED_META[suggestion.status] ?? suggestion.status}
          </span>
        ) : null}
      </div>
      <p className="text-sm font-bold text-[var(--bp-text)]">{suggestion.title}</p>
      <p className="mt-1 text-sm text-slate-400">{suggestion.message}</p>
      <p className="mt-1 text-[11px] text-slate-500">Why: {suggestion.reason}</p>

      {isPending ? (
        <div className="mt-3 flex justify-end gap-2">
          <OutlineButton size="sm" disabled={dismissing || approving} onClick={onDismiss}>
            {dismissing ? 'Dismissing…' : 'Dismiss'}
          </OutlineButton>
          <SecondaryButton size="sm" disabled={dismissing || approving} onClick={onApprove}>
            {approving ? 'Approving…' : 'Approve'}
          </SecondaryButton>
        </div>
      ) : null}
    </li>
  )
}
