import { useState } from 'react';
import { Modal, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { InputField, PrimaryButton, SecondaryButton } from '../../../components/layout';
import { useTheme } from '../../../theme/useTheme';
import { WEEKDAY_ORDER, toggleDay, weekdayShort } from '../dayOfWeek';
import type { RecurringCommitment, RecurringCommitmentInput, SavedPlace } from '../types';
import { validateCommitment } from '../formLogic';

type Props = {
  visible: boolean;
  initial?: RecurringCommitment | null;
  places: SavedPlace[];
  saving?: boolean;
  onClose: () => void;
  onSubmit: (input: RecurringCommitmentInput) => void;
};

export function CommitmentEditor({ visible, initial, places, saving, onClose, onSubmit }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [days, setDays] = useState<number[]>(initial?.daysOfWeek ?? []);
  const [startTime, setStartTime] = useState(initial?.startTime ?? '08:00');
  const [endTime, setEndTime] = useState(initial?.endTime ?? '11:00');
  const [savedLocationId, setSavedLocationId] = useState<string | null>(initial?.savedLocationId ?? null);
  const [repeatWeekly, setRepeatWeekly] = useState(initial?.repeatWeekly ?? true);
  const [startDate, setStartDate] = useState(initial?.startDate ?? '');
  const [endDate, setEndDate] = useState(initial?.endDate ?? '');
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    const input: RecurringCommitmentInput = {
      title: title.trim(),
      daysOfWeek: days,
      startTime,
      endTime,
      savedLocationId: savedLocationId || null,
      repeatWeekly,
      startDate: startDate || null,
      endDate: endDate || null,
      isActive,
      notes: notes.trim() || null,
    };
    const validationError = validateCommitment(input);
    if (validationError) return setError(validationError);
    setError('');
    onSubmit(input);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Text className="mb-1 text-xl font-black" style={{ color: colors.text }}>
            {initial ? 'Edit commitment' : 'Add weekly commitment'}
          </Text>
          <Text className="mb-4 text-xs" style={{ color: colors.secondaryText }}>
            A fixed recurring block. The AI planner keeps this time clear — no tasks, focus, or study scheduled over it.
          </Text>

          <InputField label="Title" value={title} onChangeText={setTitle} placeholder="University Classes" />

          <Text className="mb-1 mt-3 text-xs font-bold" style={{ color: colors.secondaryText }}>
            Days
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            {WEEKDAY_ORDER.map((day) => {
              const active = days.includes(day);
              return (
                <Pressable
                  key={day}
                  onPress={() => setDays((d) => toggleDay(d, day))}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  className="h-10 w-12 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: active ? colors.accent : 'transparent',
                    borderWidth: active ? 0 : 1,
                    borderColor: colors.border,
                  }}
                >
                  <Text className="text-xs font-bold" style={{ color: active ? colors.accentText : colors.secondaryText }}>
                    {weekdayShort(day)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View className="mt-3 flex-row gap-3">
            <View className="flex-1">
              <InputField label="Start (HH:mm)" value={startTime} onChangeText={setStartTime} placeholder="08:00" />
            </View>
            <View className="flex-1">
              <InputField label="End (HH:mm)" value={endTime} onChangeText={setEndTime} placeholder="11:00" />
            </View>
          </View>

          <Text className="mb-1 mt-3 text-xs font-bold" style={{ color: colors.secondaryText }}>
            Place (optional)
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            <Pressable
              onPress={() => setSavedLocationId(null)}
              className="rounded-lg px-3 py-2"
              style={{
                backgroundColor: savedLocationId === null ? colors.accent : 'transparent',
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text className="text-xs font-bold" style={{ color: savedLocationId === null ? colors.accentText : colors.secondaryText }}>
                None
              </Text>
            </Pressable>
            {places.map((place) => {
              const selected = savedLocationId === place.id;
              return (
                <Pressable
                  key={place.id}
                  onPress={() => setSavedLocationId(place.id)}
                  className="rounded-lg px-3 py-2"
                  style={{
                    backgroundColor: selected ? colors.accent : 'transparent',
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Text className="text-xs font-bold" style={{ color: selected ? colors.accentText : colors.secondaryText }}>
                    {place.icon ? `${place.icon} ` : ''}
                    {place.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View className="mt-3 flex-row gap-3">
            <View className="flex-1">
              <InputField label="Start date (optional)" value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" autoCapitalize="none" />
            </View>
            <View className="flex-1">
              <InputField label="End date (optional)" value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" autoCapitalize="none" />
            </View>
          </View>

          <View className="mt-3 flex-row items-center justify-between rounded-lg px-3 py-2" style={{ borderWidth: 1, borderColor: colors.border }}>
            <Text className="text-sm font-semibold" style={{ color: colors.text }}>
              Repeat weekly
            </Text>
            <Switch value={repeatWeekly} onValueChange={setRepeatWeekly} />
          </View>
          <View className="mt-2 flex-row items-center justify-between rounded-lg px-3 py-2" style={{ borderWidth: 1, borderColor: colors.border }}>
            <Text className="text-sm font-semibold" style={{ color: colors.text }}>
              Active
            </Text>
            <Switch value={isActive} onValueChange={setIsActive} />
          </View>

          <View className="mt-3">
            <InputField label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="" multiline />
          </View>

          {error ? (
            <Text className="mt-3 text-sm font-semibold" style={{ color: colors.error }}>
              {error}
            </Text>
          ) : null}

          <View className="mt-5 flex-row gap-3">
            <View className="flex-1">
              <SecondaryButton onPress={onClose} fullWidth>
                Cancel
              </SecondaryButton>
            </View>
            <View className="flex-1">
              <PrimaryButton onPress={handleSubmit} loading={saving} fullWidth>
                {initial ? 'Save' : 'Add'}
              </PrimaryButton>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
