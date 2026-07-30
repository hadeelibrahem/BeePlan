import { useEffect, useMemo, useState } from 'react'
import { EmptyState } from '../../../../components/layout/EmptyState'
import { SectionCard } from '../../../../components/layout/SectionCard'
import { formatDate } from '../../../../lib/dateTime'
import { useLanguage } from '../../../../i18n/LanguageContext'
import {
  useTeamInsightsQuery,
  type TeamHealth,
  type TeamInsightsMember,
  type TeamInsightsSummary,
  type PlanFocus,
  type TeamMemberStatus,
} from '../../api/ai-collaboration.api'

type Props = {
  taskId: string
  accessToken: string
  /** Deep-link focus: highlights and filters to one member on arrival. */
  initialFocus?: PlanFocus
}

// --- Backend-driven label/icon maps (icon + text, never colour alone) --------

const STATUS_META: Record<TeamMemberStatus, { label: string; icon: string; tone: Tone }> = {
  available: { label: 'Available', icon: '○', tone: 'ok' },
  balanced: { label: 'Balanced', icon: '◐', tone: 'accent' },
  heavy: { label: 'Heavy', icon: '◕', tone: 'warn' },
  over_capacity: { label: 'Over capacity', icon: '●', tone: 'danger' },
}
// Capacity Analysis warning labels (Section 5) map from the same backend status.
const CAPACITY_LABEL: Record<TeamMemberStatus, string> = {
  available: 'Under utilised',
  balanced: 'Balanced',
  heavy: 'Near capacity',
  over_capacity: 'Over capacity',
}
const HEALTH_META: Record<TeamHealth, { label: string; icon: string; tone: Tone }> = {
  healthy: { label: 'Healthy', icon: '✓', tone: 'ok' },
  balanced: { label: 'Balanced', icon: '≈', tone: 'accent' },
  strained: { label: 'Strained', icon: '▲', tone: 'warn' },
  at_risk: { label: 'At risk', icon: '⚠', tone: 'danger' },
}

type Tone = 'ok' | 'accent' | 'warn' | 'danger' | 'neutral'
const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-emerald-300',
  accent: 'text-sky-300',
  warn: 'text-amber-300',
  danger: 'text-red-300',
  neutral: 'text-[var(--bp-text)]',
}
const TONE_BAR: Record<Tone, string> = {
  ok: 'bg-emerald-400',
  accent: 'bg-sky-400',
  warn: 'bg-amber-400',
  danger: 'bg-red-400',
  neutral: 'bg-[var(--bp-accent)]',
}

const fmt = (value: number) =>
  value >= 60 ? `${Math.floor(value / 60)}h${value % 60 ? ` ${value % 60}m` : ''}` : `${value}m`

// --- Filters (Section 7) -----------------------------------------------------

type QuickFilter = 'critical' | 'blocked' | 'overloaded' | 'available'
type Filters = {
  role: 'all' | TeamInsightsMember['role']
  status: 'all' | TeamMemberStatus
  quick: QuickFilter | null
  /** Set by a deep link to scope the list to one member. */
  memberId: string | null
}
const EMPTY_FILTERS: Filters = { role: 'all', status: 'all', quick: null, memberId: null }

function memberMatches(member: TeamInsightsMember, filters: Filters): boolean {
  if (filters.memberId && member.userId !== filters.memberId) return false
  if (filters.role !== 'all' && member.role !== filters.role) return false
  if (filters.status !== 'all' && member.status !== filters.status) return false
  if (filters.quick === 'critical' && member.criticalItemCount === 0) return false
  if (filters.quick === 'blocked' && member.blockedItemCount === 0) return false
  if (filters.quick === 'overloaded' && member.status !== 'over_capacity') return false
  if (filters.quick === 'available' && member.status !== 'available') return false
  return true
}

// --- Workload comparison (Section 3) -----------------------------------------

type MetricKey = 'remaining' | 'available' | 'utilisation' | 'completed' | 'critical' | 'blocked'
const METRICS: { key: MetricKey; label: string; value: (m: TeamInsightsMember) => number; fmt: (n: number) => string }[] = [
  { key: 'remaining', label: 'Remaining work', value: (m) => m.remainingMinutes, fmt },
  { key: 'available', label: 'Capacity', value: (m) => m.availableMinutes, fmt },
  { key: 'utilisation', label: 'Utilisation', value: (m) => m.utilisationPercent, fmt: (n) => `${n}%` },
  { key: 'completed', label: 'Completed work', value: (m) => m.completedMinutes, fmt },
  { key: 'critical', label: 'Critical work', value: (m) => m.criticalItemCount, fmt: (n) => `${n}` },
  { key: 'blocked', label: 'Blocked work', value: (m) => m.blockedItemCount, fmt: (n) => `${n}` },
]

/**
 * Team Intelligence dashboard (read-only). Every workload, capacity, forecast
 * and criticality figure comes from GET /ai/collaboration/team, which reuses the
 * shared project plan (Critical Path + Resource-Aware Forecast + Resource Lanes).
 * The client only renders, filters, and navigates — no calculations here.
 */
export function TeamMemberList({ taskId, accessToken, initialFocus }: Props) {
  const { language } = useLanguage()
  const query = useTeamInsightsQuery(taskId, accessToken)
  const [filters, setFilters] = useState<Filters>(() => ({
    ...EMPTY_FILTERS,
    memberId: initialFocus?.memberId ?? null,
  }))
  const [metric, setMetric] = useState<MetricKey>('utilisation')

  // Re-apply when a deep link arrives while this tab is already mounted.
  const focusMemberId = initialFocus?.memberId ?? null
  useEffect(() => {
    if (focusMemberId) setFilters({ ...EMPTY_FILTERS, memberId: focusMemberId })
  }, [focusMemberId])

  const members = query.data?.members ?? []
  const visible = useMemo(() => members.filter((member) => memberMatches(member, filters)), [members, filters])

  if (query.isLoading)
    return (
      <SectionCard>
        <p className="text-sm text-[var(--bp-muted)]" role="status">
          Loading Team Intelligence…
        </p>
      </SectionCard>
    )
  if (query.isError) {
    const denied = (query.error as Error & { status?: number }).status === 403
    return (
      <SectionCard>
        <p className="text-sm text-red-300" role="alert">
          {denied ? 'You do not have permission to view Team Intelligence.' : 'Could not load Team Intelligence.'}
        </p>
      </SectionCard>
    )
  }
  const data = query.data
  if (!data?.members.length)
    return (
      <SectionCard>
        <EmptyState icon={<span>👥</span>} title="No team members yet" description="Invite collaborators to see workload intelligence." />
      </SectionCard>
    )

  return (
    <div className="space-y-4" dir="auto">
      <TeamSummary summary={data.summary} language={language} />

      <FilterBar filters={filters} onChange={setFilters} members={members} />

      <WorkloadComparison members={visible} metric={metric} onMetric={setMetric} />

      <section aria-label="Team members" className="grid gap-3 lg:grid-cols-2">
        {visible.length ? (
          visible.map((member) => <MemberCard key={member.userId} member={member} deadlineDelay={data.summary.forecastDelay.minutes} />)
        ) : (
          <p className="text-sm text-[var(--bp-muted)]">No members match these filters.</p>
        )}
      </section>

      {data.warnings.length ? (
        <SectionCard>
          <h3 className="text-xs font-black uppercase tracking-wide text-[var(--bp-muted)]">Warnings</h3>
          <ul className="mt-1 space-y-1" aria-live="polite">
            {data.warnings.map((warning) => (
              <li key={warning} className="text-xs text-amber-300">
                {warning}
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <p className="text-[11px] text-[var(--bp-muted)]">
        {data.viewerRole === 'owner' ? 'Full Team Intelligence.' : 'Read-only Team Intelligence.'} All figures are computed on the server from the
        resource-aware forecast. Workload redistribution arrives in a later phase.
      </p>
    </div>
  )
}

// --- Section 1: Team Summary -------------------------------------------------

function TeamSummary({ summary, language }: { summary: TeamInsightsSummary; language: 'en' | 'ar' }) {
  const health = HEALTH_META[summary.health]
  const delay = summary.forecastDelay
  return (
    <SectionCard>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-black text-[var(--bp-text)]">Team health</h3>
        <span className={`flex items-center gap-1 rounded-full bg-[var(--bp-border)]/50 px-2 py-0.5 text-xs font-black ${TONE_TEXT[health.tone]}`}>
          <span aria-hidden="true">{health.icon}</span> {health.label}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 xl:grid-cols-5">
        <Stat label="Workload balance" value={`${summary.balancePercent}%`} />
        <Stat label="Total remaining" value={fmt(summary.remainingMinutes)} />
        <Stat label="Total capacity" value={fmt(summary.availableMinutes)} />
        <Stat label="Capacity shortfall" value={summary.capacityShortfallMinutes > 0 ? fmt(summary.capacityShortfallMinutes) : 'None'} tone={summary.capacityShortfallMinutes > 0 ? 'danger' : 'ok'} />
        <Stat label="Overloaded members" value={String(summary.overloadedCount)} tone={summary.overloadedCount > 0 ? 'danger' : 'ok'} />
        <Stat label="Available members" value={String(summary.availableCount)} tone="ok" />
        <Stat label="Blocked critical items" value={String(summary.blockedCriticalCount)} tone={summary.blockedCriticalCount > 0 ? 'danger' : 'ok'} />
        <Stat label="Forecast completion" value={summary.forecastCompletion ? formatDate(summary.forecastCompletion, language) : 'Unavailable'} />
        <Stat label="Forecast delay" value={delay.minutes > 0 ? `${delay.days} day${delay.days === 1 ? '' : 's'}` : 'On time'} tone={delay.minutes > 0 ? 'danger' : 'ok'} />
        <Stat label="Unassigned work" value={summary.unassigned.remainingMinutes > 0 ? `${fmt(summary.unassigned.remainingMinutes)} · ${summary.unassigned.itemCount}` : 'None'} tone={summary.unassigned.remainingMinutes > 0 ? 'warn' : 'ok'} />
      </dl>
    </SectionCard>
  )
}

function Stat({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: Tone }) {
  return (
    <div>
      <dt className="text-[10px] font-black uppercase tracking-wide text-[var(--bp-muted)]">{label}</dt>
      <dd className={`mt-0.5 text-base font-black ${TONE_TEXT[tone]}`}>{value}</dd>
    </div>
  )
}

// --- Section 7: Filters ------------------------------------------------------

function FilterBar({
  filters,
  onChange,
  members,
}: {
  filters: Filters
  onChange: (next: Filters) => void
  members: TeamInsightsMember[]
}) {
  const selectClass = 'rounded-lg border border-[var(--bp-border)] bg-[var(--bp-card)] px-2 py-1.5 text-xs text-[var(--bp-text)]'
  const focusedName = filters.memberId
    ? members.find((member) => member.userId === filters.memberId)?.name
    : null
  const quicks: { key: QuickFilter; label: string }[] = [
    { key: 'critical', label: 'Critical work' },
    { key: 'blocked', label: 'Blocked work' },
    { key: 'overloaded', label: 'Overloaded' },
    { key: 'available', label: 'Available' },
  ]
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Team filters">
      <QuickChip active={filters.quick === null && filters.role === 'all' && filters.status === 'all'} onClick={() => onChange(EMPTY_FILTERS)}>
        All
      </QuickChip>
      {quicks.map((quick) => (
        <QuickChip key={quick.key} active={filters.quick === quick.key} onClick={() => onChange({ ...filters, quick: filters.quick === quick.key ? null : quick.key })}>
          {quick.label}
        </QuickChip>
      ))}
      <select aria-label="Filter by role" value={filters.role} onChange={(e) => onChange({ ...filters, role: e.target.value as Filters['role'] })} className={selectClass}>
        {['all', 'owner', 'editor', 'viewer'].map((role) => (
          <option key={role} value={role}>
            {role === 'all' ? 'All roles' : role[0].toUpperCase() + role.slice(1)}
          </option>
        ))}
      </select>
      <select aria-label="Filter by status" value={filters.status} onChange={(e) => onChange({ ...filters, status: e.target.value as Filters['status'] })} className={selectClass}>
        <option value="all">All statuses</option>
        {(Object.keys(STATUS_META) as TeamMemberStatus[]).map((status) => (
          <option key={status} value={status}>
            {STATUS_META[status].label}
          </option>
        ))}
      </select>
      {filters.memberId ? (
        <span className="flex items-center gap-1.5 rounded-full bg-[var(--bp-accent)]/15 px-3 py-1 text-xs font-bold text-[var(--bp-accent-ink)]">
          Showing {focusedName ?? 'one member'} only
          <button
            type="button"
            onClick={() => onChange({ ...filters, memberId: null })}
            aria-label="Show the whole team again"
            className="font-black"
          >
            ×
          </button>
        </span>
      ) : null}
    </div>
  )
}

function QuickChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1 text-xs font-bold ${active ? 'border border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] text-[var(--bp-accent-text,#000)]' : 'border border-[var(--bp-border)] text-[var(--bp-text)] hover:bg-[var(--bp-border)]/40'}`}
    >
      {children}
    </button>
  )
}

// --- Section 3: Workload Comparison -----------------------------------------

function WorkloadComparison({ members, metric, onMetric }: { members: TeamInsightsMember[]; metric: MetricKey; onMetric: (key: MetricKey) => void }) {
  const active = METRICS.find((m) => m.key === metric)!
  const rows = [...members].map((member) => ({ member, value: active.value(member) }))
  const max = Math.max(1, ...rows.map((row) => row.value))
  if (!rows.length) return null
  return (
    <SectionCard>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-black text-[var(--bp-text)]">Workload comparison</h3>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Comparison metric">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => onMetric(m.key)}
              aria-pressed={m.key === metric}
              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${m.key === metric ? 'border border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] text-[var(--bp-accent-text,#000)]' : 'border border-[var(--bp-border)] text-[var(--bp-subtle)]'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <ul className="space-y-2">
        {rows.map(({ member, value }) => {
          const pct = Math.round((value / max) * 100)
          const tone: Tone = metric === 'utilisation' ? STATUS_META[member.status].tone : member.isBottleneck ? 'danger' : 'accent'
          return (
            <li key={member.userId} className="grid grid-cols-[7rem_1fr_auto] items-center gap-2">
              <span className="truncate text-xs font-semibold text-[var(--bp-text)]" title={member.name}>
                {member.isBottleneck ? '⭐ ' : ''}
                {member.name}
              </span>
              <span className="h-3 overflow-hidden rounded-full bg-[var(--bp-border)]/40" role="img" aria-label={`${member.name}: ${active.fmt(value)}`}>
                <span className={`block h-3 rounded-full ${TONE_BAR[tone]}`} style={{ width: `${Math.max(2, pct)}%` }} />
              </span>
              <span className="text-xs font-bold text-[var(--bp-subtle)]">{active.fmt(value)}</span>
            </li>
          )
        })}
      </ul>
    </SectionCard>
  )
}

// --- Section 2/4/5/6: Member card (expandable) -------------------------------

function MemberCard({ member, deadlineDelay }: { member: TeamInsightsMember; deadlineDelay: number }) {
  const [open, setOpen] = useState(false)
  const status = STATUS_META[member.status]
  const width = Math.min(100, member.utilisationPercent)
  return (
    <article className={`rounded-xl border p-3 ${member.isBottleneck ? 'border-red-400/60' : 'border-[var(--bp-border)]'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {member.avatarUrl ? (
            <img src={member.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
          ) : (
            <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-full bg-[var(--bp-accent)]/20 text-sm font-black">
              {member.name.slice(0, 1)}
            </span>
          )}
          <span className="min-w-0">
            <b className="block truncate text-sm text-[var(--bp-text)]">{member.name}</b>
            <small className="block text-xs text-[var(--bp-muted)]">{member.role}</small>
          </span>
        </div>
        <span className={`flex shrink-0 items-center gap-1 rounded-full bg-[var(--bp-border)]/50 px-2 py-0.5 text-[10px] font-black ${TONE_TEXT[status.tone]}`}>
          <span aria-hidden="true">{status.icon}</span> {status.label}
        </span>
      </div>

      {member.isBottleneck ? (
        <p className="mt-2 rounded-lg bg-red-500/10 px-2 py-1 text-xs font-black text-red-300">⭐ Project bottleneck</p>
      ) : null}

      <div
        className="mt-3 h-2 rounded bg-[var(--bp-border)]"
        role="progressbar"
        aria-label={`${member.name} utilisation ${member.utilisationPercent}%`}
        aria-valuemin={0}
        aria-valuenow={member.utilisationPercent}
        aria-valuemax={100}
      >
        <div className={`h-2 rounded ${TONE_BAR[status.tone]}`} style={{ width: `${width}%` }} />
      </div>
      <p className="mt-1 text-xs text-[var(--bp-muted)]">
        {member.utilisationPercent}% · {fmt(member.remainingMinutes)} of {fmt(member.availableMinutes)} capacity · {CAPACITY_LABEL[member.status]}
      </p>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="mt-2 text-xs font-bold text-[var(--bp-accent-ink)] hover:underline"
      >
        {open ? 'Hide details' : 'Show details'}
      </button>

      {open ? (
        <div className="mt-2 space-y-3 border-t border-[var(--bp-border)] pt-2">
          <Group title="Workload">
            <Cell label="Remaining" value={fmt(member.remainingMinutes)} />
            <Cell label="Capacity" value={fmt(member.availableMinutes)} />
            <Cell label="Overload" value={member.overloadMinutes > 0 ? fmt(member.overloadMinutes) : 'None'} />
            <Cell label="Focus time" value={fmt(member.actualMinutes)} />
            <Cell label="Completed work" value={fmt(member.completedMinutes)} />
            <Cell label="Assigned" value={String(member.assignedItemCount)} />
          </Group>
          <Group title="Assignment readiness">
            <Cell label="Ready" value={String(member.readyItemCount)} />
            <Cell label="Blocked" value={String(member.blockedItemCount)} />
            <Cell label="Critical" value={String(member.criticalItemCount)} />
            <Cell label="Future" value={String(member.futureItemCount)} />
            <Cell label="Completed" value={String(member.completedItemCount)} />
            <Cell label="Unscheduled" value={String(member.unscheduledItemCount)} />
          </Group>
          <Group title="Capacity analysis">
            <Cell label="Current capacity" value={fmt(member.availableMinutes)} />
            <Cell label="Remaining capacity" value={fmt(Math.max(0, member.availableMinutes - member.remainingMinutes))} />
            <Cell label="Overload" value={member.overloadMinutes > 0 ? fmt(member.overloadMinutes) : 'None'} />
            <Cell label="Status" value={CAPACITY_LABEL[member.status]} />
          </Group>
          <Group title="Forecast impact">
            <Cell label="Delay contribution" value={member.forecastDelayMinutes > 0 ? fmt(member.forecastDelayMinutes) : 'None'} />
            <Cell label="Critical assignments" value={String(member.criticalItemCount)} />
            <Cell label="Capacity bottleneck" value={member.isBottleneck ? 'Yes' : 'No'} />
            <Cell label="Project delay" value={deadlineDelay > 0 ? fmt(deadlineDelay) : 'On time'} />
          </Group>
        </div>
      ) : null}
    </article>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-1 text-[10px] font-black uppercase tracking-wide text-[var(--bp-muted)]">{title}</h4>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">{children}</dl>
    </div>
  )
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-[11px] text-[var(--bp-muted)]">{label}</dt>
      <dd className="text-xs font-bold text-[var(--bp-text)]">{value}</dd>
    </div>
  )
}
