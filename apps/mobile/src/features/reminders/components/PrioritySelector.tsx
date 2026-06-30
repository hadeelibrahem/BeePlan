import { Pressable, Text, View } from 'react-native';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useTheme } from '../../../theme/useTheme';
import type { ReminderPriority } from '../types/reminders.types';

const PRIORITIES: ReminderPriority[] = ['low', 'medium', 'high', 'urgent'];

type Props = {
  value: ReminderPriority;
  onChange: (value: ReminderPriority) => void;
};

export function PrioritySelector({ value, onChange }: Props) {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View>
      <Text className="mb-3 text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
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
              className="rounded-full border px-4 py-2.5 active:opacity-80"
              style={{ borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accentSoft : colors.input }}
            >
              <Text className="text-xs font-black capitalize" style={{ color: selected ? colors.accent : colors.text }}>
                {priority}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
