import { useState } from 'react'
import { SectionCard } from '../../../../components/layout/SectionCard'
import {
  useApproveSuggestionMutation,
  useDismissSuggestionMutation,
  useSuggestionsQuery,
  type PlanFocus,
} from '../../api/ai-collaboration.api'
import { friendlyError } from '../../errorMessages'
import { Toast } from '../Toast'
import { SuggestionCard } from './SuggestionCard'
import { RecommendationDetail } from './RecommendationDetail'
import type { OverviewTab } from './OverviewPanel'

type Props = {
  taskId: string
  accessToken: string
  onNavigate: (tab: OverviewTab, focus?: PlanFocus) => void
}

/**
 * The AI Recommendations section of the Overview command centre — the
 * Detect → Explain → Recommend → Preview → Approve/Dismiss loop.
 *
 * Detection, explanation, impact and permissions all come from the backend
 * (`GET /ai/collaboration/suggestions`); this component only renders them,
 * opens the review modal, and calls the existing approve/dismiss endpoints.
 * Resolved recommendations stay visible, collapsed, as a decision record.
 */
export function SuggestionsFeed({ taskId, accessToken, onNavigate }: Props) {
  const suggestionsQuery = useSuggestionsQuery(taskId, accessToken)
  const approveMutation = useApproveSuggestionMutation(taskId, accessToken)
  const dismissMutation = useDismissSuggestionMutation(taskId, accessToken)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [showResolved, setShowResolved] = useState(false)

  const items = suggestionsQuery.data?.items ?? []
  const pending = items.filter((item) => item.status === 'pending')
  const resolved = items.filter((item) => item.status !== 'pending')
  const reviewing = pending.find((item) => item.id === reviewingId) ?? null

  async function handleApprove(id: string, title: string) {
    setBusyId(id)
    setError('')
    try {
      await approveMutation.mutateAsync(id)
      setReviewingId(null)
      setNotice(`Approved — "${title}" has been applied.`)
    } catch (err) {
      setError(friendlyError(err, 'Could not approve this recommendation. Please try again.'))
    } finally {
      setBusyId(null)
    }
  }

  async function handleDismiss(id: string, title: string) {
    setBusyId(id)
    setError('')
    try {
      await dismissMutation.mutateAsync(id)
      setReviewingId(null)
      setNotice(`Dismissed — "${title}" won't be suggested again.`)
    } catch (err) {
      setError(friendlyError(err, 'Could not dismiss this recommendation. Please try again.'))
    } finally {
      setBusyId(null)
    }
  }

  // A quiet surface is the healthy state — don't spend a card saying so while
  // loading, erroring, or when the planner has found nothing to decide.
  if (suggestionsQuery.isLoading) {
    return (
      <SectionCard>
        <h3 className="mb-2 text-[10px] font-black uppercase tracking-wide text-[var(--bp-muted)]">
          AI recommendations
        </h3>
        <p className="text-sm text-[var(--bp-muted)]" role="status" aria-live="polite">
          Looking for decisions that need you…
        </p>
      </SectionCard>
    )
  }

  if (suggestionsQuery.isError) {
    const status = (suggestionsQuery.error as { status?: number })?.status
    if (status === 403) return null
    return (
      <SectionCard>
        <h3 className="mb-2 text-[10px] font-black uppercase tracking-wide text-[var(--bp-muted)]">
          AI recommendations
        </h3>
        <p className="text-sm text-red-300" role="alert">
          {friendlyError(suggestionsQuery.error, 'Could not load recommendations.')}
        </p>
      </SectionCard>
    )
  }

  if (!items.length) return null

  return (
    <>
      <SectionCard>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[10px] font-black uppercase tracking-wide text-[var(--bp-muted)]">
            AI recommendations ({pending.length})
          </h3>
          {resolved.length ? (
            <button
              type="button"
              onClick={() => setShowResolved((value) => !value)}
              aria-expanded={showResolved}
              className="text-[11px] font-bold text-[var(--bp-accent-ink)] hover:underline"
            >
              {showResolved ? 'Hide' : 'Show'} {resolved.length} resolved
            </button>
          ) : null}
        </div>

        {pending.length ? (
          <ul className="space-y-2">
            {pending.map((recommendation) => (
              <SuggestionCard
                key={recommendation.id}
                recommendation={recommendation}
                onReview={() => setReviewingId(recommendation.id)}
                onApprove={() => void handleApprove(recommendation.id, recommendation.title)}
                onDismiss={() => void handleDismiss(recommendation.id, recommendation.title)}
                approving={busyId === recommendation.id && approveMutation.isPending}
                dismissing={busyId === recommendation.id && dismissMutation.isPending}
              />
            ))}
          </ul>
        ) : (
          <p className="text-xs text-[var(--bp-muted)]">
            Nothing needs a decision right now — you're all caught up.
          </p>
        )}

        {showResolved && resolved.length ? (
          <ul className="mt-3 space-y-2 border-t border-[var(--bp-border)] pt-3">
            {resolved.map((recommendation) => (
              <SuggestionCard
                key={recommendation.id}
                recommendation={recommendation}
                onReview={() => {}}
                onApprove={() => {}}
                onDismiss={() => {}}
                approving={false}
                dismissing={false}
              />
            ))}
          </ul>
        ) : null}
      </SectionCard>

      {reviewing ? (
        <RecommendationDetail
          taskId={taskId}
          accessToken={accessToken}
          recommendation={reviewing}
          onClose={() => setReviewingId(null)}
          onApprove={() => void handleApprove(reviewing.id, reviewing.title)}
          onDismiss={() => void handleDismiss(reviewing.id, reviewing.title)}
          onNavigate={onNavigate}
          approving={busyId === reviewing.id && approveMutation.isPending}
          dismissing={busyId === reviewing.id && dismissMutation.isPending}
        />
      ) : null}

      <Toast message={error} tone="error" onDone={() => setError('')} />
      <Toast message={notice} tone="success" onDone={() => setNotice('')} />
    </>
  )
}
