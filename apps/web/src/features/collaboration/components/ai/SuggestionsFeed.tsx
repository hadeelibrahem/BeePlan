import { useState } from 'react'
import { SectionCard } from '../../../../components/layout/SectionCard'
import { EmptyState } from '../../../../components/layout/EmptyState'
import {
  useApproveSuggestionMutation,
  useDismissSuggestionMutation,
  useSuggestionsQuery,
} from '../../api/ai-collaboration.api'
import { friendlyError } from '../../errorMessages'
import { Toast } from '../Toast'
import { SuggestionCard } from './SuggestionCard'

type Props = {
  taskId: string
  accessToken: string
}

/** One card per suggestion. The owner always approves or dismisses — nothing
 * here changes the task on its own. */
export function SuggestionsFeed({ taskId, accessToken }: Props) {
  const suggestionsQuery = useSuggestionsQuery(taskId, accessToken)
  const approveMutation = useApproveSuggestionMutation(taskId, accessToken)
  const dismissMutation = useDismissSuggestionMutation(taskId, accessToken)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  if (suggestionsQuery.isLoading) {
    return (
      <SectionCard>
        <p className="text-sm text-slate-400">Loading suggestions…</p>
      </SectionCard>
    )
  }

  const items = suggestionsQuery.data?.items ?? []
  if (!items.length) {
    return (
      <SectionCard>
        <EmptyState
          icon={<span>💡</span>}
          title="No suggestions right now"
          description="The AI will surface ideas here when it notices something worth adjusting — like an uneven load or a quiet member."
        />
      </SectionCard>
    )
  }

  const pending = items.filter((s) => s.status === 'pending')
  const resolved = items.filter((s) => s.status !== 'pending')

  async function handleApprove(id: string) {
    setBusyId(id)
    setError('')
    try {
      await approveMutation.mutateAsync(id)
    } catch (err) {
      setError(friendlyError(err, 'Could not approve this suggestion. Please try again.'))
    } finally {
      setBusyId(null)
    }
  }

  async function handleDismiss(id: string) {
    setBusyId(id)
    setError('')
    try {
      await dismissMutation.mutateAsync(id)
    } catch (err) {
      setError(friendlyError(err, 'Could not dismiss this suggestion. Please try again.'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      <SectionCard>
        <h3 className="mb-3 text-[10px] font-black uppercase tracking-wide text-slate-400">
          Pending ({pending.length})
        </h3>
        {pending.length ? (
          <ul className="space-y-2">
            {pending.map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                approving={busyId === suggestion.id && approveMutation.isPending}
                dismissing={busyId === suggestion.id && dismissMutation.isPending}
                onApprove={() => void handleApprove(suggestion.id)}
                onDismiss={() => void handleDismiss(suggestion.id)}
              />
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-400">Nothing pending — you're all caught up.</p>
        )}
      </SectionCard>

      {resolved.length ? (
        <SectionCard>
          <h3 className="mb-3 text-[10px] font-black uppercase tracking-wide text-slate-400">Resolved</h3>
          <ul className="space-y-2">
            {resolved.map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                approving={false}
                dismissing={false}
                onApprove={() => {}}
                onDismiss={() => {}}
              />
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <Toast message={error} tone="error" onDone={() => setError('')} />
    </div>
  )
}
