import { useMemo } from 'react'
import { SectionCard } from '../../../../components/layout/SectionCard'
import { EmptyState } from '../../../../components/layout/EmptyState'
import type { ProjectPlanNode, ProjectPlanSchedule, ResourceLane } from '../../api/project-plan.api'
import {
  buildTimelineRows,
  filterNodeIds,
  nodeResourceFlags,
  overloadedAssigneeIds,
  timelineDomain,
  type PlanFilters,
  type ResourceFlags,
  type TimelineRow,
} from '../../lib/project-plan.view'

type Props = {
  nodes: ProjectPlanNode[]
  filters: PlanFilters
  selectedId: string | null
  onSelect: (id: string) => void
  scheduling: Record<string, ProjectPlanSchedule>
  lanes: ResourceLane[]
  highlightCritical: boolean
}

/**
 * Improved, project-plan-driven timeline: each execution item gets a planned
 * bar (with a progress fill) overlaid by its forecast bar, a shared "today"
 * marker, and delayed / blocked / unscheduled badges. Selecting a row opens the
 * same shared PlanNodeDetail the graph uses. All positioning comes from the
 * pure view helpers — no date math in this component.
 */
export function PlanTimelineView({ nodes, filters, selectedId, onSelect, scheduling, lanes, highlightCritical }: Props) {
  const domain = useMemo(() => timelineDomain(nodes, undefined, scheduling), [nodes, scheduling])
  const rows = useMemo(() => buildTimelineRows(nodes, domain, scheduling), [nodes, domain, scheduling])
  const visibleIds = useMemo(() => filterNodeIds(nodes, filters), [nodes, filters])
  const overloadedIds = useMemo(() => overloadedAssigneeIds(lanes), [lanes])

  const visibleRows = rows.filter((row) => visibleIds.has(row.node.id))
  if (!visibleRows.length) {
    return (
      <SectionCard>
        <EmptyState icon={<span>🗓</span>} title="Nothing on the timeline" description="No items match the current filters, or this plan has no scheduled work yet." />
      </SectionCard>
    )
  }

  const scheduled = visibleRows.filter((row) => row.hasBar)
  const unscheduled = visibleRows.filter((row) => !row.hasBar)
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const tomorrowStart = new Date(todayStart)
  tomorrowStart.setDate(todayStart.getDate() + 1)
  const dateFor = (row: TimelineRow) => new Date(row.node.dueDate ?? row.node.plannedEnd ?? row.node.forecastEnd ?? 0).getTime()
  const blocked = scheduled.filter((row) => row.node.isBlocked)
  const overdue = scheduled.filter((row) => !row.node.isBlocked && row.node.status !== 'done' && dateFor(row) > 0 && dateFor(row) < todayStart.getTime())
  const today = scheduled.filter((row) => !row.node.isBlocked && !overdue.includes(row) && dateFor(row) >= todayStart.getTime() && dateFor(row) < tomorrowStart.getTime())
  const upcoming = scheduled.filter((row) => !blocked.includes(row) && !overdue.includes(row) && !today.includes(row))

  return (
    <SectionCard>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-[var(--bp-muted)]">
        <LegendSwatch className="bg-[var(--bp-accent)]/40" label="Planned" />
        <LegendSwatch className="bg-amber-400/60" label="Forecast" />
        <LegendSwatch className="bg-[var(--bp-accent)]" label="Progress" />
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-0.5 bg-red-400" />Today</span>
      </div>

      <div className="space-y-2">
        <TimelineGroup label="Today's Tasks" rows={today} open domain={domain} selectedId={selectedId} scheduling={scheduling} overloadedIds={overloadedIds} highlightCritical={highlightCritical} onSelect={onSelect} />
        <TimelineGroup label="Blocked" rows={blocked} domain={domain} selectedId={selectedId} scheduling={scheduling} overloadedIds={overloadedIds} highlightCritical={highlightCritical} onSelect={onSelect} />
        <TimelineGroup label="Overdue" rows={overdue} domain={domain} selectedId={selectedId} scheduling={scheduling} overloadedIds={overloadedIds} highlightCritical={highlightCritical} onSelect={onSelect} />
        <TimelineGroup label="Upcoming" rows={upcoming} domain={domain} selectedId={selectedId} scheduling={scheduling} overloadedIds={overloadedIds} highlightCritical={highlightCritical} onSelect={onSelect} />
      </div>

      {unscheduled.length ? (
        <div className="mt-4">
          <h4 className="mb-2 text-[10px] font-black uppercase tracking-wide text-[var(--bp-muted)]">Unscheduled</h4>
          <ul className="space-y-1">
            {unscheduled.map((row) => (
              <li key={row.node.id}>
                <button
                  type="button"
                  onClick={() => onSelect(row.node.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--bp-border)] px-3 py-2 text-start text-sm hover:bg-[var(--bp-border)]/40"
                >
                  <span className="truncate font-semibold text-[var(--bp-text)]">{row.node.title}</span>
                  <StatusBadges node={row.node} delayed={row.isDelayed} flags={nodeResourceFlags(row.node, scheduling[row.node.id], overloadedIds)} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </SectionCard>
  )
}

function TimelineGroup({ label, rows, open, domain, selectedId, scheduling, overloadedIds, highlightCritical, onSelect }: { label: string; rows: TimelineRow[]; open?: boolean; domain: ReturnType<typeof timelineDomain>; selectedId: string | null; scheduling: Props['scheduling']; overloadedIds: Set<string>; highlightCritical: boolean; onSelect: (id: string) => void }) {
  if (!rows.length) return null
  return <details open={open} className="rounded-xl border border-[var(--bp-border)]/70 bg-[var(--bp-bg)]/40"><summary className="cursor-pointer list-none px-3 py-2 text-xs font-black uppercase tracking-wide text-[var(--bp-muted)] [&::-webkit-details-marker]:hidden">{label} <span className="text-[var(--bp-text)]">({rows.length})</span></summary><div className="space-y-1.5 border-t border-[var(--bp-border)]/60 p-2">{rows.map((row) => <TimelineBar key={row.node.id} row={row} todayFraction={domain.todayFraction} selected={row.node.id === selectedId} schedule={scheduling[row.node.id]} flags={nodeResourceFlags(row.node, scheduling[row.node.id], overloadedIds)} dimmed={highlightCritical && !scheduling[row.node.id]?.isCritical} onSelect={() => onSelect(row.node.id)} />)}</div></details>
}

function TimelineBar({
  row,
  todayFraction,
  selected,
  schedule,
  flags,
  dimmed,
  onSelect,
}: {
  row: TimelineRow
  todayFraction: number | null
  selected: boolean
  schedule: ProjectPlanSchedule | undefined
  flags: ResourceFlags
  dimmed: boolean
  onSelect: () => void
}) {
  const start = row.plannedStartFraction ?? row.forecastStartFraction ?? 0
  const end = row.plannedEndFraction ?? row.forecastEndFraction ?? start
  const left = Math.min(start, end)
  const width = Math.max(0.02, Math.abs(end - left))
  const forecastLeft =
    row.forecastStartFraction != null ? Math.min(row.forecastStartFraction, row.forecastEndFraction ?? row.forecastStartFraction) : null
  const forecastWidth =
    row.forecastStartFraction != null && row.forecastEndFraction != null
      ? Math.max(0.02, Math.abs(row.forecastEndFraction - row.forecastStartFraction))
      : null

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`block w-full rounded-lg border px-3 py-2 text-start transition ${dimmed ? 'opacity-35' : ''} ${schedule?.isCritical ? 'border-red-400/70' : ''} ${
        selected ? 'border-[var(--bp-accent)] bg-[var(--bp-accent)]/5' : 'border-[var(--bp-border)] hover:bg-[var(--bp-border)]/30'
      }`}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="truncate text-sm font-bold text-[var(--bp-text)]">{row.node.title}</span>
        <StatusBadges node={row.node} delayed={row.isDelayed} critical={schedule?.isCritical} flags={flags} />
      </div>
      <div className="relative h-5 rounded-full bg-[var(--bp-border)]/40">
        {/* Planned window with progress fill inside it. */}
        <div
          className="absolute top-0 h-5 rounded-full bg-[var(--bp-accent)]/25"
          style={{ left: `${left * 100}%`, width: `${width * 100}%` }}
        >
          <div
            className="h-5 rounded-full bg-[var(--bp-accent)]"
            style={{ width: `${row.node.progressPercent}%` }}
          />
        </div>
        {/* Forecast window, thinner and offset below. */}
        {forecastLeft != null && forecastWidth != null ? (
          <div
            className={`absolute bottom-0 h-1.5 rounded-full ${row.isDelayed ? 'bg-red-400' : 'bg-amber-400/70'}`}
            style={{ left: `${forecastLeft * 100}%`, width: `${forecastWidth * 100}%` }}
          />
        ) : null}
        {/* Today marker. */}
        {todayFraction != null ? (
          <span className="absolute top-0 h-5 w-0.5 bg-red-400" style={{ left: `${todayFraction * 100}%` }} aria-hidden />
        ) : null}
      </div>
    </button>
  )
}

function StatusBadges({ node, delayed, critical, flags }: { node: ProjectPlanNode; delayed: boolean; critical?: boolean; flags: ResourceFlags }) {
  const attention = node.isBlocked ? 'Blocked' : critical ? 'Critical' : delayed || flags.resourceDelayed ? 'Delayed' : flags.overCapacity ? 'Over capacity' : node.inCycle ? 'Cycle' : null
  const schedulingState = flags.forecastUnscheduled ? 'Unscheduled' : node.isUnscheduled ? 'No due date' : null
  return (
    <span className="flex shrink-0 flex-wrap gap-1">
      {attention ? <Badge tone="danger">{attention}</Badge> : null}
      {schedulingState ? <Badge tone="warning">{schedulingState}</Badge> : null}
    </span>
  )
}

function Badge({ tone, children }: { tone: 'danger' | 'warning'; children: React.ReactNode }) {
  const cls = tone === 'danger' ? 'bg-red-500/15 text-red-300' : 'bg-amber-500/15 text-amber-300'
  return <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${cls}`}>{children}</span>
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`inline-block h-2.5 w-4 rounded-full ${className}`} />
      {label}
    </span>
  )
}
