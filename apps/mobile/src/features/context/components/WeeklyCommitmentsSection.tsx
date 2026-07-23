import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { SectionCard } from '../../../components/layout';
import { useTheme } from '../../../theme/useTheme';
import { formatDays, formatTimeRange } from '../dayOfWeek';
import { useCommitmentMutations, useCommitments, useSavedPlaces } from '../hooks';
import type { RecurringCommitment, RecurringCommitmentInput } from '../types';
import { CommitmentEditor } from './CommitmentEditor';

type Props = { accessToken: string | undefined };

export function WeeklyCommitmentsSection({ accessToken }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const { data: commitments = [], isLoading } = useCommitments(accessToken);
  const { data: places = [] } = useSavedPlaces(accessToken);
  const { create, update, remove } = useCommitmentMutations(accessToken);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editing, setEditing] = useState<RecurringCommitment | null>(null);

  const openCreate = () => {
    setEditing(null);
    setEditorVisible(true);
  };
  const openEdit = (commitment: RecurringCommitment) => {
    setEditing(commitment);
    setEditorVisible(true);
  };

  const handleSubmit = (input: RecurringCommitmentInput) => {
    const mutation = editing
      ? update.mutateAsync({ id: editing.id, input })
      : create.mutateAsync(input);
    void mutation
      .then(() => setEditorVisible(false))
      .catch((error: unknown) => Alert.alert('Could not save commitment', error instanceof Error ? error.message : 'Please try again.'));
  };

  const toggleActive = (commitment: RecurringCommitment) => {
    void update
      .mutateAsync({ id: commitment.id, input: { isActive: !commitment.isActive } })
      .catch((error: unknown) => Alert.alert('Could not update commitment', error instanceof Error ? error.message : 'Please try again.'));
  };

  const confirmDelete = (commitment: RecurringCommitment) => {
    Alert.alert('Delete commitment?', `"${commitment.title}" will no longer block time in your plans.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void remove.mutateAsync(commitment.id).catch((error: unknown) =>
          Alert.alert('Could not delete commitment', error instanceof Error ? error.message : 'Please try again.'),
        ),
      },
    ]);
  };

  return (
    <SectionCard>
      <View className="mb-2 flex-row items-center justify-between">
        <View className="flex-1 pr-2">
          <Text className="text-sm font-black" style={{ color: colors.text }}>
            Weekly Commitments
          </Text>
          <Text className="text-xs" style={{ color: colors.secondaryText }}>
            Fixed recurring time the planner keeps clear.
          </Text>
        </View>
        <Pressable
          onPress={openCreate}
          accessibilityLabel="Add commitment"
          className="h-9 w-9 items-center justify-center rounded-full"
          style={{ backgroundColor: colors.accent }}
        >
          <Text className="text-lg font-black" style={{ color: colors.accentText }}>
            +
          </Text>
        </Pressable>
      </View>

      {isLoading ? (
        <Text className="py-3 text-sm" style={{ color: colors.secondaryText }}>
          Loading…
        </Text>
      ) : commitments.length === 0 ? (
        <Text className="py-3 text-sm" style={{ color: colors.secondaryText }}>
          No commitments yet. Add classes, work shifts, or anything recurring.
        </Text>
      ) : (
        commitments.map((commitment) => (
          <View
            key={commitment.id}
            className="flex-row items-center gap-2 border-t py-2.5"
            style={{ borderTopColor: colors.border }}
          >
            <View className="min-w-0 flex-1">
              <Text
                className="text-sm font-bold"
                style={{ color: commitment.isActive ? colors.text : colors.secondaryText, textDecorationLine: commitment.isActive ? 'none' : 'line-through' }}
                numberOfLines={1}
              >
                {commitment.title}
              </Text>
              <Text className="text-xs" style={{ color: colors.secondaryText }} numberOfLines={1}>
                {formatDays(commitment.daysOfWeek)} · {formatTimeRange(commitment.startTime, commitment.endTime)}
                {commitment.savedLocationName ? ` · ${commitment.savedLocationName}` : ''}
              </Text>
            </View>
            <Pressable
              onPress={() => toggleActive(commitment)}
              accessibilityLabel={commitment.isActive ? `Disable ${commitment.title}` : `Enable ${commitment.title}`}
              className="rounded-full px-2 py-1"
              style={{ backgroundColor: commitment.isActive ? colors.accent : colors.surfaceElevated }}
            >
              <Text className="text-[11px] font-bold" style={{ color: commitment.isActive ? colors.accentText : colors.secondaryText }}>
                {commitment.isActive ? 'Active' : 'Paused'}
              </Text>
            </Pressable>
            <Pressable onPress={() => openEdit(commitment)}>
              <Text className="px-1 text-xs font-semibold" style={{ color: colors.secondaryText }}>
                Edit
              </Text>
            </Pressable>
            <Pressable onPress={() => confirmDelete(commitment)}>
              <Text className="px-1 text-xs font-semibold" style={{ color: colors.error }}>
                Delete
              </Text>
            </Pressable>
          </View>
        ))
      )}

      {editorVisible ? (
        <CommitmentEditor
          visible={editorVisible}
          initial={editing}
          places={places}
          saving={create.isPending || update.isPending}
          onClose={() => setEditorVisible(false)}
          onSubmit={handleSubmit}
        />
      ) : null}
    </SectionCard>
  );
}
