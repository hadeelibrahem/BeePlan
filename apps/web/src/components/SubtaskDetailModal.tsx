import { useEffect, useRef, useState } from 'react'
import { DirectionalChevron } from './layout'
import { useLanguage } from '../i18n/LanguageContext'
import { ConfirmDestructiveModal } from './ConfirmDestructiveModal'
import { TaskPriorityBadge, TaskStatusBadge } from './TaskBadges'
import {
  deleteSubtaskAttachment,
  downloadSubtaskAttachment,
  getSubtaskAttachments,
  updateSubtask,
  uploadSubtaskAttachment,
  type ApiSubtask,
  type ApiSubtaskStatus,
  type ApiTask,
  type ApiTaskAttachment,
} from '../lib/tasksApi'
import {
  formatDuration,
  getSubtaskIndicator,
  getSubtaskWarnings,
  SUBTASK_INDICATOR_META,
  SUBTASK_STATUS_CLASS,
  SUBTASK_STATUS_LABEL,
} from '../lib/subtaskDisplay'

const STATUS_ORDER: ApiSubtaskStatus[] = ['todo', 'in_progress', 'done', 'blocked', 'missed']

type Props = {
  task: ApiTask
  subtask: ApiSubtask
  accessToken: string
  canEdit?: boolean
  onClose: () => void
  onEdit: () => void
  onTaskUpdated: (task: ApiTask) => void
}

export default function SubtaskDetailModal({
  task,
  subtask,
  accessToken,
  canEdit = true,
  onClose,
  onEdit,
  onTaskUpdated,
}: Props) {
  const { isRTL } = useLanguage()
  const [attachments, setAttachments] = useState<ApiTaskAttachment[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [attachmentToDelete, setAttachmentToDelete] = useState<ApiTaskAttachment | null>(null)
  const [isDeletingAttachment, setIsDeletingAttachment] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let active = true
    getSubtaskAttachments(accessToken, task.id, subtask.id)
      .then((rows) => active && setAttachments(rows))
      .catch(() => active && setAttachments([]))
    return () => {
      active = false
    }
  }, [accessToken, task.id, subtask.id])

  const indicator = getSubtaskIndicator(subtask)
  const meta = SUBTASK_INDICATOR_META[indicator]
  const warnings = getSubtaskWarnings(subtask, {
    parentDueDate: task.dueDate,
    remainingParentMinutes: task.remainingTimeMinutes,
  })
  const depNames = subtask.dependencyIds
    .map((id) => task.subtasks.find((s) => s.id === id)?.title)
    .filter(Boolean) as string[]

  async function changeStatus(status: ApiSubtaskStatus) {
    if (status === subtask.status) return
    setBusy(true)
    setError('')
    try {
      const updated = await updateSubtask(accessToken, task.id, subtask.id, {
        status,
        isDone: status === 'done',
      })
      onTaskUpdated(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update status.')
    } finally {
      setBusy(false)
    }
  }

  async function handleUpload(file: File) {
    setBusy(true)
    setError('')
    try {
      const created = await uploadSubtaskAttachment(accessToken, task.id, subtask.id, file)
      setAttachments((current) => [...current, created])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteAttachment(attachmentId: string) {
    if (isDeletingAttachment) return
    setIsDeletingAttachment(true)
    setBusy(true)
    try {
      await deleteSubtaskAttachment(accessToken, task.id, subtask.id, attachmentId)
      setAttachments((current) => current.filter((a) => a.id !== attachmentId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete attachment.')
    } finally {
      setBusy(false)
      setIsDeletingAttachment(false)
      setAttachmentToDelete(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-7 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="mb-3 flex items-center gap-2 text-sm text-slate-400 hover:text-[var(--bp-text)]"
            >
              <DirectionalChevron direction="back" isRTL={isRTL} className="h-4 w-4" />
              Back
            </button>
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} aria-hidden />
              <h2 className="truncate text-2xl font-black">{subtask.title}</h2>
            </div>
          </div>
          {canEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="shrink-0 rounded-xl border border-[var(--bp-border)] px-4 py-2.5 text-sm font-bold text-[var(--bp-text)] hover:bg-[var(--bp-border)]"
            >
              Edit
            </button>
          ) : null}
        </div>

        {error ? (
          <p className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>
        ) : null}

        {warnings.length ? (
          <div className="mb-4 space-y-1.5">
            {warnings.map((w) => (
              <p
                key={w}
                className="rounded-xl border border-orange-500/40 bg-orange-500/10 px-4 py-2.5 text-sm text-orange-300"
              >
                ⚠ {w}
              </p>
            ))}
          </div>
        ) : null}

        {/* Status quick-switch */}
        <div className="mb-5 flex flex-wrap gap-2">
          {STATUS_ORDER.map((status) => (
            <button
              key={status}
              type="button"
              disabled={busy || !canEdit}
              onClick={() => void changeStatus(status)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
                subtask.status === status
                  ? SUBTASK_STATUS_CLASS[status]
                  : 'bg-[var(--bp-bg)] text-slate-400 hover:text-[var(--bp-text)]'
              }`}
            >
              {SUBTASK_STATUS_LABEL[status]}
            </button>
          ))}
        </div>

        {subtask.description ? (
          <Field label="Description">
            <p className="whitespace-pre-wrap text-sm text-[var(--bp-text)]">{subtask.description}</p>
          </Field>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Priority">
            <TaskPriorityBadge priority={subtask.priority} />
          </Field>
          <Field label="Status">
            <TaskStatusBadge status={subtask.status} />
          </Field>
          <Field label="Start Date">
            <Value>{formatDateTime(subtask.startDate)}</Value>
          </Field>
          <Field label="Due Date">
            <Value>{formatDateTime(subtask.dueDate)}</Value>
          </Field>
          <Field label="Estimated Duration">
            <Value>
              {formatDuration(subtask.estimatedDurationMinutes) || '—'}
              {subtask.estimatedDurationSource === 'ai' && subtask.estimatedDurationMinutes ? (
                <span className="ms-2 rounded-md bg-[var(--bp-accent)]/15 px-1.5 py-0.5 text-xs font-bold text-[var(--bp-accent)]">
                  AI Estimate
                </span>
              ) : null}
            </Value>
          </Field>
          <Field label="Actual Time Spent">
            <Value>{formatDuration(subtask.actualDurationMinutes) || '—'}</Value>
          </Field>
          <Field label="Reminder">
            <Value>
              {subtask.reminderEnabled
                ? subtask.reminderMinutesBeforeDue
                  ? `${subtask.reminderMinutesBeforeDue} min before due`
                  : 'On'
                : 'Off'}
            </Value>
          </Field>
          <Field label="Assignee">
            <Value>{subtask.assignee || '—'}</Value>
          </Field>
        </div>

        {depNames.length ? (
          <Field label="Dependencies">
            <div className="flex flex-wrap gap-1.5">
              {depNames.map((name) => (
                <span key={name} className="rounded-md bg-[var(--bp-bg)] px-2 py-0.5 text-xs text-[var(--bp-text)]">
                  {name}
                </span>
              ))}
            </div>
          </Field>
        ) : null}

        {subtask.tags.length ? (
          <Field label="Tags">
            <div className="flex flex-wrap gap-1.5">
              {subtask.tags.map((tag) => (
                <span key={tag} className="rounded-md bg-[var(--bp-accent)]/10 px-2 py-0.5 text-xs text-[var(--bp-accent)]">
                  #{tag}
                </span>
              ))}
            </div>
          </Field>
        ) : null}

        {subtask.notes ? (
          <Field label="Notes">
            <p className="whitespace-pre-wrap text-sm text-[var(--bp-text)]">{subtask.notes}</p>
          </Field>
        ) : null}

        {/* Attachments */}
        <Field label="Attachments">
          <div className="space-y-2">
            {attachments.map((a) => (
              <div key={a.id ?? a.name} className="flex items-center gap-2 rounded-lg bg-[var(--bp-bg)] px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm text-[var(--bp-text)]">{a.fileName ?? a.name}</span>
                <button
                  type="button"
                  onClick={() => void downloadSubtaskAttachment(accessToken, task.id, subtask.id, a)}
                  className="text-xs font-bold text-[var(--bp-accent)] hover:underline"
                >
                  Download
                </button>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => setAttachmentToDelete(a)}
                    className="text-xs font-bold text-red-400 hover:underline"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ))}
            {canEdit ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
                className="rounded-xl border border-dashed border-[var(--bp-border)] px-4 py-2.5 text-sm font-bold text-slate-400 hover:text-[var(--bp-text)] disabled:opacity-50"
              >
                + Add Attachment
              </button>
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleUpload(file)
                e.target.value = ''
              }}
            />
          </div>
        </Field>

        {/* Activity timeline */}
        <Field label="Activity Timeline">
          <ul className="space-y-1 text-xs text-slate-400">
            <li>Created: {formatDateTime(subtask.createdAt)}</li>
            <li>Last Updated: {formatDateTime(subtask.updatedAt)}</li>
            {subtask.completedAt ? <li>Completed: {formatDateTime(subtask.completedAt)}</li> : null}
          </ul>
        </Field>
      </div>
      <ConfirmDestructiveModal open={attachmentToDelete !== null} title="Delete attachment?" message={`"${attachmentToDelete?.fileName ?? attachmentToDelete?.name ?? 'This file'}" cannot be recovered after deletion.`} confirmLabel="Delete attachment" isConfirming={isDeletingAttachment} onCancel={() => !isDeletingAttachment && setAttachmentToDelete(null)} onConfirm={() => attachmentToDelete?.id && void handleDeleteAttachment(attachmentToDelete.id)} />
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <p className="mb-1.5 text-xs font-black uppercase tracking-wide text-slate-400">{label}</p>
      {children}
    </div>
  )
}

function Value({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-[var(--bp-text)]">{children}</p>
}

function formatDateTime(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
