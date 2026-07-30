import { useState } from 'react'
import { EmptyState } from '../../../../components/layout/EmptyState'
import { SectionCard } from '../../../../components/layout/SectionCard'
import {
  useProjectHealthQuery,
  type HealthStatus,
  type MetricHealth,
  type ProjectHealthReport,
} from '../../api/ai-collaboration.api'

type Props = { taskId: string; accessToken: string; onNavigate?: (tab: 'plan' | 'team' | 'health') => void }

type Tone = 'ok' | 'accent' | 'warn' | 'danger' | 'neutral'
const STATUS_META: Record<HealthStatus, { label: string; icon: string; tone: Tone }> = {
  healthy: { label: 'Healthy', icon: '✓', tone: 'ok' },
  balanced: { label: 'Balanced', icon: '≈', tone: 'accent' },
  warning: { label: 'Warning', icon: '▲', tone: 'warn' },
  at_risk: { label: 'At risk', icon: '⚠', tone: 'danger' },
  critical: { label: 'Critical', icon: '✕', tone: 'danger' },
  no_data: { label: 'No data', icon: '–', tone: 'neutral' },
}
const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-emerald-300',
  accent: 'text-sky-300',
  warn: 'text-amber-300',
  danger: 'text-red-300',
  neutral: 'text-[var(--bp-subtle)]',
}
const TONE_BAR: Record<Tone, string> = {
  ok: 'bg-emerald-400',
  accent: 'bg-sky-400',
  warn: 'bg-amber-400',
  danger: 'bg-red-400',
  neutral: 'bg-[var(--bp-border)]',
}

const METRICS: { key: keyof Pick<ProjectHealthReport, 'schedule' | 'capacity' | 'dependency' | 'execution' | 'focus' | 'collaboration'>; label: string }[] = [
  { key: 'schedule', label: 'Schedule' },
  { key: 'capacity', label: 'Capacity' },
  { key: 'dependency', label: 'Dependency' },
  { key: 'execution', label: 'Execution' },
  { key: 'focus', label: 'Focus' },
  { key: 'collaboration', label: 'Collaboration' },
]

/**
 * Project Health dashboard (read-only). Every score, status, reason, contributor
 * and warning comes from GET /ai/collaboration/health, which deterministically
 * blends the Critical Path, Resource Forecast, Resource Lanes, Team Intelligence
 * and Focus data. The client renders only — no health formulas live here.
 */
export function ProjectHealthPanel({ taskId, accessToken, onNavigate }: Props) {
  const query = useProjectHealthQuery(taskId, accessToken)

  if (query.isLoading)
    return (
      <SectionCard>
        <p className="text-sm text-[var(--bp-muted)]" role="status">
          Loading Project Health…
        </p>
      </SectionCard>
    )
  if (query.isError) {
    const denied = (query.error as Error & { status?: number }).status === 403
    return (
      <SectionCard>
        <p className="text-sm text-red-300" role="alert">
          {denied ? 'You do not have permission to view Project Health.' : 'Could not load Project Health.'}
        </p>
      </SectionCard>
    )
  }
  const data = query.data
  if (!data) return <SectionCard><EmptyState icon={<span>🩺</span>} title="No health data yet" description="Add work and assignees to see project health." /></SectionCard>

  return (
    <div className="space-y-4" dir="auto">
      <OverallHealth overall={data.overall} />
      <HealthBreakdown data={data} />
      <Contributors contributors={data.contributors} />
      <Warnings warnings={data.warnings} onNavigate={onNavigate} />
      <Trend trend={data.trend} />
      <p className="text-[11px] text-[var(--bp-muted)]">
        Read-only. Health is computed on the server from the resource-aware forecast, critical path, team capacity, and focus history.
      </p>
    </div>
  )
}

// --- Section 1: Overall ------------------------------------------------------

function OverallHealth({ overall }: { overall: MetricHealth }) {
  const meta = STATUS_META[overall.status]
  const score = overall.score ?? 0
  return (
    <SectionCard>
      <div className="flex flex-wrap items-center gap-4">
        <div
          className="grid h-24 w-24 shrink-0 place-items-center rounded-full border-4"
          role="img"
          aria-label={`Project health ${score} percent, ${meta.label}`}
          style={{ borderColor: 'var(--bp-border)' }}
        >
          <span className={`text-2xl font-black ${TONE_TEXT[meta.tone]}`}>{score}%</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wide text-[var(--bp-muted)]">Project health</span>
            <span className={`flex items-center gap-1 rounded-full bg-[var(--bp-border)]/50 px-2 py-0.5 text-xs font-black ${TONE_TEXT[meta.tone]}`}>
              <span aria-hidden="true">{meta.icon}</span> {meta.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--bp-text)]">{overall.reason}</p>
          <div className="mt-2 h-2 rounded-full bg-[var(--bp-border)]/40" role="progressbar" aria-label="Overall health" aria-valuemin={0} aria-valuenow={score} aria-valuemax={100}>
            <div className={`h-2 rounded-full ${TONE_BAR[meta.tone]}`} style={{ width: `${score}%` }} />
          </div>
        </div>
      </div>
    </SectionCard>
  )
}

// --- Section 2: Breakdown (expandable) --------------------------------------

function HealthBreakdown({ data }: { data: ProjectHealthReport }) {
  return (
    <section aria-label="Health breakdown" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {METRICS.map((metric) => (
        <MetricCard key={metric.key} label={metric.label} metric={data[metric.key]} />
      ))}
    </section>
  )
}

function MetricCard({ label, metric }: { label: string; metric: MetricHealth }) {
  const [open, setOpen] = useState(false)
  const meta = STATUS_META[metric.status]
  const score = metric.score
  const detailEntries = Object.entries(metric.details)
  return (
    <article className="rounded-xl border border-[var(--bp-border)] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-black text-[var(--bp-text)]">{label} health</span>
        <span className={`flex items-center gap-1 text-xs font-black ${TONE_TEXT[meta.tone]}`}>
          <span aria-hidden="true">{meta.icon}</span> {score == null ? '—' : `${score}%`}
        </span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-[var(--bp-border)]/40" role="progressbar" aria-label={`${label} health`} aria-valuemin={0} aria-valuenow={score ?? 0} aria-valuemax={100}>
        <div className={`h-1.5 rounded-full ${TONE_BAR[meta.tone]}`} style={{ width: `${score ?? 0}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-[var(--bp-muted)]">{metric.reason}</p>
      {detailEntries.length ? (
        <>
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-1.5 text-[11px] font-bold text-[var(--bp-accent-ink)] hover:underline">
            {open ? 'Hide details' : 'Show details'}
          </button>
          {open ? (
            <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
              {detailEntries.map(([key, value]) => (
                <div key={key} className="flex items-center justify-between gap-2">
                  <dt className="text-[11px] text-[var(--bp-muted)]">{humanize(key)}</dt>
                  <dd className="text-[11px] font-bold text-[var(--bp-text)]">{formatValue(value)}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </>
      ) : null}
    </article>
  )
}

// --- Section 9: Contributors -------------------------------------------------

function Contributors({ contributors }: { contributors: ProjectHealthReport['contributors'] }) {
  if (!contributors.positive.length && !contributors.negative.length) return null
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SectionCard>
        <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-emerald-300">Helping</h3>
        <ul className="space-y-1">
          {contributors.positive.length ? (
            contributors.positive.map((c, i) => (
              <li key={i} className="text-sm text-[var(--bp-text)]">
                <span aria-hidden="true">✓ </span>
                {c.text}
              </li>
            ))
          ) : (
            <li className="text-xs text-[var(--bp-muted)]">Nothing notable.</li>
          )}
        </ul>
      </SectionCard>
      <SectionCard>
        <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-red-300">Hurting</h3>
        <ul className="space-y-1">
          {contributors.negative.length ? (
            contributors.negative.map((c, i) => (
              <li key={i} className="text-sm text-[var(--bp-text)]">
                <span aria-hidden="true">⚠ </span>
                {c.text}
              </li>
            ))
          ) : (
            <li className="text-xs text-[var(--bp-muted)]">Nothing hurting the project.</li>
          )}
        </ul>
      </SectionCard>
    </div>
  )
}

// --- Section 11: Warnings ----------------------------------------------------

function Warnings({ warnings, onNavigate }: { warnings: ProjectHealthReport['warnings']; onNavigate?: Props['onNavigate'] }) {
  if (!warnings.length) return null
  const groups = [...new Set(warnings.map((w) => w.group))]
  return (
    <SectionCard>
      <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-[var(--bp-muted)]">Warnings</h3>
      <div className="space-y-3">
        {groups.map((group) => (
          <div key={group}>
            <h4 className="text-[11px] font-black uppercase tracking-wide text-[var(--bp-muted)]">{group}</h4>
            <ul className="mt-1 space-y-1">
              {warnings.filter((w) => w.group === group).map((w, i) => (
                <li key={i} className="flex items-center justify-between gap-2">
                  <span className={`text-sm ${w.severity === 'critical' ? 'text-red-300' : 'text-amber-300'}`}>
                    <span aria-hidden="true">{w.severity === 'critical' ? '✕ ' : '⚠ '}</span>
                    {w.message}
                  </span>
                  {onNavigate && w.link !== 'health' ? (
                    <button type="button" onClick={() => onNavigate(w.link)} className="shrink-0 rounded-full border border-[var(--bp-border)] px-2 py-0.5 text-[11px] font-bold text-[var(--bp-text)] hover:bg-[var(--bp-border)]/40">
                      Open {w.link === 'plan' ? 'Plan' : 'Team'}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

// --- Section 10: Trend -------------------------------------------------------

function Trend({ trend }: { trend: ProjectHealthReport['trend'] }) {
  return (
    <SectionCard>
      <h3 className="text-xs font-black uppercase tracking-wide text-[var(--bp-muted)]">Health trend</h3>
      {trend.available && trend.points.length ? (
        <div className="mt-2 flex items-end gap-3">
          {trend.points.map((point, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <span className="text-sm font-black text-[var(--bp-text)]">{point.score}%</span>
              <span className="text-[10px] text-[var(--bp-muted)]">{point.label}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-sm text-[var(--bp-muted)]">{trend.reason ?? 'Trend unavailable'}</p>
      )}
    </SectionCard>
  )
}

// --- Helpers -----------------------------------------------------------------

function humanize(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\bMinutes\b/, 'min')
    .trim()
}

function formatValue(value: number | string | boolean | null): string {
  if (value === null) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}
