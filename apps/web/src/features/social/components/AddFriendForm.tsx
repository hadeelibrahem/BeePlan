import { useState } from 'react'
import { PrimaryButton } from '../../../components/layout'
import { useLanguage } from '../../../i18n/LanguageContext'
import type { FriendSummary } from '../types/social.types'
import { FriendAvatar } from './FriendAvatar'

type Props = {
  /** Sends the request. Resolves on success; throws with a message on failure. */
  onAdd: (username: string) => Promise<void>
  onSearch?: (username: string) => Promise<FriendSummary | null>
}

/**
 * Self-contained compact "add a friend" form: username input with format validation, a
 * loading state, and inline success/error feedback. Reused on the People page.
 */
export function AddFriendForm({ onAdd, onSearch }: Props) {
  const { t } = useLanguage()
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [match, setMatch] = useState<FriendSummary | null>(null)

  const normalized = username.trim().replace(/^@+/, '').toLowerCase()
  const valid = /^[a-z0-9](?:[a-z0-9_]{1,18}[a-z0-9])?$/.test(normalized)

  const submit = async () => {
    setError('')
    setSuccess('')
    if (!valid) {
      setError('Enter a valid username (3–20 letters, numbers, or underscores).')
      return
    }
    if (onSearch && !match) {
      setLoading(true)
      try {
        const found = await onSearch(normalized)
        if (!found) setError('No BeePlan user found with that username.')
        else setMatch(found)
      } catch (err) { setError(err instanceof Error ? err.message : t('common.somethingWentWrong')) }
      finally { setLoading(false) }
      return
    }
    setLoading(true)
    try {
      await onAdd(normalized)
      setUsername('')
      setMatch(null)
      setSuccess(t('people.addFriend.sent'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.somethingWentWrong'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section id="add-friend-card" className="border-b border-[var(--bp-border)] pb-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="text-sm font-bold text-[var(--bp-text)]">Add Friend by Username</h3><p className="mt-0.5 text-xs text-[var(--bp-muted)]">Search for a BeePlan username without exposing email addresses.</p></div>
        <div className="flex min-w-[min(100%,420px)] flex-1 gap-2 sm:max-w-xl">
        <input
          type="text"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value)
            setError('')
            setSuccess('')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
          placeholder="@username"
          className="flex-1 rounded-xl border border-[var(--bp-border)] bg-[var(--bp-bg)] px-3 py-2 text-sm text-[var(--bp-text)] outline-none focus:border-[var(--bp-accent)]"
        />
        <PrimaryButton onClick={() => void submit()} disabled={!valid || loading} loading={loading}>
          {match ? 'Send Request' : 'Search'}
        </PrimaryButton>
        </div>
      </div>
      {match ? <div className="mt-3 flex items-center gap-3 rounded-xl border border-[var(--bp-border)] bg-[var(--bp-bg)] p-3"><FriendAvatar fullName={match.fullName} avatarUrl={match.avatarUrl} size={32} /><div className="min-w-0 flex-1"><p className="text-sm font-bold text-[var(--bp-text)]">{match.fullName}</p><p className="text-xs text-[var(--bp-muted)]">@{match.username}</p></div><button type="button" onClick={() => setMatch(null)} className="text-xs font-bold text-[var(--bp-muted)] hover:text-[var(--bp-text)]">Clear</button></div> : null}
      {error && <p className="mt-2 text-xs text-rose-500">{error}</p>}
      {success && <p className="mt-2 text-xs text-emerald-500">{success}</p>}
    </section>
  )
}
