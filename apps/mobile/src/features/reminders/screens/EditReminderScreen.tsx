import { useEffect, useState } from 'react';
import { AppScreen, PageHeader } from '../../../components/layout';
import { useLanguage } from '../../../i18n/LanguageContext';
import { getFriends } from '../../social/api/social.api';
import type { FriendSummary } from '../../social/types/social.types';
import { updateReminder } from '../api/reminders.api';
import { ReminderForm } from '../components/ReminderForm';
import type { Reminder } from '../types/reminders.types';
import { scheduleTimeReminderNotification } from '../utils/reminderNotificationSync';

type Props = {
  reminder: Reminder;
  accessToken: string;
  onCancel: () => void;
  onSaved: (reminder: Reminder) => void;
};

export function EditReminderScreen({ reminder, accessToken, onCancel, onSaved }: Props) {
  const { t } = useLanguage();
  const [friends, setFriends] = useState<FriendSummary[]>([]);

  useEffect(() => {
    if (reminder.type !== 'person') return;
    void getFriends()
      .then(setFriends)
      .catch(() => setFriends([]));
  }, [reminder.type]);

  return (
    <AppScreen keyboardAvoiding>
      <PageHeader title={t('reminders.editTitle')} subtitle={t('reminders.editSubtitle')} onBack={onCancel} />
      <ReminderForm
        initialReminder={reminder}
        accessToken={accessToken}
        friends={friends}
        submitLabel={t('reminders.saveChanges')}
        onSubmit={async (values) => {
          const updated = await updateReminder(reminder.id, values, accessToken);
          if (!updated) return;

          console.log('[EditReminderScreen] updateReminder succeeded', updated.id);
          await scheduleTimeReminderNotification(updated);
          onSaved(updated);
        }}
      />
    </AppScreen>
  );
}
