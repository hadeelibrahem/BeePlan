import { useLanguage } from '../../../i18n/LanguageContext'
import type { ReminderType } from '../types/reminders.types'

const TYPES: Array<{ value: ReminderType; labelKey: string; hintKey: string }> = [
  { value: 'time', labelKey: 'reminders.typeTime', hintKey: 'reminders.typeTimeHint' },
  { value: 'location', labelKey: 'reminders.typeLocation', hintKey: 'reminders.typeLocationHint' },
  { value: 'context', labelKey: 'reminders.typeContext', hintKey: 'reminders.typeContextHint' },
  { value: 'checklist', labelKey: 'reminders.typeChecklist', hintKey: 'reminders.typeChecklistHint' },
  { value: 'person', labelKey: 'reminders.typePerson', hintKey: 'reminders.typePersonHint' },
]

type Props = {
  value: ReminderType
  onChange: (value: ReminderType) => void
}

export function ReminderTypeSelector({ value, onChange }: Props) {
  const { t } = useLanguage()

  return (
    <section>
      <p className="mb-3 text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">{t('reminders.reminderType')}</p>
      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-1.5 sm:grid-cols-3 lg:grid-cols-5">
        {TYPES.map((type) => {
          const selected = value === type.value
          return (
            <button
              key={type.value}
              type="button"
              onClick={() => onChange(type.value)}
              aria-pressed={selected}
              className={`relative rounded-xl border px-3 py-3 text-start transition ${
                selected
                  ? 'border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] text-[var(--bp-text)] shadow-[inset_0_0_0_1px_rgba(253,239,75,0.12),0_0_18px_rgba(253,239,75,0.08)]'
                  : 'border-transparent bg-transparent text-[var(--bp-text)] hover:bg-[var(--bp-input)]'
              }`}
            >
              {selected && <span className="absolute end-3 top-3 h-2 w-2 rounded-full bg-[var(--bp-accent)]" />}
              <span className="block pe-4 text-sm font-black">{t(type.labelKey)}</span>
              <span className={`mt-1 block text-xs font-semibold ${selected ? 'text-[var(--bp-accent)]' : 'text-[var(--bp-subtle)]'}`}>
                {t(type.hintKey)}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
