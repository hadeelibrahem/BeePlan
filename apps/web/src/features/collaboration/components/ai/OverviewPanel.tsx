import { SectionCard } from '../../../../components/layout/SectionCard'
import { StatsCard } from '../../../../components/layout/StatsCard'
import { EmptyState } from '../../../../components/layout/EmptyState'
import { PrimaryButton, OutlineButton } from '../../../../components/layout/Buttons'
import { formatDate } from '../../../../lib/dateTime'
import { formatDuration } from '../../../../lib/subtaskDisplay'
import { useLanguage } from '../../../../i18n/LanguageContext'
import {
  useOverviewQuery,
  type CollaborationOverview,
  type DoThisNow,
  type OverviewAlert,
  type PlanFocus,
  type ProjectHealth,
} from '../../api/ai-collaboration.api'
import { friendlyError } from '../../errorMessages'
import { SuggestionsFeed } from './SuggestionsFeed'

export type OverviewTab = 'plan' | 'team' | 'health'

type Props = {
  taskId: string
  accessToken: string
  /** `focus` carries backend-provided filters so a deep link lands on the work itself. */
  onNavigate: (tab: OverviewTab, focus?: PlanFocus) => void
  /** Start a focus session on the recommended unit. Absent = action hidden. */
  onStartFocus?: (input: {
    taskId: string
    taskTitle: string
    subtaskId: string | null
    subtaskTitle: string | null
    estimatedMinutes: number | null
  }) => void
  /** Open the parent task's detail screen. */
  onViewDetails?: () => void
}

const HEALTH_LABEL: Record<ProjectHealth['status'], string> = {
  complete: 'Complete',
  on_track: 'On track',
  at_risk: 'At risk',
  needs_attention: 'Needs attention',
}

const HEALTH_TONE_CLASS: Record<ProjectHealth['tone'], string> = {
  success: 'text-green-400',
  positive: 'text-[var(--bp-accent-ink)]',
  warning: 'text-amber-400',
  danger: 'text-red-400',
}

const STATUS_LABEL: Record<string, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  missed: 'Missed',
}

/**
 * The AI Collaboration **Overview** — a concise project command centre. Every
 * value comes from the backend `/overview` aggregation (no client-side health
 * scoring), and each section links into the Plan / Team / Health tab that owns
 * the full report rather than duplicating it here.
 */
export function OverviewPanel({ taskId, accessToken, onNavigate, onStartFocus, onViewDetails }: Props) {
  const query = useOverviewQuery(taskId, accessToken)

  if (query.isLoading) return <OverviewSkeleton />

  if (query.isError) {
    const status = (query.error as { status?: number })?.status
    if (status === 403) {
      return (
        <SectionCard>
          <EmptyState
            icon={<span>🔒</span>}
            title="No access to this overview"
            description="You don't have permission to view this project's overview."
          />
        </SectionCard>
      )
    }
    return (
      <SectionCard>
        <p className="text-sm font-semibold text-red-300">
          {friendlyError(query.error, 'Could not load the overview. Please try again.')}
        </p>
      </SectionCard>
    )
  }

  const data = query.data
  if (!data) return null

  const { status, doThisNow, alerts, plan, team } = data
  const isEmpty =
    status.totalCount === 0 &&
    !doThisNow &&
    alerts.length === 0 &&
    team.contributorCount === 0 &&
    status.pendingActionCount === 0
  if (isEmpty) {
    return (
      <SectionCard>
        <EmptyState
          icon={<span>🧭</span>}
          title="Nothing to show yet"
          description="Once this project has work, assignees, and a plan, its command centre will appear here."
        />
      </SectionCard>
    )
  }

  return (
    <div className="space-y-4">
      <StatusCards data={data} />
      {/* Directly below "Pending actions": the decisions those pending actions
          refer to, with Review / Approve / Dismiss in place. */}
      <SuggestionsFeed taskId={taskId} accessToken={accessToken} onNavigate={onNavigate} />
      <DoThisNowCard
        doThisNow={doThisNow}
        onNavigate={onNavigate}
        onStartFocus={onStartFocus}
        onViewDetails={onViewDetails}
      />
      <CriticalAlerts alerts={alerts} onNavigate={onNavigate} />
      <div className="grid gap-4 lg:grid-cols-2">
        <PlanSnapshotCard plan={plan} onNavigate={onNavigate} />
        <TeamSnapshotCard team={team} onNavigate={onNavigate} />
      </div>
    </div>
  )
}

// --- 1. Project Status Cards ------------------------------------------------

function StatusCards({ data }: { data: CollaborationOverview }) {
  const { status } = data
  const health = status.health
  const deadlineValue = status.deadline
    ? formatDate(status.deadline)
    : status.isDeadlineAtRisk
      ? 'At risk'
      : 'No deadline'

  return (
    <div className="space-y-2">
      {/* Team count is intentionally secondary metadata, not a primary card. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          icon={<span>🎯</span>}
          value={`${status.overallPercent}%`}
          title="Overall progress"
          desc={`${status.completedCount} of ${status.totalCount} done`}
        />
        {health ? (
          <StatsCard
            icon={<span>❤️</span>}
            value={<span className={HEALTH_TONE_CLASS[health.tone]}>{HEALTH_LABEL[health.status]}</span>}
            title="Project health"
            desc="Based on progress, due dates & blockers"
          />
        ) : (
          <StatsCard icon={<span>❤️</span>} value="—" title="Project health" desc="No work to assess yet" />
        )}
        <StatsCard
          icon={<span>📅</span>}
          value={deadlineValue}
          title={status.isDeadlineAtRisk ? 'Deadline · at risk' : 'Deadline'}
          desc={status.isDeadlineAtRisk ? 'Overdue or past the finish date' : 'Current finish target'}
        />
        <StatsCard
          icon={<span>✅</span>}
          value={String(status.pendingActionCount)}
          title="Pending actions"
          desc={status.pendingActionCount ? 'Need your decision' : "You're all caught up"}
        />
      </div>
      <p className="text-[11px] text-[var(--bp-muted)]">
        {status.teamMemberCount} contributor{status.teamMemberCount === 1 ? '' : 's'} tracked
      </p>
    </div>
  )
}

// --- 2. Do This Now ---------------------------------------------------------

function DoThisNowCard({
  doThisNow,
  onNavigate,
  onStartFocus,
  onViewDetails,
}: {
  doThisNow: DoThisNow | null
  onNavigate: (tab: OverviewTab) => void
  onStartFocus?: Props['onStartFocus']
  onViewDetails?: () => void
}) {
  const { language } = useLanguage()

  if (!doThisNow) {
    return (
      <SectionCard>
        <h3 className="mb-2 text-[10px] font-black uppercase tracking-wide text-[var(--bp-muted)]">Do this now</h3>
        <EmptyState
          icon={<span>🌱</span>}
          title="Nothing assigned to you right now"
          description="When you have an executable item on this project, it'll appear here ready to start."
        />
      </SectionCard>
    )
  }

  const meta: string[] = []
  if (doThisNow.assignee) meta.push(doThisNow.assignee.displayName)
  if (doThisNow.estimatedRemainingMinutes != null) {
    meta.push(`${formatDuration(doThisNow.estimatedRemainingMinutes) || '0 min'} left`)
  }
  if (doThisNow.dueDate) meta.push(`Due ${formatDate(doThisNow.dueDate, language)}`)

  return (
    <SectionCard>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-black uppercase tracking-wide text-[var(--bp-muted)]">Do this now</h3>
        <div className="flex flex-wrap gap-1.5">
          {doThisNow.isOverdue ? <Chip tone="danger">Overdue</Chip> : null}
          {doThisNow.isBlocked ? <Chip tone="warning">Blocked</Chip> : null}
          <Chip tone="neutral">{STATUS_LABEL[doThisNow.status] ?? doThisNow.status}</Chip>
        </div>
      </div>

      {doThisNow.kind === 'subtask' ? (
        <p className="text-[11px] font-semibold text-[var(--bp-muted)]">{doThisNow.parentTaskTitle}</p>
      ) : null}
      <p className="text-base font-black text-[var(--bp-text)]">{doThisNow.title}</p>

      {meta.length ? <p className="mt-1 text-xs text-[var(--bp-muted)]">{meta.join(' · ')}</p> : null}
      {doThisNow.blocksCount > 0 ? (
        <p className="mt-1 text-[11px] text-[var(--bp-accent-ink)]">
          Unblocks {doThisNow.blocksCount} downstream item{doThisNow.blocksCount === 1 ? '' : 's'} when done
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-[var(--bp-border)] pt-3">
        <OutlineButton size="sm" onClick={() => onNavigate('plan')}>
          Open in Plan
        </OutlineButton>
        {onViewDetails ? (
          <OutlineButton size="sm" onClick={onViewDetails}>
            View details
          </OutlineButton>
        ) : null}
        {doThisNow.canStartFocus && onStartFocus ? (
          <PrimaryButton
            size="sm"
            onClick={() =>
              onStartFocus({
                taskId: doThisNow.taskId,
                taskTitle: doThisNow.parentTaskTitle,
                subtaskId: doThisNow.subtaskId,
                subtaskTitle: doThisNow.kind === 'subtask' ? doThisNow.title : null,
                estimatedMinutes: doThisNow.estimatedRemainingMinutes,
              })
            }
          >
            Start focus
          </PrimaryButton>
        ) : null}
      </div>
    </SectionCard>
  )
}

// --- 3. Critical Alerts -----------------------------------------------------

const ALERT_LINK_LABEL: Record<OverviewAlert['link'], string> = {
  health: 'Health',
  plan: 'Plan',
  team: 'Team',
}

function CriticalAlerts({
  alerts,
  onNavigate,
}: {
  alerts: OverviewAlert[]
  onNavigate: (tab: OverviewTab, focus?: PlanFocus) => void
}) {
  if (!alerts.length) return null

  return (
    <SectionCard>
      <h3 className="mb-3 text-[10px] font-black uppercase tracking-wide text-[var(--bp-muted)]">
        Critical alerts ({alerts.length})
      </h3>
      <ul className="space-y-2">
        {alerts.map((alert) => (
          <li key={alert.id} className="rounded-xl border border-[var(--bp-border)] p-3">
            <div className="mb-1 flex items-center gap-2">
              <Chip tone={alert.severity === 'critical' ? 'danger' : 'warning'}>
                {alert.severity === 'critical' ? 'Critical' : 'Warning'}
              </Chip>
              <span className="text-sm font-bold text-[var(--bp-text)]">{alert.title}</span>
            </div>
            <p className="text-xs text-[var(--bp-muted)]">{alert.reason}</p>
            <p className="mt-0.5 text-[11px] text-[var(--bp-muted)]">Impact: {alert.impact}</p>
            <div className="mt-2 flex justify-end">
              <OutlineButton
                size="sm"
                onClick={() =>
                  alert.focus ? onNavigate(alert.link, alert.focus) : onNavigate(alert.link)
                }
              >
                Go to {ALERT_LINK_LABEL[alert.link]}
              </OutlineButton>
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}

// --- 4. Plan Snapshot -------------------------------------------------------

function PlanSnapshotCard({
  plan,
  onNavigate,
}: {
  plan: CollaborationOverview['plan']
  onNavigate: (tab: OverviewTab) => void
}) {
  const { language } = useLanguage()
  return (
    <SectionCard>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[10px] font-black uppercase tracking-wide text-[var(--bp-muted)]">Plan snapshot</h3>
        <button type="button" onClick={() => onNavigate('plan')} className="text-[11px] font-bold text-[var(--bp-accent-ink)]">
          Open Plan →
        </button>
      </div>
      <dl className="space-y-2 text-sm">
        <Row label="Remaining work">
          {plan.remainingEstimatedMinutes != null ? formatDuration(plan.remainingEstimatedMinutes) || '0 min' : 'Not estimated'}
        </Row>
        <Row label="Blocked items">{String(plan.blockedCount)}</Row>
        <Row label="Critical path">{plan.criticalPathSummary ?? 'Not available yet'}</Row>
        <Row label="Forecast date">{plan.forecastDate ? formatDate(plan.forecastDate, language) : 'Not available yet'}</Row>
        <Row label="Deadline">{plan.deadline ? formatDate(plan.deadline, language) : 'None set'}</Row>
        <Row label="Available capacity">
          {plan.availableCapacityMemberCount} member{plan.availableCapacityMemberCount === 1 ? '' : 's'} with room
        </Row>
      </dl>
    </SectionCard>
  )
}

// --- 5. Team Snapshot -------------------------------------------------------

function TeamSnapshotCard({
  team,
  onNavigate,
}: {
  team: CollaborationOverview['team']
  onNavigate: (tab: OverviewTab) => void
}) {
  return (
    <SectionCard>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[10px] font-black uppercase tracking-wide text-[var(--bp-muted)]">Team snapshot</h3>
        <button type="button" onClick={() => onNavigate('team')} className="text-[11px] font-bold text-[var(--bp-accent-ink)]">
          Open Team →
        </button>
      </div>
      {team.contributorCount === 0 ? (
        <p className="text-xs text-[var(--bp-muted)]">No contributors tracked yet.</p>
      ) : (
        <dl className="space-y-2 text-sm">
          <Row label="Contributors">{String(team.contributorCount)}</Row>
          <Row label="Workload balance">
            {team.balance ? (team.balance === 'balanced' ? 'Balanced' : 'Uneven') : 'Not enough data'}
          </Row>
          {team.mostOverloaded ? (
            <Row label="Most loaded">
              {team.mostOverloaded.displayName} · {team.mostOverloaded.loadPercent}%
            </Row>
          ) : null}
          {team.mostAvailable ? (
            <Row label="Most available">
              {team.mostAvailable.displayName} · {team.mostAvailable.loadPercent}%
            </Row>
          ) : null}
        </dl>
      )}
    </SectionCard>
  )
}

// --- Shared bits ------------------------------------------------------------

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs text-[var(--bp-muted)]">{label}</dt>
      <dd className="text-end text-sm font-semibold text-[var(--bp-text)]">{children}</dd>
    </div>
  )
}

function Chip({ tone, children }: { tone: 'danger' | 'warning' | 'neutral'; children: React.ReactNode }) {
  const cls =
    tone === 'danger'
      ? 'bg-red-500/15 text-red-300'
      : tone === 'warning'
        ? 'bg-amber-500/15 text-amber-300'
        : 'bg-[var(--bp-border)] text-[var(--bp-subtle)]'
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${cls}`}>{children}</span>
  )
}

function OverviewSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading overview…</span>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-border)]/30" />
        ))}
      </div>
      <div className="h-32 animate-pulse rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-border)]/30" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-40 animate-pulse rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-border)]/30" />
        <div className="h-40 animate-pulse rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-border)]/30" />
      </div>
    </div>
  )
}
