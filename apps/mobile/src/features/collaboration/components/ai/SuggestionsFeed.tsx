import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LoadingState, SectionCard } from '../../../../components/layout';
import { useTheme } from '../../../../theme/useTheme';
import {
  useApproveSuggestionMutation,
  useDismissSuggestionMutation,
  useSuggestionsQuery,
  type PlanFocus,
} from '../../api/ai-collaboration.api';
import { friendlyError } from '../../errorMessages';
import { SuggestionCard } from './SuggestionCard';
import { RecommendationDetailSheet } from './RecommendationDetailSheet';
import type { OverviewTab } from './OverviewPanel';

type Props = {
  taskId: string;
  onNavigate: (tab: OverviewTab, focus?: PlanFocus) => void;
};

/**
 * The AI Recommendations section of the Overview command centre — the
 * Detect → Explain → Recommend → Preview → Approve/Dismiss loop.
 *
 * Detection, explanation, impact and permissions all come from the backend
 * (`GET /ai/collaboration/suggestions`); this component only renders them,
 * opens the review sheet, and calls the existing approve/dismiss endpoints.
 */
export function SuggestionsFeed({ taskId, onNavigate }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const query = useSuggestionsQuery(taskId);
  const approveMutation = useApproveSuggestionMutation(taskId);
  const dismissMutation = useDismissSuggestionMutation(taskId);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  if (query.isLoading) return <LoadingState rows={3} />;

  if (query.isError) {
    if ((query.error as { status?: number })?.status === 403) return null;
    return (
      <SectionCard>
        <Text className="text-sm" style={{ color: colors.error }}>
          {friendlyError(query.error, 'Could not load recommendations.')}
        </Text>
      </SectionCard>
    );
  }

  const items = query.data?.items ?? [];
  const pending = items.filter((item) => item.status === 'pending');
  const resolved = items.filter((item) => item.status !== 'pending');
  const reviewing = pending.find((item) => item.id === reviewingId) ?? null;

  // A quiet surface is the healthy state — don't spend a card saying so.
  if (!items.length) return null;

  const approve = (id: string) => {
    setReviewingId(null);
    approveMutation.mutate(id);
  };
  const dismiss = (id: string) => {
    setReviewingId(null);
    dismissMutation.mutate(id);
  };

  return (
    <SectionCard>
      <View className="mb-2 flex-row items-center justify-between gap-2">
        <Text className="text-[10px] font-black uppercase tracking-wide" style={{ color: colors.secondaryText }}>
          AI recommendations ({pending.length})
        </Text>
        {resolved.length ? (
          <Pressable
            onPress={() => setShowResolved((value) => !value)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showResolved }}
          >
            <Text className="text-[11px] font-bold" style={{ color: colors.accentInk }}>
              {showResolved ? 'Hide' : 'Show'} {resolved.length} resolved
            </Text>
          </Pressable>
        ) : null}
      </View>

      {approveMutation.isError || dismissMutation.isError ? (
        <Text className="mb-2 text-sm" style={{ color: colors.error }}>
          {friendlyError(
            approveMutation.error ?? dismissMutation.error,
            'Could not update that recommendation. Please try again.',
          )}
        </Text>
      ) : null}

      {pending.length ? (
        pending.map((recommendation) => (
          <SuggestionCard
            key={recommendation.id}
            recommendation={recommendation}
            onReview={() => setReviewingId(recommendation.id)}
            onApprove={() => approve(recommendation.id)}
            onDismiss={() => dismiss(recommendation.id)}
            approving={approveMutation.isPending && approveMutation.variables === recommendation.id}
            dismissing={dismissMutation.isPending && dismissMutation.variables === recommendation.id}
          />
        ))
      ) : (
        <Text className="text-xs" style={{ color: colors.secondaryText }}>
          Nothing needs a decision right now — you're all caught up.
        </Text>
      )}

      {showResolved && resolved.length ? (
        <View className="mt-2 border-t pt-2" style={{ borderColor: colors.border }}>
          {resolved.map((recommendation) => (
            <SuggestionCard key={recommendation.id} recommendation={recommendation} />
          ))}
        </View>
      ) : null}

      {reviewing ? (
        <RecommendationDetailSheet
          taskId={taskId}
          recommendation={reviewing}
          onClose={() => setReviewingId(null)}
          onApprove={() => approve(reviewing.id)}
          onDismiss={() => dismiss(reviewing.id)}
          onNavigate={onNavigate}
          approving={approveMutation.isPending && approveMutation.variables === reviewing.id}
          dismissing={dismissMutation.isPending && dismissMutation.variables === reviewing.id}
        />
      ) : null}
    </SectionCard>
  );
}
