import { useMemo, useState } from 'react'
import { useLanguage } from '../../../i18n/LanguageContext'
import type {
  ChecklistItem,
  Reminder,
  ReminderFormValues,
  ReminderPriority,
  ReminderType,
  RepeatRule,
  TriggerType,
} from '../types/reminders.types'
import { ChecklistInput } from './ChecklistInput'
import { DateTimeSection } from './DateTimeSection'
import { PrioritySelector } from './PrioritySelector'
import { ReminderTypeSelector } from './ReminderTypeSelector'

const defaultRepeatRule: RepeatRule = { frequency: 'none', interval: 1 }

const createInitialValues = (reminder?: Reminder): ReminderFormValues => ({
  title: reminder?.title ?? '',
  description: reminder?.description ?? '',
  type: reminder?.type ?? 'time',
  priority: reminder?.priority ?? 'medium',
  remindAt: reminder?.remindAt ?? '',
  reminderBeforeMinutes: reminder?.reminderBeforeMinutes ?? 30,
  repeatRule: reminder?.repeatRule ?? defaultRepeatRule,
  location: reminder?.location ?? { name: '', radiusMeters: 100, triggerType: 'arrive' },
  context: reminder?.context ?? { condition: '', detail: '' },
  checklistItems: reminder?.checklistItems ?? [{ id: 'item-1', title: '', isDone: false }],
})

type Props = {
  initialReminder?: Reminder
  submitLabel: string
  onSubmit: (values: ReminderFormValues) => void
}

export function ReminderForm({ initialReminder, submitLabel, onSubmit }: Props) {
  const [values, setValues] = useState<ReminderFormValues>(() => createInitialValues(initialReminder))
  const { t } = useLanguage()

  const isValid = useMemo(() => {
    if (!values.title.trim()) return false
    if (values.type === 'time') return Boolean(values.remindAt?.trim())
    if (values.type === 'location') return Boolean(values.location?.name.trim())
    if (values.type === 'context') return Boolean(values.context?.condition.trim())
    if (values.type === 'checklist') return Boolean(values.checklistItems?.some((item) => item.title.trim()))
    return true
  }, [values])

  const setType = (type: ReminderType) => setValues((current) => ({ ...current, type }))
  const setPriority = (priority: ReminderPriority) => setValues((current) => ({ ...current, priority }))
  const setRepeatRule = (repeatRule: RepeatRule) => setValues((current) => ({ ...current, repeatRule }))
  const setChecklistItems = (checklistItems: ChecklistItem[]) =>
    setValues((current) => ({ ...current, checklistItems }))
  const setTriggerType = (triggerType: TriggerType) =>
    setValues((current) => ({
      ...current,
      location: { ...(current.location ?? { name: '', radiusMeters: 100 }), triggerType },
    }))

  const submit = () => {
    if (!isValid) return
    onSubmit({
      ...values,
      checklistItems: values.checklistItems?.filter((item) => item.title.trim()),
    })
  }

  return (
    <form
      className="grid gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <label className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-4 py-3 transition focus-within:border-[var(--bp-accent)] focus-within:shadow-[0_0_24px_rgba(253,239,75,0.08)]">
        <span className="mb-1 block text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">{t('reminders.title')}</span>
        <input
          value={values.title}
          onChange={(event) => setValues((current) => ({ ...current, title: event.target.value }))}
          placeholder={t('reminders.titlePlaceholder', { brand_name: t('common.brand_name') })}
          className="w-full bg-transparent py-2 text-2xl font-black leading-8 text-[var(--bp-text)] outline-none placeholder:text-[var(--bp-placeholder)]"
        />
      </label>

      <ReminderTypeSelector value={values.type} onChange={setType} />

      <section className="grid gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">{t('reminders.trigger')}</p>
          <p className="mt-1 text-sm text-[var(--bp-muted)]">
            {values.type === 'time' && t('reminders.timeHelp')}
            {values.type === 'location' && t('reminders.locationHelp', { brand_name: t('common.brand_name') })}
            {values.type === 'context' && t('reminders.contextHelp')}
            {values.type === 'checklist' && t('reminders.checklistHelp')}
          </p>
        </div>

        {values.type === 'time' && (
          <DateTimeSection
            remindAt={values.remindAt}
            reminderBeforeMinutes={values.reminderBeforeMinutes}
            repeatRule={values.repeatRule ?? defaultRepeatRule}
            onRemindAtChange={(remindAt) => setValues((current) => ({ ...current, remindAt }))}
            onReminderBeforeChange={(reminderBeforeMinutes) =>
              setValues((current) => ({ ...current, reminderBeforeMinutes }))
            }
            onRepeatRuleChange={setRepeatRule}
          />
        )}

        {values.type === 'location' && (
          <section className="grid gap-4">
            <label className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-4 py-3 transition focus-within:border-[var(--bp-accent)]">
              <span className="mb-1 block text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">
                {t('reminders.locationName')}
              </span>
              <input
                value={values.location?.name ?? ''}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    location: {
                      ...(current.location ?? { radiusMeters: 100, triggerType: 'arrive' }),
                      name: event.target.value,
                    },
                  }))
                }
                placeholder={t('reminders.locationPlaceholder')}
                className="w-full bg-transparent py-2 text-base font-semibold text-[var(--bp-text)] outline-none placeholder:text-[var(--bp-placeholder)]"
              />
            </label>
            <label className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-4 py-3 transition focus-within:border-[var(--bp-accent)]">
              <span className="mb-1 block text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">
                {t('reminders.radiusMeters')}
              </span>
              <input
                type="number"
                value={values.location?.radiusMeters ?? 100}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    location: {
                      ...(current.location ?? { name: '', triggerType: 'arrive' }),
                      radiusMeters: Number(event.target.value) || 100,
                    },
                  }))
                }
                className="w-full bg-transparent py-2 text-base font-semibold text-[var(--bp-text)] outline-none"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['arrive', 'leave'] as TriggerType[]).map((triggerType) => {
                const selected = values.location?.triggerType === triggerType
                return (
                  <button
                    key={triggerType}
                    type="button"
                    onClick={() => setTriggerType(triggerType)}
                    aria-pressed={selected}
                    className={`rounded-full border px-4 py-3 text-xs font-black capitalize transition ${
                      selected
                        ? 'border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] text-[var(--bp-accent)]'
                        : 'border-[var(--bp-border)] bg-[var(--bp-surface)] text-[var(--bp-text)] hover:border-[var(--bp-accent)]'
                    }`}
                  >
                    {t(`reminders.${triggerType}`)}
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {values.type === 'context' && (
          <section className="grid gap-4">
            <input
              value={values.context?.condition ?? ''}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  context: { ...(current.context ?? {}), condition: event.target.value },
                }))
              }
              placeholder={t('reminders.contextPlaceholder')}
              className="w-full rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-4 py-4 text-[var(--bp-text)] outline-none transition placeholder:text-[var(--bp-placeholder)] focus:border-[var(--bp-accent)]"
            />
            <input
              value={values.context?.detail ?? ''}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  context: { ...(current.context ?? { condition: '' }), detail: event.target.value },
                }))
              }
              placeholder={t('reminders.contextDetailPlaceholder')}
              className="w-full rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-4 py-4 text-[var(--bp-text)] outline-none transition placeholder:text-[var(--bp-placeholder)] focus:border-[var(--bp-accent)]"
            />
          </section>
        )}

        {values.type === 'checklist' && <ChecklistInput value={values.checklistItems ?? []} onChange={setChecklistItems} />}
      </section>

      <label>
        <span className="mb-2 block text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">{t('reminders.notes')}</span>
        <textarea
          value={values.description}
          onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))}
          placeholder={t('reminders.notesPlaceholder')}
          className="min-h-28 w-full resize-y rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-4 py-4 text-base leading-6 text-[var(--bp-text)] outline-none transition placeholder:text-[var(--bp-placeholder)] focus:border-[var(--bp-accent)]"
        />
      </label>

      <PrioritySelector value={values.priority} onChange={setPriority} />

      <button
        type="submit"
        disabled={!isValid}
        className="sticky bottom-4 rounded-2xl border border-[var(--bp-accent)] bg-[var(--bp-accent)] py-4 text-base font-black text-[var(--bp-accent-text)] shadow-[0_16px_40px_var(--bp-shadow)] transition hover:brightness-95 disabled:cursor-not-allowed disabled:border-[var(--bp-border)] disabled:bg-[var(--bp-disabled)] disabled:text-[var(--bp-disabled-text)]"
      >
        {submitLabel}
      </button>
    </form>
  )
}
