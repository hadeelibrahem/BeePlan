import { useEffect, useMemo, useState } from 'react'
import { parseRecurrenceWithAi, toApiDate, type AiRecurrenceParseResponse } from '../lib/tasksApi'
import { DangerButton, PrimaryButton, SecondaryButton } from './layout'

export type RecurrenceFrequency = 'Never' | 'Daily' | 'Weekly' | 'Monthly' | 'Yearly' | 'Custom'
export type RecurrenceEndType = 'never' | 'onDate' | 'after'
export type RecurrenceCustomUnit = 'days' | 'weeks' | 'months'
export type RecurrenceMonthlyMode = 'sameDay' | 'lastDay' | 'firstWeekday'

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
  accessToken?: string
  onClose: () => void
  onSave: (recurrence: RecurrenceSettings | null) => void
  onRemove?: () => void
  onApplyTime?: (time: string) => void
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
        : recurrence.monthlyMode === 'firstWeekday' && weekdayText
          ? `Repeats on the first ${weekdayText} of each month`
          : 'Repeats on the same day every month'
  }
  if (recurrence.frequency === 'Yearly') summary = 'Repeats yearly'
  if (recurrence.frequency === 'Custom') {
    const unit = recurrence.customInterval === 1 ? recurrence.customUnit.replace(/s$/, '') : recurrence.customUnit
    summary = `Repeats every ${recurrence.customInterval} ${unit}`
    if (recurrence.customUnit === 'weeks' && weekdayText) summary += ` on ${weekdayText}`
    if (recurrence.customUnit === 'months' && recurrence.monthlyMode === 'firstWeekday' && weekdayText) {
      summary += ` on the first ${weekdayText}`
    }
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
  accessToken,
  onClose,
  onSave,
  onRemove,
  onApplyTime,
}: TaskRecurrenceModalProps) {
  const [draft, setDraft] = useState<RecurrenceSettings>(recurrence ?? defaultRecurrenceSettings)
  const [error, setError] = useState('')
  const [aiInput, setAiInput] = useState('')
  const [aiContext, setAiContext] = useState('')
  const [aiMessage, setAiMessage] = useState('')
  const [aiResult, setAiResult] = useState<AiRecurrenceParseResponse | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  useEffect(() => {
    if (!open) return

    setDraft(recurrence ?? defaultRecurrenceSettings)
    setError('')
    setAiInput('')
    setAiContext('')
    setAiMessage('')
    setAiResult(null)
    setAiLoading(false)
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
      weekdays:
        (current.frequency === 'Monthly' ||
          (current.frequency === 'Custom' && current.customUnit === 'months')) &&
        current.monthlyMode === 'firstWeekday'
          ? current.weekdays.includes(weekday)
            ? []
            : [weekday]
          : current.weekdays.includes(weekday)
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

  const handleAskAi = async () => {
    const message = aiInput.trim()
    if (!message) return

    if (!accessToken) {
      setAiMessage("I couldn't reach the assistant. You can still set it manually.")
      setAiResult(null)
      return
    }

    setAiLoading(true)
    setAiMessage('')
    setAiResult(null)

    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      const result = await parseRecurrenceWithAi(accessToken, {
        message: aiContext ? `${aiContext}\nUser follow-up: ${message}` : message,
        currentDate: new Date().toISOString(),
        timezone,
      })

      if (!isUsableAiResult(result)) {
        setAiMessage("I couldn't understand that. You can still set it manually.")
        setAiContext('')
        return
      }

      if (result.clarifyingQuestion) {
        setAiMessage(result.clarifyingQuestion)
        setAiContext(`User request: ${message}\nAssistant asked: ${result.clarifyingQuestion}`)
        setAiInput('')
        return
      }

      setAiResult(result)
      setAiMessage(`I understood: ${result.preview}`)
      setAiContext('')
      setAiInput('')
    } catch {
      setAiMessage("I couldn't understand that. You can still set it manually.")
      setAiResult(null)
      setAiContext('')
    } finally {
      setAiLoading(false)
    }
  }

  const handleApplyAiResult = () => {
    if (!aiResult) return

    const next = aiResultToRecurrence(aiResult, draft)
    if (!next) {
      setAiMessage("I couldn't apply that to the current recurrence options. You can still set it manually.")
      setAiResult(null)
      return
    }

    setDraft(next)
    if (aiResult.time) onApplyTime?.(aiResult.time)
    setError('')
    setAiMessage(`Applied: ${createRecurrenceSummary(next)}${aiResult.time ? ` at ${aiResult.time}` : ''}`)
    setAiResult(null)
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
          <section className="rounded-[20px] border border-[var(--bp-border)] bg-[var(--bp-bg)] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black text-[var(--bp-text)]">AI Recurrence Assistant</p>
                <p className="mt-1 text-xs text-[var(--bp-muted)]">Describe how this task should repeat.</p>
              </div>
              {aiLoading ? (
                <span className="shrink-0 text-xs font-black uppercase tracking-wide text-[var(--bp-accent)]">Thinking</span>
              ) : null}
            </div>

            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                value={aiInput}
                onChange={(event) => setAiInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void handleAskAi()
                  }
                }}
                placeholder="Describe how this task should repeat..."
                className="min-w-0 rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-4 py-3 text-sm font-semibold text-[var(--bp-text)] outline-none placeholder:text-[var(--bp-placeholder)] focus:border-[var(--bp-accent)]"
              />
              <button
                type="button"
                onClick={() => void handleAskAi()}
                disabled={aiLoading || !aiInput.trim()}
                className="rounded-2xl bg-[var(--bp-accent)] px-4 py-3 text-sm font-black text-[var(--bp-accent-text)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {aiLoading ? 'Asking...' : 'Ask AI'}
              </button>
            </div>

            {aiMessage ? (
              <div className="mt-3 rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-4 py-3">
                <p className="text-sm font-semibold leading-6 text-[var(--bp-text)]">{aiMessage}</p>
                {aiResult ? (
                  <button
                    type="button"
                    onClick={handleApplyAiResult}
                    className="mt-3 rounded-xl border border-[var(--bp-accent)]/50 bg-[var(--bp-accent-soft)] px-3 py-2 text-xs font-black text-[var(--bp-accent)] transition hover:border-[var(--bp-accent)]"
                  >
                    Apply to Recurrence
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="mt-5">
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

          {draft.frequency === 'Weekly' ||
          (draft.frequency === 'Custom' &&
            (draft.customUnit === 'weeks' ||
              (draft.customUnit === 'months' && draft.monthlyMode === 'firstWeekday'))) ||
          (draft.frequency === 'Monthly' && draft.monthlyMode === 'firstWeekday') ? (
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

          {draft.frequency === 'Monthly' || (draft.frequency === 'Custom' && draft.customUnit === 'months') ? (
            <section className="mt-5 rounded-[20px] border border-[var(--bp-border)] bg-[var(--bp-bg)] p-4">
              <p className="mb-3 text-sm font-black text-[var(--bp-text)]">Monthly Options</p>
              <div className="grid gap-3 sm:grid-cols-3">
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
                <OptionButton
                  selected={draft.monthlyMode === 'firstWeekday'}
                  label="First weekday"
                  onClick={() => updateDraft({ monthlyMode: 'firstWeekday' })}
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

  if (recurrence.frequency === 'Monthly' && recurrence.monthlyMode === 'firstWeekday' && recurrence.weekdays.length === 0) {
    return 'Select the weekday for the monthly recurrence.'
  }

  if (recurrence.frequency === 'Custom') {
    if (recurrence.customInterval <= 0) return 'Custom repeat interval must be greater than 0.'
    if (recurrence.customUnit === 'weeks' && recurrence.weekdays.length === 0) return 'Select at least one weekday.'
    if (recurrence.customUnit === 'months' && recurrence.monthlyMode === 'firstWeekday' && recurrence.weekdays.length === 0) {
      return 'Select the weekday for the monthly recurrence.'
    }
  }

  if (recurrence.endType === 'onDate' && !recurrence.endDate) return 'End date is required.'
  if (recurrence.endType === 'after' && recurrence.occurrences <= 0) {
    return 'Occurrences must be greater than 0.'
  }

  return ''
}

function isUsableAiResult(result: AiRecurrenceParseResponse) {
  if (!['daily', 'weekly', 'monthly', 'yearly', 'custom', 'never'].includes(result.repeat)) return false
  if (!Number.isFinite(result.interval) || result.interval < 1) return false
  if (!Array.isArray(result.daysOfWeek)) return false
  if (!['never', 'onDate', 'afterOccurrences'].includes(result.endCondition)) return false
  if (result.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(result.time)) return false
  return true
}

function aiResultToRecurrence(
  result: AiRecurrenceParseResponse,
  current: RecurrenceSettings,
): RecurrenceSettings | null {
  const weekdaysFromAi = result.daysOfWeek.filter((day) => weekdays.includes(day))
  const endPatch = aiEndConditionToDraft(result)
  if (!endPatch) return null

  if (result.repeat === 'never') {
    return { ...defaultRecurrenceSettings }
  }

  if (result.repeat === 'daily') {
    return {
      ...current,
      ...endPatch,
      frequency: result.interval === 1 ? 'Daily' : 'Custom',
      weekdays: [],
      customInterval: Math.max(result.interval, 1),
      customUnit: 'days',
    }
  }

  if (result.repeat === 'weekly') {
    if (!weekdaysFromAi.length) return null
    return {
      ...current,
      ...endPatch,
      frequency: result.interval === 1 ? 'Weekly' : 'Custom',
      weekdays: weekdaysFromAi,
      customInterval: Math.max(result.interval, 1),
      customUnit: 'weeks',
    }
  }

  if (result.repeat === 'monthly') {
    return {
      ...current,
      ...endPatch,
      frequency: result.interval === 1 ? 'Monthly' : 'Custom',
      weekdays: weekdaysFromAi,
      monthlyMode: weekdaysFromAi.length && !result.dayOfMonth ? 'firstWeekday' : 'sameDay',
      customInterval: Math.max(result.interval, 1),
      customUnit: 'months',
    }
  }

  if (result.repeat === 'yearly') {
    return {
      ...current,
      ...endPatch,
      frequency: result.interval === 1 ? 'Yearly' : 'Custom',
      weekdays: [],
      customInterval: Math.max(result.interval, 1),
      customUnit: 'months',
    }
  }

  return {
    ...current,
    ...endPatch,
    frequency: 'Custom',
    weekdays: weekdaysFromAi,
    customInterval: Math.max(result.interval, 1),
    customUnit: current.customUnit,
  }
}

function aiEndConditionToDraft(result: AiRecurrenceParseResponse): Pick<RecurrenceSettings, 'endType' | 'endDate' | 'occurrences'> | null {
  if (result.endCondition === 'never') {
    return { endType: 'never', endDate: '', occurrences: 1 }
  }

  if (result.endCondition === 'onDate') {
    // Accept whatever shape the AI returns (e.g. "31 Aug 2026") but store the
    // draft as a machine date so the payload is always ISO.
    const endDate = toApiDate(result.endDate)
    if (!endDate) return null
    return { endType: 'onDate', endDate, occurrences: 1 }
  }

  if (!result.occurrences || result.occurrences < 1) return null
  return { endType: 'after', endDate: '', occurrences: Math.round(result.occurrences) }
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
