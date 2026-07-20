import { SectionCard } from '../../../../components/layout/SectionCard'
import { EmptyState } from '../../../../components/layout/EmptyState'
import { useTimelineQuery } from '../../api/ai-collaboration.api'

type Props = {
  taskId: string
  accessToken: string
}

function formatDate(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** A vertical list of milestones plus deadline and buffer-day markers, with
 * "today" called out. Read-only — the AI proposes the timeline, nothing here
 * changes the task. */
export function TimelineView({ taskId, accessToken }: Props) {
  const timelineQuery = useTimelineQuery(taskId, accessToken)

  if (timelineQuery.isLoading) {
    return (
      <SectionCard>
        <p className="text-sm text-slate-400">Loading timeline…</p>
      </SectionCard>
    )
  }

  const data = timelineQuery.data
  if (!data) {
    return (
      <SectionCard>
        <EmptyState icon={<span>🗓</span>} title="No timeline yet" description="A timeline will appear once this task has a due date or milestones." />
      </SectionCard>
    )
  }

  return (
    <div className="space-y-4">
      <SectionCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Today</p>
            <p className="text-sm font-bold text-[var(--bp-text)]">{formatDate(data.today)}</p>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Deadline</p>
            <p className="text-sm font-bold text-[var(--bp-text)]">
              {data.deadline ? formatDate(data.deadline) : 'No deadline set'}
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard>
        <h3 className="mb-3 text-[10px] font-black uppercase tracking-wide text-slate-400">Milestones</h3>
        {data.milestones.length ? (
          <ol className="space-y-3 border-s border-[var(--bp-border)] ps-4">
            {data.milestones.map((milestone) => (
              <li key={milestone.id} className="relative">
                <span className="absolute -start-[21px] top-1 h-2.5 w-2.5 rounded-full bg-[var(--bp-accent)]" />
                <p className="text-sm font-bold text-[var(--bp-text)]">{milestone.title}</p>
                <p className="text-xs text-slate-400">{formatDate(milestone.date)}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs text-slate-400">No milestones proposed yet.</p>
        )}
      </SectionCard>

      {data.bufferDay ? (
        <SectionCard>
          <h3 className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">Buffer day</h3>
          <p className="text-sm font-bold text-[var(--bp-text)]">{formatDate(data.bufferDay)}</p>
          <p className="mt-1 text-xs text-slate-400">
            A buffer day is kept free of new work so the team has slack to catch up before the deadline if
            something runs long.
          </p>
        </SectionCard>
      ) : null}
    </div>
  )
}
