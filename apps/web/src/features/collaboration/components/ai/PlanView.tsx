import { useEffect, useMemo, useState } from 'react'
import { FilterTabs } from '../../../../components/layout/FilterTabs'
import { SectionCard } from '../../../../components/layout/SectionCard'
import { EmptyState } from '../../../../components/layout/EmptyState'
import { formatDate } from '../../../../lib/dateTime'
import { useLanguage } from '../../../../i18n/LanguageContext'
import { friendlyError } from '../../errorMessages'
import { useProjectPlanQuery, type ProjectPlan, type ProjectPlanWarning, type ResourceLane } from '../../api/project-plan.api'
import type { PlanFocus } from '../../api/ai-collaboration.api'
import {
  EMPTY_FILTERS,
  filtersFromFocus,
  formatMinutesLabel,
  hasActiveFilters,
  ownersOf,
  statusesOf,
  type PlanFilters,
} from '../../lib/project-plan.view'
import { DependencyGraphView } from './DependencyGraphView'
import { PlanTimelineView } from './PlanTimelineView'
import { PlanNodeDetail } from './PlanNodeDetail'
import { TodayTeamPlan } from './TodayTeamPlan'

type Props = {
  taskId: string
  accessToken: string
  /**
   * Filters to apply on arrival, from a deep link (a recommendation or an alert
   * on the Overview). The backend decides what a finding is "about"; this view
   * just starts filtered to it and stays fully editable afterwards.
   */
  initialFocus?: PlanFocus
}

type PlanMode = 'timeline' | 'dependency-graph'

const PLAN_MODES: { value: PlanMode; label: string }[] = [
  { value: 'timeline', label: 'Timeline' },
  { value: 'dependency-graph', label: 'Dependency Graph' },
]

const STATUS_LABEL: Record<string, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  missed: 'Missed',
}

/**
 * The "Plan" tab: one local Timeline | Dependency Graph switcher over a single
 * backend-normalized project-plan model. Both views share the same filters,
 * selection, and PlanNodeDetail surface, so selecting a graph node and a
 * timeline row open the exact same detail. Invalid (circular) data is reported
 * in a prominent banner and never rendered silently.
 */
export function PlanView({ taskId, accessToken, initialFocus }: Props) {
  const [mode, setMode] = useState<PlanMode>('timeline')
  const [filters, setFilters] = useState<PlanFilters>(() => filtersFromFocus(initialFocus))
  const [selectedId, setSelectedId] = useState<string | null>(initialFocus?.itemIds?.[0] ?? null)
  const [highlightCritical, setHighlightCritical] = useState(false)

  // A later deep link (arriving while this tab is already mounted) re-applies.
  const focusKey = initialFocus ? JSON.stringify(initialFocus) : ''
  useEffect(() => {
    if (!focusKey) return
    const focus = JSON.parse(focusKey) as PlanFocus
    setFilters(filtersFromFocus(focus))
    setSelectedId(focus.itemIds?.[0] ?? null)
  }, [focusKey])

  const { language } = useLanguage()
  const query = useProjectPlanQuery(taskId, accessToken)
  const plan = query.data
  const nodes = useMemo(() => plan?.nodes ?? [], [plan])
  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes])
  const owners = useMemo(() => ownersOf(nodes), [nodes])
  const statuses = useMemo(() => statusesOf(nodes), [nodes])
  const selectedNode = selectedId ? nodesById.get(selectedId) ?? null : null

  return (
    <div className="space-y-4">
      <FilterTabs tabs={PLAN_MODES} active={mode} onChange={setMode} />

      {query.isLoading ? (
        <SectionCard>
          <p className="text-sm text-[var(--bp-muted)]">Loading plan…</p>
        </SectionCard>
      ) : query.isError ? (
        <SectionCard>
          {(query.error as { status?: number })?.status === 403 ? (
            <EmptyState icon={<span>🔒</span>} title="No access to this plan" description="You don't have permission to view this project's plan." />
          ) : (
            <p className="text-sm font-semibold text-red-300">{friendlyError(query.error, 'Could not load the plan. Please try again.')}</p>
          )}
        </SectionCard>
      ) : !plan || !nodes.length ? (
        <SectionCard>
          <EmptyState icon={<span>🗂</span>} title="No plan yet" description="Add subtasks or dependencies and they'll appear here as a timeline and a dependency graph." />
        </SectionCard>
      ) : (
        <>
          <WarningBanner warnings={plan.warnings} />

          <CriticalPathSummary
            plan={plan}
            highlighted={highlightCritical}
            onFocus={() => setHighlightCritical((value) => !value)}
          />

          <ForecastSummary plan={plan} language={language} />

          <ResourceLanesPanel lanes={plan.resourceLanes} />

          <FiltersBar
            filters={filters}
            onChange={setFilters}
            owners={owners}
            statuses={statuses}
          />

          {mode === 'timeline' ? (
            <>
              <PlanTimelineView nodes={nodes} filters={filters} selectedId={selectedId} onSelect={setSelectedId} scheduling={plan.scheduling} lanes={plan.resourceLanes} highlightCritical={highlightCritical} />
              {/* The per-member "what's due today" checklist with one-tap check-ins
                  lives here (execution view) now that Overview is a command centre. */}
              <TodayTeamPlan taskId={taskId} accessToken={accessToken} />
            </>
          ) : (
            <SectionCard>
              <DependencyGraphView nodes={nodes} edges={plan.edges} filters={filters} selectedId={selectedId} onSelect={setSelectedId} scheduling={plan.scheduling} lanes={plan.resourceLanes} highlightCritical={highlightCritical} currentUserId={jwtSubject(accessToken)} />
            </SectionCard>
          )}

          {/* Timeline retains its existing modal detail. The dependency graph now
              presents the same operational fields in a persistent side panel so
              a large graph remains readable while an item is inspected. */}
          {mode === 'timeline' ? (
            <PlanNodeDetail node={selectedNode} nodesById={nodesById} schedule={selectedId ? plan.scheduling[selectedId] : undefined} overloaded={overloadedForNode(plan, selectedNode)} onClose={() => setSelectedId(null)} />
          ) : null}
        </>
      )}
    </div>
  )
}

/** JWT payloads are already available in the browser; reading `sub` here only
 * powers a local view filter and never changes authentication or permissions. */
function jwtSubject(token: string): string | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    return (JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: unknown }).sub as string ?? null
  } catch {
    return null
  }
}

function CriticalPathSummary({ plan, highlighted, onFocus }: { plan: ProjectPlan; highlighted: boolean; onFocus: () => void }) {
  const critical = plan.criticalPath
  if (critical.status === 'unavailable') {
    return <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-[var(--bp-text)]"><strong>Critical Path unavailable.</strong> {critical.reason}</div>
  }
  const hours = Math.round(((critical.durationMinutes ?? 0) / 60) * 10) / 10
  return (
    <button type="button" onClick={onFocus} className={`w-full rounded-2xl border p-3 text-start ${highlighted ? 'border-red-400 bg-red-500/10' : 'border-[var(--bp-border)] bg-[var(--bp-card)]'}`}>
      <div className="flex items-center justify-between gap-2"><span className="text-sm font-black text-[var(--bp-text)]">Critical Path</span><span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-black uppercase text-red-300">{critical.itemIds.length} items</span></div>
      <p className="mt-1 text-xs text-[var(--bp-muted)]">{hours} hours remaining · <span className="font-bold text-[var(--bp-text)]">Highlight Critical Path</span> to {highlighted ? 'show the full plan' : 'focus affected items'}.</p>
    </button>
  )
}

/** Backend-computed helper: is the selected node's assignee over capacity? */
function overloadedForNode(plan: ProjectPlan, node: ProjectPlan['nodes'][number] | null): boolean {
  if (!node?.assignee) return false
  return plan.resourceLanes.some((lane) => lane.assigneeId === node.assignee!.userId && lane.overloadMinutes > 0)
}

/**
 * Plan Summary — the resource-aware forecast at a glance. Critical Path answers
 * "what delays the project?"; this answers "when will it actually finish, given
 * who is doing the work and when they're free?". Read-only: forecast never
 * changes saved dates.
 */
function ForecastSummary({ plan, language }: { plan: ProjectPlan; language: 'en' | 'ar' }) {
  const f = plan.forecast
  const cp = plan.criticalPath
  const dateLabel = (value: string | null) => (value ? formatDate(value, language) : '—')
  const tone =
    f.status === 'available' ? 'border-emerald-500/40 bg-emerald-500/10' : f.status === 'partial' ? 'border-amber-500/40 bg-amber-500/10' : 'border-red-500/40 bg-red-500/10'
  const statusLabel = f.status === 'available' ? 'On track' : f.status === 'partial' ? 'Partial forecast' : 'Unavailable'

  return (
    <div className={`rounded-2xl border p-3 ${tone}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-black text-[var(--bp-text)]">Resource Forecast</span>
        <span className="rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-black uppercase text-[var(--bp-text)]">{statusLabel}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        <SummaryField label="CPM completion">{cp.status === 'available' ? dateLabel(cp.projectedCompletion) : 'Unavailable'}</SummaryField>
        <SummaryField label="Forecast completion">{dateLabel(f.projectedCompletion)}</SummaryField>
        <SummaryField label="Deadline">{dateLabel(f.deadline)}</SummaryField>
        <SummaryField label="Delay" tone={f.delayMinutes > 0 ? 'danger' : 'ok'}>
          {f.delayMinutes > 0 ? `${f.delayDays} day${f.delayDays === 1 ? '' : 's'} late` : 'On or before'}
        </SummaryField>
        <SummaryField label="Capacity shortfall" tone={f.capacityShortfallMinutes > 0 ? 'danger' : 'ok'}>
          {f.capacityShortfallMinutes > 0 ? formatMinutesLabel(f.capacityShortfallMinutes) : 'None'}
        </SummaryField>
        <SummaryField label="Unscheduled items" tone={f.unscheduledItemIds.length ? 'danger' : 'ok'}>
          {f.unscheduledItemIds.length}
        </SummaryField>
        <SummaryField label="Main bottleneck" tone={f.bottleneckAssignee ? 'danger' : 'ok'}>
          {f.bottleneckAssignee ? `${f.bottleneckAssignee.assigneeName} (+${formatMinutesLabel(f.bottleneckAssignee.overloadMinutes)})` : 'None'}
        </SummaryField>
      </dl>
      <details className="mt-2 border-t border-[var(--bp-border)]/60 pt-2">
        <summary className="cursor-pointer list-none text-xs font-bold text-[var(--bp-accent-ink)] [&::-webkit-details-marker]:hidden">View analysis</summary>
      {f.reasons.length ? (
        <ul className="mt-2 space-y-0.5">
          {f.reasons.map((reason, i) => (
            <li key={i} className="text-xs text-[var(--bp-text)]">• {reason}</li>
          ))}
        </ul>
      ) : null}
      {f.fallbackPolicy ? <p className="mt-2 text-[11px] text-[var(--bp-muted)]">{f.fallbackPolicy}</p> : null}
      </details>
    </div>
  )
}

function SummaryField({ label, tone = 'neutral', children }: { label: string; tone?: 'neutral' | 'ok' | 'danger'; children: React.ReactNode }) {
  const color = tone === 'danger' ? 'text-red-300' : tone === 'ok' ? 'text-emerald-300' : 'text-[var(--bp-text)]'
  return (
    <div>
      <dt className="text-[10px] font-black uppercase tracking-wide text-[var(--bp-muted)]">{label}</dt>
      <dd className={`text-sm font-bold ${color}`}>{children}</dd>
    </div>
  )
}

/** Per-member capacity vs. scheduled load (all computed on the backend). */
function ResourceLanesPanel({ lanes }: { lanes: ResourceLane[] }) {
  if (!lanes.length) return null
  return (
    <SectionCard>
      <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-[var(--bp-muted)]">Team capacity</h3>
      <div className="space-y-2">
        {lanes.map((lane) => {
          const over = lane.overloadMinutes > 0
          const fill = Math.min(100, lane.utilisationPercent)
          return (
            <div key={lane.assigneeId}>
              <div className="mb-0.5 flex items-center justify-between gap-2 text-xs">
                <span className="font-bold text-[var(--bp-text)]">{lane.assigneeName}</span>
                <span className={over ? 'font-black text-red-300' : 'text-[var(--bp-muted)]'}>
                  {lane.utilisationPercent}%{over ? ` · +${formatMinutesLabel(lane.overloadMinutes)} over` : ''}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--bp-border)]/40">
                <div className={`h-2 rounded-full ${over ? 'bg-red-400' : 'bg-[var(--bp-accent)]'}`} style={{ width: `${fill}%` }} />
              </div>
              <p className="mt-0.5 text-[10px] text-[var(--bp-muted)]">
                {formatMinutesLabel(lane.scheduledMinutes)} scheduled of {formatMinutesLabel(lane.availableMinutes)} available
              </p>
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}

function WarningBanner({ warnings }: { warnings: ProjectPlanWarning[] }) {
  if (!warnings.length) return null
  return (
    <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-3" role="alert">
      <h3 className="text-xs font-black uppercase tracking-wide text-red-300">Invalid dependency data</h3>
      <ul className="mt-1 space-y-1">
        {warnings.map((warning, i) => (
          <li key={`${warning.code}-${i}`} className="text-sm text-[var(--bp-text)]">
            {warning.message}
          </li>
        ))}
      </ul>
    </div>
  )
}

function FiltersBar({
  filters,
  onChange,
  owners,
  statuses,
}: {
  filters: PlanFilters
  onChange: (next: PlanFilters) => void
  owners: { userId: string; displayName: string }[]
  statuses: string[]
}) {
  const selectClass =
    'rounded-lg border border-[var(--bp-border)] bg-[var(--bp-card)] px-2 py-1.5 text-xs text-[var(--bp-text)]'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        value={filters.search}
        onChange={(event) => onChange({ ...filters, search: event.target.value })}
        placeholder="Search items…"
        aria-label="Search plan items"
        className={`${selectClass} flex-1 min-w-40`}
      />
      <select
        aria-label="Filter by owner"
        value={filters.ownerId ?? ''}
        onChange={(event) => onChange({ ...filters, ownerId: event.target.value || null })}
        className={selectClass}
      >
        <option value="">All owners</option>
        {owners.map((owner) => (
          <option key={owner.userId} value={owner.userId}>
            {owner.displayName}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter by status"
        value={filters.status ?? ''}
        onChange={(event) => onChange({ ...filters, status: event.target.value || null })}
        className={selectClass}
      >
        <option value="">All statuses</option>
        {statuses.map((status) => (
          <option key={status} value={status}>
            {STATUS_LABEL[status] ?? status}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1.5 rounded-lg border border-[var(--bp-border)] px-2 py-1.5 text-xs font-semibold text-[var(--bp-text)]">
        <input
          type="checkbox"
          checked={filters.blockedOnly}
          onChange={(event) => onChange({ ...filters, blockedOnly: event.target.checked })}
        />
        Blocked only
      </label>
      {filters.itemIds ? (
        <span className="flex items-center gap-1.5 rounded-lg bg-[var(--bp-accent)]/15 px-2 py-1.5 text-xs font-bold text-[var(--bp-accent-ink)]">
          Showing {filters.itemIds.length} linked item{filters.itemIds.length === 1 ? '' : 's'}
          <button
            type="button"
            onClick={() => onChange({ ...filters, itemIds: null })}
            aria-label="Stop filtering to the linked items"
            className="font-black"
          >
            ×
          </button>
        </span>
      ) : null}
      {hasActiveFilters(filters) ? (
        <button
          type="button"
          onClick={() => onChange(EMPTY_FILTERS)}
          className="text-xs font-bold text-[var(--bp-accent-ink)] hover:underline"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  )
}
