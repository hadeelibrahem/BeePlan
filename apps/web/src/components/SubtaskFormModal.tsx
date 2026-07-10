import { useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import type { ApiSubtask, ApiSubtaskPriority, ApiSubtaskStatus, SubtaskPayload } from '../lib/tasksApi'
import { SUBTASK_PRIORITY_LABEL, SUBTASK_STATUS_LABEL } from '../lib/subtaskDisplay'

const PRIORITIES: ApiSubtaskPriority[] = ['low', 'medium', 'high', 'urgent']
const STATUSES: ApiSubtaskStatus[] = ['todo', 'in_progress', 'done', 'blocked', 'missed']

type FormValues = {
  title: string
  description: string
  priority: ApiSubtaskPriority
  status: ApiSubtaskStatus
  startDate: string
  startTime: string
  dueDate: string
  dueTime: string
  estimatedDurationMinutes: string
  assignee: string
  reminderEnabled: boolean
  reminderMinutesBeforeDue: string
  tags: string
  notes: string
  dependencyIds: string[]
}

function splitDateTime(iso?: string): { date: string; time: string } {
  if (!iso) return { date: '', time: '' }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { date: '', time: '' }
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

function combineDateTime(date: string, time: string): string | undefined {
  if (!date) return undefined
  const iso = new Date(`${date}T${time || '00:00'}`)
  return Number.isNaN(iso.getTime()) ? undefined : iso.toISOString()
}

function fromSubtask(subtask?: ApiSubtask): FormValues {
  const start = splitDateTime(subtask?.startDate)
  const due = splitDateTime(subtask?.dueDate)
  return {
    title: subtask?.title ?? '',
    description: subtask?.description ?? '',
    priority: subtask?.priority ?? 'medium',
    status: subtask?.status ?? 'todo',
    startDate: start.date,
    startTime: start.time,
    dueDate: due.date,
    dueTime: due.time,
    estimatedDurationMinutes: subtask?.estimatedDurationMinutes ? String(subtask.estimatedDurationMinutes) : '',
    assignee: subtask?.assignee ?? '',
    reminderEnabled: subtask?.reminderEnabled ?? false,
    reminderMinutesBeforeDue: subtask?.reminderMinutesBeforeDue ? String(subtask.reminderMinutesBeforeDue) : '',
    tags: subtask?.tags?.join(', ') ?? '',
    notes: subtask?.notes ?? '',
    dependencyIds: subtask?.dependencyIds ?? [],
  }
}

function toPayload(values: FormValues): SubtaskPayload {
  const estimated = Number.parseInt(values.estimatedDurationMinutes, 10)
  const reminderMinutes = Number.parseInt(values.reminderMinutesBeforeDue, 10)
  return {
    title: values.title.trim(),
    description: values.description.trim() || undefined,
    priority: values.priority,
    status: values.status,
    isDone: values.status === 'done',
    startDate: combineDateTime(values.startDate, values.startTime),
    dueDate: combineDateTime(values.dueDate, values.dueTime),
    estimatedDurationMinutes: Number.isFinite(estimated) && estimated > 0 ? estimated : undefined,
    // A person edited it, so any estimate is now user-owned.
    estimatedDurationSource: 'user',
    assignee: values.assignee.trim() || undefined,
    reminderEnabled: values.reminderEnabled,
    reminderMinutesBeforeDue:
      values.reminderEnabled && Number.isFinite(reminderMinutes) ? reminderMinutes : undefined,
    tags: values.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    notes: values.notes.trim() || undefined,
    dependencyIds: values.dependencyIds,
  }
}

type Props = {
  mode: 'add' | 'edit'
  siblings?: ApiSubtask[]
  initialSubtask?: ApiSubtask
  onBack?: () => void
  onCancel?: () => void
  onDelete?: () => void
  onSubmit: (payload: SubtaskPayload) => void | Promise<void>
}

export default function SubtaskFormModal({
  mode,
  siblings = [],
  initialSubtask,
  onBack,
  onCancel,
  onDelete,
  onSubmit,
}: Props) {
  const { isRTL } = useLanguage()
  const [values, setValues] = useState<FormValues>(() => fromSubtask(initialSubtask))
  const [submitting, setSubmitting] = useState(false)

  const isEdit = mode === 'edit'
  const update = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  const toggleDependency = (id: string) =>
    setValues((current) => ({
      ...current,
      dependencyIds: current.dependencyIds.includes(id)
        ? current.dependencyIds.filter((d) => d !== id)
        : [...current.dependencyIds, id],
    }))

  async function handleSubmit() {
    if (!values.title.trim() || submitting) return
    setSubmitting(true)
    try {
      await onSubmit(toPayload(values))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-7 shadow-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={onBack ?? onCancel}
              className="mb-4 flex items-center gap-2 text-sm text-slate-400 hover:text-[var(--bp-text)]"
            >
              <span aria-hidden>{isRTL ? '→' : '←'}</span>
              Back
            </button>
            <h2 className="text-2xl font-black">{isEdit ? 'Edit Subtask' : 'Add Subtask'}</h2>
            <p className="mt-1 text-sm text-slate-400">
              {isEdit ? 'Update the details for this subtask' : 'Create a new subtask'}
            </p>
          </div>

          {isEdit && onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-xl border border-red-500/40 px-4 py-3 text-sm font-bold text-red-300 hover:bg-red-500/10"
            >
              Delete
            </button>
          ) : null}
        </div>

        <div className="space-y-5">
          <div>
            <FieldLabel label="Subtask Title" required />
            <input
              className={inputClass}
              placeholder="Enter subtask title..."
              value={values.title}
              onChange={(e) => update('title', e.target.value)}
            />
          </div>

          <div>
            <FieldLabel label="Description" />
            <textarea
              className={`${inputClass} min-h-24 resize-none`}
              placeholder="Describe this subtask..."
              value={values.description}
              onChange={(e) => update('description', e.target.value)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FieldLabel label="Priority" />
              <div className="grid grid-cols-2 gap-2">
                {PRIORITIES.map((p) => (
                  <Segment key={p} label={SUBTASK_PRIORITY_LABEL[p]} active={values.priority === p} onClick={() => update('priority', p)} />
                ))}
              </div>
            </div>
            <div>
              <FieldLabel label="Status" />
              <select
                className={inputClass}
                value={values.status}
                onChange={(e) => update('status', e.target.value as ApiSubtaskStatus)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {SUBTASK_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FieldLabel label="Start Date" />
              <div className="grid grid-cols-2 gap-2">
                <input type="date" className={inputClass} value={values.startDate} onChange={(e) => update('startDate', e.target.value)} />
                <input type="time" className={inputClass} value={values.startTime} onChange={(e) => update('startTime', e.target.value)} />
              </div>
            </div>
            <div>
              <FieldLabel label="Due Date" />
              <div className="grid grid-cols-2 gap-2">
                <input type="date" className={inputClass} value={values.dueDate} onChange={(e) => update('dueDate', e.target.value)} />
                <input type="time" className={inputClass} value={values.dueTime} onChange={(e) => update('dueTime', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FieldLabel label="Estimated Duration (minutes)" />
              <input
                type="number"
                min={0}
                className={inputClass}
                placeholder="e.g. 45"
                value={values.estimatedDurationMinutes}
                onChange={(e) => update('estimatedDurationMinutes', e.target.value)}
              />
            </div>
            <div>
              <FieldLabel label="Assignee" />
              <input
                className={inputClass}
                placeholder="Optional"
                value={values.assignee}
                onChange={(e) => update('assignee', e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-xl border border-[var(--bp-border)] p-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={values.reminderEnabled}
                onChange={(e) => update('reminderEnabled', e.target.checked)}
                className="h-4 w-4 accent-[var(--bp-accent)]"
              />
              <span className="text-sm font-bold text-[var(--bp-text)]">Enable reminder</span>
            </label>
            {values.reminderEnabled ? (
              <div className="mt-3">
                <FieldLabel label="Remind (minutes before due)" />
                <input
                  type="number"
                  min={0}
                  className={inputClass}
                  placeholder="e.g. 30"
                  value={values.reminderMinutesBeforeDue}
                  onChange={(e) => update('reminderMinutesBeforeDue', e.target.value)}
                />
              </div>
            ) : null}
          </div>

          <div>
            <FieldLabel label="Tags (comma separated)" />
            <input
              className={inputClass}
              placeholder="e.g. research, writing"
              value={values.tags}
              onChange={(e) => update('tags', e.target.value)}
            />
          </div>

          {siblings.length ? (
            <div>
              <FieldLabel label="Depends On" />
              <div className="flex flex-wrap gap-2">
                {siblings.map((sib) => (
                  <button
                    key={sib.id}
                    type="button"
                    onClick={() => toggleDependency(sib.id)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                      values.dependencyIds.includes(sib.id)
                        ? 'border-[var(--bp-accent)] bg-[var(--bp-accent)]/10 text-[var(--bp-accent)]'
                        : 'border-[var(--bp-border)] text-slate-400 hover:text-[var(--bp-text)]'
                    }`}
                  >
                    {sib.title}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <FieldLabel label="Notes" />
            <textarea
              className={`${inputClass} min-h-20 resize-none`}
              placeholder="Additional notes (optional)..."
              value={values.notes}
              onChange={(e) => update('notes', e.target.value)}
            />
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-[var(--bp-border)] pt-6 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-10 py-4 font-bold text-[var(--bp-text)] hover:bg-[var(--bp-border)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting || !values.title.trim()}
            onClick={() => void handleSubmit()}
            className="rounded-xl bg-[var(--bp-accent)] px-10 py-4 font-black text-[var(--bp-accent-text)] shadow-lg shadow-[var(--bp-accent)]/20 disabled:opacity-50"
          >
            {isEdit ? 'Save Changes' : 'Add Subtask'}
          </button>
        </div>
      </div>
    </div>
  )
}

const inputClass =
  'w-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-4 py-3.5 text-[var(--bp-text)] outline-none placeholder:text-[var(--bp-placeholder)] focus:border-[var(--bp-accent)]'

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className="mb-2 block text-xs font-black uppercase tracking-wide text-[var(--bp-text)]">
      {label} {required ? <span className="text-red-400">*</span> : null}
    </label>
  )
}

function Segment({ label, active, onClick }: { label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-4 py-2.5 text-sm font-bold transition ${
        active
          ? 'border-[var(--bp-accent)] bg-[var(--bp-accent)]/10 text-[var(--bp-accent)]'
          : 'border-[var(--bp-border)] bg-[var(--bp-surface)] text-slate-400'
      }`}
    >
      {label}
    </button>
  )
}
