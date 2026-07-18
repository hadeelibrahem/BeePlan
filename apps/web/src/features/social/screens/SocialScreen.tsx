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
  rejectFriendRequest,
  rejectLocationSharing,
  removeFriend,
  revokeLocationSharing,
  sendFriendRequest,
} from '../api/social.api'
import { AddFriendForm } from '../components/AddFriendForm'
import { FriendListItem } from '../components/FriendListItem'
import { FriendRequestItem } from '../components/FriendRequestItem'
import { LocationSharingRequestItem } from '../components/LocationSharingRequestItem'
import { PermissionCard } from '../components/PermissionCard'
import { ConfirmDestructiveModal } from '../../../components/ConfirmDestructiveModal'
import type {
  FriendRequest,
  FriendSummary,
  LocationSharingPermission,
} from '../types/social.types'

type Props = SidebarNavHandlers & {
  accessToken: string
  onSignOut?: () => void
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-5">
      <h3 className="text-sm font-bold text-[var(--bp-text)]">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  )
}

export function SocialScreen({ accessToken, onSignOut, ...nav }: Props) {
  const { t, toggleLanguage } = useLanguage()
  const { mode, toggleTheme } = useTheme()
  const [search, setSearch] = useState('')
  const [friends, setFriends] = useState<FriendSummary[]>([])
  const [requests, setRequests] = useState<FriendRequest[]>([])
  const [permissions, setPermissions] = useState<LocationSharingPermission[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [permissionToRevoke, setPermissionToRevoke] = useState<LocationSharingPermission | null>(null)
  const [isRevoking, setIsRevoking] = useState(false)
  const [friendToRemove, setFriendToRemove] = useState<FriendSummary | null>(null)
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
  const outgoingSharing = permissions.filter((p) => p.direction === 'outgoing')

  const filteredFriends = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return friends
    return friends.filter(
      (f) => f.fullName.toLowerCase().includes(q) || f.email.toLowerCase().includes(q),
    )
  }, [friends, search])

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
          <TopActionBar
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Friends */}
        <Card title={t('people.friends.title')}>
          {filteredFriends.length === 0 ? (
            <p className="text-xs text-slate-400">
              {friends.length === 0 ? t('people.friends.empty') : t('people.friends.noMatch')}
            </p>
          ) : (
            <div>
              {filteredFriends.map((friend) => (
                <FriendListItem key={friend.userId} friend={friend} onRemove={handleRemoveFriend} />
              ))}
            </div>
          )}
        </Card>

        {/* Add a friend */}
        <AddFriendForm onAdd={(email) => sendFriendRequest(email, accessToken).then(() => undefined)} />

        {/* Friend requests */}
        <Card title={t('people.requests.title')}>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {t('people.requests.incoming')}
          </p>
          {incoming.length === 0 ? (
            <p className="text-xs text-slate-400">{t('people.requests.noIncoming')}</p>
          ) : (
            incoming.map((req) => (
              <FriendRequestItem
                key={req.id}
                request={req}
                direction="incoming"
                onAccept={(id) => void run(() => acceptFriendRequest(id, accessToken), t('people.requests.added'))}
                onDecline={(id) => void run(() => rejectFriendRequest(id, accessToken))}
              />
            ))
          )}

          <p className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {t('people.requests.outgoing')}
          </p>
          {outgoing.length === 0 ? (
            <p className="text-xs text-slate-400">{t('people.requests.noOutgoing')}</p>
          ) : (
            outgoing.map((req) => (
              <FriendRequestItem
                key={req.id}
                request={req}
                direction="outgoing"
                onCancel={(id) => void run(() => cancelFriendRequest(id, accessToken), t('people.requests.cancelled'))}
              />
            ))
          )}
        </Card>

        {/* Location sharing requests */}
        <Card title={t('people.sharing.title')}>
          <p className="mb-2 text-[11px] text-slate-400">{t('people.sharing.explainer')}</p>
          {incomingSharing.length === 0 ? (
            <p className="text-xs text-slate-400">{t('people.sharing.empty')}</p>
          ) : (
            incomingSharing.map((perm) => (
              <LocationSharingRequestItem
                key={perm.id}
                permission={perm}
                onApprove={(id) => void run(() => acceptLocationSharing(id, accessToken), t('people.sharing.approved'))}
                onReject={(id) => void run(() => rejectLocationSharing(id, accessToken))}
                onRevoke={(id) => setPermissionToRevoke(incomingSharing.find((permission) => permission.id === id) ?? null)}
              />
            ))
          )}
        </Card>

        {/* My permissions */}
        <section className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-5 lg:col-span-2">
          <h3 className="text-sm font-bold text-[var(--bp-text)]">{t('people.permissions.title')}</h3>

          <p className="mb-2 mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {t('people.permissions.granted')}
          </p>
          {incomingSharing.length === 0 ? (
            <p className="text-xs text-slate-400">{t('people.permissions.noneGranted')}</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {incomingSharing.map((perm) => (
                <PermissionCard key={perm.id} permission={perm} />
              ))}
            </div>
          )}

          <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {t('people.permissions.requested')}
          </p>
          {outgoingSharing.length === 0 ? (
            <p className="text-xs text-slate-400">{t('people.permissions.noneRequested')}</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {outgoingSharing.map((perm) => (
                <PermissionCard key={perm.id} permission={perm} />
              ))}
            </div>
          )}
        </section>
      </div>
      <ConfirmDestructiveModal open={permissionToRevoke !== null} title="Revoke location sharing?" message={`${permissionToRevoke?.friend?.fullName ?? t('people.sharing.aFriend')} will no longer be able to see your shared location.`} confirmLabel="Revoke access" isConfirming={isRevoking} onCancel={() => !isRevoking && setPermissionToRevoke(null)} onConfirm={() => void confirmRevoke()} />
      <ConfirmDestructiveModal open={friendToRemove !== null} title="Remove friend?" message={`${friendToRemove?.fullName ?? 'This person'} will no longer be connected to you on BeePlan.`} confirmLabel="Remove friend" isConfirming={isRemovingFriend} onCancel={() => !isRemovingFriend && setFriendToRemove(null)} onConfirm={() => void confirmRemoveFriend()} />
    </AppLayout>
  )
}
