import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { ApiTask } from '../../../../lib/tasksApi'
import { SectionCard } from '../../../../components/layout/SectionCard'
import { EmptyState } from '../../../../components/layout/EmptyState'
import { PrimaryButton, OutlineButton, SecondaryButton } from '../../../../components/layout/Buttons'
import { getMembers } from '../../api/collaboration.api'
import {
  applyCollaborationPlan,
  generateCollaborationPlan,
  type ApplyPlanItemInput,
  type CollaborationPlanItem,
  type CollaborationPlanProposal,
} from '../../api/ai-collaboration-planner.api'
import { useCapacityQuery, useInvalidateAiCollaboration } from '../../api/ai-collaboration.api'
import { friendlyError } from '../../errorMessages'
import { CapacityOverview } from './CapacityOverview'

type Props = {
  task: ApiTask
  accessToken: string
}

function toApplyInput(item: CollaborationPlanItem): ApplyPlanItemInput {
  return {
    proposalId: item.proposalId,
    title: item.title,
    description: item.description || undefined,
    assigneeUserId: item.assigneeUserId,
    estimatedDurationMinutes: item.estimatedDurationMinutes,
    suggestedStart: item.suggestedStart ?? undefined,
    suggestedDue: item.suggestedDue ?? undefined,
    priority: item.priority,
    order: item.order,
    dependsOnProposalIds: item.dependsOnProposalIds,
    canRunInParallel: item.canRunInParallel,
    activityType: item.activityType,
    sharedSessionId: item.sharedSessionId,
  }
}

/**
 * Capacity-aware "smart fair split" stage: capacity snapshot, generate/
 * regenerate a proposal, a collapsed full-plan view, light manual adjustment
 * (remove an item, or unassign it), and Accept to write it as real subtasks.
 * Never applies anything until the owner presses Accept.
 */
export function DistributionPanel({ task, accessToken }: Props) {
  const capacityQuery = useCapacityQuery(task.id, accessToken)
  const invalidate = useInvalidateAiCollaboration(task.id)

  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [proposal, setProposal] = useState<CollaborationPlanProposal | null>(null)
  const [items, setItems] = useState<CollaborationPlanItem[]>([])
  const [showFullPlan, setShowFullPlan] = useState(false)
  const [adjusting, setAdjusting] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const capacityMembers = capacityQuery.data?.members ?? []

  // The AI's `selectedMemberIds` accepts accepted editors only — the owner is
  // included automatically via the `includeOwner` preference, never as a
  // selectable candidate (the backend 400s otherwise). CapacityOverview above
  // still shows everyone, including the owner, since that's informational.
  const membersQuery = useQuery({
    queryKey: ['collaboration', 'members', task.id],
    queryFn: () => getMembers(task.id, accessToken),
    enabled: Boolean(accessToken),
    staleTime: 60_000,
  })
  const editorCandidates = useMemo(
    () =>
      (membersQuery.data ?? []).filter(
        (member) => !member.isOwner && member.role === 'editor' && member.status === 'accepted',
      ),
    [membersQuery.data],
  )

  // Default the candidate pool to every eligible editor the first time the
  // member list loads — the owner can still narrow it via the checkboxes.
  useEffect(() => {
    if (selectedMemberIds.length || !editorCandidates.length) return
    setSelectedMemberIds(editorCandidates.map((m) => m.userId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorCandidates.length])

  const generateMutation = useMutation({
    mutationFn: () =>
      generateCollaborationPlan(
        task.id,
        { selectedMemberIds, preferences: { includeOwner: true } },
        accessToken,
      ),
    onSuccess: (result) => {
      setProposal(result)
      setItems(result.items)
      setAdjusting(false)
      setError('')
    },
    onError: (err) => setError(friendlyError(err, 'Could not generate a plan. Please try again.')),
  })

  const applyMutation = useMutation({
    mutationFn: () => {
      if (!proposal) throw new Error('no_proposal')
      const toApply = items.filter((item) => item.title.trim())
      return applyCollaborationPlan(task.id, proposal.planId, toApply.map(toApplyInput), accessToken)
    },
    onSuccess: (result) => {
      const createdCount = result.created.subtaskIds.length
      setNotice(`Applied ${createdCount} subtask${createdCount === 1 ? '' : 's'}.`)
      setProposal(null)
      setItems([])
      setAdjusting(false)
      invalidate({ includeTaskDetail: true })
    },
    onError: (err) => setError(friendlyError(err, 'Could not apply the plan. Please try again.')),
  })

  const workloadDisplay = useMemo(() => proposal?.workloadByMember ?? [], [proposal])
  const maxWorkloadMinutes = useMemo(
    () => Math.max(1, ...workloadDisplay.map((w) => w.totalEstimatedMinutes)),
    [workloadDisplay],
  )

  function toggleSelectedMember(userId: string) {
    setSelectedMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    )
  }

  function removeItem(proposalId: string) {
    setItems((prev) => prev.filter((item) => item.proposalId !== proposalId))
  }

  function unassignItem(proposalId: string) {
    setItems((prev) =>
      prev.map((item) =>
        item.proposalId === proposalId ? { ...item, assigneeUserId: null, assigneeDisplayName: null } : item,
      ),
    )
  }

  const isOwner = task.viewerRole === 'owner'
  const busy = generateMutation.isPending || applyMutation.isPending

  if (!isOwner) {
    return (
      <SectionCard>
        <p className="text-sm text-slate-400">
          Only the task owner can generate or apply an AI split. You can still see the current capacity snapshot
          below.
        </p>
        <div className="mt-3">
          <CapacityOverview members={capacityMembers} />
        </div>
      </SectionCard>
    )
  }

  return (
    <div className="space-y-4">
      <SectionCard>
        <h3 className="mb-3 text-[10px] font-black uppercase tracking-wide text-slate-400">Team capacity</h3>
        {capacityQuery.isLoading ? (
          <p className="text-xs text-slate-400">Loading capacity…</p>
        ) : (
          <CapacityOverview members={capacityMembers} />
        )}
      </SectionCard>

      <SectionCard>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[10px] font-black uppercase tracking-wide text-slate-400">Smart fair split</h3>
          <div className="flex flex-wrap gap-2">
            {editorCandidates.map((member) => (
              <label
                key={member.userId}
                className="flex items-center gap-1.5 rounded-full border border-[var(--bp-border)] px-2.5 py-1 text-[11px] font-semibold text-[var(--bp-text)]"
              >
                <input
                  type="checkbox"
                  checked={selectedMemberIds.includes(member.userId)}
                  onChange={() => toggleSelectedMember(member.userId)}
                />
                {member.user.fullName}
              </label>
            ))}
          </div>
        </div>
        {!editorCandidates.length && (
          <p className="mb-3 text-xs text-slate-400">
            Only accepted collaborators with an editable role can be selected for planning.
          </p>
        )}

        {generateMutation.isPending ? (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-3 rounded-lg border border-[var(--bp-accent)]/40 bg-[var(--bp-accent)]/10 px-4 py-3"
          >
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[var(--bp-accent)] border-t-transparent" />
            <p className="text-sm font-bold text-[var(--bp-text)]">Working out a fair split… this can take up to 90 seconds.</p>
          </div>
        ) : null}

        {error ? <p className="mb-3 text-sm font-semibold text-red-300">{error}</p> : null}

        {!proposal && !generateMutation.isPending ? (
          <EmptyState
            icon={<span>🤝</span>}
            title="No split proposed yet"
            description="Generate a plan and the AI will explain how it split the work based on who has room this week."
            actionLabel="Generate plan"
            onAction={() => void generateMutation.mutate()}
          />
        ) : null}

        {proposal ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--bp-text)]">{proposal.summary}</p>
            {proposal.source === 'fallback' ? (
              <p className="text-xs font-bold text-amber-300">
                Generated without AI assistance — review carefully before accepting.
              </p>
            ) : null}

            {workloadDisplay.length ? (
              <div className="space-y-2">
                {workloadDisplay.map((w) => (
                  <div key={w.userId}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-bold text-[var(--bp-text)]">{w.displayName}</span>
                      <span className="text-slate-400">
                        {w.itemCount} item{w.itemCount === 1 ? '' : 's'} · {w.totalEstimatedMinutes} min
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--bp-border)]">
                      <div
                        className="h-1.5 rounded-full bg-[var(--bp-accent)]"
                        style={{ width: `${(w.totalEstimatedMinutes / maxWorkloadMinutes) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setShowFullPlan((v) => !v)}
              className="text-xs font-bold text-[var(--bp-accent)]"
            >
              {showFullPlan ? 'Hide full plan' : `View full plan (${items.length})`}
            </button>

            {showFullPlan ? (
              <ul className="space-y-2">
                {items.map((item) => (
                  <li
                    key={item.proposalId}
                    className="rounded-xl border border-[var(--bp-border)] p-3 text-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-[var(--bp-text)]">{item.title}</p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {item.assigneeDisplayName ?? 'Unassigned'} · {item.estimatedDurationMinutes} min
                        </p>
                        {item.reason ? <p className="mt-1 text-[11px] text-slate-500">Why: {item.reason}</p> : null}
                      </div>
                      {adjusting ? (
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {item.assigneeUserId ? (
                            <button
                              type="button"
                              onClick={() => unassignItem(item.proposalId)}
                              className="text-[11px] font-bold text-slate-400 hover:text-[var(--bp-text)]"
                            >
                              Unassign
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => removeItem(item.proposalId)}
                            className="text-[11px] font-bold text-red-300"
                          >
                            Remove
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
                {!items.length ? <p className="text-xs text-slate-400">No items left in this plan.</p> : null}
              </ul>
            ) : null}

            {notice ? <p className="text-sm font-semibold text-green-300">{notice}</p> : null}

            <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--bp-border)] pt-3">
              <OutlineButton size="sm" onClick={() => setAdjusting((v) => !v)}>
                {adjusting ? 'Done adjusting' : 'Adjust'}
              </OutlineButton>
              <SecondaryButton size="sm" disabled={busy} onClick={() => void generateMutation.mutate()}>
                {generateMutation.isPending ? 'Regenerating…' : 'Regenerate'}
              </SecondaryButton>
              <PrimaryButton
                size="sm"
                disabled={busy || !items.length}
                onClick={() => void applyMutation.mutate()}
              >
                {applyMutation.isPending ? 'Accepting…' : 'Accept plan'}
              </PrimaryButton>
            </div>
          </div>
        ) : null}
      </SectionCard>
    </div>
  )
}
