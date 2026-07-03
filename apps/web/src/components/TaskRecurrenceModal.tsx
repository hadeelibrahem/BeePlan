import { useEffect, useMemo, useState } from 'react'
import { DangerButton, PrimaryButton, SecondaryButton } from './layout'

export type RecurrenceFrequency = 'Never' | 'Daily' | 'Weekly' | 'Monthly' | 'Yearly' | 'Custom'
export type RecurrenceEndType = 'never' | 'onDate' | 'after'
export type RecurrenceCustomUnit = 'days' | 'weeks' | 'months'
export type RecurrenceMonthlyMode = 'sameDay' | 'lastDay'

export type RecurrenceSettings = {
  frequency: RecurrenceFrequency
  weekdays: string[]
  monthlyMode: RecurrenceMonthlyMode
  customInterval: number
  customUnit: RecurrenceCustomUnit
  endType: RecurrenceEndType
  endDate: string
  occurrences: number
}

type TaskRecurrenceModalProps = {
  open: boolean
  mode: 'create' | 'edit'
  recurrence: RecurrenceSettings | null
  onClose: () => void
  onSave: (recurrence: RecurrenceSettings | null) => void
  onRemove?: () => void
}

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const frequencies: RecurrenceFrequency[] = ['Never', 'Daily', 'Weekly', 'Monthly', 'Yearly', 'Custom']

export const defaultRecurrenceSettings: RecurrenceSettings = {
  frequency: 'Never',
  weekdays: [],
  monthlyMode: 'sameDay',
  customInterval: 1,
  customUnit: 'weeks',
  endType: 'never',
  endDate: '',
  occurrences: 1,
}

export function createRecurrenceSummary(recurrence: RecurrenceSettings | null) {
  if (!recurrence || recurrence.frequency === 'Never') return 'No repeat'

  let summary = ''
  const weekdayText = formatList(recurrence.weekdays)

  if (recurrence.frequency === 'Daily') summary = 'Repeats daily'
  if (recurrence.frequency === 'Weekly') summary = `Repeats every ${weekdayText || 'week'}`
  if (recurrence.frequency === 'Monthly') {
    summary =
      recurrence.monthlyMode === 'lastDay'
        ? 'Repeats on the last day of each month'
        : 'Repeats on the same day every month'
  }
  if (recurrence.frequency === 'Yearly') summary = 'Repeats yearly'
  if (recurrence.frequency === 'Custom') {
    const unit = recurrence.customInterval === 1 ? recurrence.customUnit.replace(/s$/, '') : recurrence.customUnit
    summary = `Repeats every ${recurrence.customInterval} ${unit}`
    if (recurrence.customUnit === 'weeks' && weekdayText) summary += ` on ${weekdayText}`
  }

  if (recurrence.endType === 'onDate' && recurrence.endDate) summary += ` until ${formatDate(recurrence.endDate)}`
  if (recurrence.endType === 'after') summary += ` for ${recurrence.occurrences} occurrences`

  return summary
}

export function getNextOccurrenceLabel(recurrence: RecurrenceSettings | null) {
  if (!recurrence || recurrence.frequency === 'Never') return 'Not scheduled'
  if (recurrence.frequency === 'Weekly' && recurrence.weekdays.length) return `Next ${recurrence.weekdays[0]}`
  if (recurrence.frequency === 'Daily') return 'Tomorrow'
  if (recurrence.frequency === 'Monthly') return 'Next month'
  if (recurrence.frequency === 'Yearly') return 'Next year'
  return 'Next occurrence'
}

export function TaskRecurrenceModal({
  open,
  mode,
  recurrence,
  onClose,
  onSave,
  onRemove,
}: TaskRecurrenceModalProps) {
  const [draft, setDraft] = useState<RecurrenceSettings>(recurrence ?? defaultRecurrenceSettings)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return

    setDraft(recurrence ?? defaultRecurrenceSettings)
    setError('')
  }, [open, recurrence])

  const preview = useMemo(() => createRecurrenceSummary(draft), [draft])

  if (!open) return null

  const updateDraft = (next: Partial<RecurrenceSettings>) => {
    setDraft((current) => ({ ...current, ...next }))
    setError('')
  }

  const toggleWeekday = (weekday: string) => {
    setDraft((current) => ({
      ...current,
      weekdays: current.weekdays.includes(weekday)
        ? current.weekdays.filter((item) => item !== weekday)
        : [...current.weekdays, weekday],
    }))
    setError('')
  }

  const handleSave = () => {
    const validationError = validateRecurrence(draft)
    if (validationError) {
      setError(validationError)
      return
    }

    onSave(draft.frequency === 'Never' ? null : draft)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 px-4 backdrop-blur-[2px] md:items-center md:py-8">
      <div className="w-full max-w-2xl animate-[statusSheetIn_180ms_ease-out] rounded-t-[28px] border border-[var(--bp-border)] bg-[var(--bp-surface-elevated)] p-5 shadow-2xl md:rounded-[28px] md:p-6">
        <div className="mx-auto mb-5 h-1.5 w-14 rounded-full bg-[var(--bp-border)]" />

        <header className="mb-5 text-center">
          <h2 className="text-2xl font-black text-[var(--bp-text)]">Recurring Task</h2>
          <p className="mt-2 text-sm text-[var(--bp-muted)]">Choose how often this task should repeat.</p>
        </header>

        <div className="max-h-[68vh] overflow-y-auto pe-1">
          <section>
            <p className="mb-3 text-xs font-black uppercase tracking-wide text-[var(--bp-muted)]">Repeat</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {frequencies.map((frequency) => (
                <OptionButton
                  key={frequency}
                  selected={draft.frequency === frequency}
                  label={frequency}
                  onClick={() =>
                    updateDraft({
                      frequency,
                      weekdays: frequency === 'Weekly' ? draft.weekdays : draft.weekdays,
                    })
                  }
                />
              ))}
            </div>
          </section>

          {draft.frequency === 'Weekly' || (draft.frequency === 'Custom' && draft.customUnit === 'weeks') ? (
            <section className="mt-5 rounded-[20px] border border-[var(--bp-border)] bg-[var(--bp-bg)] p-4">
              <p className="mb-3 text-sm font-black text-[var(--bp-text)]">Weekdays</p>
              <div className="flex flex-wrap gap-2">
                {weekdays.map((weekday) => (
                  <Chip
                    key={weekday}
                    selected={draft.weekdays.includes(weekday)}
                    label={weekday}
                    onClick={() => toggleWeekday(weekday)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {draft.frequency === 'Monthly' ? (
            <section className="mt-5 rounded-[20px] border border-[var(--bp-border)] bg-[var(--bp-bg)] p-4">
              <p className="mb-3 text-sm font-black text-[var(--bp-text)]">Monthly Options</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <OptionButton
                  selected={draft.monthlyMode === 'sameDay'}
                  label="Same day every month"
                  onClick={() => updateDraft({ monthlyMode: 'sameDay' })}
                />
                <OptionButton
                  selected={draft.monthlyMode === 'lastDay'}
                  label="Last day of month"
                  onClick={() => updateDraft({ monthlyMode: 'lastDay' })}
                />
              </div>
            </section>
          ) : null}

          {draft.frequency === 'Custom' ? (
            <section className="mt-5 rounded-[20px] border border-[var(--bp-border)] bg-[var(--bp-bg)] p-4">
              <p className="mb-3 text-sm font-black text-[var(--bp-text)]">Custom Repeat</p>
              <div className="grid gap-3 sm:grid-cols-[1fr_1.5fr]">
                <NumberInput
                  label="Repeat every"
                  value={draft.customInterval}
                  onChange={(value) => updateDraft({ customInterval: value })}
                />
                <label>
                  <span className="text-xs font-black uppercase tracking-wide text-[var(--bp-muted)]">Unit</span>
                  <select
                    value={draft.customUnit}
                    onChange={(event) => updateDraft({ customUnit: event.target.value as RecurrenceCustomUnit })}
                    className="mt-2 w-full rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-4 py-3 text-sm font-semibold text-[var(--bp-text)] outline-none focus:border-[var(--bp-accent)]"
                  >
                    <option value="days">days</option>
                    <option value="weeks">weeks</option>
                    <option value="months">months</option>
                  </select>
                </label>
              </div>
            </section>
          ) : null}

          <section className="mt-5 rounded-[20px] border border-[var(--bp-border)] bg-[var(--bp-bg)] p-4">
            <p className="mb-3 text-sm font-black text-[var(--bp-text)]">End Condition</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <OptionButton selected={draft.endType === 'never'} label="Never ends" onClick={() => updateDraft({ endType: 'never' })} />
              <OptionButton selected={draft.endType === 'onDate'} label="Ends on date" onClick={() => updateDraft({ endType: 'onDate' })} />
              <OptionButton selected={draft.endType === 'after'} label="Ends after" onClick={() => updateDraft({ endType: 'after' })} />
            </div>

            {draft.endType === 'onDate' ? (
              <label className="mt-4 block">
                <span className="text-xs font-black uppercase tracking-wide text-[var(--bp-muted)]">End Date</span>
                <input
                  type="date"
                  value={draft.endDate}
                  onChange={(event) => updateDraft({ endDate: event.target.value })}
                  className="mt-2 w-full rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-4 py-3 text-sm font-semibold text-[var(--bp-text)] outline-none focus:border-[var(--bp-accent)]"
                />
              </label>
            ) : null}

            {draft.endType === 'after' ? (
              <div className="mt-4">
                <NumberInput
                  label="Occurrences"
                  value={draft.occurrences}
                  onChange={(value) => updateDraft({ occurrences: value })}
                />
              </div>
            ) : null}
          </section>

          <section className="mt-5 rounded-[20px] border border-[var(--bp-accent)]/30 bg-[var(--bp-accent-soft)] p-4">
            <p className="text-xs font-black uppercase tracking-wide text-[var(--bp-muted)]">Preview</p>
            <p className="mt-2 font-black text-[var(--bp-text)]">{preview}</p>
          </section>

          {error ? <p className="mt-4 text-sm font-semibold text-red-300">{error}</p> : null}
        </div>

        <footer className={`mt-5 grid gap-3 ${mode === 'edit' ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          {mode === 'edit' ? (
            <DangerButton
              onClick={() => {
                onRemove?.()
                onClose()
              }}
            >
              Remove Recurrence
            </DangerButton>
          ) : null}
          <PrimaryButton onClick={handleSave}>{mode === 'edit' ? 'Save Changes' : 'Save Recurrence'}</PrimaryButton>
        </footer>
      </div>
    </div>
  )
}

function validateRecurrence(recurrence: RecurrenceSettings) {
  if (recurrence.frequency === 'Never') return ''

  if (recurrence.frequency === 'Weekly' && recurrence.weekdays.length === 0) {
    return 'Select at least one weekday.'
  }

  if (recurrence.frequency === 'Custom') {
    if (recurrence.customInterval <= 0) return 'Custom repeat interval must be greater than 0.'
    if (recurrence.customUnit === 'weeks' && recurrence.weekdays.length === 0) return 'Select at least one weekday.'
  }

  if (recurrence.endType === 'onDate' && !recurrence.endDate) return 'End date is required.'
  if (recurrence.endType === 'after' && recurrence.occurrences <= 0) {
    return 'Occurrences must be greater than 0.'
  }

  return ''
}

function OptionButton({ selected, label, onClick }: { selected: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-4 py-3 text-sm font-black transition active:scale-[0.98] ${
        selected
          ? 'border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] text-[var(--bp-accent)]'
          : 'border-[var(--bp-border)] bg-[var(--bp-surface)] text-[var(--bp-text)] hover:border-[var(--bp-accent)]/50'
      }`}
    >
      {label}
    </button>
  )
}

function Chip({ selected, label, onClick }: { selected: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-3 text-xs font-black transition active:scale-[0.98] ${
        selected ? 'bg-[var(--bp-accent)] text-[var(--bp-accent-text)]' : 'bg-[var(--bp-surface)] text-[var(--bp-text)]'
      }`}
    >
      {label}
    </button>
  )
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label>
      <span className="text-xs font-black uppercase tracking-wide text-[var(--bp-muted)]">{label}</span>
      <input
        type="number"
        min={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-4 py-3 text-sm font-semibold text-[var(--bp-text)] outline-none focus:border-[var(--bp-accent)]"
      />
    </label>
  )
}

function formatList(values: string[]) {
  if (!values.length) return ''
  if (values.length === 1) return values[0]
  if (values.length === 2) return `${values[0]} and ${values[1]}`
  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}
