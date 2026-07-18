import { Text, View } from 'react-native';
import { EmptyState, LoadingState, SectionCard } from '../../../../components/layout';
import { useTheme } from '../../../../theme/useTheme';
import { useProgressQuery, type ProgressMember } from '../../api/ai-collaboration.api';
import { friendlyError } from '../../errorMessages';

type Props = {
  taskId: string;
};

// React Native has no CSS clip-path, so hexagons aren't available without a
// new SVG dependency. This approximates the honeycomb spirit with small
// rotated (45deg) rounded squares — diamonds — laid out in a wrapping grid,
// which reads visually as a cell grid without pulling in react-native-svg
// (not currently a project dependency).
const MAX_CELLS = 24;
const CELL_SIZE = 14;

export function TeamProgressComb({ taskId }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const query = useProgressQuery(taskId);
  const data = query.data;

  return (
    <View>
      <SectionCard className="mb-3">
        <Text className="mb-1 text-xs font-black uppercase tracking-wide" style={{ color: colors.secondaryText }}>
          Overall Progress
        </Text>
        {query.isLoading ? (
          <LoadingState rows={1} />
        ) : query.isError ? (
          <Text className="text-sm" style={{ color: colors.error }}>
            {friendlyError(query.error, 'Could not load progress.')}
          </Text>
        ) : data ? (
          <View>
            <Text className="text-2xl font-black" style={{ color: colors.text }}>
              {Math.round(data.overallPercent)}%
            </Text>
            <Text className="mt-0.5 text-xs" style={{ color: colors.secondaryText }}>
              {data.completedCount} of {data.totalCount} subtasks completed
            </Text>
          </View>
        ) : null}
      </SectionCard>

      {!query.isLoading && !query.isError && data ? (
        data.members.length ? (
          <SectionCard className="mb-3">
            <View className="gap-4">
              {data.members.map((member) => (
                <MemberComb key={member.userId} member={member} colors={colors} />
              ))}
            </View>
          </SectionCard>
        ) : (
          <EmptyState icon="🐝" title="No member progress yet" description="Once work is assigned, each teammate's progress will show up here." />
        )
      ) : null}
    </View>
  );
}

function MemberComb({
  member,
  colors,
}: {
  member: ProgressMember;
  colors: ReturnType<typeof useTheme>['theme']['colors'];
}) {
  const cellCount = Math.min(MAX_CELLS, Math.max(member.totalCount, member.totalCount === 0 ? 0 : 1));
  const filledCount =
    member.totalCount > 0 ? Math.round((member.completedCount / member.totalCount) * cellCount) : 0;

  return (
    <View>
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-sm font-semibold" style={{ color: colors.text }}>
          {member.displayName}
        </Text>
        <Text className="text-xs font-bold" style={{ color: colors.secondaryText }}>
          {member.completedCount}/{member.totalCount} · {Math.round(member.percent)}%
        </Text>
      </View>
      {cellCount > 0 ? (
        <View className="flex-row flex-wrap" style={{ paddingHorizontal: 4 }}>
          {Array.from({ length: cellCount }).map((_, index) => (
            <View
              key={index}
              style={{
                width: CELL_SIZE,
                height: CELL_SIZE,
                margin: 3,
                borderRadius: 3,
                backgroundColor: index < filledCount ? colors.accent : colors.progressTrack,
                transform: [{ rotate: '45deg' }],
              }}
            />
          ))}
        </View>
      ) : (
        <Text className="text-xs" style={{ color: colors.secondaryText }}>
          No subtasks assigned yet.
        </Text>
      )}
    </View>
  );
}
