import { Pressable, Text, View } from 'react-native';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useTheme } from '../../../theme/useTheme';
import type { ReminderType } from '../types/reminders.types';

const TYPES: Array<{ value: ReminderType; labelKey: string; hintKey: string }> = [
  { value: 'time', labelKey: 'reminders.typeTime', hintKey: 'reminders.typeTimeHint' },
  { value: 'location', labelKey: 'reminders.typeLocation', hintKey: 'reminders.typeLocationHint' },
  { value: 'context', labelKey: 'reminders.typeContext', hintKey: 'reminders.typeContextHint' },
  { value: 'checklist', labelKey: 'reminders.typeChecklist', hintKey: 'reminders.typeChecklistHint' },
  { value: 'person', labelKey: 'reminders.typePerson', hintKey: 'reminders.typePersonHint' },
];

type Props = {
  value: ReminderType;
  onChange: (value: ReminderType) => void;
};

export function ReminderTypeSelector({ value, onChange }: Props) {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View className="gap-3">
      <Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
        {t('reminders.reminderType')}
      </Text>
      <View className="flex-row flex-wrap gap-2 rounded-2xl border p-1.5" style={{ borderColor: colors.border, backgroundColor: colors.input }}>
        {TYPES.map((type) => {
          const selected = value === type.value;
          return (
            <Pressable
              key={type.value}
              onPress={() => onChange(type.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className="w-[48%] rounded-xl border px-3 py-3 active:opacity-80"
              style={{ borderColor: selected ? colors.accent : 'transparent', backgroundColor: selected ? colors.accentSoft : 'transparent' }}
            >
              <View className="flex-row items-start justify-between gap-2">
                <Text className="flex-1 text-sm font-black" style={{ color: colors.text }}>{t(type.labelKey)}</Text>
                {selected && <View className="mt-1 h-2 w-2 rounded-full" style={{ backgroundColor: colors.accent }} />}
              </View>
              <Text className="mt-1 text-xs font-semibold" style={{ color: selected ? colors.accent : colors.secondaryText }}>
                {t(type.hintKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
