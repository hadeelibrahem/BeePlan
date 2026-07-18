import { OutlineButton } from './layout/Buttons'

type DeleteTaskModalProps = {
  taskTitle?: string
  error?: string
  isDeleting?: boolean
  onCancel?: () => void
  onConfirm?: () => void
}

export default function DeleteTaskModal({
  taskTitle,
  error = '',
  isDeleting = false,
  onCancel,
  onConfirm,
}: DeleteTaskModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-task-title"
    >
      <div className="w-full max-w-md rounded-3xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-7 text-center shadow-2xl">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-red-500/40 bg-red-500/15 text-3xl font-black text-red-400">
          !
        </div>

        <h2 id="delete-task-title" className="text-2xl font-black">
          Delete Task?
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          This action cannot be undone. Are you sure you want to permanently delete
          {taskTitle ? <span className="font-bold text-slate-300"> "{taskTitle}"</span> : ' this task'}?
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Subtasks, attachments, and collaboration data may also be removed.
        </p>

        {error ? (
          <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-300">
            {error}
          </p>
        ) : null}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <OutlineButton className="flex-1 rounded-xl px-8 py-4 font-bold" onClick={onCancel} disabled={isDeleting}>
            Cancel
          </OutlineButton>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex-1 rounded-xl bg-red-500 px-8 py-4 font-black text-white shadow-lg shadow-red-500/20 transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isDeleting ? 'Deleting...' : 'Delete Task'}
          </button>
        </div>
      </div>
    </div>
  )
}
