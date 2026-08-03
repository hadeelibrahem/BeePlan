import type { FriendSummary } from '../types/social.types'
import { FriendAvatar } from './FriendAvatar'
import { useState } from 'react'

type Props = {
  friend: FriendSummary
  onRemove: (friend: FriendSummary) => void
  /** Future friend-detail seam. When omitted the row isn't clickable. */
  onSelect?: (friend: FriendSummary) => void
}

/** A single friend row: avatar, display name, username, and secondary actions. */
export function FriendListItem({ friend, onRemove, onSelect }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const clickable = Boolean(onSelect)

  return (
    <div className="group relative flex items-center gap-3 rounded-xl border-b border-[var(--bp-border)] px-2 py-3 transition hover:bg-[var(--bp-bg)] last:border-0">
      <button
        type="button"
        disabled={!clickable}
        onClick={() => onSelect?.(friend)}
        className={`flex flex-1 items-center gap-3 text-start ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <FriendAvatar fullName={friend.fullName} avatarUrl={friend.avatarUrl} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-[var(--bp-text)]">{friend.fullName}</span>
          <span className="block truncate text-[11px] text-[var(--bp-muted)]">@{friend.username}</span>
        </span>
      </button>
      <span className="hidden rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-600 sm:inline-flex">Active</span>
      <div className="relative">
        <button type="button" aria-label={`Actions for ${friend.fullName}`} aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)} className="rounded-lg p-2 text-lg leading-none text-[var(--bp-muted)] opacity-70 transition hover:bg-[var(--bp-surface)] hover:text-[var(--bp-text)] group-hover:opacity-100">⋮</button>
        {menuOpen ? <div className="absolute right-0 top-10 z-10 min-w-40 rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-1 shadow-lg"><button type="button" onClick={() => { setMenuOpen(false); onSelect?.(friend) }} className="w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-[var(--bp-text)] hover:bg-[var(--bp-bg)]">View details</button><button type="button" onClick={() => { setMenuOpen(false); onSelect?.(friend) }} className="w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-[var(--bp-text)] hover:bg-[var(--bp-bg)]">Manage sharing</button><button type="button" onClick={() => { setMenuOpen(false); onRemove(friend) }} className="w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-rose-600 hover:bg-rose-500/10">Remove friend</button></div> : null}
      </div>
    </div>
  )
}
