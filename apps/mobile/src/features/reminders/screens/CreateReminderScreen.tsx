import { Alert } from 'react-native';
import { AppScreen, PageHeader } from '../../../components/layout';
import { useLanguage } from '../../../i18n/LanguageContext';
import { NotificationPermissionDeniedError, scheduleReminderNotification } from '../../../lib/notifications';
import { createReminder } from '../api/reminders.api';
import { ReminderForm } from '../components/ReminderForm';
import type { Reminder } from '../types/reminders.types';

async function scheduleTimeReminderNotification(reminder: Reminder) {
  if (reminder.type !== 'time' || !reminder.remindAt) return;

  try {
    await scheduleReminderNotification({
      title: reminder.title,
      body: reminder.description,
      triggerDateTime: reminder.remindAt,
      priority: reminder.priority,
    });
  } catch (error) {
    if (error instanceof NotificationPermissionDeniedError) {
      console.warn('[CreateReminderScreen] notification permission denied:', error.message);
      Alert.alert('Notifications disabled', error.message);
      return;
    }

    console.error('[CreateReminderScreen] failed to schedule notification:', error);
  }
}

type Props = {
  onCancel: () => void;
  onCreated: (reminder: Reminder) => void;
};

export function CreateReminderScreen({ onCancel, onCreated }: Props) {
  const { t } = useLanguage();

  return (
    <AppScreen keyboardAvoiding>
      <PageHeader
        title={t('reminders.createTitle')}
        subtitle={t('reminders.createSubtitle', { brand_name: t('common.brand_name') })}
        onBack={onCancel}
      />
      <ReminderForm
        submitLabel={t('reminders.saveReminder')}
        onSubmit={async (values) => {
          const reminder = await createReminder(values);
          await scheduleTimeReminderNotification(reminder);
          onCreated(reminder);
        }}
      />
    </AppScreen>
  );
}
