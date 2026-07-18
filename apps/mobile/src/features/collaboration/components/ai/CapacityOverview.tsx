import { Text, View } from 'react-native';
import { EmptyState, LoadingState, SectionCard } from '../../../../components/layout';
import { useTheme } from '../../../../theme/useTheme';
import { useCapacityQuery, type CapacityBand, type CapacityMember } from '../../api/ai-collaboration.api';
import { friendlyError } from '../../errorMessages';

type Props = {
  taskId: string;
};

const BAND_LABEL: Record<CapacityBand, string> = {
  light: 'Light week',
  moderate: 'Moderate week',
  busy: 'Busy week',
};

/**
 * Per-member capacity bars (band + load percent only — never task titles or
 * content, the server already keeps that private) plus a short AI "why"
 * sentence explaining why the split leans the way it does.
 */
export function CapacityOverview({ taskId }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const query = useCapacityQuery(taskId);

  const members = query.data?.members ?? [];
  const whySentence = buildWhySentence(members);

  return (
    <SectionCard className="mb-3">
      <Text className="mb-3 text-xs font-black uppercase tracking-wide" style={{ color: colors.secondaryText }}>
        Capacity
      </Text>

      {query.isLoading ? (
        <LoadingState rows={2} />
      ) : query.isError ? (
        <Text className="text-sm" style={{ color: colors.error }}>
          {friendlyError(query.error, 'Could not load capacity.')}
        </Text>
      ) : members.length ? (
        <View className="gap-3">
          {members.map((member) => (
            <CapacityBar key={member.userId} member={member} colors={colors} />
          ))}
          {whySentence ? (
            <Text className="mt-1 text-xs leading-4" style={{ color: colors.secondaryText }}>
              {whySentence}
            </Text>
          ) : null}
        </View>
      ) : (
        <EmptyState
          icon="👥"
          title="No capacity data yet"
          description="Once your teammates have tasks on their own schedule, their capacity will show up here."
        />
      )}
    </SectionCard>
  );
}

function CapacityBar({
  member,
  colors,
}: {
  member: CapacityMember;
  colors: ReturnType<typeof useTheme>['theme']['colors'];
}) {
  const bandColor = member.band === 'light' ? colors.success : member.band === 'moderate' ? colors.warning : colors.error;
  const width = Math.max(4, Math.min(100, Math.round(member.loadPercent)));

  return (
    <View>
      <View className="mb-1 flex-row items-center justify-between">
        <Text className="text-sm font-semibold" style={{ color: colors.text }}>
          {member.displayName}
        </Text>
        <Text className="text-xs font-bold" style={{ color: bandColor }}>
          {BAND_LABEL[member.band]} · {Math.round(member.loadPercent)}%
        </Text>
      </View>
      <View className="h-2.5 overflow-hidden rounded-full" style={{ backgroundColor: colors.progressTrack }}>
        <View style={{ width: `${width}%`, height: '100%', backgroundColor: bandColor, borderRadius: 999 }} />
      </View>
    </View>
  );
}

function buildWhySentence(members: CapacityMember[]): string | null {
  if (members.length < 2) return null;

  const sorted = [...members].sort((a, b) => a.loadPercent - b.loadPercent);
  const lightest = sorted[0];
  const busiest = sorted[sorted.length - 1];

  if (lightest.band === busiest.band) {
    return "Everyone's workload looks evenly balanced right now.";
  }

  return `${lightest.displayName} has the lightest load right now, so more of the split leans their way.`;
}
