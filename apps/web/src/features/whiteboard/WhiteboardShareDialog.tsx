import { useEffect, useState } from 'react'
import { FriendAvatar } from '../social/components/FriendAvatar'
import { createWhiteboardInvitation, listWhiteboardBoardInvitations, listWhiteboardInviteCandidates, listWhiteboardMembers, removeWhiteboardMember, revokeWhiteboardInvitation, updateWhiteboardMember } from './api/whiteboardApi'

type Member = { id: string; fullName: string; email?: string; role: 'owner' | 'editor' | 'viewer'; username?: string; avatarUrl?: string | null }
type Invitation = { id: string; email?: string; username?: string | null; displayName?: string | null; avatarUrl?: string | null; role: string; status: string; expiresAt: string }
type Candidate = { userId: string; fullName: string; username: string; avatarUrl: string | null }

export function WhiteboardShareDialog({ open, boardId, accessRole, token, onClose }: { open: boolean; boardId: string; accessRole: 'owner' | 'editor' | 'viewer'; token: string; onClose: () => void }) {
  const [members, setMembers] = useState<Member[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Candidate | null>(null)
  const [role, setRole] = useState<'editor' | 'viewer'>('editor')
  const [busy, setBusy] = useState(false)
  const [loadingCandidates, setLoadingCandidates] = useState(false)
  const [error, setError] = useState('')

  const load = () => {
    void listWhiteboardMembers(token, boardId).then((value) => setMembers(value as Member[]))
    if (accessRole === 'owner') void listWhiteboardBoardInvitations(token, boardId).then((value) => setInvitations(value as Invitation[]))
  }

  useEffect(() => {
    if (open) { setError(''); setSearch(''); setSelected(null); load() }
  }, [open, boardId])

  useEffect(() => {
    if (!open || accessRole !== 'owner') return
    const query = search.trim()
    if (!query) { setCandidates([]); setLoadingCandidates(false); return }
    setLoadingCandidates(true)
    const timer = window.setTimeout(() => void listWhiteboardInviteCandidates(token, boardId, query).then((value) => setCandidates(value as Candidate[])).catch(() => setError('Search failed.')).finally(() => setLoadingCandidates(false)), 250)
    return () => window.clearTimeout(timer)
  }, [open, accessRole, boardId, search, token])

  if (!open) return null

  const invite = async () => {
    if (!selected || busy) return
    setBusy(true); setError('')
    try {
      await createWhiteboardInvitation(token, boardId, { inviteeUserId: selected.userId, role })
      setSearch(''); setSelected(null); setCandidates([]); load()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to invite this friend.') } finally { setBusy(false) }
  }

  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section role="dialog" aria-modal="true" aria-label="Share whiteboard" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-5 text-[var(--bp-text)] shadow-2xl sm:p-6">
      <header className="flex items-center justify-between gap-4 border-b border-[var(--bp-border)] pb-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--bp-muted)]">Collaboration</p><h2 className="mt-1 text-lg font-bold">Share Whiteboard</h2></div><button type="button" aria-label="Close share dialog" onClick={onClose} className="rounded-lg px-2 py-1 text-xl leading-none text-[var(--bp-muted)] hover:bg-[var(--bp-bg)] hover:text-[var(--bp-text)]">×</button></header>
      {accessRole === 'owner' && <section className="mt-5"><h3 className="text-sm font-bold">Invite a friend</h3><div className="relative mt-3"><input aria-label="Search friends" value={selected ? `@${selected.username}` : search} onChange={(event) => { setSelected(null); setSearch(event.target.value) }} placeholder="Search by username or name…" className="w-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--bp-accent)]" />{!selected && search.trim() && <div className="absolute inset-x-0 top-full z-10 mt-2 max-h-56 overflow-y-auto rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-1 shadow-xl">{loadingCandidates ? <p className="px-3 py-4 text-sm text-[var(--bp-muted)]">Searching…</p> : candidates.length ? candidates.map((candidate) => <button type="button" key={candidate.userId} onClick={() => setSelected(candidate)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-start hover:bg-[var(--bp-bg)]"><FriendAvatar fullName={candidate.fullName} avatarUrl={candidate.avatarUrl} size={32} /><span className="min-w-0"><span className="block truncate text-sm font-semibold">{candidate.fullName}</span><span className="block truncate text-xs text-[var(--bp-muted)]">@{candidate.username}</span></span></button>) : <p className="px-3 py-4 text-sm text-[var(--bp-muted)]">{search.trim().length < 2 ? 'Start typing to search friends.' : 'No friends found.'}</p>}</div>}</div>{selected && <div className="mt-3 flex items-center gap-3 rounded-xl border border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] p-3"><FriendAvatar fullName={selected.fullName} avatarUrl={selected.avatarUrl} size={36} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{selected.fullName}</span><span className="block text-xs text-[var(--bp-muted)]">@{selected.username}</span></span><button type="button" onClick={() => { setSelected(null); setSearch('') }} className="text-xs font-semibold text-[var(--bp-muted)]">Change</button></div>}<div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-[var(--bp-muted)]">Role</span>{(['editor', 'viewer'] as const).map((value) => <button key={value} type="button" onClick={() => setRole(value)} aria-pressed={role === value} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold capitalize ${role === value ? 'border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] text-[var(--bp-accent-ink)]' : 'border-[var(--bp-border)] text-[var(--bp-muted)]'}`}>{value}</button>)}<button type="button" disabled={!selected || busy} onClick={() => void invite()} className="ms-auto rounded-xl bg-[var(--bp-accent)] px-4 py-2 text-sm font-semibold text-[var(--bp-accent-text)] disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Inviting…' : 'Invite'}</button></div></section>}
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-300/70 bg-red-50/50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-300">{error}</p>}
      <section className="mt-6"><h3 className="text-sm font-bold">Members</h3><div className="mt-3 space-y-2">{members.length ? members.map((member) => <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--bp-border)] p-3 text-sm"><span className="min-w-0 truncate">{member.fullName} <span className="text-[var(--bp-muted)]">· {member.username ? `@${member.username}` : member.role}</span></span>{accessRole === 'owner' && member.role !== 'owner' && <span className="flex gap-2"><button type="button" onClick={() => void updateWhiteboardMember(token, boardId, member.id, member.role === 'editor' ? 'viewer' : 'editor').then(load)} className="rounded-lg border border-[var(--bp-border)] px-2.5 py-1.5 text-xs font-semibold">Change role</button><button type="button" onClick={() => void removeWhiteboardMember(token, boardId, member.id).then(load)} className="rounded-lg border border-red-300 px-2.5 py-1.5 text-xs font-semibold text-red-700">Remove</button></span>}</div>) : <p className="rounded-xl border border-dashed border-[var(--bp-border)] px-3 py-5 text-center text-sm text-[var(--bp-muted)]">No members yet.</p>}</div></section>
      {accessRole === 'owner' && <section className="mt-6"><h3 className="text-sm font-bold">Pending Invitations</h3><div className="mt-3 space-y-2">{invitations.length ? invitations.map((invitation) => <div key={invitation.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--bp-border)] p-3 text-sm">{(invitation.displayName || invitation.username) && <FriendAvatar fullName={invitation.displayName || invitation.username || 'Friend'} avatarUrl={invitation.avatarUrl} size={32} />}<span className="min-w-0 flex-1 truncate">{invitation.displayName || (invitation.username ? `@${invitation.username}` : invitation.email)} <span className="text-[var(--bp-muted)]">· {invitation.role}</span></span><button type="button" onClick={() => void revokeWhiteboardInvitation(token, boardId, invitation.id).then(load)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-700">Revoke</button></div>) : <p className="rounded-xl border border-dashed border-[var(--bp-border)] px-3 py-5 text-center text-sm text-[var(--bp-muted)]">No pending invitations.</p>}</div></section>}
    </section>
  </div>
}
