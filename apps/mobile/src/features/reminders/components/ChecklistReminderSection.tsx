import { Pressable, Text, TextInput, View } from 'react-native';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useTheme } from '../../../theme/useTheme';
import type {
  ChecklistReminderTrigger,
  GeneralTimeCategory,
  ReminderTimeTrigger,
  SpecificTimeRepeat,
  TimeTriggerType,
} from '../types/reminders.types';
import { LocationTriggerSection } from './LocationTriggerSection';

const TIME_TRIGGER_TYPES: TimeTriggerType[] = ['none', 'general_time', 'specific_time'];
const GENERAL_TIME_CATEGORIES: GeneralTimeCategory[] = [
  'morning',
  'afternoon',
  'evening',
  'night',
  'weekdays',
  'weekends',
  'custom',
];
const SPECIFIC_TIME_REPEATS: SpecificTimeRepeat[] = ['none', 'daily', 'weekly', 'monthly', 'custom'];

const TIME_TRIGGER_LABEL_KEYS: Record<TimeTriggerType, string> = {
  none: 'reminders.noTimeReminder',
  general_time: 'reminders.generalTimeReminder',
  specific_time: 'reminders.specificDateTime',
};

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className="rounded-full border px-4 py-2.5 active:opacity-80"
      style={{ borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accentSoft : colors.input }}
    >
      <Text className="text-xs font-black" style={{ color: selected ? colors.accent : colors.text }}>{label}</Text>
    </Pressable>
  );
}

type TimeProps = {
  value: ReminderTimeTrigger;
  onChange: (value: ReminderTimeTrigger) => void;
};

function TimeTriggerSection({ value, onChange }: TimeProps) {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const { colors } = theme;

  const setType = (type: TimeTriggerType) => onChange({ ...value, type });

  const setGeneralCategory = (category: GeneralTimeCategory) =>
    onChange({ ...value, generalTime: { category, customLabel: value.generalTime?.customLabel } });

  const setGeneralCustomLabel = (customLabel: string) =>
    onChange({
      ...value,
      generalTime: { category: value.generalTime?.category ?? 'custom', customLabel },
    });

  const setSpecificField = (field: 'date' | 'time', fieldValue: string) =>
    onChange({
      ...value,
      specificTime: {
        date: value.specificTime?.date ?? '',
        time: value.specificTime?.time ?? '',
        repeat: value.specificTime?.repeat ?? 'none',
        [field]: fieldValue,
      },
    });

  const setSpecificRepeat = (repeat: SpecificTimeRepeat) =>
    onChange({
      ...value,
      specificTime: {
        date: value.specificTime?.date ?? '',
        time: value.specificTime?.time ?? '',
        repeat,
      },
    });

  return (
    <View className="gap-4">
      <Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
        {t('reminders.timeTrigger')}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {TIME_TRIGGER_TYPES.map((type) => (
          <Chip key={type} label={t(TIME_TRIGGER_LABEL_KEYS[type])} selected={value.type === type} onPress={() => setType(type)} />
        ))}
      </View>

      {value.type === 'general_time' && (
        <View className="gap-3">
          <View className="flex-row flex-wrap gap-2">
            {GENERAL_TIME_CATEGORIES.map((category) => (
              <Chip
                key={category}
                label={t(`reminders.generalTimeCategory.${category}`)}
                selected={value.generalTime?.category === category}
                onPress={() => setGeneralCategory(category)}
              />
            ))}
          </View>
          {value.generalTime?.category === 'custom' && (
            <View className="rounded-2xl border px-4 py-3" style={{ borderColor: colors.border, backgroundColor: colors.input }}>
              <TextInput
                placeholder={t('reminders.customLabelPlaceholder')}
                placeholderTextColor={colors.placeholder}
                value={value.generalTime?.customLabel ?? ''}
                onChangeText={setGeneralCustomLabel}
                className="py-2 text-base font-semibold"
                style={{ color: colors.text }}
              />
            </View>
          )}
        </View>
      )}

      {value.type === 'specific_time' && (
        <View className="gap-4">
          <View className="rounded-2xl border px-4 py-3" style={{ borderColor: colors.border, backgroundColor: colors.input }}>
            <Text className="mb-1 text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
              {t('reminders.date')}
            </Text>
            <TextInput
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.placeholder}
              value={value.specificTime?.date ?? ''}
              onChangeText={(text) => setSpecificField('date', text)}
              className="py-2 text-base font-semibold"
              style={{ color: colors.text }}
            />
          </View>

          <View className="rounded-2xl border px-4 py-3" style={{ borderColor: colors.border, backgroundColor: colors.input }}>
            <Text className="mb-1 text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
              {t('reminders.time')}
            </Text>
            <TextInput
              placeholder="HH:MM"
              placeholderTextColor={colors.placeholder}
              value={value.specificTime?.time ?? ''}
              onChangeText={(text) => setSpecificField('time', text)}
              className="py-2 text-base font-semibold"
              style={{ color: colors.text }}
            />
          </View>

          <View>
            <Text className="mb-2 text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
              {t('reminders.repeat')}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {SPECIFIC_TIME_REPEATS.map((repeat) => (
                <Chip
                  key={repeat}
                  label={repeat === 'custom' ? t('reminders.repeatCustom') : repeat}
                  selected={(value.specificTime?.repeat ?? 'none') === repeat}
                  onPress={() => setSpecificRepeat(repeat)}
                />
              ))}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

type Props = {
  value: ChecklistReminderTrigger;
  onChange: (value: ChecklistReminderTrigger) => void;
};

export function ChecklistReminderSection({ value, onChange }: Props) {
  return (
    <View className="gap-6">
      <TimeTriggerSection value={value.time} onChange={(time) => onChange({ ...value, time })} />
      <LocationTriggerSection value={value.location} onChange={(location) => onChange({ ...value, location })} />
    </View>
  );
}
