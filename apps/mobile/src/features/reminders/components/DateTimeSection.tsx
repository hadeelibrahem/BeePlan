import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useTheme, type AppTheme } from '../../../theme/ThemeContext';
import type { RepeatRule } from '../types/reminders.types';
import { RepeatSelector } from './RepeatSelector';

type Props = {
  remindAt?: string;
  reminderBeforeMinutes?: number;
  repeatRule: RepeatRule;
  onRemindAtChange: (value: string) => void;
  onReminderBeforeChange: (value: number) => void;
  onRepeatRuleChange: (value: RepeatRule) => void;
};

export function DateTimeSection({
  remindAt,
  reminderBeforeMinutes,
  repeatRule,
  onRemindAtChange,
  onReminderBeforeChange,
  onRepeatRuleChange,
}: Props) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const styles = createStyles(theme);

  return (
    <View className="gap-4">
      <View className="rounded-2xl border px-4 py-3" style={styles.field}>
        <Text className="mb-1 text-xs font-black uppercase tracking-widest" style={styles.label}>
          {t('reminders.dateTime')}
        </Text>
        <TextInput
          placeholder="2026-06-26 18:30"
          placeholderTextColor={theme.colors.textSubtle}
          value={remindAt ?? ''}
          onChangeText={onRemindAtChange}
          className="py-2 text-base font-semibold"
          style={styles.input}
        />
      </View>
      <View className="rounded-2xl border px-4 py-3" style={styles.field}>
        <Text className="mb-1 text-xs font-black uppercase tracking-widest" style={styles.label}>
          {t('reminders.reminderBefore')}
        </Text>
        <TextInput
          keyboardType="numeric"
          placeholder="30 minutes"
          placeholderTextColor={theme.colors.textSubtle}
          value={reminderBeforeMinutes ? String(reminderBeforeMinutes) : ''}
          onChangeText={(text) => onReminderBeforeChange(Number(text) || 0)}
          className="py-2 text-base font-semibold"
          style={styles.input}
        />
      </View>
      <RepeatSelector value={repeatRule} onChange={onRepeatRuleChange} />
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    field: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
    },
    label: {
      color: theme.colors.textSubtle,
    },
    input: {
      color: theme.colors.text,
    },
  });
}
