import { Modal } from '../../../../components/layout/Modal'
import { formatDate } from '../../../../lib/dateTime'
import { formatDuration } from '../../../../lib/subtaskDisplay'
import { useLanguage } from '../../../../i18n/LanguageContext'
import type { ProjectPlanNode, ProjectPlanSchedule } from '../../api/project-plan.api'

type Props = {
  node: ProjectPlanNode | null
  nodesById: Map<string, ProjectPlanNode>
  onClose: () => void
  schedule?: ProjectPlanSchedule
  /** Backend forecast flag: the node's assignee is over capacity in the forecast window. */
  overloaded?: boolean
}

const STATUS_LABEL: Record<string, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  missed: 'Missed',
}

/**
 * The ONE detail surface shared by the Dependency Graph (node click) and the
 * Timeline (row select) — selecting either opens this exact component, so the
 * two views can never drift. Pure presentation over the backend-normalized
 * node; no calculations here.
 */
export function PlanNodeDetail({ node, nodesById, schedule, overloaded = false, onClose }: Props) {
  const { language } = useLanguage()
  if (!node) return null

  const titlesFor = (ids: string[]) =>
    ids.map((id) => nodesById.get(id)?.title ?? 'Unknown item')

  const blockedBy = titlesFor(node.blockedByIds)
  const blocking = titlesFor(node.blockingIds)
  const forecastStatus = schedule?.forecastStatus
  const resourceDelayMinutes = schedule?.resourceConflictMinutes ?? 0
  // The resource-aware forecast window takes precedence over the dependency-only one.
  const forecastStart = schedule?.forecastStart ?? node.forecastStart
  const forecastEnd = schedule?.forecastEnd ?? node.forecastEnd

  return (
    <Modal open={Boolean(node)} title={node.title} description={node.entityType === 'subtask' ? 'Subtask' : 'Task'} onClose={onClose} size="md">
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-2">
          <Badge tone={node.isBlocked ? 'danger' : 'neutral'}>{STATUS_LABEL[node.status] ?? node.status}</Badge>
          {node.isBlocked ? <Badge tone="danger">Blocked</Badge> : null}
          {node.inCycle ? <Badge tone="danger">In a dependency cycle</Badge> : null}
          {node.isExternal ? <Badge tone="warning">Other task</Badge> : null}
          {schedule?.isCritical ? <Badge tone="danger">Critical path</Badge> : null}
          {resourceDelayMinutes > 0 ? <Badge tone="danger">Resource delayed</Badge> : null}
          {forecastStatus === 'unscheduled' || forecastStatus === 'in_cycle' ? <Badge tone="warning">Unscheduled</Badge> : null}
          {overloaded ? <Badge tone="danger">Over capacity</Badge> : null}
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
          <Field label="Owner">{node.assignee?.displayName ?? 'Unassigned'}</Field>
          <Field label="Due date">{node.dueDate ? formatDate(node.dueDate, language) : 'None'}</Field>
          <Field label="Estimated">{node.estimatedMinutes != null ? formatDuration(node.estimatedMinutes) || '0 min' : '—'}</Field>
          <Field label="Actual">{node.actualMinutes != null ? formatDuration(node.actualMinutes) || '0 min' : '—'}</Field>
          <Field label="Remaining">{node.remainingMinutes != null ? formatDuration(node.remainingMinutes) || '0 min' : '—'}</Field>
          <Field label="Progress">{node.progressPercent}%</Field>
          <Field label="Planned">{windowLabel(node.plannedStart, node.plannedEnd, language)}</Field>
          <Field label="Forecast">{windowLabel(forecastStart, forecastEnd, language)}</Field>
          <Field label="Resource delay">{resourceDelayMinutes > 0 ? `${formatFloatHours(resourceDelayMinutes)} waiting on assignee` : 'None'}</Field>
          <Field label="Scheduling flexibility">{schedule?.isCritical ? 'On the critical path' : schedule?.totalFloatMinutes != null ? formatFloatHours(schedule.totalFloatMinutes) : '—'}</Field>
        </dl>

        {schedule?.forecastReason ? <p className="rounded-lg bg-[var(--bp-border)]/40 px-3 py-2 text-xs text-[var(--bp-text)]"><span className="font-black uppercase tracking-wide text-[var(--bp-muted)]">Forecast · </span>{schedule.forecastReason}</p> : null}
        {overloaded ? <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300"><span className="font-black uppercase tracking-wide">Capacity impact · </span>This item's assignee is over capacity in the forecast window.</p> : null}

        {node.focusSummary ? (
          <p className="text-xs text-[var(--bp-muted)]">
            Focus: {node.focusSummary.sessionCount} session{node.focusSummary.sessionCount === 1 ? '' : 's'} ·{' '}
            {formatDuration(node.focusSummary.spentMinutes) || '0 min'} tracked
          </p>
        ) : null}

        <DependencyList label="Blocked by" titles={blockedBy} emptyLabel="Nothing — ready to start" />
        <DependencyList label="Blocking" titles={blocking} emptyLabel="Nothing downstream" />
      </div>
    </Modal>
  )
}

function windowLabel(start: string | null, end: string | null, language: 'en' | 'ar'): string {
  if (!start && !end) return '—'
  const s = start ? formatDate(start, language) : '?'
  const e = end ? formatDate(end, language) : '?'
  return `${s} → ${e}`
}

function formatFloatHours(minutes: number): string {
  const hours = Math.round((minutes / 60) * 10) / 10
  return `${hours} hour${hours === 1 ? '' : 's'}`
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-black uppercase tracking-wide text-[var(--bp-muted)]">{label}</dt>
      <dd className="font-semibold text-[var(--bp-text)]">{children}</dd>
    </div>
  )
}

function DependencyList({ label, titles, emptyLabel }: { label: string; titles: string[]; emptyLabel: string }) {
  return (
    <div>
      <h4 className="mb-1 text-[10px] font-black uppercase tracking-wide text-[var(--bp-muted)]">{label}</h4>
      {titles.length ? (
        <ul className="space-y-1">
          {titles.map((title, i) => (
            <li key={`${title}-${i}`} className="rounded-lg border border-[var(--bp-border)] px-2 py-1 text-xs text-[var(--bp-text)]">
              {title}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[var(--bp-muted)]">{emptyLabel}</p>
      )}
    </div>
  )
}

function Badge({ tone, children }: { tone: 'danger' | 'warning' | 'neutral'; children: React.ReactNode }) {
  const cls =
    tone === 'danger'
      ? 'bg-red-500/15 text-red-300'
      : tone === 'warning'
        ? 'bg-amber-500/15 text-amber-300'
        : 'bg-[var(--bp-border)] text-[var(--bp-subtle)]'
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${cls}`}>{children}</span>
}
