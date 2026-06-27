import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useTheme, type AppTheme } from '../../../theme/ThemeContext';
import type { Reminder } from '../types/reminders.types';

type Props = {
  reminder: Reminder;
  onBack: () => void;
  onEdit: () => void;
};

export function ReminderDetailsScreen({ reminder, onBack, onEdit }: Props) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const styles = createStyles(theme);

  return (
    <ScrollView style={styles.screen} contentContainerClassName="px-5 pb-10 pt-12">
      <View className="mb-6 flex-row items-center justify-between">
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
              accessibilityLabel={t('actions.back')}
            className="h-10 w-10 items-center justify-center rounded-full"
            style={styles.iconButton}
          >
            <Text className="text-lg font-black" style={styles.accentText}>&lt;</Text>
          </Pressable>
          <Text className="text-sm font-bold" style={styles.mutedText}>{t('actions.back')}</Text>
        </View>
        <Pressable onPress={onEdit} className="rounded-full px-5 py-3" style={styles.secondaryButton}>
          <Text className="text-xs font-black" style={styles.accentText}>{t('actions.edit')}</Text>
        </Pressable>
      </View>

      <View className="rounded-3xl p-6" style={styles.card}>
        <Text className="text-xs font-black uppercase tracking-widest" style={styles.accentText}>
          {t('reminders.typeReminder', { type: t(`filters.${reminder.type}`) })}
        </Text>
        <Text className="mt-3 text-3xl font-black" style={styles.title}>{reminder.title}</Text>
        {!!reminder.description && (
          <Text className="mt-3 text-base leading-7" style={styles.mutedText}>{reminder.description}</Text>
        )}
        <View className="mt-6 gap-3">
          <Detail label={t('reminders.detailStatus')} value={t(`status.${reminder.status}`)} theme={theme} />
          <Detail label={t('reminders.detailPriority')} value={reminder.priority} theme={theme} />
          {reminder.remindAt && <Detail label={t('reminders.detailWhen')} value={reminder.remindAt} theme={theme} />}
          {reminder.location && (
            <Detail
              label={t('reminders.detailLocation')}
              value={`${reminder.location.triggerType} ${reminder.location.name}, ${reminder.location.radiusMeters}m`}
              theme={theme}
            />
          )}
          {reminder.context && <Detail label={t('reminders.detailCondition')} value={reminder.context.condition} theme={theme} />}
        </View>
      </View>

      {!!reminder.checklistItems?.length && (
        <View className="mt-5 rounded-3xl p-5" style={styles.card}>
          <Text className="mb-4 text-lg font-black" style={styles.title}>{t('reminders.checklist')}</Text>
          <View className="gap-3">
            {reminder.checklistItems.map((item) => (
              <View key={item.id} className="flex-row items-center gap-3">
                <View
                  className="h-5 w-5 rounded-full"
                  style={item.isDone ? styles.checkDone : styles.checkEmpty}
                />
                <Text className="flex-1 text-sm font-semibold" style={styles.mutedText}>{item.title}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function Detail({ label, value, theme }: { label: string; value: string; theme: AppTheme }) {
  const styles = createStyles(theme);

  return (
    <View className="rounded-2xl p-4" style={styles.detail}>
      <Text className="text-xs font-black uppercase tracking-widest" style={styles.subtleText}>{label}</Text>
      <Text className="mt-1 text-sm font-bold" style={styles.title}>{value}</Text>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: {
      backgroundColor: theme.colors.background,
      flex: 1,
    },
    iconButton: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
    },
    secondaryButton: {
      backgroundColor: theme.colors.accentSoft,
      borderColor: theme.colors.accent,
      borderWidth: 1,
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
    },
    detail: {
      backgroundColor: theme.colors.background,
      borderColor: theme.colors.border,
      borderWidth: 1,
    },
    title: {
      color: theme.colors.text,
    },
    mutedText: {
      color: theme.colors.textMuted,
    },
    subtleText: {
      color: theme.colors.textSubtle,
    },
    accentText: {
      color: theme.colors.accent,
    },
    checkDone: {
      backgroundColor: theme.colors.accent,
    },
    checkEmpty: {
      borderColor: theme.colors.textSubtle,
      borderWidth: 1,
    },
  });
}
