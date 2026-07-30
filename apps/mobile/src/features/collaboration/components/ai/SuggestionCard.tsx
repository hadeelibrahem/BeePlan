import { Text, View } from 'react-native';
import { OutlineButton, PrimaryButton, SecondaryButton } from '../../../../components/layout';
import { useTheme } from '../../../../theme/useTheme';
import { formatDuration } from '../../../../lib/subtasks';
import type {
  DetailedRecommendation,
  RecommendationImpact,
  SuggestionKind,
  SuggestionStatus,
} from '../../api/ai-collaboration.api';
import {
  CONFIDENCE_ICON,
  CONFIDENCE_LABEL,
  DIRECTION_ICON,
  DIRECTION_LABEL,
  RELATION_LABEL,
  formatDeltaValue,
} from '../../lib/recommendation.view';

type Props = {
  recommendation: DetailedRecommendation;
  onReview?: () => void;
  onApprove?: () => void;
  onDismiss?: () => void;
  approving?: boolean;
  dismissing?: boolean;
};

const KIND_ICON: Record<SuggestionKind, string> = {
  ahead_of_pace: '🚀',
  inactive_member: '💤',
  deadline_risk: '⏰',
  workload_imbalance: '⚖️',
};

const RESOLVED_LABEL: Partial<Record<SuggestionStatus, string>> = {
  approved: 'Approved',
  dismissed: 'Dismissed',
  auto_resolved: 'Resolved automatically',
};

/**
 * One recommendation, showing the whole case for it before any action: what it
 * is, why it exists, what it would improve, how complete the underlying data is,
 * and which work and people it touches. Approve/Dismiss render only when the
 * backend says this viewer may act; the server re-checks editor+ regardless.
 */
/**
 * Measured before/after for every metric that changes. Metrics that do not move
 * are omitted by the backend, and a recommendation where nothing moves is
 * auto-resolved before it can reach this component.
 */
function ImpactBlock({
  impact,
  colors,
}: {
  impact: RecommendationImpact;
  colors: ReturnType<typeof useTheme>['theme']['colors'];
}) {
  const hasDate = Boolean(impact.forecastDateBefore && impact.forecastDateAfter);
  if (!impact.metrics.length && !hasDate) return null;

  const toneFor = (direction: 'better' | 'worse' | 'unchanged') =>
    direction === 'better' ? colors.success : direction === 'worse' ? colors.error : colors.text;

  return (
    <View className="mt-2 rounded-lg border p-2" style={{ borderColor: colors.border }}>
      <Text className="mb-1 text-[10px] font-black uppercase tracking-wide" style={{ color: colors.secondaryText }}>
        Measured impact
      </Text>

      {hasDate ? (
        <View className="flex-row items-center justify-between gap-2 py-0.5">
          <Text className="text-[11px]" style={{ color: colors.secondaryText }}>
            Forecast
          </Text>
          <Text className="text-[11px] font-bold" style={{ color: colors.text }}>
            {formatShortDate(impact.forecastDateBefore)} → {formatShortDate(impact.forecastDateAfter)}
          </Text>
        </View>
      ) : null}

      {impact.metrics.map((metric) => (
        <View
          key={metric.key}
          className="flex-row items-center justify-between gap-2 py-0.5"
          accessibilityLabel={`${metric.label}: ${DIRECTION_LABEL[metric.direction]}, from ${formatDeltaValue(metric.before, metric.unit)} to ${formatDeltaValue(metric.after, metric.unit)}`}
        >
          <Text className="text-[11px]" style={{ color: colors.secondaryText }}>
            {metric.label}
          </Text>
          <Text className="text-[11px] font-bold" style={{ color: toneFor(metric.direction) }}>
            {formatDeltaValue(metric.before, metric.unit)} →{' '}
            {DIRECTION_ICON[metric.direction]} {formatDeltaValue(metric.after, metric.unit)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function formatShortDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}

export function SuggestionCard({
  recommendation,
  onReview,
  onApprove,
  onDismiss,
  approving,
  dismissing,
}: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const isPending = recommendation.status === 'pending';
  const busy = Boolean(approving || dismissing);

  const confidenceColor =
    recommendation.confidence.level === 'high'
      ? colors.success
      : recommendation.confidence.level === 'medium'
        ? colors.warning
        : colors.error;

  return (
    <View
      className="mb-2 rounded-xl border p-3"
      style={{
        borderColor: isPending ? colors.accent : colors.border,
        backgroundColor: isPending ? `${colors.accent}0D` : colors.background,
        opacity: isPending ? 1 : 0.65,
      }}
    >
      <View className="mb-1 flex-row items-start gap-2">
        <Text className="text-base">{KIND_ICON[recommendation.kind]}</Text>
        <View className="flex-1">
          <Text className="text-sm font-black" style={{ color: colors.text }}>
            {recommendation.title}
          </Text>
          <Text className="mt-0.5 text-xs leading-4" style={{ color: colors.secondaryText }}>
            {recommendation.message}
          </Text>
        </View>
      </View>

      {isPending ? (
        <Text className="mt-1 text-[11px] font-black uppercase tracking-wide" style={{ color: confidenceColor }}>
          {CONFIDENCE_ICON[recommendation.confidence.level]}{' '}
          {CONFIDENCE_LABEL[recommendation.confidence.level]} — {recommendation.confidence.reason}
        </Text>
      ) : null}

      <Text className="mt-1 text-[11px] leading-4" style={{ color: colors.secondaryText }}>
        Why: {recommendation.reason}
      </Text>

      {/* Measured effect from the shared simulation — the same numbers the
          review sheet shows, and only the metrics that actually move. */}
      {isPending && recommendation.impact ? (
        <ImpactBlock impact={recommendation.impact} colors={colors} />
      ) : null}

      {recommendation.affectedItems.length ? (
        <View className="mt-2">
          <Text className="text-[10px] font-black uppercase tracking-wide" style={{ color: colors.secondaryText }}>
            Affected work
          </Text>
          {recommendation.affectedItems.map((item) => (
            <Text key={item.subtaskId} className="mt-0.5 text-[11px]" style={{ color: colors.text }}>
              • {item.title}
              {item.estimatedDurationMinutes != null
                ? ` · ${formatDuration(item.estimatedDurationMinutes)}`
                : ' · no estimate'}
            </Text>
          ))}
        </View>
      ) : null}

      {recommendation.affectedMembers.length ? (
        <View className="mt-2">
          <Text className="text-[10px] font-black uppercase tracking-wide" style={{ color: colors.secondaryText }}>
            Affected members
          </Text>
          {recommendation.affectedMembers.map((member) => (
            <Text key={member.userId} className="mt-0.5 text-[11px]" style={{ color: colors.text }}>
              • {RELATION_LABEL[member.relation]}: {member.displayName}
            </Text>
          ))}
        </View>
      ) : null}

      {isPending && recommendation.blockers.length ? (
        <View className="mt-2">
          {recommendation.blockers.map((blocker) => (
            <Text key={blocker} className="text-[11px]" style={{ color: colors.warning }}>
              ⚠ {blocker}
            </Text>
          ))}
        </View>
      ) : null}

      {isPending ? (
        <View className="mt-2 gap-2">
          {recommendation.canPreview ? (
            <SecondaryButton
              size="sm"
              onPress={onReview}
              disabled={busy}
              accessibilityLabel={`Review ${recommendation.title}`}
            >
              Review
            </SecondaryButton>
          ) : null}
          {recommendation.canDismiss || recommendation.canApprove ? (
            <View className="flex-row gap-2">
              {recommendation.canDismiss ? (
                <OutlineButton
                  className="flex-1"
                  size="sm"
                  onPress={onDismiss}
                  loading={dismissing}
                  disabled={busy}
                  accessibilityLabel={`Dismiss ${recommendation.title}`}
                >
                  Dismiss
                </OutlineButton>
              ) : null}
              {recommendation.canApprove ? (
                <PrimaryButton
                  className="flex-1"
                  size="sm"
                  onPress={onApprove}
                  loading={approving}
                  disabled={busy}
                  accessibilityLabel={`Approve ${recommendation.title}`}
                >
                  Approve
                </PrimaryButton>
              ) : null}
            </View>
          ) : (
            <Text className="text-[11px]" style={{ color: colors.secondaryText }}>
              You can review this, but only an editor or the owner can act on it.
            </Text>
          )}
        </View>
      ) : (
        <Text className="mt-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: colors.secondaryText }}>
          {recommendation.resolutionLabel ?? RESOLVED_LABEL[recommendation.status]}
        </Text>
      )}
    </View>
  );
}
