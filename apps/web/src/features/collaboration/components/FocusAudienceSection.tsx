import { useEffect, useState } from 'react'
import { getPreferences, updatePreferences } from '../api/collaboration.api'
import { friendlyError } from '../errorMessages'

type Props = {
  taskId: string
  accessToken: string
  canEditShared: boolean
  focusEnabled: boolean
  onFocusEnabledChange: (value: boolean) => void
  onError: (message: string) => void
}

/**
 * Shared-vs-personal focus audience picker for the Edit Task screen. Shared
 * focus flips the task's own `isFocusTask` flag (saved with the rest of the
 * task on "Save Changes") so it appears in everyone's Focus Queue. Personal
 * focus is a private, immediately-persisted preference that only affects
 * the current user's own Focus Queue.
 */
export function FocusAudienceSection({
  taskId,
  accessToken,
  canEditShared,
  focusEnabled,
  onFocusEnabledChange,
  onError,
}: Props) {
  const [tab, setTab] = useState<'shared' | 'personal'>(canEditShared ? 'shared' : 'personal')
  const [personalFocus, setPersonalFocus] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    getPreferences(taskId, accessToken)
      .then((prefs) => {
        if (!active) return
        setPersonalFocus(prefs.isFocusQueued)
        setLoaded(true)
      })
      .catch(() => active && setLoaded(true))
    return () => {
      active = false
    }
  }, [taskId, accessToken])

  async function togglePersonalFocus() {
    const next = !personalFocus
    setPersonalFocus(next) // optimistic
    try {
      await updatePreferences(taskId, { isFocusQueued: next }, accessToken)
    } catch (err) {
      setPersonalFocus(!next) // rollback
      onError(friendlyError(err, 'Could not update your personal focus setting.'))
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-black">🎯 Focus Audience</h4>
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

      {tab === 'shared' ? (
        <>
          <p className="mb-2 text-[11px] leading-5 text-slate-400">
            A shared focus task appears in the Focus Queue for every member of this task.
          </p>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={focusEnabled}
              onChange={(event) => onFocusEnabledChange(event.target.checked)}
            />
            Enable shared focus
          </label>
        </>
      ) : (
        <>
          <p className="mb-2 text-[11px] leading-5 text-slate-400">
            A personal focus task appears only in your own Focus Queue.
          </p>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              disabled={!loaded}
              checked={personalFocus}
              onChange={() => void togglePersonalFocus()}
            />
            Enable personal focus
          </label>
        </>
      )}
    </div>
  )
}
