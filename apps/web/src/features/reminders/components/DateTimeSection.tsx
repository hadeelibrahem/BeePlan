import { useLanguage } from '../../../i18n/LanguageContext'
import type { RepeatRule } from '../types/reminders.types'
import { RepeatSelector } from './RepeatSelector'

type Props = {
  remindAt?: string
  reminderBeforeMinutes?: number
  repeatRule: RepeatRule
  onRemindAtChange: (value: string) => void
  onReminderBeforeChange: (value: number) => void
  onRepeatRuleChange: (value: RepeatRule) => void
}

export function DateTimeSection({
  remindAt,
  reminderBeforeMinutes,
  repeatRule,
  onRemindAtChange,
  onReminderBeforeChange,
  onRepeatRuleChange,
}: Props) {
  const { t } = useLanguage()

  return (
    <section className="grid gap-4">
      <label className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-4 py-3 transition focus-within:border-[var(--bp-accent)]">
        <span className="mb-1 block text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">
          {t('reminders.dateTime')}
        </span>
        <input
          type="datetime-local"
          value={remindAt ?? ''}
          onChange={(event) => onRemindAtChange(event.target.value)}
          className="w-full bg-transparent py-2 text-base font-semibold text-[var(--bp-text)] outline-none"
        />
      </label>
      <label className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-4 py-3 transition focus-within:border-[var(--bp-accent)]">
        <span className="mb-1 block text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">
          {t('reminders.reminderBefore')}
        </span>
        <input
          type="number"
          min={0}
          value={reminderBeforeMinutes ?? ''}
          onChange={(event) => onReminderBeforeChange(Number(event.target.value) || 0)}
          className="w-full bg-transparent py-2 text-base font-semibold text-[var(--bp-text)] outline-none"
        />
      </label>
      <RepeatSelector value={repeatRule} onChange={onRepeatRuleChange} />
    </section>
  )
}
