import { useLanguage } from '../../../i18n/LanguageContext'
import type { ReminderPriority } from '../types/reminders.types'

const PRIORITIES: ReminderPriority[] = ['low', 'medium', 'high', 'urgent']

type Props = {
  value: ReminderPriority
  onChange: (value: ReminderPriority) => void
}

export function PrioritySelector({ value, onChange }: Props) {
  const { t } = useLanguage()

  return (
    <section>
      <p className="mb-3 text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">{t('reminders.priority')}</p>
      <div className="flex flex-wrap gap-2">
        {PRIORITIES.map((priority) => {
          const selected = value === priority
          return (
            <button
              key={priority}
              type="button"
              onClick={() => onChange(priority)}
              aria-pressed={selected}
              className={`rounded-full border px-4 py-2.5 text-xs font-black capitalize transition ${
                selected
                  ? 'border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] text-[var(--bp-accent)]'
                  : 'border-[var(--bp-border)] bg-[var(--bp-surface)] text-[var(--bp-text)] hover:border-[var(--bp-accent)]'
              }`}
            >
              {priority}
            </button>
          )
        })}
      </div>
    </section>
  )
}
