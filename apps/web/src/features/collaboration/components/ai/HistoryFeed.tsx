import { useQuery } from '@tanstack/react-query'
import { SectionCard } from '../../../../components/layout/SectionCard'
import { EmptyState } from '../../../../components/layout/EmptyState'
import { queryKeys } from '../../../../lib/queryKeys'
import { getTaskActivity } from '../../../../lib/tasksApi'

type Props = {
  taskId: string
  accessToken: string
}

/** New AI-driven actions ("ai_recommendation_approved" /
 * "ai_recommendation_dismissed") show up in this feed automatically once the
 * backend logs them — `action` is a free-form string, so no local mapping is
 * required to display it. */
function describeAction(action: string): string {
  return action
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/** Reuses the existing `GET /tasks/:id/activity` endpoint and its client
 * wrapper (`getTaskActivity` in lib/tasksApi.ts) — no new backend surface. */
export function HistoryFeed({ taskId, accessToken }: Props) {
  const activityQuery = useQuery({
    queryKey: queryKeys.tasks.activity(taskId),
    queryFn: () => getTaskActivity(accessToken, taskId),
    enabled: Boolean(taskId && accessToken),
  })

  if (activityQuery.isLoading) {
    return (
      <SectionCard>
        <p className="text-sm text-slate-400">Loading history…</p>
      </SectionCard>
    )
  }

  const items = activityQuery.data ?? []
  if (!items.length) {
    return (
      <SectionCard>
        <EmptyState icon={<span>🕘</span>} title="No activity yet" description="Changes to this task, including AI suggestions approved or dismissed, will show up here." />
      </SectionCard>
    )
  }

  return (
    <SectionCard>
      <h3 className="mb-3 text-[10px] font-black uppercase tracking-wide text-slate-400">History</h3>
      <ul className="space-y-3">
        {items.map((activity) => (
          <li key={activity.id} className="border-s border-[var(--bp-border)] ps-3">
            <p className="text-sm font-bold text-[var(--bp-text)]">
              {activity.description || describeAction(activity.action)}
            </p>
            <p className="text-[11px] text-slate-400">{new Date(activity.createdAt).toLocaleString()}</p>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}
