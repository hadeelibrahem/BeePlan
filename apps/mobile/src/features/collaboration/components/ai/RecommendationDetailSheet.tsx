import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LoadingState, OutlineButton, PrimaryButton, SecondaryButton } from '../../../../components/layout';
import { useTheme } from '../../../../theme/useTheme';
import { friendlyError } from '../../errorMessages';
import {
  useSuggestionPreviewQuery,
  type DetailedRecommendation,
  type PlanFocus,
  type PreviewSnapshot,
} from '../../api/ai-collaboration.api';
import {
  CONFIDENCE_ICON,
  CONFIDENCE_LABEL,
  DIRECTION_ICON,
  DIRECTION_LABEL,
  formatDeltaChange,
  formatDeltaValue,
  formatMinutes,
} from '../../lib/recommendation.view';
import type { OverviewTab } from './OverviewPanel';

type Props = {
  taskId: string;
  recommendation: DetailedRecommendation;
  onClose: () => void;
  onApprove: () => void;
  onDismiss: () => void;
  onNavigate: (tab: OverviewTab, focus?: PlanFocus) => void;
  approving: boolean;
  dismissing: boolean;
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

/**
 * The review step of the decision loop on mobile: Problem → Evidence → How it
 * was detected → Expected improvement → exactly what would change → a real
 * before/after preview of Forecast, Health, Capacity and Critical Work.
 *
 * The preview comes from the backend, which runs the same deterministic engines
 * against a hypothetical plan. Nothing mutates until Approve is pressed.
 */
export function RecommendationDetailSheet({
  taskId,
  recommendation,
  onClose,
  onApprove,
  onDismiss,
  onNavigate,
  approving,
  dismissing,
}: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const query = useSuggestionPreviewQuery(taskId, recommendation.id);
  const busy = approving || dismissing;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <Pressable
          className="flex-1"
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close recommendation review"
        />

        <View
          className="rounded-t-[28px] border px-5 pt-3"
          style={{
            maxHeight: '90%',
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
            paddingBottom: insets.bottom + 20,
          }}
        >
          <View className="mx-auto mb-4 h-1.5 w-14 rounded-full" style={{ backgroundColor: colors.border }} />

          <Text className="text-lg font-black" style={{ color: colors.text }}>
            {recommendation.title}
          </Text>
          <Text className="mt-1 text-xs leading-4" style={{ color: colors.secondaryText }}>
            {recommendation.kindLabel} · {CONFIDENCE_ICON[recommendation.confidence.level]}{' '}
            {CONFIDENCE_LABEL[recommendation.confidence.level]} — {recommendation.confidence.reason}
          </Text>

          <ScrollView className="mt-3" showsVerticalScrollIndicator={false}>
            <Section title="Problem">
              <Body>{recommendation.explanation.problem}</Body>
            </Section>

            <Section title="How this was detected">
              <Body>{recommendation.explanation.detection}</Body>
            </Section>

            <Section title="Evidence">
              {recommendation.explanation.evidence.map((line, index) => (
                <Bullet key={index}>{line}</Bullet>
              ))}
            </Section>

            <Section title="Expected improvement">
              <Body>{recommendation.explanation.expectedImprovement}</Body>
            </Section>

            <Section title="Why this confidence">
              {recommendation.confidence.basis.map((line, index) => (
                <Bullet key={index}>{line}</Bullet>
              ))}
            </Section>

            <Section title="What changes if you approve">
              {recommendation.changes.map((change) => (
                <Bullet key={`${change.subtaskId}-${change.kind}`}>{change.summary}</Bullet>
              ))}
            </Section>

            <Section title="Preview changes">
              {query.isLoading ? (
                <LoadingState rows={3} />
              ) : query.isError ? (
                <Text className="text-sm" style={{ color: colors.error }}>
                  {friendlyError(query.error, 'Could not calculate the impact of this recommendation.')}
                </Text>
              ) : query.data ? (
                <View>
                  <Text
                    className="text-sm font-bold"
                    style={{ color: query.data.isNoOp ? colors.warning : colors.text }}
                  >
                    {query.data.summary}
                  </Text>
                  <Text className="mt-0.5 text-[11px]" style={{ color: colors.secondaryText }}>
                    Nothing has been changed — this is a simulation of the plan after approval.
                  </Text>

                  <View className="mt-3">
                    {query.data.deltas.map((delta) => (
                      <View
                        key={delta.key}
                        className="flex-row items-center justify-between border-t py-1.5"
                        style={{ borderColor: colors.border }}
                        accessibilityLabel={`${delta.label}: ${DIRECTION_LABEL[delta.direction]}, was ${formatDeltaValue(delta.before, delta.unit)}, now ${formatDeltaValue(delta.after, delta.unit)}`}
                      >
                        <Text className="flex-1 text-xs font-semibold" style={{ color: colors.text }}>
                          {delta.label}
                        </Text>
                        <Text className="w-20 text-end text-xs" style={{ color: colors.secondaryText }}>
                          {formatDeltaValue(delta.before, delta.unit)}
                        </Text>
                        <Text className="w-20 text-end text-xs font-bold" style={{ color: colors.text }}>
                          {formatDeltaValue(delta.after, delta.unit)}
                        </Text>
                        <Text
                          className="w-20 text-end text-xs font-bold"
                          style={{
                            color:
                              delta.direction === 'better'
                                ? colors.success
                                : delta.direction === 'worse'
                                  ? colors.error
                                  : colors.secondaryText,
                          }}
                        >
                          {DIRECTION_ICON[delta.direction]} {formatDeltaChange(delta)}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <SnapshotBlock title="Before" snapshot={query.data.before} />
                  <SnapshotBlock title="After" snapshot={query.data.after} accent />
                </View>
              ) : null}
            </Section>
          </ScrollView>

          <View className="mt-3 gap-2">
            <SecondaryButton
              size="sm"
              disabled={busy}
              onPress={() => {
                onNavigate(recommendation.navigation.tab, recommendation.navigation.focus);
                onClose();
              }}
            >
              {recommendation.navigation.label}
            </SecondaryButton>
            {recommendation.canDismiss || recommendation.canApprove ? (
              <View className="flex-row gap-2">
                {recommendation.canDismiss ? (
                  <OutlineButton className="flex-1" size="sm" onPress={onDismiss} loading={dismissing} disabled={busy}>
                    Dismiss
                  </OutlineButton>
                ) : null}
                {recommendation.canApprove ? (
                  <PrimaryButton className="flex-1" size="sm" onPress={onApprove} loading={approving} disabled={busy}>
                    Approve
                  </PrimaryButton>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <View className="mb-3">
      <Text
        className="mb-1 text-[10px] font-black uppercase tracking-wide"
        style={{ color: theme.colors.secondaryText }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <Text className="text-sm leading-5" style={{ color: theme.colors.text }}>
      {children}
    </Text>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <Text className="mt-0.5 text-xs leading-4" style={{ color: theme.colors.secondaryText }}>
      • {children}
    </Text>
  );
}

function SnapshotBlock({
  title,
  snapshot,
  accent,
}: {
  title: string;
  snapshot: PreviewSnapshot;
  accent?: boolean;
}) {
  const { theme } = useTheme();
  const { colors } = theme;
  return (
    <View
      className="mt-3 rounded-xl border p-3"
      style={{
        borderColor: accent ? colors.accent : colors.border,
        backgroundColor: accent ? `${colors.accent}0D` : 'transparent',
      }}
    >
      <Text className="mb-1 text-[10px] font-black uppercase tracking-wide" style={{ color: colors.secondaryText }}>
        {title}
      </Text>
      <Row label="Forecast completion" value={formatDate(snapshot.forecast.projectedCompletion)} />
      <Row
        label="Delay"
        value={
          snapshot.forecast.delayDays > 0
            ? `${snapshot.forecast.delayDays} day${snapshot.forecast.delayDays === 1 ? '' : 's'} late`
            : 'On or before'
        }
      />
      <Row
        label="Capacity shortfall"
        value={
          snapshot.forecast.capacityShortfallMinutes > 0
            ? formatMinutes(snapshot.forecast.capacityShortfallMinutes)
            : 'None'
        }
      />
      <Row
        label="Overall health"
        value={snapshot.health.overallScore == null ? '—' : `${snapshot.health.overallScore}%`}
      />
      <Row label="Workload balance" value={`${snapshot.capacity.balancePercent}%`} />
      <Row label="Members over capacity" value={String(snapshot.capacity.overloadedCount)} />
      <Row label="Critical items" value={String(snapshot.criticalWork.itemCount)} />
      <Row label="Blocked critical" value={String(snapshot.criticalWork.blockedCount)} />
      <Row label="Blocked items" value={String(snapshot.work.blockedItemCount)} />
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View className="flex-row items-center justify-between gap-2 py-0.5">
      <Text className="text-[11px]" style={{ color: theme.colors.secondaryText }}>
        {label}
      </Text>
      <Text className="text-[11px] font-bold" style={{ color: theme.colors.text }}>
        {value}
      </Text>
    </View>
  );
}
