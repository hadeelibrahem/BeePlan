import { useLanguage } from '../../../i18n/LanguageContext'
import type { RepeatFrequency, RepeatRule } from '../types/reminders.types'

const FREQUENCIES: RepeatFrequency[] = ['none', 'daily', 'weekly', 'monthly']

type Props = {
  value: RepeatRule
  onChange: (value: RepeatRule) => void
}

export function RepeatSelector({ value, onChange }: Props) {
  const { t } = useLanguage()

  return (
    <section>
      <p className="mb-3 text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">{t('reminders.repeat')}</p>
      <div className="flex flex-wrap gap-2">
        {FREQUENCIES.map((frequency) => {
          const selected = value.frequency === frequency
          return (
            <button
              key={frequency}
              type="button"
              onClick={() => onChange({ ...value, frequency })}
              aria-pressed={selected}
              className={`rounded-full border px-4 py-2.5 text-xs font-black capitalize transition ${
                selected
                  ? 'border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] text-[var(--bp-accent)]'
                  : 'border-[var(--bp-border)] bg-[var(--bp-surface)] text-[var(--bp-text)] hover:border-[var(--bp-accent)]'
              }`}
            >
              {frequency}
            </button>
          )
        })}
      </div>
      {value.frequency !== 'none' && (
        <label className="mt-3 block rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-4 py-3 transition focus-within:border-[var(--bp-accent)]">
          <span className="mb-1 block text-xs font-bold text-[var(--bp-subtle)]">{t('reminders.every')}</span>
          <input
            type="number"
            min={1}
            value={value.interval}
            onChange={(event) => onChange({ ...value, interval: Number(event.target.value) || 1 })}
            className="w-full bg-transparent text-base font-bold text-[var(--bp-text)] outline-none"
          />
        </label>
      )}
    </section>
  )
}
