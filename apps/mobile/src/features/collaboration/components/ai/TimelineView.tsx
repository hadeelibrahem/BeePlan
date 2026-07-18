import { Text, View } from 'react-native';
import { EmptyState, LoadingState, SectionCard } from '../../../../components/layout';
import { useTheme } from '../../../../theme/useTheme';
import { useTimelineQuery } from '../../api/ai-collaboration.api';
import { friendlyError } from '../../errorMessages';

type Props = {
  taskId: string;
};

export function TimelineView({ taskId }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const query = useTimelineQuery(taskId);

  if (query.isLoading) {
    return <LoadingState rows={3} />;
  }

  if (query.isError) {
    return (
      <SectionCard>
        <Text className="text-sm" style={{ color: colors.error }}>
          {friendlyError(query.error, 'Could not load the timeline.')}
        </Text>
      </SectionCard>
    );
  }

  const data = query.data;
  if (!data) return null;

  const sortedMilestones = [...data.milestones].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  return (
    <SectionCard>
      <TimelineRow color={colors.accent} label="Today" value={formatDate(data.today)} colors={colors} />

      {sortedMilestones.length ? (
        sortedMilestones.map((milestone) => (
          <TimelineRow key={milestone.id} color={colors.border} label={milestone.title} value={formatDate(milestone.date)} colors={colors} />
        ))
      ) : (
        <View className="py-2">
          <EmptyState icon="🗓" title="No milestones yet" description="Milestones will show up here once the plan has dated checkpoints." />
        </View>
      )}

      {data.deadline ? (
        <TimelineRow color={colors.error} label="Deadline" value={formatDate(data.deadline)} colors={colors} />
      ) : null}

      {data.bufferDay ? (
        <View className="mt-2 rounded-xl border px-3 py-2.5" style={{ borderColor: colors.warning, backgroundColor: `${colors.warning}1a` }}>
          <Text className="text-sm font-semibold" style={{ color: colors.text }}>
            Buffer day · {formatDate(data.bufferDay)}
          </Text>
          <Text className="mt-0.5 text-xs leading-4" style={{ color: colors.secondaryText }}>
            This extra day is set aside so a last-minute change doesn't collide with the deadline.
          </Text>
        </View>
      ) : null}
    </SectionCard>
  );
}

function TimelineRow({
  color,
  label,
  value,
  colors,
}: {
  color: string;
  label: string;
  value: string;
  colors: ReturnType<typeof useTheme>['theme']['colors'];
}) {
  return (
    <View className="flex-row items-start gap-3 pb-4">
      <View className="items-center pt-1">
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
        <View style={{ width: 2, flex: 1, marginTop: 4, backgroundColor: colors.border }} />
      </View>
      <View className="flex-1">
        <Text className="text-sm font-semibold" style={{ color: colors.text }}>
          {label}
        </Text>
        <Text className="mt-0.5 text-xs" style={{ color: colors.secondaryText }}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}
