import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useTheme, type AppTheme } from '../../../theme/ThemeContext';
import { createReminder } from '../api/reminders.api';
import { ReminderForm } from '../components/ReminderForm';
import type { Reminder } from '../types/reminders.types';

type Props = {
  onCancel: () => void;
  onCreated: (reminder: Reminder) => void;
};

export function CreateReminderScreen({ onCancel, onCreated }: Props) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const styles = createStyles(theme);

  return (
    <ScrollView style={styles.screen} contentContainerClassName="px-5 pb-10 pt-12">
      <View className="mb-6">
        <View className="mb-5 flex-row items-center gap-3">
          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel={t('actions.back')}
            className="h-10 w-10 items-center justify-center rounded-full"
            style={styles.iconButton}
          >
            <Text className="text-lg font-black" style={styles.accentText}>&lt;</Text>
          </Pressable>
          <Text className="text-sm font-bold" style={styles.mutedText}>{t('actions.back')}</Text>
        </View>
        <Text className="text-3xl font-black" style={styles.title}>{t('reminders.createTitle')}</Text>
        <Text className="mt-2 text-sm leading-6" style={styles.mutedText}>
          {t('reminders.createSubtitle', { brand_name: t('common.brand_name') })}
        </Text>
      </View>
      <ReminderForm
        submitLabel={t('reminders.saveReminder')}
        onSubmit={async (values) => {
          const reminder = await createReminder(values);
          onCreated(reminder);
        }}
      />
    </ScrollView>
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
    title: {
      color: theme.colors.text,
    },
    mutedText: {
      color: theme.colors.textMuted,
    },
    accentText: {
      color: theme.colors.accent,
    },
  });
}
