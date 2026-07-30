import { SecondaryButton, OutlineButton } from '../../../../components/layout/Buttons'
import { formatDuration } from '../../../../lib/subtaskDisplay'
import { formatDate } from '../../../../lib/dateTime'
import { useLanguage } from '../../../../i18n/LanguageContext'
import type { DetailedRecommendation, RecommendationImpact } from '../../api/ai-collaboration.api'
import {
  CONFIDENCE_ICON,
  CONFIDENCE_LABEL,
  CONFIDENCE_TEXT_CLASS,
  DIRECTION_ICON,
  DIRECTION_LABEL,
  DIRECTION_TEXT_CLASS,
  RELATION_LABEL,
  formatImpactValue,
} from '../../lib/recommendation.view'

type Props = {
  recommendation: DetailedRecommendation
  onReview: () => void
  onApprove: () => void
  onDismiss: () => void
  approving: boolean
  dismissing: boolean
}

const RESOLVED_LABEL: Record<string, string> = {
  approved: 'Approved',
  dismissed: 'Dismissed',
  auto_resolved: 'Resolved automatically',
}

/**
 * One recommendation, showing the whole case for it before any action: what it
 * is, why it exists, what it would improve, how complete the data behind it is,
 * and exactly which work and people it touches. Approve/Dismiss appear only when
 * the backend says this viewer may act (`canApprove` / `canDismiss`); the server
 * re-checks editor+ regardless, so hiding them is an affordance, not the gate.
 */
/**
 * Measured before/after for every metric that changes. Metrics that do not move
 * are omitted entirely by the backend, so this block is never padded with
 * "no change" rows — and a recommendation where nothing moves is auto-resolved
 * before it can reach this component.
 */
function ImpactBlock({ impact }: { impact: RecommendationImpact }) {
  const { language } = useLanguage()
  const hasDate = Boolean(impact.forecastDateBefore && impact.forecastDateAfter)
  if (!impact.metrics.length && !hasDate) return null

  return (
    <div className="mt-2 rounded-lg border border-[var(--bp-border)] bg-[var(--bp-border)]/20 p-2">
      <h4 className="mb-1 text-[10px] font-black uppercase tracking-wide text-[var(--bp-muted)]">
        Measured impact
      </h4>
      <dl className="space-y-0.5">
        {hasDate ? (
          <ImpactRow
            label="Forecast"
            before={formatDate(impact.forecastDateBefore!, language)}
            after={formatDate(impact.forecastDateAfter!, language)}
            direction="better"
            showDirection={false}
          />
        ) : null}
        {impact.metrics.map((metric) => (
          <ImpactRow
            key={metric.key}
            label={metric.label}
            before={formatImpactValue(metric.before, metric.unit)}
            after={formatImpactValue(metric.after, metric.unit)}
            direction={metric.direction}
          />
        ))}
      </dl>
    </div>
  )
}

function ImpactRow({
  label,
  before,
  after,
  direction,
  showDirection = true,
}: {
  label: string
  before: string
  after: string
  direction: 'better' | 'worse' | 'unchanged'
  showDirection?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <dt className="text-[var(--bp-muted)]">{label}</dt>
      <dd className="flex items-center gap-1.5 font-bold">
        <span className="text-[var(--bp-muted)] line-through decoration-slate-500/60">{before}</span>
        <span aria-hidden="true" className="text-[var(--bp-muted)]">
          →
        </span>
        <span className={showDirection ? DIRECTION_TEXT_CLASS[direction] : 'text-[var(--bp-text)]'}>
          {showDirection ? (
            <>
              <span aria-hidden="true">{DIRECTION_ICON[direction]} </span>
              <span className="sr-only">{DIRECTION_LABEL[direction]}: </span>
            </>
          ) : null}
          {after}
        </span>
      </dd>
    </div>
  )
}

export function SuggestionCard({
  recommendation,
  onReview,
  onApprove,
  onDismiss,
  approving,
  dismissing,
}: Props) {
  const isPending = recommendation.status === 'pending'
  const confidence = recommendation.confidence
  const busy = approving || dismissing

  return (
    <li
      className={`rounded-xl border p-3 ${
        isPending ? 'border-[var(--bp-border)]' : 'border-[var(--bp-border)]/60 opacity-60'
      }`}
    >
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-[var(--bp-accent)]/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[var(--bp-accent-ink)]">
          {recommendation.kindLabel}
        </span>
        {isPending ? (
          <span
            className={`text-[10px] font-black uppercase tracking-wide ${CONFIDENCE_TEXT_CLASS[confidence.level]}`}
            title={confidence.reason}
          >
            <span aria-hidden="true">{CONFIDENCE_ICON[confidence.level]} </span>
            {CONFIDENCE_LABEL[confidence.level]} — {confidence.reason}
          </span>
        ) : (
          <span className="text-[10px] font-black uppercase tracking-wide text-[var(--bp-muted)]">
            {recommendation.resolutionLabel ??
              RESOLVED_LABEL[recommendation.status] ??
              recommendation.status}
          </span>
        )}
      </div>

      <p className="text-sm font-bold text-[var(--bp-text)]">{recommendation.title}</p>
      <p className="mt-1 text-sm text-[var(--bp-muted)]">{recommendation.message}</p>

      <dl className="mt-2 space-y-1">
        <div className="flex gap-1.5 text-[11px]">
          <dt className="shrink-0 font-black uppercase tracking-wide text-[var(--bp-muted)]">Why</dt>
          <dd className="text-[var(--bp-muted)]">{recommendation.reason}</dd>
        </div>
      </dl>

      {/* Measured effect from the shared simulation — the same numbers the
          preview shows, and only the metrics that actually move. */}
      {isPending && recommendation.impact ? <ImpactBlock impact={recommendation.impact} /> : null}

      {recommendation.affectedItems.length ? (
        <div className="mt-2">
          <h4 className="text-[10px] font-black uppercase tracking-wide text-[var(--bp-muted)]">Affected work</h4>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {recommendation.affectedItems.map((item) => (
              <li
                key={item.subtaskId}
                className="rounded-full border border-[var(--bp-border)] px-2 py-0.5 text-[11px] text-[var(--bp-text)]"
              >
                {item.title}
                {item.estimatedDurationMinutes != null ? (
                  <span className="text-[var(--bp-muted)]"> · {formatDuration(item.estimatedDurationMinutes)}</span>
                ) : (
                  <span className="text-[var(--bp-muted)]"> · no estimate</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {recommendation.affectedMembers.length ? (
        <div className="mt-2">
          <h4 className="text-[10px] font-black uppercase tracking-wide text-[var(--bp-muted)]">Affected members</h4>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {recommendation.affectedMembers.map((member) => (
              <li
                key={member.userId}
                className="rounded-full bg-[var(--bp-border)]/50 px-2 py-0.5 text-[11px] text-[var(--bp-text)]"
              >
                <span className="text-[var(--bp-muted)]">{RELATION_LABEL[member.relation]}:</span> {member.displayName}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {isPending && recommendation.blockers.length ? (
        <ul className="mt-2 space-y-0.5" aria-label="Why this cannot be applied">
          {recommendation.blockers.map((blocker) => (
            <li key={blocker} className="text-[11px] text-amber-300">
              <span aria-hidden="true">⚠ </span>
              {blocker}
            </li>
          ))}
        </ul>
      ) : null}

      {isPending ? (
        <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-[var(--bp-border)] pt-3">
          {recommendation.canPreview ? (
            <OutlineButton
              size="sm"
              disabled={busy}
              onClick={onReview}
              aria-label={`Review ${recommendation.title}`}
            >
              Review
            </OutlineButton>
          ) : null}
          {recommendation.canDismiss ? (
            <OutlineButton
              size="sm"
              loading={dismissing}
              disabled={busy}
              onClick={onDismiss}
              aria-label={`Dismiss ${recommendation.title}`}
            >
              {dismissing ? 'Dismissing…' : 'Dismiss'}
            </OutlineButton>
          ) : null}
          {recommendation.canApprove ? (
            <SecondaryButton
              size="sm"
              loading={approving}
              disabled={busy}
              onClick={onApprove}
              aria-label={`Approve ${recommendation.title}`}
            >
              {approving ? 'Approving…' : 'Approve'}
            </SecondaryButton>
          ) : null}
          {!recommendation.canDismiss ? (
            <p className="self-center text-[11px] text-[var(--bp-muted)]">
              You can review this, but only an editor or the owner can act on it.
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}
