import { Pressable, Text, View } from 'react-native';
import { EmptyState, LoadingState, SectionCard } from '../../../../components/layout';
import { useTheme } from '../../../../theme/useTheme';
import type { ApiSubtaskStatus } from '../../../../lib/tasksApi';
import { useCheckInSubtaskMutation, useTodayQuery, type TodayItem } from '../../api/ai-collaboration.api';
import { friendlyError } from '../../errorMessages';

type Props = {
  taskId: string;
};

const CHECK_IN_OPTIONS: { label: string; status: ApiSubtaskStatus }[] = [
  { label: 'Done', status: 'done' },
  { label: 'Partial', status: 'in_progress' },
  { label: "Didn't do it", status: 'missed' },
];

/** Per-member "what's due today" checklist with one-tap check-ins. */
export function TodayTeamPlan({ taskId }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const query = useTodayQuery(taskId);
  const checkIn = useCheckInSubtaskMutation(taskId);

  const data = query.data;

  return (
    <View>
      <SectionCard className="mb-3">
        <Text className="mb-1 text-xs font-black uppercase tracking-wide" style={{ color: colors.secondaryText }}>
          Today's Goal
        </Text>
        {query.isLoading ? (
          <LoadingState rows={1} />
        ) : query.isError ? (
          <Text className="text-sm" style={{ color: colors.error }}>
            {friendlyError(query.error, 'Could not load today’s plan.')}
          </Text>
        ) : (
          <Text className="text-sm leading-5" style={{ color: colors.text }}>
            {data?.goal || 'No specific goal set for today — steady progress is the goal.'}
          </Text>
        )}
      </SectionCard>

      {!query.isLoading && !query.isError && data ? (
        <>
          {data.members.map((member) => (
            <SectionCard key={member.userId} className="mb-3">
              <Text className="mb-2 text-sm font-black" style={{ color: colors.text }}>
                {member.displayName}
              </Text>
              {member.items.length ? (
                <View className="gap-2">
                  {member.items.map((item) => (
                    <TodayItemRow
                      key={item.id}
                      item={item}
                      colors={colors}
                      pending={checkIn.isPending && checkIn.variables?.subtaskId === item.id}
                      onCheckIn={(status) => checkIn.mutate({ subtaskId: item.id, payload: { status } })}
                    />
                  ))}
                </View>
              ) : (
                <Text className="text-xs leading-4" style={{ color: colors.secondaryText }}>
                  No open work is due yet, and a later item is free to start now.
                </Text>
              )}
            </SectionCard>
          ))}

          {data.sharedItems.length ? (
            <SectionCard className="mb-3">
              <Text className="mb-2 text-sm font-black" style={{ color: colors.text }}>
                Shared
              </Text>
              <View className="gap-2">
                {data.sharedItems.map((item) => (
                  <TodayItemRow
                    key={item.id}
                    item={item}
                    colors={colors}
                    pending={checkIn.isPending && checkIn.variables?.subtaskId === item.id}
                    onCheckIn={(status) => checkIn.mutate({ subtaskId: item.id, payload: { status } })}
                  />
                ))}
              </View>
            </SectionCard>
          ) : null}

          {!data.members.length && !data.sharedItems.length ? (
            <EmptyState
              icon="🌤"
              title="Nothing due today"
              description="No open work is due yet, and a later item is free to start now."
            />
          ) : null}

          {checkIn.isError ? (
            <Text className="text-sm" style={{ color: colors.error }}>
              {friendlyError(checkIn.error, 'Could not update that item. Please try again.')}
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function TodayItemRow({
  item,
  colors,
  pending,
  onCheckIn,
}: {
  item: TodayItem;
  colors: ReturnType<typeof useTheme>['theme']['colors'];
  pending: boolean;
  onCheckIn: (status: ApiSubtaskStatus) => void;
}) {
  return (
    <View className="rounded-xl px-3 py-2.5" style={{ backgroundColor: colors.background }}>
      <Text className="text-sm font-semibold" style={{ color: colors.text }}>
        {item.title}
      </Text>
      {item.dueDate ? (
        <Text className="mt-0.5 text-xs" style={{ color: colors.secondaryText }}>
          Due {formatShortDate(item.dueDate)}
        </Text>
      ) : null}
      <View className="mt-2 flex-row flex-wrap gap-1.5">
        {CHECK_IN_OPTIONS.map((option) => {
          const active = item.status === option.status;
          return (
            <Pressable
              key={option.status}
              onPress={() => onCheckIn(option.status)}
              disabled={pending}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              className="rounded-full border px-2.5 py-1"
              style={{
                borderColor: active ? colors.accent : colors.border,
                backgroundColor: active ? colors.accent : 'transparent',
                opacity: pending ? 0.5 : 1,
              }}
            >
              <Text className="text-[11px] font-bold" style={{ color: active ? colors.accentText : colors.text }}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}
