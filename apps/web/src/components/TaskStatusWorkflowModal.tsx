import { useEffect, useMemo, useState } from 'react'
import { PrimaryButton, SecondaryButton } from './layout'
import { useLanguage } from '../i18n/LanguageContext'

export type TaskStatus = 'To Do' | 'In Progress' | 'Done' | 'Missed'

type TaskStatusWorkflowModalProps = {
  open: boolean
  status: TaskStatus
  /** Status to preselect when opening (e.g. 'Done' from the inline control). Defaults to `status`. */
  initialStatus?: TaskStatus
  progress: number
  hasSubtasks?: boolean
  subtasksComplete?: boolean
  subtaskProgress?: number
  completedSubtasksCount?: number
  totalSubtasksCount?: number
  onClose: () => void
  onSave: (next: {
    status: TaskStatus
    progress: number
    completionDate?: string
    missedReason?: string
  }) => void
}

const statusOptions: {
  value: TaskStatus
  icon: string
  statusKey: string
  descriptionKey: string
  tone: string
}[] = [
  {
    value: 'To Do',
    icon: 'TD',
    statusKey: 'todo',
    descriptionKey: 'taskStatusWorkflow.todoDescription',
    tone: 'text-[var(--bp-subtle)]',
  },
  {
    value: 'In Progress',
    icon: 'IP',
    statusKey: 'inProgress',
    descriptionKey: 'taskStatusWorkflow.inProgressDescription',
    tone: 'text-blue-300',
  },
  {
    value: 'Done',
    icon: 'DN',
    statusKey: 'done',
    descriptionKey: 'taskStatusWorkflow.doneDescription',
    tone: 'text-green-300',
  },
  {
    value: 'Missed',
    icon: 'MS',
    statusKey: 'missed',
    descriptionKey: 'taskStatusWorkflow.missedDescription',
    tone: 'text-red-300',
  },
]

export function TaskStatusWorkflowModal({
  open,
  status,
  initialStatus,
  progress,
  hasSubtasks = false,
  subtasksComplete = true,
  subtaskProgress = 0,
  completedSubtasksCount = 0,
  totalSubtasksCount = 0,
  onClose,
  onSave,
}: TaskStatusWorkflowModalProps) {
  const { t } = useLanguage()
  const [selectedStatus, setSelectedStatus] = useState<TaskStatus>(initialStatus ?? status)
  const [progressValue, setProgressValue] = useState(progress)
  const [completionDate, setCompletionDate] = useState('')
  const [missedReason, setMissedReason] = useState('')

  useEffect(() => {
    if (!open) return

    setSelectedStatus(initialStatus ?? status)
    setProgressValue(progress)
    setCompletionDate('')
    setMissedReason('')
  }, [open, progress, status, initialStatus])

  const doneDisabled = hasSubtasks && !subtasksComplete
  const saveDisabled = selectedStatus === 'Done' && doneDisabled

  const helperText = useMemo(() => {
    if (hasSubtasks) {
      return t('taskStatusWorkflow.calculatedFromSubtasks', { completed: completedSubtasksCount, total: totalSubtasksCount })
    }
    if (selectedStatus === 'Done') return t('taskStatusWorkflow.doneHelper')
    if (selectedStatus === 'Missed') return t('taskStatusWorkflow.missedHelper')
    return t('taskStatusWorkflow.progressHelper')
  }, [completedSubtasksCount, hasSubtasks, selectedStatus, totalSubtasksCount, t])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 px-4 py-0 backdrop-blur-[2px] md:items-center md:py-8">
      <div className="w-full max-w-xl animate-[statusSheetIn_180ms_ease-out] rounded-t-[28px] border border-[var(--bp-border)] bg-[var(--bp-surface-elevated)] p-5 shadow-2xl md:rounded-[28px] md:p-6">
        <div className="mx-auto mb-5 h-1.5 w-14 rounded-full bg-[var(--bp-border)]" />

        <header className="mb-5 text-center">
          <h2 className="text-2xl font-black text-[var(--bp-text)]">{t('taskDetailsCore.changeStatus')}</h2>
          <p className="mt-2 text-sm text-[var(--bp-muted)]">{t('taskStatusWorkflow.selectStatus')}</p>
        </header>

        <div className="space-y-3">
          {statusOptions.map((option) => {
            const isSelected = selectedStatus === option.value
            const isDisabled = option.value === 'Done' && doneDisabled

            return (
              <div key={option.value}>
                <button
                  type="button"
                  onClick={() => {
                    if (isDisabled) return
                    setSelectedStatus(option.value)
                  }}
                  disabled={isDisabled}
                  className={`flex w-full items-center gap-4 rounded-[20px] border p-4 text-start transition duration-200 active:scale-[0.99] ${
                    isDisabled
                      ? 'cursor-not-allowed border-[var(--bp-border)] bg-[var(--bp-bg)] opacity-50'
                      : isSelected
                        ? 'border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] shadow-lg shadow-black/20'
                        : 'border-[var(--bp-border)] bg-[var(--bp-bg)] hover:border-[var(--bp-accent)]/50'
                  }`}
                  aria-pressed={isSelected}
                  aria-disabled={isDisabled}
                >
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-xs font-black ${
                      isSelected && !isDisabled
                        ? 'border-[var(--bp-accent)] border border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] text-[var(--bp-accent-ink)]'
                        : `border-[var(--bp-border)] bg-[var(--bp-surface)] ${option.tone}`
                    }`}
                  >
                    {option.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-black text-[var(--bp-text)]">{t(`taskLabels.status.${option.statusKey}`)}</span>
                    <span className="mt-1 block text-sm leading-5 text-[var(--bp-muted)]">{t(option.descriptionKey)}</span>
                  </span>
                  <span
                    className={`h-5 w-5 rounded-full border transition ${
                      isSelected && !isDisabled ? 'border-[var(--bp-accent)] bg-[var(--bp-accent)]' : 'border-[var(--bp-border)]'
                    }`}
                  />
                </button>
                {isDisabled ? (
                  <p className="mt-2 px-1 text-xs font-semibold text-red-400">{t('editTaskFeedback.completeSubtasks')}</p>
                ) : null}
              </div>
            )
          })}
        </div>

        <section className="mt-5 rounded-[20px] border border-[var(--bp-border)] bg-[var(--bp-bg)] p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-[var(--bp-text)]">{t('taskStatusWorkflow.progressPercentage')}</p>
              <p className="mt-1 text-xs text-[var(--bp-muted)]">{helperText}</p>
            </div>
            <span className="text-2xl font-black text-[var(--bp-accent-ink)]">{hasSubtasks ? subtaskProgress : progressValue}%</span>
          </div>

          {hasSubtasks ? (
            <div className="h-2 rounded-full bg-[var(--bp-border)]" aria-label={t('taskStatusWorkflow.progressFromSubtasks')}>
              <div
                className="h-2 rounded-full bg-[var(--bp-accent)] transition-all"
                style={{ width: `${subtaskProgress}%` }}
              />
            </div>
          ) : (
            <input
              aria-label={t('taskStatusWorkflow.progressPercentage')}
              type="range"
              min="0"
              max="100"
              value={progressValue}
              onChange={(event) => setProgressValue(Number(event.target.value))}
              className="w-full accent-[var(--bp-accent)]"
            />
          )}

          {selectedStatus === 'Done' ? (
            <label className="mt-4 block">
              <span className="text-xs font-black uppercase tracking-wide text-[var(--bp-muted)]">{t('taskStatusWorkflow.completionDate')}</span>
              <input
                type="date"
                value={completionDate}
                onChange={(event) => setCompletionDate(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-4 py-3 text-sm font-semibold text-[var(--bp-text)] outline-none transition focus:border-[var(--bp-accent)]"
              />
            </label>
          ) : null}

          {selectedStatus === 'Missed' ? (
            <label className="mt-4 block">
              <span className="text-xs font-black uppercase tracking-wide text-[var(--bp-muted)]">{t('taskStatusWorkflow.missedReason')}</span>
              <textarea
                value={missedReason}
                onChange={(event) => setMissedReason(event.target.value)}
                placeholder={t('taskStatusWorkflow.missedReasonPlaceholder')}
                rows={3}
                className="mt-2 w-full resize-none rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-4 py-3 text-sm font-semibold text-[var(--bp-text)] outline-none transition placeholder:text-[var(--bp-placeholder)] focus:border-[var(--bp-accent)]"
              />
            </label>
          ) : null}
        </section>

        <footer className="mt-5 grid grid-cols-2 gap-3">
          <SecondaryButton onClick={onClose} className="w-full">
            {t('taskForm.cancel')}
          </SecondaryButton>
          <PrimaryButton
            onClick={() =>
              onSave({
                status: selectedStatus,
                progress: hasSubtasks ? subtaskProgress : progressValue,
                completionDate,
                missedReason,
              })
            }
            disabled={saveDisabled}
            className="w-full"
          >
            {t('taskStatusWorkflow.saveStatus')}
          </PrimaryButton>
        </footer>
      </div>
    </div>
  )
}
