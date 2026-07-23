import { useState } from 'react'
import { PrimaryButton, SecondaryButton } from '../../../components/layout'
import { Modal } from '../../../components/layout/Modal'
import { WEEKDAY_ORDER, weekdayShort, toggleDay } from '../dayOfWeek'
import type { RecurringCommitment, RecurringCommitmentInput, SavedPlace } from '../types'

type Props = {
  open: boolean
  initial?: RecurringCommitment | null
  places: SavedPlace[]
  saving?: boolean
  onClose: () => void
  onSubmit: (input: RecurringCommitmentInput) => void
}

const FIELD =
  'w-full rounded-lg border border-[var(--bp-border)] bg-[var(--bp-bg)] px-3 py-2 text-sm text-[var(--bp-text)] outline-none focus:border-[var(--bp-accent)]'
const LABEL = 'mb-1 block text-xs font-bold text-[var(--bp-muted)]'

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function CommitmentEditorModal({ open, initial, places, saving, onClose, onSubmit }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [days, setDays] = useState<number[]>(initial?.daysOfWeek ?? [])
  const [startTime, setStartTime] = useState(initial?.startTime ?? '08:00')
  const [endTime, setEndTime] = useState(initial?.endTime ?? '11:00')
  const [savedLocationId, setSavedLocationId] = useState(initial?.savedLocationId ?? '')
  const [repeatWeekly, setRepeatWeekly] = useState(initial?.repeatWeekly ?? true)
  const [startDate, setStartDate] = useState(initial?.startDate ?? '')
  const [endDate, setEndDate] = useState(initial?.endDate ?? '')
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [error, setError] = useState('')

  const handleSubmit = () => {
    if (!title.trim()) return setError('Give this commitment a title.')
    if (days.length === 0) return setError('Select at least one day.')
    if (toMinutes(endTime) <= toMinutes(startTime)) return setError('End time must be after start time.')
    if (startDate && endDate && endDate < startDate) return setError('End date must be on or after start date.')
    setError('')
    onSubmit({
      title: title.trim(),
      daysOfWeek: days,
      startTime,
      endTime,
      savedLocationId: savedLocationId || null,
      repeatWeekly,
      startDate: startDate || null,
      endDate: endDate || null,
      isActive,
      notes: notes.trim() || null,
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={initial ? 'Edit commitment' : 'Add weekly commitment'}
      description="A fixed recurring block. The AI planner keeps this time clear — no tasks, focus, or study are scheduled over it."
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : initial ? 'Save changes' : 'Add commitment'}
          </PrimaryButton>
        </>
      }
    >
      <div className="mt-4 space-y-4">
        <div>
          <label className={LABEL}>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="University Classes" className={FIELD} />
        </div>

        <div>
          <label className={LABEL}>Days</label>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_ORDER.map((day) => {
              const active = days.includes(day)
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setDays((d) => toggleDay(d, day))}
                  aria-pressed={active}
                  className={`h-9 w-11 rounded-lg text-xs font-bold transition ${
                    active
                      ? 'bg-[var(--bp-accent)] text-black'
                      : 'border border-[var(--bp-border)] text-[var(--bp-muted)] hover:text-[var(--bp-text)]'
                  }`}
                >
                  {weekdayShort(day)}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Start time</label>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>End time</label>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={FIELD} />
          </div>
        </div>

        <div>
          <label className={LABEL}>Place (optional)</label>
          <select value={savedLocationId} onChange={(e) => setSavedLocationId(e.target.value)} className={FIELD}>
            <option value="">— None —</option>
            {places.map((place) => (
              <option key={place.id} value={place.id}>
                {place.icon ? `${place.icon} ` : ''}
                {place.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Start date (optional)</label>
            <input type="date" value={startDate ?? ''} onChange={(e) => setStartDate(e.target.value)} className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>End date (optional)</label>
            <input type="date" value={endDate ?? ''} onChange={(e) => setEndDate(e.target.value)} className={FIELD} />
          </div>
        </div>

        <label className="flex items-center justify-between gap-3 rounded-lg border border-[var(--bp-border)] px-3 py-2">
          <span className="text-sm font-semibold text-[var(--bp-text)]">Repeat weekly</span>
          <input type="checkbox" checked={repeatWeekly} onChange={(e) => setRepeatWeekly(e.target.checked)} className="h-4 w-4 accent-[var(--bp-accent)]" />
        </label>

        <label className="flex items-center justify-between gap-3 rounded-lg border border-[var(--bp-border)] px-3 py-2">
          <span className="text-sm font-semibold text-[var(--bp-text)]">Active</span>
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 accent-[var(--bp-accent)]" />
        </label>

        <div>
          <label className={LABEL}>Notes (optional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={FIELD} />
        </div>

        {error ? <p className="text-sm font-semibold text-red-500">{error}</p> : null}
      </div>
    </Modal>
  )
}
