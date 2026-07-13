import { useEffect, useState } from 'react'
import { PrimaryButton } from '../../../components/layout/Buttons'
import { createPersonalReminder, createSharedReminder, getTaskReminders } from '../api/collaboration.api'
import { friendlyError } from '../errorMessages'
import type { TaskReminder } from '../types'

type Props = {
  taskId: string
  accessToken: string
  canEditShared: boolean
  onError: (message: string) => void
  onNotice: (message: string) => void
}

/**
 * Shared-vs-personal reminder audience picker, lived inside "My Preferences"
 * on the Task Details page. Moved into the Edit Task screen's Reminder
 * section so there is a single place to manage reminders.
 */
export function ReminderAudienceSection({ taskId, accessToken, canEditShared, onError, onNotice }: Props) {
  const [tab, setTab] = useState<'shared' | 'personal'>(canEditShared ? 'shared' : 'personal')
  const [when, setWhen] = useState('')
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [reminders, setReminders] = useState<TaskReminder[]>([])

  useEffect(() => {
    let active = true
    getTaskReminders(taskId, accessToken)
      .then((rows) => active && setReminders(rows))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [taskId, accessToken])

  async function submit() {
    if (!when || submitting) return
    setSubmitting(true)
    try {
      const input = { title: title.trim() || undefined, triggerDateTime: new Date(when).toISOString() }
      const created =
        tab === 'shared'
          ? await createSharedReminder(taskId, input, accessToken)
          : await createPersonalReminder(taskId, input, accessToken)
      setReminders((prev) => [created, ...prev])
      setWhen('')
      setTitle('')
      onNotice(
        tab === 'shared'
          ? 'Shared reminder set for everyone on this task.'
          : 'Personal reminder set — only you will be notified.',
      )
    } catch (err) {
      onError(friendlyError(err, 'Could not create the reminder.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-black">🔔 Reminder Audience</h4>
        <div className="flex overflow-hidden rounded-lg border border-[var(--bp-border)]">
          {(['shared', 'personal'] as const).map((option) => (
            <button
              key={option}
              type="button"
              disabled={option === 'shared' && !canEditShared}
              onClick={() => setTab(option)}
              aria-pressed={tab === option}
              className={`px-3 py-1 text-[11px] font-bold capitalize transition disabled:cursor-not-allowed disabled:opacity-40 ${
                tab === option
                  ? 'bg-[var(--bp-accent)] text-[var(--bp-accent-text)]'
                  : 'text-slate-400 hover:text-[var(--bp-text)]'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-2 text-[11px] leading-5 text-slate-400">
        {tab === 'shared'
          ? 'A shared reminder notifies every member of this task.'
          : 'A personal reminder notifies only you.'}
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Reminder title (optional)"
          aria-label="Reminder title"
          className="flex-1 rounded-lg border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 py-2 text-xs text-[var(--bp-text)] outline-none focus:border-[var(--bp-accent)]/60"
        />
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          aria-label="Reminder time"
          className="rounded-lg border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 py-2 text-xs text-[var(--bp-text)] outline-none focus:border-[var(--bp-accent)]/60"
        />
        <PrimaryButton size="sm" loading={submitting} disabled={!when} onClick={() => void submit()}>
          Set
        </PrimaryButton>
      </div>

      {reminders.length ? (
        <ul className="mt-3 space-y-1.5">
          {reminders.map((reminder) => (
            <li
              key={reminder.id}
              className="flex items-center gap-2 rounded-lg border border-[var(--bp-border)] px-3 py-1.5 text-xs"
            >
              <span aria-hidden>{reminder.audience === 'shared' ? '👥' : '🔒'}</span>
              <span className="flex-1 truncate text-[var(--bp-text)]">{reminder.title}</span>
              <span className="text-[10px] text-slate-500">
                {reminder.triggerDateTime
                  ? new Date(reminder.triggerDateTime).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })
                  : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
