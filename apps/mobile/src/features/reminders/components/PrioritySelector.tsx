import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useTheme, type AppTheme } from '../../../theme/ThemeContext';
import type { ReminderPriority } from '../types/reminders.types';

const PRIORITIES: ReminderPriority[] = ['low', 'medium', 'high', 'urgent'];

type Props = {
  value: ReminderPriority;
  onChange: (value: ReminderPriority) => void;
};

export function PrioritySelector({ value, onChange }: Props) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const styles = createStyles(theme);

  return (
    <View>
      <Text className="mb-3 text-xs font-black uppercase tracking-widest" style={styles.label}>
        {t('reminders.priority')}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {PRIORITIES.map((priority) => {
          const selected = value === priority;
          return (
            <Pressable
              key={priority}
              onPress={() => onChange(priority)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className="rounded-full border px-4 py-2.5"
              style={selected ? styles.selectedPill : styles.pill}
            >
              <Text
                className="text-xs font-black capitalize"
                style={selected ? styles.selectedText : styles.text}
              >
                {priority}
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
    pill: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
    },
    selectedPill: {
      backgroundColor: theme.colors.accentSoft,
      borderColor: theme.colors.accent,
    },
    text: {
      color: theme.colors.text,
    },
    selectedText: {
      color: theme.colors.accent,
    },
  });
}
