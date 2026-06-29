import { useState } from 'react'

export type SubtaskFormValues = {
  title: string
  description: string
  dueDate: string
  dueTime: string
  priority: 'Low' | 'Medium' | 'High'
  estimatedTime: string
  assignee: string
  notes: string
}

const emptyValues: SubtaskFormValues = {
  title: '',
  description: '',
  dueDate: '',
  dueTime: '',
  priority: 'Medium',
  estimatedTime: '',
  assignee: '',
  notes: '',
}

type SubtaskFormModalProps = {
  mode: 'add' | 'edit'
  initialValues?: Partial<SubtaskFormValues>
  onBack?: () => void
  onCancel?: () => void
  onDelete?: () => void
  onSubmit?: (values: SubtaskFormValues) => void
}

export default function SubtaskFormModal({
  mode,
  initialValues,
  onBack,
  onCancel,
  onDelete,
  onSubmit,
}: SubtaskFormModalProps) {
  const [values, setValues] = useState<SubtaskFormValues>({ ...emptyValues, ...initialValues })

  const isEdit = mode === 'edit'
  const update = <K extends keyof SubtaskFormValues>(key: K, value: SubtaskFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-[#3B465B] bg-[#2B3443] p-7 shadow-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <button type="button" onClick={onBack ?? onCancel} className="mb-4 flex items-center gap-2 text-sm text-slate-400 hover:text-white">
              <span aria-hidden>←</span>
              Back
            </button>
            <h2 className="text-2xl font-black">{isEdit ? 'Edit Subtask' : 'Add Subtask'}</h2>
            <p className="mt-1 text-sm text-slate-400">
              {isEdit ? 'Update the details for this subtask' : 'Create a new subtask'}
            </p>
          </div>

          {isEdit ? (
            <button
              type="button"
              onClick={onDelete}
              aria-label="Delete subtask"
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
              onChange={(event) => update('title', event.target.value)}
            />
          </div>

          <div>
            <FieldLabel label="Description" />
            <textarea
              className={`${inputClass} min-h-28 resize-none`}
              placeholder="Describe this subtask..."
              value={values.description}
              onChange={(event) => update('description', event.target.value)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FieldLabel label="Due Date" />
              <input
                type="date"
                className={inputClass}
                value={values.dueDate}
                onChange={(event) => update('dueDate', event.target.value)}
              />
            </div>
            <div>
              <FieldLabel label="Due Time" />
              <input
                type="time"
                className={inputClass}
                value={values.dueTime}
                onChange={(event) => update('dueTime', event.target.value)}
              />
            </div>
          </div>

          <div>
            <FieldLabel label="Priority" />
            <div className="grid grid-cols-3 gap-3">
              <Segment
                label="Low"
                color="text-green-400"
                active={values.priority === 'Low'}
                onClick={() => update('priority', 'Low')}
              />
              <Segment
                label="Medium"
                color="text-orange-400"
                active={values.priority === 'Medium'}
                onClick={() => update('priority', 'Medium')}
              />
              <Segment
                label="High"
                color="text-red-400"
                active={values.priority === 'High'}
                onClick={() => update('priority', 'High')}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FieldLabel label="Estimated Time" />
              <input
                className={inputClass}
                placeholder="e.g. 2h"
                value={values.estimatedTime}
                onChange={(event) => update('estimatedTime', event.target.value)}
              />
            </div>
            <div>
              <FieldLabel label="Assignee" />
              <input
                className={inputClass}
                placeholder="Optional"
                value={values.assignee}
                onChange={(event) => update('assignee', event.target.value)}
              />
            </div>
          </div>

          <div>
            <FieldLabel label="Notes" />
            <textarea
              className={`${inputClass} min-h-24 resize-none`}
              placeholder="Additional notes (optional)..."
              value={values.notes}
              onChange={(event) => update('notes', event.target.value)}
            />
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-[#3B465B] pt-6 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-[#3B465B] bg-[#2B3443] px-10 py-4 font-bold text-slate-300 hover:bg-[#3B465B]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSubmit?.(values)}
            className="rounded-xl bg-[#FDE64B] px-10 py-4 font-black text-black shadow-lg shadow-[#FDE64B]/20"
          >
            {isEdit ? 'Save Changes' : 'Add Subtask'}
          </button>
        </div>
      </div>
    </div>
  )
}

const inputClass =
  'w-full rounded-xl border border-[#3B465B] bg-black/30 px-4 py-4 text-white outline-none placeholder:text-slate-500 focus:border-[#FDE64B]'

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-300">
      {label} {required ? <span className="text-red-400">*</span> : null}
    </label>
  )
}

function Segment({
  label,
  active,
  color,
  onClick,
}: {
  label: string
  active?: boolean
  color: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-4 py-3 text-sm font-bold transition ${
        active
          ? 'border-[#FDE64B] bg-[#FDE64B]/10 text-[#FDE64B]'
          : `border-[#3B465B] bg-[#2B3443] ${color}`
      }`}
    >
      {label}
    </button>
  )
}
