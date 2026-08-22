import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AppLayout,
  PageHeader,
  TopActionBar,
  type SidebarNavHandlers,
} from '../../../components/layout'
import { useLanguage } from '../../../i18n/LanguageContext'
import { useTheme } from '../../../theme/ThemeContext'
import {
  acceptFriendRequest,
  acceptLocationSharing,
  cancelFriendRequest,
  getFriendRequests,
  getFriends,
  getLocationSharing,
  searchFriendByUsername,
  rejectFriendRequest,
  rejectLocationSharing,
  removeFriend,
  revokeLocationSharing,
  sendFriendRequest,
} from '../api/social.api'
import { AddFriendForm } from '../components/AddFriendForm'
import { FriendListItem } from '../components/FriendListItem'
import { FriendAvatar } from '../components/FriendAvatar'
import { ReportUserModal } from '../../reports/components/ReportUserModal'
import { ConfirmDestructiveModal } from '../../../components/ConfirmDestructiveModal'
import type {
  FriendRequest,
  FriendSummary,
  LocationSharingPermission,
} from '../types/social.types'

type PeopleTab = 'friends' | 'sharing' | 'requests'
type FriendFilter = 'all' | 'active' | 'expired' | 'pending'
type SharingFilter = 'all' | 'withMe' | 'withOthers' | 'expired' | 'pending'

const statusStyles: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-600',
  expired: 'bg-slate-500/10 text-slate-500',
  pending: 'bg-amber-500/10 text-amber-600',
  none: 'bg-slate-500/10 text-[var(--bp-muted)]',
}

function CompactStatus({ label, tone }: { label: string; tone: keyof typeof statusStyles }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-bold ${statusStyles[tone]}`}>{label}</span>
}

function permissionForFriend(friendId: string, permissions: LocationSharingPermission[]) {
  return permissions.find((permission) => permission.friend?.userId === friendId) ?? null
}

function friendStatus(friend: FriendSummary, permissions: LocationSharingPermission[], t: (key: string, vars?: Record<string, string | number>) => string) {
  const status = permissionForFriend(friend.userId, permissions)?.status
  if (status === 'active') return { label: t('people.status.active'), tone: 'active' as const }
  if (status === 'expired') return { label: t('people.status.expired'), tone: 'expired' as const }
  if (status === 'pending') return { label: t('people.status.pending'), tone: 'pending' as const }
  return { label: t('people.status.notSharing'), tone: 'none' as const }
}

type Props = SidebarNavHandlers & {
  accessToken: string
  onSignOut?: () => void
}

export function SocialScreen({ accessToken, onSignOut, ...nav }: Props) {
  const { t, toggleLanguage } = useLanguage()
  const { mode, toggleTheme } = useTheme()
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<PeopleTab>('friends')
  const [friendFilter, setFriendFilter] = useState<FriendFilter>('all')
  const [sortBy, setSortBy] = useState<'name' | 'recent' | 'sharing'>('name')
  const [visibleCount, setVisibleCount] = useState(20)
  const [selectedFriend, setSelectedFriend] = useState<FriendSummary | null>(null)
  const [friends, setFriends] = useState<FriendSummary[]>([])
  const [requests, setRequests] = useState<FriendRequest[]>([])
  const [permissions, setPermissions] = useState<LocationSharingPermission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [permissionToRevoke, setPermissionToRevoke] = useState<LocationSharingPermission | null>(null)
  const [isRevoking, setIsRevoking] = useState(false)
  const [friendToRemove, setFriendToRemove] = useState<FriendSummary | null>(null)
  const [friendToReport, setFriendToReport] = useState<FriendSummary | null>(null)
  const [isRemovingFriend, setIsRemovingFriend] = useState(false)

  const refresh = useCallback(async () => {
    if (!accessToken) return
    try {
      const [f, r, p] = await Promise.all([
        getFriends(accessToken),
        getFriendRequests(accessToken),
        getLocationSharing(accessToken),
      ])
      setFriends(f)
      setRequests(r)
      setPermissions(p)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('people.errors.load'))
    } finally {
      setLoading(false)
    }
  }, [accessToken, t])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const run = useCallback(
    async (action: () => Promise<unknown>, successMessage?: string) => {
      setError('')
      setNotice('')
      try {
        await action()
        if (successMessage) setNotice(successMessage)
        await refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : t('common.somethingWentWrong'))
      }
    },
    [refresh, t],
  )

  const incoming = requests.filter((r) => r.direction === 'incoming')
  const outgoing = requests.filter((r) => r.direction === 'outgoing')
  const incomingSharing = permissions.filter((p) => p.direction === 'incoming')

  const filteredFriends = useMemo(() => {
    const q = search.trim().toLowerCase()
    const matching = friends.filter(
      (f) => f.fullName.toLowerCase().includes(q) || f.username.toLowerCase().includes(q),
    )
    const statusMatches = matching.filter((friend) => {
      const permission = permissionForFriend(friend.userId, permissions)
      if (friendFilter === 'all') return true
      if (friendFilter === 'active') return permission?.status === 'active'
      if (friendFilter === 'expired') return permission?.status === 'expired'
      return permission?.status === 'pending'
    })
    return [...statusMatches].sort((a, b) => {
      if (sortBy === 'sharing') return (permissionForFriend(a.userId, permissions)?.status ?? 'none').localeCompare(permissionForFriend(b.userId, permissions)?.status ?? 'none')
      if (sortBy === 'recent') return friends.indexOf(b) - friends.indexOf(a)
      return a.fullName.localeCompare(b.fullName)
    })
  }, [friends, friendFilter, permissions, search, sortBy])

  useEffect(() => setVisibleCount(20), [search, friendFilter, sortBy, tab])

  const handleRemoveFriend = (friend: FriendSummary) => {
    setFriendToRemove(friend)
  }

  async function confirmRemoveFriend() {
    if (!friendToRemove || isRemovingFriend) return
    setIsRemovingFriend(true)
    await run(() => removeFriend(friendToRemove.userId, accessToken), t('people.friends.removed'))
    setIsRemovingFriend(false)
    setFriendToRemove(null)
  }

  async function confirmRevoke() {
    if (!permissionToRevoke || isRevoking) return
    setIsRevoking(true)
    await run(() => revokeLocationSharing(permissionToRevoke.id, accessToken), t('people.sharing.revoked'))
    setIsRevoking(false)
    setPermissionToRevoke(null)
  }

  return (
    <AppLayout
      active="people"
      panelTitle={t('people.panelTitle')}
      panelCaption={t('people.panelCaption', { count: friends.length })}
      panelPercent={friends.length > 0 ? 100 : 0}
      {...nav}
    >
      <PageHeader
        title={t('people.title')}
        subtitle={t('people.subtitle')}
        toolbar={
          <TopActionBar pageOnly
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder={t('people.searchPlaceholder')}
            themeMode={mode}
            onToggleTheme={toggleTheme}
            languageLabel={t('common.languageToggle')}
            onToggleLanguage={toggleLanguage}
            onOpenNotifications={nav.onNavigateNotifications}
            onSignOut={onSignOut}
          />
        }
      />

      {error && <p className="mb-3 text-sm text-rose-500">{error}</p>}
      {notice && <p className="mb-3 text-sm text-emerald-500">{notice}</p>}

      <div className="mb-6">
        <AddFriendForm onSearch={(username) => searchFriendByUsername(username, accessToken)} onAdd={(username) => sendFriendRequest(username, accessToken).then(() => undefined)} />
      </div>

      <div className="mb-5 flex gap-1 border-b border-[var(--bp-border)]" role="tablist" aria-label={t('people.title')}>
        {(['friends', 'sharing', 'requests'] as PeopleTab[]).map((value) => <button key={value} type="button" role="tab" aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)} onKeyDown={(event) => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); const index = ['friends', 'sharing', 'requests'].indexOf(value); setTab(['friends', 'sharing', 'requests'][(index + (event.key === 'ArrowRight' ? 1 : 2)) % 3] as PeopleTab) } }} className={`border-b-2 px-4 py-2.5 text-sm font-bold transition ${tab === value ? 'border-[var(--bp-accent)] text-[var(--bp-accent-ink)]' : 'border-transparent text-[var(--bp-muted)] hover:text-[var(--bp-text)]'}`}>{value === 'friends' ? `${t('people.friends.title')} (${friends.length})` : value[0].toUpperCase() + value.slice(1)}</button>)}
      </div>

      {tab === 'friends' ? <section role="tabpanel" className="overflow-hidden rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--bp-border)] p-4"><div><h2 className="text-base font-black text-[var(--bp-text)]">{t('people.friends.title')} ({friends.length})</h2><p className="mt-0.5 text-xs text-[var(--bp-muted)]">{t('people.subtitle')}</p></div><div className="flex w-full flex-wrap gap-2 sm:w-auto"><input aria-label={t('people.searchPlaceholder')} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('people.searchPlaceholder')} className="min-w-48 flex-1 rounded-xl border border-[var(--bp-border)] bg-[var(--bp-bg)] px-3 py-2 text-sm text-[var(--bp-text)] outline-none focus:border-[var(--bp-accent)]" /><select aria-label={t('people.searchPlaceholder')} value={friendFilter} onChange={(event) => setFriendFilter(event.target.value as FriendFilter)} className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-bg)] px-3 py-2 text-xs font-bold text-[var(--bp-text)]"><option value="all">{t('common.show')}</option><option value="active">{t('people.sharing.approved')}</option><option value="expired">{t('sharedFocusRooms.invitationStatus.expired')}</option><option value="pending">{t('people.requests.pending')}</option></select><select aria-label={t('people.title')} value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)} className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-bg)] px-3 py-2 text-xs font-bold text-[var(--bp-text)]"><option value="name">{t('people.title')}</option><option value="recent">{t('people.title')}</option><option value="sharing">{t('people.sharing.title')}</option></select></div></div>
        {loading ? <div className="px-4 py-10 text-center text-sm text-[var(--bp-muted)]">{t('sharedFocusRooms.creating')}</div> : filteredFriends.length === 0 ? <div className="px-4 py-10 text-center"><p className="text-sm font-bold text-[var(--bp-text)]">{friends.length === 0 ? t('people.friends.empty') : t('people.friends.noMatch')}</p><p className="mt-1 text-xs text-[var(--bp-muted)]">{friends.length === 0 ? t('people.friends.empty') : t('people.friends.noMatch')}</p></div> : <div className="p-2">{filteredFriends.slice(0, visibleCount).map((friend) => <div key={friend.userId} onDoubleClick={() => setSelectedFriend(friend)}><FriendListItem friend={friend} onRemove={handleRemoveFriend} onReport={setFriendToReport} onSelect={setSelectedFriend} /></div>)}{visibleCount < filteredFriends.length ? <div className="px-2 py-3"><button type="button" onClick={() => setVisibleCount((value) => value + 20)} className="w-full rounded-xl border border-[var(--bp-border)] px-3 py-2 text-xs font-bold text-[var(--bp-text)] hover:bg-[var(--bp-bg)]">{t('common.show')} ({filteredFriends.length - visibleCount})</button></div> : null}</div>}
      </section> : null}

      {tab === 'sharing' ? <SharingTab permissions={permissions} onApprove={(id) => void run(() => acceptLocationSharing(id, accessToken), t('people.sharing.approved'))} onReject={(id) => void run(() => rejectLocationSharing(id, accessToken))} onRevoke={(permission) => setPermissionToRevoke(permission)} /> : null}

      {tab === 'requests' ? <RequestsTab incoming={incoming} outgoing={outgoing} incomingSharing={incomingSharing} onAccept={(id) => void run(() => acceptFriendRequest(id, accessToken), t('people.requests.added'))} onDecline={(id) => void run(() => rejectFriendRequest(id, accessToken))} onCancel={(id) => void run(() => cancelFriendRequest(id, accessToken), t('people.requests.cancelled'))} onApprove={(id) => void run(() => acceptLocationSharing(id, accessToken), t('people.sharing.approved'))} onReject={(id) => void run(() => rejectLocationSharing(id, accessToken))} /> : null}
      <FriendDetailsDrawer friend={selectedFriend} permission={selectedFriend ? permissionForFriend(selectedFriend.userId, permissions) : null} onClose={() => setSelectedFriend(null)} onRemove={handleRemoveFriend} onRevoke={(permission) => setPermissionToRevoke(permission)} />
      <ConfirmDestructiveModal open={permissionToRevoke !== null} title={t('people.sharing.revoke')} message={t('people.sharing.revokeMessage', { name: permissionToRevoke?.friend?.fullName ?? t('people.sharing.aFriend') })} confirmLabel={t('people.sharing.revokeAccess')} isConfirming={isRevoking} onCancel={() => !isRevoking && setPermissionToRevoke(null)} onConfirm={() => void confirmRevoke()} />
      <ConfirmDestructiveModal open={friendToRemove !== null} title={t('people.friends.removeConfirm', { name: friendToRemove?.fullName ?? t('people.title') })} message={t('people.friends.removeMessage', { name: friendToRemove?.fullName ?? t('people.sharing.aFriend') })} confirmLabel={t('people.friends.remove')} isConfirming={isRemovingFriend} onCancel={() => !isRemovingFriend && setFriendToRemove(null)} onConfirm={() => void confirmRemoveFriend()} />
      {friendToReport ? <ReportUserModal user={{ id: friendToReport.userId, fullName: friendToReport.fullName }} accessToken={accessToken} open onClose={() => setFriendToReport(null)} onSubmitted={() => setNotice(t('people.friends.reportSubmitted'))} /> : null}
    </AppLayout>
  )
}

function SharingTab({ permissions, onApprove, onReject, onRevoke }: { permissions: LocationSharingPermission[]; onApprove: (id: string) => void; onReject: (id: string) => void; onRevoke: (permission: LocationSharingPermission) => void }) {
  const { t } = useLanguage()
  const [filter, setFilter] = useState<SharingFilter>('all')
  const visible = permissions.filter((permission) => filter === 'all' || filter === 'expired' && permission.status === 'expired' || filter === 'pending' && permission.status === 'pending' || filter === 'withMe' && permission.direction === 'incoming' || filter === 'withOthers' && permission.direction === 'outgoing')
  return <section role="tabpanel" className="overflow-hidden rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)]"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--bp-border)] p-4"><div><h2 className="text-base font-black text-[var(--bp-text)]">{t('people.sharing.title')}</h2><p className="mt-1 text-xs text-[var(--bp-muted)]">{t('people.sharing.explainer')}</p></div><select aria-label={t('people.sharing.title')} value={filter} onChange={(event) => setFilter(event.target.value as SharingFilter)} className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-bg)] px-3 py-2 text-xs font-bold text-[var(--bp-text)]"><option value="all">{t('common.show')}</option><option value="withMe">{t('people.sharing.withMe')}</option><option value="withOthers">{t('people.sharing.withOthers')}</option><option value="expired">{t('people.status.expired')}</option><option value="pending">{t('people.status.pending')}</option></select></div>{visible.length === 0 ? <div className="px-4 py-10 text-center"><p className="text-sm font-bold text-[var(--bp-text)]">{t('people.sharing.empty')}</p><p className="mt-1 text-xs text-[var(--bp-muted)]">{t('people.sharing.explainer')}</p></div> : <div className="p-2">{visible.map((permission) => { const name = permission.friend?.fullName ?? t('people.sharing.aFriend'); const sentence = permission.direction === 'incoming' ? t('people.sharing.incomingSentence', { name }) : t('people.sharing.outgoingSentence', { name }); const statusLabel = permission.status === 'active' ? t('people.status.active') : permission.status === 'pending' ? t('people.status.pending') : permission.status === 'expired' ? t('people.status.expired') : t('people.status.notSharing'); return <div key={permission.id} className="flex min-h-16 items-center gap-3 border-b border-[var(--bp-border)] px-2 py-3 last:border-0"><FriendAvatar fullName={name} avatarUrl={permission.friend?.avatarUrl} size={36} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[var(--bp-text)]">{sentence}</p><p className="mt-0.5 text-[11px] text-[var(--bp-muted)]">{permission.expiresAt ? t('people.sharing.expires', { date: new Date(permission.expiresAt).toLocaleDateString() }) : t('people.sharing.noExpiration')}</p></div><CompactStatus label={statusLabel} tone={permission.status === 'active' ? 'active' : permission.status === 'pending' ? 'pending' : 'expired'} />{permission.status === 'pending' ? <div className="flex gap-1"><button type="button" onClick={() => onApprove(permission.id)} className="rounded-lg px-2 py-1 text-xs font-bold text-emerald-600 hover:bg-emerald-500/10">{t('people.requests.accept')}</button><button type="button" onClick={() => onReject(permission.id)} className="rounded-lg px-2 py-1 text-xs font-bold text-rose-600 hover:bg-rose-500/10">{t('people.requests.decline')}</button></div> : permission.status === 'active' ? <button type="button" onClick={() => onRevoke(permission)} className="rounded-lg px-2 py-1 text-xs font-bold text-rose-600 hover:bg-rose-500/10">{t('people.sharing.revoke')}</button> : null}</div> })}</div>}</section>
}

function RequestsTab({ incoming, outgoing, incomingSharing, onAccept, onDecline, onCancel, onApprove, onReject }: { incoming: FriendRequest[]; outgoing: FriendRequest[]; incomingSharing: LocationSharingPermission[]; onAccept: (id: string) => void; onDecline: (id: string) => void; onCancel: (id: string) => void; onApprove: (id: string) => void; onReject: (id: string) => void }) {
  const { t } = useLanguage()
  const [filter, setFilter] = useState<'all' | 'friends' | 'locations'>('all')
  const pendingSharing = incomingSharing.filter((permission) => permission.status === 'pending')
  const total = incoming.length + outgoing.length + pendingSharing.length
  const showFriends = filter !== 'locations'
  const showLocations = filter !== 'friends'

  return <section role="tabpanel" className="overflow-hidden rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)]">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--bp-border)] p-4"><div><h2 className="text-base font-black text-[var(--bp-text)]">{t('people.requests.title')}</h2><p className="mt-1 text-xs text-[var(--bp-muted)]">{t('people.subtitle')}</p></div><div className="flex gap-1 rounded-xl bg-[var(--bp-bg)] p-1">{[['all', t('people.requests.all')], ['friends', t('people.requests.friendRequests')], ['locations', t('people.requests.locationRequests')]].map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value as typeof filter)} className={`rounded-lg px-2.5 py-1.5 text-xs font-bold ${filter === value ? 'bg-[var(--bp-surface)] text-[var(--bp-text)] shadow-sm' : 'text-[var(--bp-muted)]'}`}>{label}</button>)}</div></div>
    {total === 0 ? <div className="px-4 py-10 text-center"><p className="text-sm font-bold text-[var(--bp-text)]">{t('people.requests.noIncoming')}</p><p className="mt-1 text-xs text-[var(--bp-muted)]">{t('people.requests.noIncoming')}</p></div> : <div className="p-2">
      {showFriends ? incoming.map((request) => <RequestRow key={request.id} name={request.user.fullName} username={request.user.username} avatar={request.user.avatarUrl} label={t('people.requests.title')} date={request.createdAt} action={<><button type="button" onClick={() => onAccept(request.id)} className="rounded-lg px-2 py-1 text-xs font-bold text-emerald-600 hover:bg-emerald-500/10">{t('people.requests.accept')}</button><button type="button" onClick={() => onDecline(request.id)} className="rounded-lg px-2 py-1 text-xs font-bold text-rose-600 hover:bg-rose-500/10">{t('people.requests.decline')}</button></>} />) : null}
      {showFriends ? outgoing.map((request) => <RequestRow key={request.id} name={request.user.fullName} username={request.user.username} avatar={request.user.avatarUrl} label={t('people.requests.pending')} date={request.createdAt} action={<button type="button" onClick={() => onCancel(request.id)} className="rounded-lg px-2 py-1 text-xs font-bold text-rose-600 hover:bg-rose-500/10">{t('people.requests.cancel')}</button>} />) : null}
      {showLocations ? pendingSharing.map((permission) => <div key={permission.id} className="flex min-h-16 items-center gap-3 border-b border-[var(--bp-border)] px-2 py-3"><FriendAvatar fullName={permission.friend?.fullName ?? 'A friend'} avatarUrl={permission.friend?.avatarUrl} size={36} /><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-[var(--bp-text)]">{permission.friend?.fullName ?? 'A friend'}</p><p className="text-[11px] text-[var(--bp-muted)]">{t('people.sharing.title')} · {new Date(permission.createdAt).toLocaleDateString()}</p></div><CompactStatus label={t('people.requests.pending')} tone="pending" /><button type="button" onClick={() => onApprove(permission.id)} className="rounded-lg px-2 py-1 text-xs font-bold text-emerald-600 hover:bg-emerald-500/10">{t('people.requests.accept')}</button><button type="button" onClick={() => onReject(permission.id)} className="rounded-lg px-2 py-1 text-xs font-bold text-rose-600 hover:bg-rose-500/10">{t('people.requests.decline')}</button></div>) : null}
    </div>}
  </section>
}

function RequestRow({ name, username, avatar, label, date, action }: { name: string; username: string; avatar: string | null; label: string; date: string; action: React.ReactNode; key?: string }) {
  const { t } = useLanguage()
  const pending = label === t('people.requests.pending')
  return <div className="flex min-h-16 items-center gap-3 border-b border-[var(--bp-border)] px-2 py-3"><FriendAvatar fullName={name} avatarUrl={avatar} size={36} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[var(--bp-text)]">{name}</p><p className="truncate text-[11px] text-[var(--bp-muted)]">@{username} · {label} · {new Date(date).toLocaleDateString()}</p></div><CompactStatus label={pending ? t('people.requests.pending') : t('people.requests.new')} tone={pending ? 'pending' : 'active'} />{action}</div>
}

function FriendDetailsDrawer({ friend, permission, onClose, onRemove, onRevoke }: { friend: FriendSummary | null; permission: LocationSharingPermission | null; onClose: () => void; onRemove: (friend: FriendSummary) => void; onRevoke: (permission: LocationSharingPermission) => void }) {
  const { t } = useLanguage()
  useEffect(() => { if (!friend) return; const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }; window.addEventListener('keydown', handleKey); return () => window.removeEventListener('keydown', handleKey) }, [friend, onClose])
  if (!friend) return null
  const status = friendStatus(friend, permission ? [permission] : [], t)
  return <div className="fixed inset-0 z-40"><button type="button" aria-label={t('people.requests.decline')} onClick={onClose} className="absolute inset-0 bg-slate-950/20" /><aside role="dialog" aria-modal="true" aria-label={`${friend.fullName} details`} className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-[var(--bp-border)] bg-[var(--bp-surface)] p-6 shadow-2xl"><button type="button" onClick={onClose} className="float-right rounded-lg px-2 py-1 text-xl text-[var(--bp-muted)] hover:bg-[var(--bp-bg)]" aria-label={t('people.requests.decline')}>×</button><div className="pt-8 text-center"><div className="flex justify-center"><FriendAvatar fullName={friend.fullName} avatarUrl={friend.avatarUrl} size={72} /></div><h2 className="mt-4 text-xl font-black text-[var(--bp-text)]">{friend.fullName}</h2><p className="mt-1 text-sm text-[var(--bp-muted)]">@{friend.username}</p><div className="mt-3"><CompactStatus label={status.label} tone={status.tone} /></div></div><div className="mt-8 space-y-4 border-t border-[var(--bp-border)] pt-5"><div><p className="text-xs font-bold uppercase tracking-wide text-[var(--bp-muted)]">{t('people.sharing.title')}</p><p className="mt-1 text-sm font-semibold text-[var(--bp-text)]">{permission ? permission.status : 'Not sharing'}</p></div>{permission?.expiresAt ? <div><p className="text-xs font-bold uppercase tracking-wide text-[var(--bp-muted)]">{t('people.permissions.title')}</p><p className="mt-1 text-sm text-[var(--bp-text)]">{new Date(permission.expiresAt).toLocaleString()}</p></div> : null}<div className="flex flex-wrap gap-2"><button type="button" onClick={() => onRemove(friend)} className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-500/15">{t('people.friends.remove')}</button>{permission?.status === 'active' ? <button type="button" onClick={() => onRevoke(permission)} className="rounded-xl border border-[var(--bp-border)] px-3 py-2 text-xs font-bold text-[var(--bp-text)] hover:bg-[var(--bp-bg)]">{t('people.sharing.revoke')}</button> : null}</div></div></aside></div>
}











