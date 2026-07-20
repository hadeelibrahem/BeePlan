import { useQuery } from '@tanstack/react-query';
import { Text, View } from 'react-native';
import { EmptyState, LoadingState, SectionCard } from '../../../../components/layout';
import { useTheme } from '../../../../theme/useTheme';
import { getTaskActivity, type ApiTaskActivity } from '../../../../lib/tasksApi';

type Props = {
  taskId: string;
  accessToken: string;
};

const AI_ACTIONS = new Set(['ai_recommendation_approved', 'ai_recommendation_dismissed']);

/** Reuses the existing task-activity endpoint/client (GET /tasks/:id/activity) — no new endpoint needed. */
export function HistoryFeed({ taskId, accessToken }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const query = useQuery({
    queryKey: ['tasks', taskId, 'activity'],
    queryFn: () => getTaskActivity(accessToken, taskId),
    enabled: Boolean(taskId && accessToken),
  });

  if (query.isLoading) {
    return <LoadingState rows={4} />;
  }

  if (query.isError) {
    return (
      <SectionCard>
        <Text className="text-sm" style={{ color: colors.error }}>
          Could not load history. Please try again.
        </Text>
      </SectionCard>
    );
  }

  const activities = [...(query.data ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  if (!activities.length) {
    return <EmptyState icon="🕘" title="No history yet" description="Actions on this task — including AI suggestions you approve or dismiss — will show up here." />;
  }

  return (
    <SectionCard>
      <View className="gap-3">
        {activities.map((activity) => (
          <HistoryRow key={activity.id} activity={activity} colors={colors} />
        ))}
      </View>
    </SectionCard>
  );
}

function HistoryRow({
  activity,
  colors,
}: {
  activity: ApiTaskActivity;
  colors: ReturnType<typeof useTheme>['theme']['colors'];
}) {
  const isAi = AI_ACTIONS.has(activity.action);

  return (
    <View className="flex-row items-start gap-2.5">
      <Text className="text-sm">{isAi ? '🤖' : '•'}</Text>
      <View className="flex-1">
        <Text className="text-sm leading-5" style={{ color: colors.text }}>
          {activity.description || humanizeAction(activity.action)}
        </Text>
        <Text className="mt-0.5 text-xs" style={{ color: colors.secondaryText }}>
          {formatDateTime(activity.createdAt)}
        </Text>
      </View>
    </View>
  );
}

function humanizeAction(action: string) {
  return action
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}
