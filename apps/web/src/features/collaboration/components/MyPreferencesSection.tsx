import { useEffect, useState } from 'react'
import { PrimaryButton } from '../../../components/layout/Buttons'
import {
  createPersonalReminder,
  createSharedReminder,
  getPreferences,
  getTaskReminders,
  updatePreferences,
} from '../api/collaboration.api'
import { friendlyError } from '../errorMessages'
import type { PersonalPreferences, TaskReminder } from '../types'

type Props = {
  taskId: string
  accessToken: string
  canEditShared: boolean
  onError: (message: string) => void
  onNotice: (message: string) => void
}

const TOGGLES: { key: keyof PersonalPreferences; icon: string; label: string; hint: string }[] = [
  { key: 'isFavorite', icon: '⭐', label: 'Favorite', hint: 'Only you' },
  { key: 'isPinned', icon: '📌', label: 'Pin', hint: 'Only you' },
  { key: 'isFocusQueued', icon: '🎯', label: 'Focus Queue', hint: 'Only you' },
  { key: 'notificationsMuted', icon: '🔕', label: 'Mute notifications', hint: 'Only you' },
]

export function MyPreferencesSection({ taskId, accessToken, canEditShared, onError, onNotice }: Props) {
  const [prefs, setPrefs] = useState<PersonalPreferences | null>(null)

  useEffect(() => {
    let active = true
    getPreferences(taskId, accessToken)
      .then((p) => active && setPrefs(p))
      .catch(() => active && setPrefs(null))
    return () => {
      active = false
    }
  }, [taskId, accessToken])

  async function toggle(key: keyof PersonalPreferences) {
    if (!prefs) return
    const next = !prefs[key]
    setPrefs({ ...prefs, [key]: next }) // optimistic
    try {
      await updatePreferences(taskId, { [key]: next }, accessToken)
    } catch (err) {
      setPrefs((cur) => (cur ? { ...cur, [key]: !next } : cur)) // rollback
      onError(friendlyError(err, 'Could not update your preference.'))
    }
  }

  return (
    <section
      className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4"
      aria-label="My preferences"
    >
      <div className="mb-1 flex items-center gap-2">
        <h3 className="text-sm font-black">My Preferences</h3>
        <span className="rounded-full bg-[var(--bp-accent)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--bp-accent)]">
          Private to you
        </span>
      </div>
      <p className="mb-3 text-xs text-slate-400">These settings never change the shared task.</p>

      <div className="grid grid-cols-2 gap-2">
        {TOGGLES.map((toggleDef) => {
          const active = Boolean(prefs?.[toggleDef.key])
          return (
            <button
              key={toggleDef.key}
              type="button"
              role="switch"
              aria-checked={active}
              aria-label={toggleDef.label}
              disabled={!prefs}
              onClick={() => void toggle(toggleDef.key)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-bold transition disabled:opacity-50 ${
                active
                  ? 'border-[var(--bp-accent)] bg-[var(--bp-accent)]/10 text-[var(--bp-text)]'
                  : 'border-[var(--bp-border)] text-slate-400 hover:border-[var(--bp-accent)]/40'
              }`}
            >
              <span aria-hidden className="text-base">
                {toggleDef.icon}
              </span>
              <span className="min-w-0">
                <span className="block truncate">{toggleDef.label}</span>
                <span className="block text-[10px] font-normal text-slate-500">
                  {active ? 'On' : 'Off'} · {toggleDef.hint}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <ReminderSubsection
        taskId={taskId}
        accessToken={accessToken}
        canEditShared={canEditShared}
        onError={onError}
        onNotice={onNotice}
      />
    </section>
  )
}

function ReminderSubsection({
  taskId,
  accessToken,
  canEditShared,
  onError,
  onNotice,
}: {
  taskId: string
  accessToken: string
  canEditShared: boolean
  onError: (m: string) => void
  onNotice: (m: string) => void
}) {
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
    <div className="mt-4 border-t border-[var(--bp-border)] pt-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-black">🔔 Reminders</h4>
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
