import { useEffect, useMemo, useState } from 'react'
import { getFriends } from '../../social/api/social.api'
import type { FriendSummary } from '../../social/types/social.types'
import { FriendAvatar } from '../../social/components/FriendAvatar'
import { PrimaryButton } from '../../../components/layout/Buttons'
import { inviteMember } from '../api/collaboration.api'
import { friendlyError } from '../errorMessages'
import type { TaskMember, TaskRole } from '../types'

type Props = {
  taskId: string
  accessToken: string
  existingMemberIds: string[]
  onClose: () => void
  onInvited: (member: TaskMember, name: string) => void
}

export function InviteMemberModal({
  taskId,
  accessToken,
  existingMemberIds,
  onClose,
  onInvited,
}: Props) {
  const [friends, setFriends] = useState<FriendSummary[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<FriendSummary | null>(null)
  const [role, setRole] = useState<Exclude<TaskRole, 'owner'>>('editor')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoadError('')
    getFriends(accessToken)
      .then((rows) => active && setFriends(rows))
      .catch((err) => active && setLoadError(friendlyError(err, 'Could not load your friends.')))
    return () => {
      active = false
    }
  }, [accessToken])

  const existing = useMemo(() => new Set(existingMemberIds), [existingMemberIds])

  const results = useMemo(() => {
    if (!friends) return []
    const q = search.trim().toLowerCase()
    return friends
      .filter((f) => !existing.has(f.userId))
      .filter(
        (f) =>
          !q ||
          f.fullName.toLowerCase().includes(q) ||
          f.email.toLowerCase().includes(q),
      )
  }, [friends, search, existing])

  async function submit() {
    if (!selected || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const member = await inviteMember(taskId, selected.userId, role, accessToken)
      onInvited(member, selected.fullName)
    } catch (err) {
      setError(friendlyError(err, 'Could not send the invite.'))
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Invite member"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-3xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-black">Invite a friend</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg px-2 py-1 text-slate-400 hover:bg-[var(--bp-border)]/50 hover:text-[var(--bp-text)]"
          >
            ✕
          </button>
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search friends by name or email"
          aria-label="Search friends"
          autoFocus
          className="mb-3 w-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 py-2.5 text-sm text-[var(--bp-text)] outline-none focus:border-[var(--bp-accent)]/60"
        />

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loadError ? (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300">
              {loadError}
            </p>
          ) : friends === null ? (
            <div className="space-y-2" aria-hidden>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-[var(--bp-border)]/40" />
              ))}
            </div>
          ) : results.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              {friends.length === 0
                ? 'Add friends first to invite them to tasks.'
                : 'No matching friends.'}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {results.map((friend) => {
                const isSelected = selected?.userId === friend.userId
                return (
                  <li key={friend.userId}>
                    <button
                      type="button"
                      onClick={() => setSelected(friend)}
                      aria-pressed={isSelected}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                        isSelected
                          ? 'border-[var(--bp-accent)] bg-[var(--bp-accent)]/10'
                          : 'border-[var(--bp-border)] hover:border-[var(--bp-accent)]/40'
                      }`}
                    >
                      <FriendAvatar fullName={friend.fullName} avatarUrl={friend.avatarUrl} size={38} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-[var(--bp-text)]">
                          {friend.fullName}
                        </span>
                        <span className="block truncate text-xs text-slate-400">{friend.email}</span>
                      </span>
                      <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-bold text-green-300">
                        Friend
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="mt-4 border-t border-[var(--bp-border)] pt-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400">Role</span>
            <div className="flex overflow-hidden rounded-lg border border-[var(--bp-border)]">
              {(['editor', 'viewer'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  aria-pressed={role === r}
                  className={`px-3 py-1.5 text-xs font-bold capitalize transition ${
                    role === r
                      ? 'bg-[var(--bp-accent)] text-[var(--bp-accent-text)]'
                      : 'text-slate-400 hover:text-[var(--bp-text)]'
                  }`}
                >
                  {r === 'editor' ? '✏️ Editor' : '👁 Viewer'}
                </button>
              ))}
            </div>
          </div>

          {error ? (
            <p className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300">
              {error}
            </p>
          ) : null}

          <PrimaryButton
            className="w-full"
            disabled={!selected}
            loading={submitting}
            onClick={() => void submit()}
          >
            {selected ? `Invite ${selected.fullName.split(' ')[0]}` : 'Select a friend'}
          </PrimaryButton>
        </div>
      </div>
    </div>
  )
}
