import { Text, View } from 'react-native';
import { OutlineButton, PrimaryButton } from '../../../../components/layout';
import { useTheme } from '../../../../theme/useTheme';
import type { Suggestion, SuggestionKind, SuggestionStatus } from '../../api/ai-collaboration.api';

type Props = {
  suggestion: Suggestion;
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

export function SuggestionCard({ suggestion, onApprove, onDismiss, approving, dismissing }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const isPending = suggestion.status === 'pending';

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
        <Text className="text-base">{KIND_ICON[suggestion.kind]}</Text>
        <View className="flex-1">
          <Text className="text-sm font-black" style={{ color: colors.text }}>
            {suggestion.title}
          </Text>
          <Text className="mt-0.5 text-xs leading-4" style={{ color: colors.secondaryText }}>
            {suggestion.message}
          </Text>
        </View>
      </View>

      {suggestion.reason ? (
        <Text className="mb-2 mt-1 text-[11px] leading-4" style={{ color: colors.secondaryText }}>
          Why: {suggestion.reason}
        </Text>
      ) : null}

      {isPending ? (
        <View className="mt-1 flex-row gap-2">
          <OutlineButton className="flex-1" size="sm" onPress={onDismiss} loading={dismissing} disabled={approving || dismissing}>
            Dismiss
          </OutlineButton>
          <PrimaryButton className="flex-1" size="sm" onPress={onApprove} loading={approving} disabled={approving || dismissing}>
            Approve
          </PrimaryButton>
        </View>
      ) : (
        <Text className="mt-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: colors.secondaryText }}>
          {RESOLVED_LABEL[suggestion.status]}
        </Text>
      )}
    </View>
  );
}
