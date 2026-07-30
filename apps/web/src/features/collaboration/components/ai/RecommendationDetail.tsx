import { Modal } from '../../../../components/layout/Modal'
import { PrimaryButton, OutlineButton } from '../../../../components/layout/Buttons'
import { formatDate } from '../../../../lib/dateTime'
import { useLanguage } from '../../../../i18n/LanguageContext'
import { friendlyError } from '../../errorMessages'
import {
  useSuggestionPreviewQuery,
  type DetailedRecommendation,
  type PreviewDelta,
  type PreviewSnapshot,
  type RecommendationPreview,
} from '../../api/ai-collaboration.api'
import {
  CONFIDENCE_ICON,
  CONFIDENCE_LABEL,
  CONFIDENCE_TEXT_CLASS,
  DIRECTION_ICON,
  DIRECTION_LABEL,
  DIRECTION_TEXT_CLASS,
  formatDeltaChange,
  formatDeltaValue,
  formatMinutes,
} from '../../lib/recommendation.view'
import type { OverviewTab } from './OverviewPanel'
import type { PlanFocus } from '../../api/ai-collaboration.api'

type Props = {
  taskId: string
  accessToken: string
  recommendation: DetailedRecommendation
  onClose: () => void
  onApprove: () => void
  onDismiss: () => void
  onNavigate: (tab: OverviewTab, focus?: PlanFocus) => void
  approving: boolean
  dismissing: boolean
}

/**
 * The review step of the decision loop: Problem → Evidence → How it was detected
 * → Expected improvement → exactly what would change → a real before/after
 * preview of Forecast, Health, Capacity and Critical Work.
 *
 * The preview is fetched from the backend, which computes it by running the same
 * deterministic engines against a hypothetical plan. Nothing is mutated until
 * the user presses Approve.
 */
export function RecommendationDetail({
  taskId,
  accessToken,
  recommendation,
  onClose,
  onApprove,
  onDismiss,
  onNavigate,
  approving,
  dismissing,
}: Props) {
  const query = useSuggestionPreviewQuery(taskId, recommendation.id, accessToken)
  const busy = approving || dismissing

  return (
    <Modal
      open
      size="md"
      title={recommendation.title}
      description={recommendation.message}
      onClose={onClose}
      footer={
        <>
          <OutlineButton
            size="sm"
            disabled={busy}
            onClick={() => {
              onNavigate(recommendation.navigation.tab, recommendation.navigation.focus)
              onClose()
            }}
          >
            {recommendation.navigation.label}
          </OutlineButton>
          {recommendation.canDismiss ? (
            <OutlineButton size="sm" loading={dismissing} disabled={busy} onClick={onDismiss}>
              {dismissing ? 'Dismissing…' : 'Dismiss'}
            </OutlineButton>
          ) : null}
          {recommendation.canApprove ? (
            <PrimaryButton size="sm" loading={approving} disabled={busy} onClick={onApprove}>
              {approving ? 'Approving…' : 'Approve'}
            </PrimaryButton>
          ) : null}
        </>
      }
    >
      <div className="mt-4 space-y-4" dir="auto">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[var(--bp-accent)]/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[var(--bp-accent-ink)]">
            {recommendation.kindLabel}
          </span>
          <span
            className={`text-[11px] font-black uppercase tracking-wide ${CONFIDENCE_TEXT_CLASS[recommendation.confidence.level]}`}
          >
            <span aria-hidden="true">{CONFIDENCE_ICON[recommendation.confidence.level]} </span>
            {CONFIDENCE_LABEL[recommendation.confidence.level]} — {recommendation.confidence.reason}
          </span>
        </div>

        <Section title="Problem">
          <p className="text-sm text-[var(--bp-text)]">{recommendation.explanation.problem}</p>
        </Section>

        <Section title="How this was detected">
          <p className="text-sm text-[var(--bp-text)]">{recommendation.explanation.detection}</p>
        </Section>

        <Section title="Evidence">
          <ul className="space-y-1">
            {recommendation.explanation.evidence.map((line, index) => (
              <li key={index} className="text-sm text-[var(--bp-subtle)]">
                <span aria-hidden="true">• </span>
                {line}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Expected improvement">
          <p className="text-sm text-[var(--bp-text)]">{recommendation.explanation.expectedImprovement}</p>
        </Section>

        <Section title="Why this confidence">
          <ul className="space-y-1">
            {recommendation.confidence.basis.map((line, index) => (
              <li key={index} className="text-xs text-[var(--bp-muted)]">
                <span aria-hidden="true">• </span>
                {line}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="What changes if you approve">
          <ul className="space-y-1">
            {recommendation.changes.map((change) => (
              <li key={`${change.subtaskId}-${change.kind}`} className="text-sm text-[var(--bp-text)]">
                <span aria-hidden="true">→ </span>
                {change.summary}
              </li>
            ))}
          </ul>
        </Section>

        <PreviewSection query={query} />
      </div>
    </Modal>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-[10px] font-black uppercase tracking-wide text-[var(--bp-muted)]">{title}</h3>
      {children}
    </section>
  )
}

// --- Preview ----------------------------------------------------------------

function PreviewSection({
  query,
}: {
  query: ReturnType<typeof useSuggestionPreviewQuery>
}) {
  if (query.isLoading) {
    return (
      <Section title="Preview changes">
        <p className="text-sm text-[var(--bp-muted)]" role="status" aria-live="polite">
          Calculating the impact…
        </p>
      </Section>
    )
  }

  if (query.isError) {
    return (
      <Section title="Preview changes">
        <p className="text-sm text-red-300" role="alert">
          {friendlyError(query.error, 'Could not calculate the impact of this recommendation.')}
        </p>
      </Section>
    )
  }

  const preview = query.data
  if (!preview) return null

  return (
    <Section title="Preview changes">
      <p className={`text-sm font-semibold ${preview.isNoOp ? 'text-amber-300' : 'text-[var(--bp-text)]'}`}>
        {preview.summary}
      </p>
      <p className="mt-0.5 text-[11px] text-[var(--bp-muted)]">
        Nothing has been changed — this is a simulation of the plan after approval.
      </p>

      <DeltaTable deltas={preview.deltas} />
      <BeforeAfter preview={preview} />
    </Section>
  )
}

function DeltaTable({ deltas }: { deltas: PreviewDelta[] }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[26rem] text-start text-xs">
        <caption className="sr-only">Projected change for each tracked metric</caption>
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-[var(--bp-muted)]">
            <th scope="col" className="pb-1 text-start font-black">Metric</th>
            <th scope="col" className="pb-1 text-end font-black">Before</th>
            <th scope="col" className="pb-1 text-end font-black">After</th>
            <th scope="col" className="pb-1 text-end font-black">Change</th>
          </tr>
        </thead>
        <tbody>
          {deltas.map((delta) => (
            <tr key={delta.key} className="border-t border-[var(--bp-border)]/60">
              <th scope="row" className="py-1 text-start font-semibold text-[var(--bp-text)]">
                {delta.label}
              </th>
              <td className="py-1 text-end text-[var(--bp-muted)]">{formatDeltaValue(delta.before, delta.unit)}</td>
              <td className="py-1 text-end font-bold text-[var(--bp-text)]">
                {formatDeltaValue(delta.after, delta.unit)}
              </td>
              <td className={`py-1 text-end font-bold ${DIRECTION_TEXT_CLASS[delta.direction]}`}>
                <span aria-hidden="true">{DIRECTION_ICON[delta.direction]} </span>
                <span className="sr-only">{DIRECTION_LABEL[delta.direction]}: </span>
                {formatDeltaChange(delta)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BeforeAfter({ preview }: { preview: RecommendationPreview }) {
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <SnapshotCard title="Before" snapshot={preview.before} />
      <SnapshotCard title="After" snapshot={preview.after} tone="accent" />
    </div>
  )
}

function SnapshotCard({
  title,
  snapshot,
  tone = 'neutral',
}: {
  title: string
  snapshot: PreviewSnapshot
  tone?: 'neutral' | 'accent'
}) {
  const { language } = useLanguage()
  const date = (value: string | null) => (value ? formatDate(value, language) : '—')

  return (
    <article
      className={`rounded-xl border p-3 ${
        tone === 'accent' ? 'border-[var(--bp-accent)]/50 bg-[var(--bp-accent)]/5' : 'border-[var(--bp-border)]'
      }`}
    >
      <h4 className="mb-2 text-[10px] font-black uppercase tracking-wide text-[var(--bp-muted)]">{title}</h4>

      <Group title="Forecast">
        <Row label="Completion">{date(snapshot.forecast.projectedCompletion)}</Row>
        <Row label="Delay">
          {snapshot.forecast.delayDays > 0
            ? `${snapshot.forecast.delayDays} day${snapshot.forecast.delayDays === 1 ? '' : 's'} late`
            : 'On or before'}
        </Row>
        <Row label="Shortfall">
          {snapshot.forecast.capacityShortfallMinutes > 0
            ? formatMinutes(snapshot.forecast.capacityShortfallMinutes)
            : 'None'}
        </Row>
        <Row label="Bottleneck">{snapshot.forecast.bottleneck?.assigneeName ?? 'None'}</Row>
      </Group>

      <Group title="Health">
        <Row label="Overall">
          {snapshot.health.overallScore == null ? '—' : `${snapshot.health.overallScore}%`}
        </Row>
        <Row label="Schedule">
          {snapshot.health.scheduleScore == null ? '—' : `${snapshot.health.scheduleScore}%`}
        </Row>
        <Row label="Capacity">
          {snapshot.health.capacityScore == null ? '—' : `${snapshot.health.capacityScore}%`}
        </Row>
      </Group>

      <Group title="Capacity">
        <Row label="Balance">{`${snapshot.capacity.balancePercent}%`}</Row>
        <Row label="Over capacity">{String(snapshot.capacity.overloadedCount)}</Row>
        <Row label="Remaining">{formatMinutes(snapshot.capacity.remainingMinutes)}</Row>
      </Group>

      <Group title="Critical work">
        <Row label="Items">{String(snapshot.criticalWork.itemCount)}</Row>
        <Row label="Blocked">{String(snapshot.criticalWork.blockedCount)}</Row>
        <Row label="Finishes">{date(snapshot.criticalWork.projectedCompletion)}</Row>
      </Group>

      <Group title="Work">
        <Row label="Blocked items">{String(snapshot.work.blockedItemCount)}</Row>
        <Row label="Ready">{String(snapshot.work.readyItemCount)}</Row>
        <Row label="Open">{String(snapshot.work.openItemCount)}</Row>
      </Group>
    </article>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-2 first:mt-0">
      <h5 className="text-[10px] font-black uppercase tracking-wide text-[var(--bp-muted)]">{title}</h5>
      <dl className="mt-0.5 space-y-0.5">{children}</dl>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-[11px] text-[var(--bp-muted)]">{label}</dt>
      <dd className="text-end text-[11px] font-bold text-[var(--bp-text)]">{children}</dd>
    </div>
  )
}
