import { useEffect, useState } from 'react';
import { AppScreen, PageHeader } from '../../../components/layout';
import { useLanguage } from '../../../i18n/LanguageContext';
import { requestForegroundLocationPermission } from '../../../lib/location';
import { requestNotificationPermission } from '../../../lib/notifications';
import { startProximityMonitor } from '../../../services/proximityMonitor';
import { createPersonReminder, getFriends } from '../../social/api/social.api';
import type { FriendSummary, ParsePersonReminderResult } from '../../social/types/social.types';
import { createReminder, getReminderById } from '../api/reminders.api';
import { AiAssistantSection, clearAiReminderText } from '../components/AiAssistantSection';
import { ReminderForm } from '../components/ReminderForm';
import type { ReminderDraft } from '../types/aiAssistant.types';
import type { PersonReminderConfig, Reminder } from '../types/reminders.types';
import { scheduleTimeReminderNotification } from '../utils/reminderNotificationSync';
import { mapDraftToReminder } from '../utils/aiDraftMapping';
import { createReminderInitialState } from '../createReminderInitialState';

type Props = {
  accessToken: string;
  onCancel: () => void;
  onCreated: (reminder: Reminder) => void;
  /** Navigate to the People page (used when a detected person isn't a friend yet). */
  onNavigatePeople?: () => void;
  initialType?: 'task' | 'person' | 'checklist';
  initialFriendId?: string;
};

// Builds a `Reminder`-shaped prefill for the Person form from an AI parse result.
function personDraftToReminder(result: ParsePersonReminderResult): Reminder {
  const now = new Date().toISOString();
  const person: PersonReminderConfig = {
    targetUserId: result.matchedFriendId ?? undefined,
    targetName: result.matchedFriendName ?? result.draft.person.personName ?? undefined,
    message: result.draft.person.message,
    radiusMeters: 100,
    cooldownMinutes: 30,
    expiration: '1w',
    confidence: result.confidence,
    matchStatus: result.match.status,
    candidates: result.match.candidates,
    aiPersonName: result.draft.person.personName,
  };
  return {
    id: 'ai-draft',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    title: result.draft.title || result.draft.person.message || '',
    description: result.draft.person.message || undefined,
    type: 'person',
    priority: 'medium',
    person,
  };
}

export function CreateReminderScreen({ accessToken, onCancel, onCreated, onNavigatePeople, initialType, initialFriendId }: Props) {
  const { t } = useLanguage();
  const [draftReminder, setDraftReminder] = useState<Reminder | undefined>(() => createReminderInitialState(initialType, initialFriendId));
  const [formKey, setFormKey] = useState(0);
  const [friends, setFriends] = useState<FriendSummary[]>([]);

  useEffect(() => {
    void getFriends()
      .then(setFriends)
      .catch(() => setFriends([]));
  }, []);

  const applyDraft = (draft: ReminderDraft) => {
    setDraftReminder(mapDraftToReminder(draft));
    setFormKey((key) => key + 1);
  };

  const applyPersonDraft = (result: ParsePersonReminderResult) => {
    setDraftReminder(personDraftToReminder(result));
    setFormKey((key) => key + 1);
  };

  return (
    <AppScreen keyboardAvoiding>
      <PageHeader
        title={t('reminders.createTitle')}
        subtitle={t('reminders.createSubtitle', { brand_name: t('common.brand_name') })}
        onBack={onCancel}
      />
      <AiAssistantSection
        onApplyDraft={applyDraft}
        onApplyPersonDraft={applyPersonDraft}
        accessToken={accessToken}
      />
      <ReminderForm
        key={formKey}
        initialReminder={draftReminder}
        friends={friends}
        onAddFriend={onNavigatePeople}
        submitLabel={t('reminders.saveReminder')}
        onSubmit={async (values) => {
          if (values.type === 'person') {
            const person = values.person;
            if (!person?.targetUserId) return;
            const created = (await createPersonReminder({
              title: values.title,
              targetUserId: person.targetUserId,
              message: values.description || person.message || '',
              expiration: person.expiration ?? '1w',
              radiusMeters: person.radiusMeters ?? 100,
              cooldownMinutes: person.cooldownMinutes ?? 30,
            })) as { id: string };
            clearAiReminderText();
            // The reminder can't fire until this device is posting snapshots, so
            // request the permissions the feature needs and start the monitor.
            await requestNotificationPermission();
            const granted = await requestForegroundLocationPermission();
            if (granted) void startProximityMonitor();
            const full = await getReminderById(created.id, accessToken);
            if (full) onCreated(full);
            return;
          }
          const reminder = await createReminder(values, accessToken);
          await scheduleTimeReminderNotification(reminder);
          clearAiReminderText();
          onCreated(reminder);
        }}
      />
    </AppScreen>
  );
}
