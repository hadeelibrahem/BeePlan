import { useState } from 'react';
import { AppScreen, PageHeader } from '../../../components/layout';
import { useLanguage } from '../../../i18n/LanguageContext';
import { createReminder } from '../api/reminders.api';
import { AiAssistantSection } from '../components/AiAssistantSection';
import { ReminderForm } from '../components/ReminderForm';
import type { ReminderDraft } from '../types/aiAssistant.types';
import type { Reminder } from '../types/reminders.types';
import { scheduleTimeReminderNotification } from '../utils/reminderNotificationSync';
import { mapDraftToReminder } from '../utils/aiDraftMapping';

type Props = {
  accessToken: string;
  onCancel: () => void;
  onCreated: (reminder: Reminder) => void;
};

export function CreateReminderScreen({ accessToken, onCancel, onCreated }: Props) {
  const { t } = useLanguage();
  const [draftReminder, setDraftReminder] = useState<Reminder | undefined>(undefined);
  const [formKey, setFormKey] = useState(0);

  const applyDraft = (draft: ReminderDraft) => {
    setDraftReminder(mapDraftToReminder(draft));
    setFormKey((key) => key + 1);
  };

  return (
    <AppScreen keyboardAvoiding>
      <PageHeader
        title={t('reminders.createTitle')}
        subtitle={t('reminders.createSubtitle', { brand_name: t('common.brand_name') })}
        onBack={onCancel}
      />
      <AiAssistantSection onApplyDraft={applyDraft} />
      <ReminderForm
        key={formKey}
        initialReminder={draftReminder}
        submitLabel={t('reminders.saveReminder')}
        onSubmit={async (values) => {
          const reminder = await createReminder(values, accessToken);
          await scheduleTimeReminderNotification(reminder);
          onCreated(reminder);
        }}
      />
    </AppScreen>
  );
}
