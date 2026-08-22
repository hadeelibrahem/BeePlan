import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { acceptWhiteboardInvitation, archiveWhiteboard, createWhiteboard, declineWhiteboardInvitation, deleteWhiteboard, duplicateWhiteboard, listWhiteboardInvitations, listWhiteboards, pinWhiteboard, restoreWhiteboard, unpinWhiteboard, updateWhiteboard, type WhiteboardInvitation, type WhiteboardSummary } from './api/whiteboardApi'
import { FriendAvatar } from '../social/components/FriendAvatar'
import { useLanguage } from '../../i18n/LanguageContext'

export function WhiteboardsDashboardScreen() {
  const { accessToken } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [boards, setBoards] = useState<WhiteboardSummary[]>([])
  const [search, setSearch] = useState('')
  const [archived, setArchived] = useState(false)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invitations, setInvitations] = useState<WhiteboardInvitation[]>([])

  const load = () => {
    if (!accessToken) return
    setLoading(true)
    void listWhiteboards(accessToken, { archived, search, sort: 'lastOpenedAt' }).then(setBoards).catch(() => setError(t('whiteboards.loadError'))).finally(() => setLoading(false))
  }
  useEffect(() => { setError(null); load(); if (accessToken) void listWhiteboardInvitations(accessToken).then(setInvitations).catch(() => undefined) }, [accessToken, archived, search])
  const pinned = useMemo(() => boards.filter((board) => board.isPinned), [boards])
  const mutate = async (id: string, action: (token: string, id: string) => Promise<WhiteboardSummary>) => {
    if (!accessToken) return
    const updated = await action(accessToken, id)
    setBoards((current) => current.map((board) => board.id === id ? updated : board))
  }
  const create = async () => {
    if (!accessToken || creating) return
    setCreating(true)
    try { const board = await createWhiteboard(accessToken); navigate(`/whiteboards/${board.id}`) } finally { setCreating(false) }
  }
  const remove = async (board: WhiteboardSummary) => {
    if (!accessToken || !window.confirm(`Delete "${board.name}"?`)) return
    await deleteWhiteboard(accessToken, board.id)
    setBoards((current) => current.filter((item) => item.id !== board.id))
  }
  const duplicate = async (board: WhiteboardSummary) => { if (!accessToken) return; const copy = await duplicateWhiteboard(accessToken, board.id); navigate(`/whiteboards/${copy.id}`) }
  const rename = async (board: WhiteboardSummary) => { if (!accessToken) return; const name = window.prompt('Board name', board.name)?.trim(); if (!name) return; const updated = await updateWhiteboard(accessToken, { name }, undefined, board.id); setBoards((current) => current.map((item) => item.id === board.id ? { ...item, name: updated.name, updatedAt: updated.updatedAt } : item)) }

  return <section className="flex min-h-0 flex-1 flex-col gap-6 py-4 text-[var(--bp-text)]">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--bp-muted)]">{t('whiteboards.workspace')}</p><h1 className="mt-1 text-2xl font-bold">{t('whiteboards.title')}</h1></div><button type="button" disabled={creating} onClick={() => void create()} className="rounded-xl bg-[var(--bp-accent)] px-4 py-2 text-sm font-semibold text-[var(--bp-accent-text)]">{creating ? t('whiteboards.creating') : t('whiteboards.new')}</button></header>
    <div className="flex flex-wrap gap-3"><input aria-label={t('whiteboards.search')} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('whiteboards.search')} className="min-w-56 flex-1 rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-3 py-2 text-sm outline-none" /><button type="button" onClick={() => setArchived((value) => !value)} className="rounded-xl border border-[var(--bp-border)] px-3 py-2 text-sm">{archived ? t('whiteboards.archived') : t('whiteboards.active')}</button></div>
    {error && <div className="rounded-xl border border-red-300 p-4 text-sm">{error}<button type="button" onClick={load} className="ms-3 font-semibold">{t('whiteboards.retry')}</button></div>}
    {loading && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading whiteboards">{[1, 2, 3].map((item) => <div key={item} className="h-44 animate-pulse rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)]" />)}</div>}
    {!loading && !boards.length && <div className="rounded-2xl border border-dashed border-[var(--bp-border)] p-10 text-center"><h2 className="text-lg font-bold">{search ? t('whiteboards.noMatch') : archived ? t('whiteboards.noArchived') : t('whiteboards.empty')}</h2><p className="mt-2 text-sm text-[var(--bp-muted)]">{search ? t('whiteboards.tryDifferent') : t('whiteboards.subtitle')}</p>{!archived && !search && <button type="button" onClick={() => void create()} className="mt-5 rounded-xl bg-[var(--bp-accent)] px-4 py-2 text-sm font-semibold text-[var(--bp-accent-text)]">{t('whiteboards.create')}</button>}</div>}
    {invitations.length > 0 && !archived && <section><h2 className="mb-3 text-sm font-bold">Pending Invitations</h2><div className="space-y-2">{invitations.map((invitation) => <div key={invitation.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-3 text-sm"><FriendAvatar fullName={invitation.inviterDisplayName || invitation.inviterUsername || 'Friend'} avatarUrl={invitation.inviterAvatarUrl} size={36} /><div className="min-w-0 flex-1"><p><span className="font-semibold">{invitation.inviterDisplayName || invitation.inviterUsername || 'A friend'}</span> invited you to <span className="font-semibold">{invitation.boardName || 'a Whiteboard'}</span></p><p className="mt-0.5 text-xs text-[var(--bp-muted)]">@{invitation.inviterUsername || 'friend'} · {invitation.role}</p></div><span className="flex gap-2"><button type="button" onClick={() => void acceptWhiteboardInvitation(accessToken!, invitation.id).then(() => setInvitations((items) => items.filter((item) => item.id !== invitation.id)))} className="rounded-lg bg-[var(--bp-accent)] px-3 py-1 font-semibold text-[var(--bp-accent-text)]">Accept</button><button type="button" onClick={() => void declineWhiteboardInvitation(accessToken!, invitation.id).then(() => setInvitations((items) => items.filter((item) => item.id !== invitation.id)))} className="rounded-lg border border-[var(--bp-border)] px-3 py-1">Decline</button></span></div>)}</div></section>}
    {boards.length > 0 && <>
      {pinned.length > 0 && !archived && <BoardSection title={t('whiteboards.pinned')} empty={t('whiteboards.empty')} boards={pinned} navigate={navigate} mutate={mutate} remove={remove} duplicate={duplicate} rename={rename} />}
      <BoardSection title={archived ? t('whiteboards.archived') : t('whiteboards.mine')} empty={archived ? t('whiteboards.noArchived') : t('whiteboards.empty')} boards={boards.filter((board) => archived || !board.isShared)} navigate={navigate} mutate={mutate} remove={remove} duplicate={duplicate} rename={rename} />
      {!archived && <BoardSection title={t('whiteboards.shared')} empty={t('whiteboards.noShared')} boards={boards.filter((board) => board.isShared)} navigate={navigate} mutate={mutate} remove={remove} duplicate={duplicate} rename={rename} />}
    </>}
  </section>
}

function BoardSection({ title, empty, boards, navigate, mutate, remove, duplicate, rename }: { title: string; empty: string; boards: WhiteboardSummary[]; navigate: ReturnType<typeof useNavigate>; mutate: (id: string, action: (token: string, id: string) => Promise<WhiteboardSummary>) => Promise<void>; remove: (board: WhiteboardSummary) => Promise<void>; duplicate: (board: WhiteboardSummary) => Promise<void>; rename: (board: WhiteboardSummary) => Promise<void> }) {
  return <div><h2 className="mb-3 text-sm font-bold">{title}</h2>{boards.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{boards.map((board) => <BoardCard key={board.id} board={board} onOpen={() => navigate(`/whiteboards/${board.id}`)} onPin={() => void mutate(board.id, board.isPinned ? unpinWhiteboard : pinWhiteboard)} onArchive={() => void mutate(board.id, board.isArchived ? restoreWhiteboard : archiveWhiteboard)} onDuplicate={() => duplicate(board)} onRename={() => rename(board)} onDelete={() => remove(board)} />)}</div> : <div className="rounded-xl border border-dashed border-[var(--bp-border)] px-4 py-5 text-sm text-[var(--bp-muted)]">{empty}</div>}</div>
}

function BoardCard({ board, onOpen, onPin, onArchive, onDuplicate, onRename, onDelete }: { board: WhiteboardSummary; onOpen: () => void; onPin: () => void; onArchive: () => void; onDuplicate: () => void; onRename: () => void; onDelete: () => Promise<void> }) {
  return <article className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4 shadow-sm"><button type="button" onClick={onOpen} className="block w-full text-start"><div className="flex h-24 items-center justify-center rounded-xl bg-[var(--bp-accent-soft)] text-2xl font-black text-[var(--bp-accent)]">{board.name.slice(0, 2).toUpperCase()}</div><h3 className="mt-3 truncate font-bold">{board.name}</h3><p className="mt-1 text-xs text-[var(--bp-muted)]">{board.isShared ? `Shared · ${board.accessRole}` : board.lastOpenedAt ? `Opened ${new Date(board.lastOpenedAt).toLocaleDateString()}` : 'Not opened yet'}</p></button><div className="mt-3 flex flex-wrap gap-2 text-xs">{board.isShared ? board.accessRole === 'editor' && <button type="button" onClick={onDuplicate} className="rounded-lg border border-[var(--bp-border)] px-2 py-1">Duplicate</button> : <><button type="button" onClick={onPin} className="rounded-lg border border-[var(--bp-border)] px-2 py-1">{board.isPinned ? 'Unpin' : 'Pin'}</button><button type="button" onClick={onArchive} className="rounded-lg border border-[var(--bp-border)] px-2 py-1">{board.isArchived ? 'Restore' : 'Archive'}</button><button type="button" onClick={onRename} className="rounded-lg border border-[var(--bp-border)] px-2 py-1">Rename</button><button type="button" onClick={onDuplicate} className="rounded-lg border border-[var(--bp-border)] px-2 py-1">Duplicate</button><button type="button" onClick={() => void onDelete()} className="rounded-lg border border-red-300 px-2 py-1 text-red-700">Delete</button></>}</div></article>
}
