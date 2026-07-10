import { useEffect, useState } from 'react'
import { useLanguage } from '../../../i18n/LanguageContext'
import { createPersonReminder, getFriends } from '../../social/api/social.api'
import type { FriendSummary, ParsePersonReminderResult } from '../../social/types/social.types'
import { createReminder, getReminder } from '../api/reminders.api'
import { AiAssistantSection, clearAiReminderText } from '../components/AiAssistantSection'
import { ReminderForm } from '../components/ReminderForm'
import type { ReminderDraft } from '../types/aiAssistant.types'
import type { PersonReminderConfig, Reminder } from '../types/reminders.types'
import { mapDraftToReminder } from '../utils/aiDraftMapping'

type Props = {
  accessToken: string
  onCancel: () => void
  onCreated: (reminder: Reminder) => void
  /** Navigate to the People page (used when a detected person isn't a friend yet). */
  onNavigatePeople?: () => void
}

// Builds a `Reminder`-shaped prefill for the Person form from an AI parse result.
function personDraftToReminder(result: ParsePersonReminderResult): Reminder {
  const now = new Date().toISOString()
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
  }
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
  }
}

export function CreateReminderScreen({ accessToken, onCancel, onCreated, onNavigatePeople }: Props) {
  const { t, isRTL } = useLanguage()
  const [draftReminder, setDraftReminder] = useState<Reminder | undefined>(undefined)
  const [formKey, setFormKey] = useState(0)
  const [friends, setFriends] = useState<FriendSummary[]>([])

  useEffect(() => {
    if (!accessToken) return
    void getFriends(accessToken)
      .then(setFriends)
      .catch(() => setFriends([]))
  }, [accessToken])

  const applyDraft = (draft: ReminderDraft) => {
    setDraftReminder(mapDraftToReminder(draft))
    setFormKey((key) => key + 1)
  }

  const applyPersonDraft = (result: ParsePersonReminderResult) => {
    setDraftReminder(personDraftToReminder(result))
    setFormKey((key) => key + 1)
  }

  return (
    <main className="min-h-screen bg-[var(--bp-bg)] px-4 pb-6 pt-4 text-[var(--bp-text)]">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            aria-label={t('actions.back')}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--bp-border)] bg-[var(--bp-surface)] text-sm font-black text-[var(--bp-accent)] transition hover:border-[var(--bp-accent)] hover:bg-[var(--bp-input)]"
          >
            {isRTL ? '>' : '<'}
          </button>
          <span className="text-sm font-bold text-[var(--bp-muted)]">{t('actions.back')}</span>
        </div>
        <h1 className="text-2xl font-black tracking-normal">{t('reminders.createTitle')}</h1>
        <p className="mb-4 mt-1.5 max-w-xl text-sm leading-6 text-[var(--bp-muted)]">
          {t('reminders.createSubtitle', { brand_name: t('common.brand_name') })}
        </p>
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
              const person = values.person
              if (!person?.targetUserId) return
              const created = (await createPersonReminder(
                {
                  title: values.title,
                  targetUserId: person.targetUserId,
                  message: values.description || person.message || '',
                  expiration: person.expiration ?? '1w',
                  radiusMeters: person.radiusMeters ?? 100,
                  cooldownMinutes: person.cooldownMinutes ?? 30,
                },
                accessToken,
              )) as { id: string }
              clearAiReminderText()
              const full = await getReminder(created.id, accessToken)
              onCreated(full)
              return
            }
            const reminder = await createReminder(values, accessToken)
            clearAiReminderText()
            onCreated(reminder)
          }}
        />
      </div>
    </main>
  )
}
