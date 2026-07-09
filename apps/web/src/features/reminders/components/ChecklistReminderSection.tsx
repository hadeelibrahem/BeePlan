import { useLanguage } from '../../../i18n/LanguageContext'
import type {
  ChecklistReminderTrigger,
  GeneralTimeCategory,
  ReminderTimeTrigger,
  SpecificTimeRepeat,
  TimeTriggerType,
} from '../types/reminders.types'
import { LocationTriggerSection } from './LocationTriggerSection'

const TIME_TRIGGER_TYPES: TimeTriggerType[] = ['none', 'general_time', 'specific_time']
const GENERAL_TIME_CATEGORIES: GeneralTimeCategory[] = [
  'morning',
  'afternoon',
  'evening',
  'night',
  'weekdays',
  'weekends',
  'custom',
]
const SPECIFIC_TIME_REPEATS: SpecificTimeRepeat[] = ['none', 'daily', 'weekly', 'monthly', 'custom']

const TIME_TRIGGER_LABEL_KEYS: Record<TimeTriggerType, string> = {
  none: 'reminders.noTimeReminder',
  general_time: 'reminders.generalTimeReminder',
  specific_time: 'reminders.specificDateTime',
}

function Chip({
  label,
  selected,
  onClick,
  fullWidth,
}: {
  label: string
  selected: boolean
  onClick: () => void
  fullWidth?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-full border px-4 py-2.5 text-xs font-black transition ${fullWidth ? 'w-full text-center' : ''} ${
        selected
          ? 'border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] text-[var(--bp-accent)]'
          : 'border-[var(--bp-border)] bg-[var(--bp-surface)] text-[var(--bp-text)] hover:border-[var(--bp-accent)]'
      }`}
    >
      {label}
    </button>
  )
}

type TimeProps = {
  value: ReminderTimeTrigger
  onChange: (value: ReminderTimeTrigger) => void
}

function TimeTriggerSection({ value, onChange }: TimeProps) {
  const { t } = useLanguage()

  const setType = (type: TimeTriggerType) => onChange({ ...value, type })

  const setGeneralCategory = (category: GeneralTimeCategory) =>
    onChange({ ...value, generalTime: { category, customLabel: value.generalTime?.customLabel } })

  const setGeneralCustomLabel = (customLabel: string) =>
    onChange({ ...value, generalTime: { category: value.generalTime?.category ?? 'custom', customLabel } })

  const setSpecificField = (field: 'date' | 'time', fieldValue: string) =>
    onChange({
      ...value,
      specificTime: {
        date: value.specificTime?.date ?? '',
        time: value.specificTime?.time ?? '',
        repeat: value.specificTime?.repeat ?? 'none',
        [field]: fieldValue,
      },
    })

  const setSpecificRepeat = (repeat: SpecificTimeRepeat) =>
    onChange({
      ...value,
      specificTime: { date: value.specificTime?.date ?? '', time: value.specificTime?.time ?? '', repeat },
    })

  return (
    <section className="grid gap-4">
      <p className="text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">{t('reminders.timeTrigger')}</p>
      <div className="flex flex-wrap gap-2">
        {TIME_TRIGGER_TYPES.map((type) => (
          <Chip key={type} label={t(TIME_TRIGGER_LABEL_KEYS[type])} selected={value.type === type} onClick={() => setType(type)} />
        ))}
      </div>

      {value.type === 'general_time' && (
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            {GENERAL_TIME_CATEGORIES.map((category) => (
              <Chip
                key={category}
                label={t(`reminders.generalTimeCategory.${category}`)}
                selected={value.generalTime?.category === category}
                onClick={() => setGeneralCategory(category)}
              />
            ))}
          </div>
          {value.generalTime?.category === 'custom' && (
            <label className="block rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-4 py-3 transition focus-within:border-[var(--bp-accent)]">
              <input
                value={value.generalTime?.customLabel ?? ''}
                onChange={(event) => setGeneralCustomLabel(event.target.value)}
                placeholder={t('reminders.customLabelPlaceholder')}
                className="w-full bg-transparent py-2 text-base font-semibold text-[var(--bp-text)] outline-none placeholder:text-[var(--bp-placeholder)]"
              />
            </label>
          )}
        </div>
      )}

      {value.type === 'specific_time' && (
        <div className="grid gap-4">
          <label className="block rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-4 py-3 transition focus-within:border-[var(--bp-accent)]">
            <span className="mb-1 block text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">{t('reminders.date')}</span>
            <input
              type="date"
              value={value.specificTime?.date ?? ''}
              onChange={(event) => setSpecificField('date', event.target.value)}
              className="w-full bg-transparent py-2 text-base font-semibold text-[var(--bp-text)] outline-none"
            />
          </label>

          <label className="block rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-4 py-3 transition focus-within:border-[var(--bp-accent)]">
            <span className="mb-1 block text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">{t('reminders.time')}</span>
            <input
              type="time"
              value={value.specificTime?.time ?? ''}
              onChange={(event) => setSpecificField('time', event.target.value)}
              className="w-full bg-transparent py-2 text-base font-semibold text-[var(--bp-text)] outline-none"
            />
          </label>

          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">{t('reminders.repeat')}</p>
            <div className="flex flex-wrap gap-2">
              {SPECIFIC_TIME_REPEATS.map((repeat) => (
                <Chip
                  key={repeat}
                  label={repeat === 'custom' ? t('reminders.repeatCustom') : repeat}
                  selected={(value.specificTime?.repeat ?? 'none') === repeat}
                  onClick={() => setSpecificRepeat(repeat)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

type Props = {
  value: ChecklistReminderTrigger
  onChange: (value: ChecklistReminderTrigger) => void
}

export function ChecklistReminderSection({ value, onChange }: Props) {
  return (
    <div className="grid gap-6">
      <TimeTriggerSection value={value.time} onChange={(time) => onChange({ ...value, time })} />
      <LocationTriggerSection value={value.location} onChange={(location) => onChange({ ...value, location })} />
    </div>
  )
}
