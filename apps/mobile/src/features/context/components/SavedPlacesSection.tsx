import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { SectionCard } from '../../../components/layout';
import { useTheme } from '../../../theme/useTheme';
import { useSavedPlaceMutations, useSavedPlaces } from '../hooks';
import type { SavedPlace, SavedPlaceInput } from '../types';
import { SavedPlaceEditor } from './SavedPlaceEditor';

type Props = { accessToken: string | undefined };

export function SavedPlacesSection({ accessToken }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const { data: places = [], isLoading } = useSavedPlaces(accessToken);
  const { create, update, remove } = useSavedPlaceMutations(accessToken);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editing, setEditing] = useState<SavedPlace | null>(null);

  const openCreate = () => {
    setEditing(null);
    setEditorVisible(true);
  };
  const openEdit = (place: SavedPlace) => {
    setEditing(place);
    setEditorVisible(true);
  };

  const handleSubmit = (input: SavedPlaceInput) => {
    const mutation = editing
      ? update.mutateAsync({ id: editing.id, input })
      : create.mutateAsync(input);
    void mutation
      .then(() => setEditorVisible(false))
      .catch((error: unknown) => Alert.alert('Could not save place', error instanceof Error ? error.message : 'Please try again.'));
  };

  const confirmDelete = (place: SavedPlace) => {
    Alert.alert('Delete saved place?', `"${place.name}" and its aliases will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void remove.mutateAsync(place.id).catch((error: unknown) =>
          Alert.alert('Could not delete place', error instanceof Error ? error.message : 'Please try again.'),
        ),
      },
    ]);
  };

  return (
    <SectionCard>
      <View className="mb-2 flex-row items-center justify-between">
        <View className="flex-1 pr-2">
          <Text className="text-sm font-black" style={{ color: colors.text }}>
            Saved Places
          </Text>
          <Text className="text-xs" style={{ color: colors.secondaryText }}>
            Permanent places the AI understands by name.
          </Text>
        </View>
        <Pressable
          onPress={openCreate}
          accessibilityLabel="Add saved place"
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
      ) : places.length === 0 ? (
        <Text className="py-3 text-sm" style={{ color: colors.secondaryText }}>
          No saved places yet. Add Home, University, Work and more.
        </Text>
      ) : (
        places.map((place) => (
          <View
            key={place.id}
            className="flex-row items-center gap-3 border-t py-2.5"
            style={{ borderTopColor: colors.border }}
          >
            <Text className="text-xl">{place.icon || '📍'}</Text>
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-bold" style={{ color: colors.text }} numberOfLines={1}>
                {place.name}
              </Text>
              <Text className="text-xs" style={{ color: colors.secondaryText }} numberOfLines={1}>
                {place.address || `${place.latitude.toFixed(4)}, ${place.longitude.toFixed(4)}`}
                {place.aliases.length ? ` · ${place.aliases.length} alias${place.aliases.length === 1 ? '' : 'es'}` : ''}
              </Text>
            </View>
            <Pressable onPress={() => openEdit(place)} accessibilityLabel={`Edit ${place.name}`}>
              <Text className="px-1 text-xs font-semibold" style={{ color: colors.secondaryText }}>
                Edit
              </Text>
            </Pressable>
            <Pressable onPress={() => confirmDelete(place)} accessibilityLabel={`Delete ${place.name}`}>
              <Text className="px-1 text-xs font-semibold" style={{ color: colors.error }}>
                Delete
              </Text>
            </Pressable>
          </View>
        ))
      )}

      {editorVisible ? (
        <SavedPlaceEditor
          visible={editorVisible}
          initial={editing}
          saving={create.isPending || update.isPending}
          onClose={() => setEditorVisible(false)}
          onSubmit={handleSubmit}
        />
      ) : null}
    </SectionCard>
  );
}
