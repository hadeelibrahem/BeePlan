import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useTheme, type AppTheme } from '../../../theme/ThemeContext';
import type { ReminderType } from '../types/reminders.types';

const TYPES: Array<{ value: ReminderType; labelKey: string; hintKey: string }> = [
  { value: 'time', labelKey: 'reminders.typeTime', hintKey: 'reminders.typeTimeHint' },
  { value: 'location', labelKey: 'reminders.typeLocation', hintKey: 'reminders.typeLocationHint' },
  { value: 'context', labelKey: 'reminders.typeContext', hintKey: 'reminders.typeContextHint' },
  { value: 'checklist', labelKey: 'reminders.typeChecklist', hintKey: 'reminders.typeChecklistHint' },
];

type Props = {
  value: ReminderType;
  onChange: (value: ReminderType) => void;
};

export function ReminderTypeSelector({ value, onChange }: Props) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const styles = createStyles(theme);

  return (
    <View className="gap-3">
      <Text className="text-xs font-black uppercase tracking-widest" style={styles.label}>
        {t('reminders.reminderType')}
      </Text>
      <View className="flex-row flex-wrap gap-2 rounded-2xl border p-1.5" style={styles.container}>
        {TYPES.map((type) => {
          const selected = value === type.value;
          return (
            <Pressable
              key={type.value}
              onPress={() => onChange(type.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className="w-[48%] rounded-xl border px-3 py-3"
              style={selected ? styles.selectedOption : styles.option}
            >
              <View className="flex-row items-start justify-between gap-2">
                <Text className="flex-1 text-sm font-black" style={styles.text}>{t(type.labelKey)}</Text>
                {selected && <View className="mt-1 h-2 w-2 rounded-full" style={styles.dot} />}
              </View>
              <Text
                className="mt-1 text-xs font-semibold"
                style={selected ? styles.selectedHint : styles.hint}
              >
                {t(type.hintKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    label: {
      color: theme.colors.textSubtle,
    },
    container: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
    },
    option: {
      backgroundColor: 'transparent',
      borderColor: 'transparent',
    },
    selectedOption: {
      backgroundColor: theme.colors.accentSoft,
      borderColor: theme.colors.accent,
    },
    text: {
      color: theme.colors.text,
    },
    hint: {
      color: theme.colors.textSubtle,
    },
    selectedHint: {
      color: theme.colors.accent,
    },
    dot: {
      backgroundColor: theme.colors.accent,
    },
  });
}
