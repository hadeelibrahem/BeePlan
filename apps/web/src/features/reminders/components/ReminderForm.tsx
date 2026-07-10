import { useMemo, useRef, useState } from 'react'
import { useLanguage } from '../../../i18n/LanguageContext'
import type { FriendSummary } from '../../social/types/social.types'
import type {
  ChecklistItem,
  ChecklistReminderTrigger,
  PersonReminderConfig,
  Reminder,
  ReminderFormValues,
  ReminderPriority,
  ReminderType,
  RepeatRule,
} from '../types/reminders.types'
import { ChecklistInput } from './ChecklistInput'
import { ChecklistReminderSection } from './ChecklistReminderSection'
import { DateTimeSection } from './DateTimeSection'
import { LocationReminderFields } from './LocationReminderFields'
import { PersonReminderFields } from './PersonReminderFields'
import { PrioritySelector } from './PrioritySelector'
import { ReminderTypeSelector } from './ReminderTypeSelector'

const defaultPerson: PersonReminderConfig = {
  radiusMeters: 100,
  cooldownMinutes: 30,
  expiration: '1w',
}

const defaultRepeatRule: RepeatRule = { frequency: 'none', interval: 1 }

const createInitialValues = (reminder?: Reminder): ReminderFormValues => ({
  title: reminder?.title ?? '',
  description: reminder?.description ?? '',
  type: reminder?.type ?? 'time',
  priority: reminder?.priority ?? 'medium',
  remindAt: reminder?.remindAt ?? '',
  reminderBeforeMinutes: reminder?.reminderBeforeMinutes ?? 30,
  repeatRule: reminder?.repeatRule ?? defaultRepeatRule,
  location: reminder?.location ?? { mode: 'specific_place', radiusMeters: 100, trigger: 'arrive' },
  context: reminder?.context ?? { condition: '', detail: '' },
  checklistItems: reminder?.checklistItems ?? [{ id: 'item-1', title: '', isDone: false }],
  checklistReminderTrigger: reminder?.checklistReminderTrigger ?? {
    time: { type: 'none' },
    location: { type: 'none' },
  },
  person: reminder?.person ?? defaultPerson,
})

type Props = {
  initialReminder?: Reminder
  submitLabel: string
  onSubmit: (values: ReminderFormValues) => Promise<void> | void
  /** Accepted friends, needed for the Person reminder friend selector. */
  friends?: FriendSummary[]
  /** Called from the Person fields when the user wants to add a friend. */
  onAddFriend?: () => void
}

export function ReminderForm({ initialReminder, submitLabel, onSubmit, friends = [], onAddFriend }: Props) {
  const [values, setValues] = useState<ReminderFormValues>(() => createInitialValues(initialReminder))
  const { t } = useLanguage()
  const submitInFlightRef = useRef(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const isValid = useMemo(() => {
    if (!values.title.trim()) return false
    if (!values.type) return false
    if (!values.priority) return false
    if ((values.reminderBeforeMinutes ?? 0) < 0) return false
    if (values.type === 'time') return Boolean(values.remindAt?.trim())
    if (values.type === 'location') {
      const location = values.location
      if (!location) return false
      if (!location.trigger) return false
      if (!(location.radiusMeters > 0)) return false
      if (location.mode === 'specific_place') {
        const place = location.specificPlace
        // A search result or a resolved map/current-location pin is valid;
        // raw manual text without geocoding never produces a `selectedBy`.
        return Boolean(place?.selectedBy && Number.isFinite(place.latitude) && Number.isFinite(place.longitude))
      }
      if (location.mode === 'general_category') {
        const category = location.generalCategory?.category
        if (!category) return false
        if (category === 'custom') return Boolean(location.generalCategory?.customLabel?.trim())
        return true
      }
      return false
    }
    if (values.type === 'context') return Boolean(values.context?.condition.trim())
    if (values.type === 'checklist') {
      if (!values.checklistItems?.some((item) => item.title.trim())) return false

      const timeTrigger = values.checklistReminderTrigger?.time
      if (timeTrigger?.type === 'general_time' && !timeTrigger.generalTime?.category) return false
      if (timeTrigger?.type === 'specific_time') {
        if (!timeTrigger.specificTime?.date?.trim() || !timeTrigger.specificTime?.time?.trim()) return false
      }

      const locationTrigger = values.checklistReminderTrigger?.location
      if (locationTrigger?.type === 'general_location') {
        const category = locationTrigger.generalLocation?.category
        if (!category) return false
        if (category === 'custom' && !locationTrigger.generalLocation?.customLabel?.trim()) return false
      }
      if (locationTrigger?.type === 'specific_location') {
        const place = locationTrigger.specificLocation
        // A search result or a resolved map/current-location pin is valid;
        // raw manual text without geocoding never produces a `selectedBy`.
        if (!place?.selectedBy || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) {
          return false
        }
        if (!place.trigger) return false
      }

      return true
    }
    if (values.type === 'person') {
      return Boolean(values.person?.targetUserId)
    }
    return true
  }, [values])

  const setType = (type: ReminderType) => setValues((current) => ({ ...current, type }))
  const setPerson = (person: PersonReminderConfig) => setValues((current) => ({ ...current, person }))
  const setPriority = (priority: ReminderPriority) => setValues((current) => ({ ...current, priority }))
  const setRepeatRule = (repeatRule: RepeatRule) => setValues((current) => ({ ...current, repeatRule }))
  const setChecklistItems = (checklistItems: ChecklistItem[]) =>
    setValues((current) => ({ ...current, checklistItems }))
  const setChecklistReminderTrigger = (checklistReminderTrigger: ChecklistReminderTrigger) =>
    setValues((current) => ({ ...current, checklistReminderTrigger }))
  const setLocation = (location: NonNullable<ReminderFormValues['location']>) =>
    setValues((current) => ({ ...current, location }))

  const submit = async () => {
    if (!isValid || submitInFlightRef.current) return

    submitInFlightRef.current = true
    setIsSubmitting(true)
    setSubmitError('')
    setSuccessMessage('')

    try {
      await onSubmit({
        ...values,
        checklistItems: values.checklistItems?.filter((item) => item.title.trim()),
      })
      setSuccessMessage(t('reminders.saveSuccess'))
      if (!initialReminder) {
        setValues(createInitialValues())
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Something went wrong. Please try again.')
    } finally {
      submitInFlightRef.current = false
      setIsSubmitting(false)
    }
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <label className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-3 py-2.5 transition focus-within:border-[var(--bp-accent)] focus-within:shadow-[0_0_24px_rgba(253,239,75,0.08)]">
        <span className="mb-1 block text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">{t('reminders.title')}</span>
        <input
          value={values.title}
          onChange={(event) => setValues((current) => ({ ...current, title: event.target.value }))}
          placeholder={t('reminders.titlePlaceholder', { brand_name: t('common.brand_name') })}
          className="w-full bg-transparent py-1.5 text-xl font-black leading-7 text-[var(--bp-text)] outline-none placeholder:text-[var(--bp-placeholder)]"
        />
      </label>

      <ReminderTypeSelector value={values.type} onChange={setType} />

      <section className="grid gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">{t('reminders.trigger')}</p>
          <p className="mt-1 text-sm text-[var(--bp-muted)]">
            {values.type === 'time' && t('reminders.timeHelp')}
            {values.type === 'location' && t('reminders.locationHelp', { brand_name: t('common.brand_name') })}
            {values.type === 'context' && t('reminders.contextHelp')}
            {values.type === 'checklist' && t('reminders.checklistHelp')}
            {values.type === 'person' && t('reminders.personHelp')}
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
          <LocationReminderFields
            value={values.location ?? { mode: 'specific_place', radiusMeters: 100, trigger: 'arrive' }}
            onChange={setLocation}
          />
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
              className="w-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-3 py-2.5 text-[var(--bp-text)] outline-none transition placeholder:text-[var(--bp-placeholder)] focus:border-[var(--bp-accent)]"
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
              className="w-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-3 py-2.5 text-[var(--bp-text)] outline-none transition placeholder:text-[var(--bp-placeholder)] focus:border-[var(--bp-accent)]"
            />
          </section>
        )}

        {values.type === 'checklist' && (
          <section className="grid gap-3">
            <ChecklistInput value={values.checklistItems ?? []} onChange={setChecklistItems} />
            <ChecklistReminderSection
              value={values.checklistReminderTrigger ?? { time: { type: 'none' }, location: { type: 'none' } }}
              onChange={setChecklistReminderTrigger}
            />
          </section>
        )}

        {values.type === 'person' && (
          <PersonReminderFields
            value={values.person ?? defaultPerson}
            onChange={setPerson}
            friends={friends}
            onAddFriend={onAddFriend}
          />
        )}
      </section>

      <label>
        <span className="mb-1.5 block text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">{t('reminders.notes')}</span>
        <textarea
          value={values.description}
          onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))}
          placeholder={t('reminders.notesPlaceholder')}
          className="min-h-24 w-full resize-y rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-3 py-2.5 text-sm leading-6 text-[var(--bp-text)] outline-none transition placeholder:text-[var(--bp-placeholder)] focus:border-[var(--bp-accent)]"
        />
      </label>

      <PrioritySelector value={values.priority} onChange={setPriority} />

      {submitError && <p className="text-red-400 text-xs ps-1">{submitError}</p>}
      {successMessage && <p className="text-emerald-400 text-xs ps-1">{successMessage}</p>}

      <button
        type="submit"
        disabled={!isValid || isSubmitting}
        className="sticky bottom-4 rounded-xl border border-[var(--bp-accent)] bg-[var(--bp-accent)] py-3 text-sm font-black text-[var(--bp-accent-text)] shadow-[0_16px_40px_var(--bp-shadow)] transition hover:brightness-95 disabled:cursor-not-allowed disabled:border-[var(--bp-border)] disabled:bg-[var(--bp-disabled)] disabled:text-[var(--bp-disabled-text)]"
      >
        {isSubmitting ? t('reminders.saving') : submitLabel}
      </button>
    </form>
  )
}
