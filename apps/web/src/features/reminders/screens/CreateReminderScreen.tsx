import { useState } from 'react'
import { useLanguage } from '../../../i18n/LanguageContext'
import { createReminder } from '../api/reminders.api'
import { AiAssistantSection } from '../components/AiAssistantSection'
import { ReminderForm } from '../components/ReminderForm'
import type { ReminderDraft } from '../types/aiAssistant.types'
import type { Reminder } from '../types/reminders.types'
import { mapDraftToReminder } from '../utils/aiDraftMapping'

type Props = {
  accessToken: string
  onCancel: () => void
  onCreated: (reminder: Reminder) => void
}

export function CreateReminderScreen({ accessToken, onCancel, onCreated }: Props) {
  const { t, isRTL } = useLanguage()
  const [draftReminder, setDraftReminder] = useState<Reminder | undefined>(undefined)
  const [formKey, setFormKey] = useState(0)

  const applyDraft = (draft: ReminderDraft) => {
    setDraftReminder(mapDraftToReminder(draft))
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
        <AiAssistantSection onApplyDraft={applyDraft} accessToken={accessToken} />
        <ReminderForm
          key={formKey}
          initialReminder={draftReminder}
          submitLabel={t('reminders.saveReminder')}
          onSubmit={async (values) => {
            const reminder = await createReminder(values, accessToken)
            onCreated(reminder)
          }}
        />
      </div>
    </main>
  )
}
