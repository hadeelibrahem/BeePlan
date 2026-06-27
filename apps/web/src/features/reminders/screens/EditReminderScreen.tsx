import { useLanguage } from '../../../i18n/LanguageContext'
import { updateReminder } from '../api/reminders.api'
import { ReminderForm } from '../components/ReminderForm'
import type { Reminder } from '../types/reminders.types'

type Props = {
  reminder: Reminder
  onCancel: () => void
  onSaved: (reminder: Reminder) => void
}

export function EditReminderScreen({ reminder, onCancel, onSaved }: Props) {
  const { t } = useLanguage()

  return (
    <main className="min-h-screen bg-[var(--bp-bg)] px-4 pb-8 pt-5 text-[var(--bp-text)]">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            aria-label={t('actions.back')}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--bp-border)] bg-[var(--bp-surface)] text-lg font-black text-[var(--bp-accent)] transition hover:border-[var(--bp-accent)] hover:bg-[var(--bp-input)]"
          >
            &lt;
          </button>
          <span className="text-sm font-bold text-[var(--bp-muted)]">{t('actions.back')}</span>
        </div>
        <h1 className="text-4xl font-black">{t('reminders.editTitle')}</h1>
        <p className="mb-8 mt-2 max-w-xl text-sm leading-6 text-[var(--bp-muted)]">
          {t('reminders.editSubtitle')}
        </p>
        <ReminderForm
          initialReminder={reminder}
          submitLabel={t('reminders.saveChanges')}
          onSubmit={async (values) => {
            const updated = await updateReminder(reminder.id, values)
            if (updated) onSaved(updated)
          }}
        />
      </div>
    </main>
  )
}
