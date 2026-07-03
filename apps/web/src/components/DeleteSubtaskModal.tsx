type DeleteSubtaskModalProps = {
  subtaskTitle?: string
  onCancel?: () => void
  onConfirm?: () => void
}

export default function DeleteSubtaskModal({ subtaskTitle, onCancel, onConfirm }: DeleteSubtaskModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-7 text-center shadow-2xl">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-red-500/40 bg-red-500/15 text-3xl font-black text-red-400">
          !
        </div>

        <h2 className="text-2xl font-black">Delete Subtask?</h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          This action cannot be undone. Are you sure you want to permanently delete
          {subtaskTitle ? <span className="font-bold text-slate-300"> "{subtaskTitle}"</span> : ' this subtask'}?
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-8 py-4 font-bold text-[var(--bp-text)] hover:bg-[var(--bp-border)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-red-500 px-8 py-4 font-black text-white shadow-lg shadow-red-500/20 hover:bg-red-600"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
