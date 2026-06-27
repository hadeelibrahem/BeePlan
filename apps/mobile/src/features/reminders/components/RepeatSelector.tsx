import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useTheme, type AppTheme } from '../../../theme/ThemeContext';
import type { RepeatFrequency, RepeatRule } from '../types/reminders.types';

const FREQUENCIES: RepeatFrequency[] = ['none', 'daily', 'weekly', 'monthly'];

type Props = {
  value: RepeatRule;
  onChange: (value: RepeatRule) => void;
};

export function RepeatSelector({ value, onChange }: Props) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const styles = createStyles(theme);

  return (
    <View>
      <Text className="mb-3 text-xs font-black uppercase tracking-widest" style={styles.label}>
        {t('reminders.repeat')}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {FREQUENCIES.map((frequency) => {
          const selected = value.frequency === frequency;
          return (
            <Pressable
              key={frequency}
              onPress={() => onChange({ ...value, frequency })}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className="rounded-full border px-4 py-2.5"
              style={selected ? styles.selectedPill : styles.pill}
            >
              <Text
                className="text-xs font-black capitalize"
                style={selected ? styles.selectedText : styles.text}
              >
                {frequency}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {value.frequency !== 'none' && (
        <View className="mt-3 rounded-2xl border px-4 py-3" style={styles.field}>
          <Text className="mb-1 text-xs font-bold" style={styles.label}>{t('reminders.every')}</Text>
          <TextInput
            keyboardType="numeric"
            value={String(value.interval)}
            onChangeText={(text) => onChange({ ...value, interval: Number(text) || 1 })}
            className="text-base font-bold"
            style={styles.text}
          />
        </View>
      )}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    label: {
      color: theme.colors.textSubtle,
    },
    field: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
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
