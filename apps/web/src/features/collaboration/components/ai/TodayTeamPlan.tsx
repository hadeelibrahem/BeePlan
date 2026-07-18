import { useMutation } from '@tanstack/react-query'
import { SectionCard } from '../../../../components/layout/SectionCard'
import { EmptyState } from '../../../../components/layout/EmptyState'
import { updateSubtask, type ApiSubtaskStatus } from '../../../../lib/tasksApi'
import { useInvalidateAiCollaboration, useTodayQuery, type TodayItem } from '../../api/ai-collaboration.api'

type Props = {
  taskId: string
  accessToken: string
}

type CheckIn = 'done' | 'partial' | 'missed'

const CHECK_IN_STATUS: Record<CheckIn, ApiSubtaskStatus> = {
  done: 'done',
  partial: 'in_progress',
  missed: 'missed',
}

const CHECK_IN_META: Record<CheckIn, { label: string; activeClass: string }> = {
  done: { label: 'Done', activeClass: 'bg-green-500/20 text-green-300 border-green-500/40' },
  partial: { label: 'Partial', activeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  missed: { label: "Didn't do it", activeClass: 'bg-red-500/20 text-red-300 border-red-500/40' },
}

function itemStatusToCheckIn(status: string): CheckIn | null {
  if (status === 'done') return 'done'
  if (status === 'in_progress') return 'partial'
  if (status === 'missed') return 'missed'
  return null
}

/**
 * The "goal" headline, per-member checklists, "nothing today" copy for empty
 * members, and Done/Partial/Didn't-do-it check-ins per item.
 */
export function TodayTeamPlan({ taskId, accessToken }: Props) {
  const todayQuery = useTodayQuery(taskId, accessToken)
  const invalidate = useInvalidateAiCollaboration(taskId)

  const checkInMutation = useMutation({
    mutationFn: ({ subtaskId, checkIn }: { subtaskId: string; checkIn: CheckIn }) =>
      updateSubtask(accessToken, taskId, subtaskId, { status: CHECK_IN_STATUS[checkIn] }),
    onSuccess: () => invalidate({ includeTaskDetail: true }),
  })

  if (todayQuery.isLoading) {
    return (
      <SectionCard>
        <p className="text-sm text-slate-400">Loading today's plan…</p>
      </SectionCard>
    )
  }

  const data = todayQuery.data
  if (!data) {
    return (
      <SectionCard>
        <EmptyState icon={<span>📋</span>} title="Nothing to show yet" description="Today's plan will appear here once the team has open work." />
      </SectionCard>
    )
  }

  const anyItems = data.members.some((m) => m.items.length) || data.sharedItems.length > 0

  return (
    <div className="space-y-4">
      <SectionCard>
        <h3 className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">Today's goal</h3>
        <p className="text-sm font-bold text-[var(--bp-text)]">{data.goal}</p>
      </SectionCard>

      {data.sharedItems.length ? (
        <SectionCard>
          <h3 className="mb-3 text-[10px] font-black uppercase tracking-wide text-slate-400">Shared</h3>
          <ItemList
            items={data.sharedItems}
            busySubtaskId={checkInMutation.variables?.subtaskId}
            pending={checkInMutation.isPending}
            onCheckIn={(subtaskId, checkIn) => void checkInMutation.mutate({ subtaskId, checkIn })}
          />
        </SectionCard>
      ) : null}

      {!anyItems ? (
        <SectionCard>
          <EmptyState
            icon={<span>✅</span>}
            title="Nothing due today"
            description="No open work is due yet, and a later item is free to start now."
          />
        </SectionCard>
      ) : (
        data.members.map((member) => (
          <SectionCard key={member.userId}>
            <h3 className="mb-3 text-sm font-black text-[var(--bp-text)]">{member.displayName}</h3>
            {member.items.length ? (
              <ItemList
                items={member.items}
                busySubtaskId={checkInMutation.variables?.subtaskId}
                pending={checkInMutation.isPending}
                onCheckIn={(subtaskId, checkIn) => void checkInMutation.mutate({ subtaskId, checkIn })}
              />
            ) : (
              <p className="text-xs text-slate-400">Nothing today — starts later.</p>
            )}
          </SectionCard>
        ))
      )}
    </div>
  )
}

function ItemList({
  items,
  busySubtaskId,
  pending,
  onCheckIn,
}: {
  items: TodayItem[]
  busySubtaskId?: string
  pending: boolean
  onCheckIn: (subtaskId: string, checkIn: CheckIn) => void
}) {
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const current = itemStatusToCheckIn(item.status)
        const isBusy = pending && busySubtaskId === item.id
        return (
          <li
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--bp-border)] p-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-[var(--bp-text)]">{item.title}</p>
              {item.dueDate ? (
                <p className="text-[11px] text-slate-400">Due {new Date(item.dueDate).toLocaleDateString()}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 gap-1.5">
              {(Object.keys(CHECK_IN_META) as CheckIn[]).map((checkIn) => (
                <button
                  key={checkIn}
                  type="button"
                  disabled={isBusy}
                  onClick={() => onCheckIn(item.id, checkIn)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-50 ${
                    current === checkIn
                      ? CHECK_IN_META[checkIn].activeClass
                      : 'border-[var(--bp-border)] text-slate-400 hover:text-[var(--bp-text)]'
                  }`}
                >
                  {CHECK_IN_META[checkIn].label}
                </button>
              ))}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
