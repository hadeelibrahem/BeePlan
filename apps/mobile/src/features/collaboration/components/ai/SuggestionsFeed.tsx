import { Text, View } from 'react-native';
import { EmptyState, LoadingState, SectionCard } from '../../../../components/layout';
import { useTheme } from '../../../../theme/useTheme';
import {
  useApproveSuggestionMutation,
  useDismissSuggestionMutation,
  useSuggestionsQuery,
} from '../../api/ai-collaboration.api';
import { friendlyError } from '../../errorMessages';
import { SuggestionCard } from './SuggestionCard';

type Props = {
  taskId: string;
};

/** One card per AI suggestion — the owner always approves or dismisses, nothing changes on its own. */
export function SuggestionsFeed({ taskId }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const query = useSuggestionsQuery(taskId);
  const approveMutation = useApproveSuggestionMutation(taskId);
  const dismissMutation = useDismissSuggestionMutation(taskId);

  if (query.isLoading) {
    return <LoadingState rows={3} />;
  }

  if (query.isError) {
    return (
      <SectionCard>
        <Text className="text-sm" style={{ color: colors.error }}>
          {friendlyError(query.error, 'Could not load suggestions.')}
        </Text>
      </SectionCard>
    );
  }

  const items = query.data?.items ?? [];
  const pending = items.filter((item) => item.status === 'pending');
  const resolved = items.filter((item) => item.status !== 'pending');

  if (!items.length) {
    return (
      <EmptyState
        icon="✅"
        title="All caught up"
        description="No suggestions right now — this will fill in if something needs your attention."
      />
    );
  }

  return (
    <View>
      {(approveMutation.isError || dismissMutation.isError) ? (
        <Text className="mb-2 text-sm" style={{ color: colors.error }}>
          {friendlyError(approveMutation.error ?? dismissMutation.error, 'Could not update that suggestion. Please try again.')}
        </Text>
      ) : null}

      {pending.map((suggestion) => (
        <SuggestionCard
          key={suggestion.id}
          suggestion={suggestion}
          approving={approveMutation.isPending && approveMutation.variables === suggestion.id}
          dismissing={dismissMutation.isPending && dismissMutation.variables === suggestion.id}
          onApprove={() => approveMutation.mutate(suggestion.id)}
          onDismiss={() => dismissMutation.mutate(suggestion.id)}
        />
      ))}

      {resolved.length ? (
        <View className="mt-2">
          <Text className="mb-2 text-xs font-black uppercase tracking-wide" style={{ color: colors.secondaryText }}>
            Resolved
          </Text>
          {resolved.map((suggestion) => (
            <SuggestionCard key={suggestion.id} suggestion={suggestion} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
