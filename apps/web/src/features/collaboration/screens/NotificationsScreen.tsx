import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  AppLayout,
  PageHeader,
  TopActionBar,
  type SidebarNavHandlers,
} from '../../../components/layout'
import { GhostButton, OutlineButton, PrimaryButton } from '../../../components/layout/Buttons'
import { FriendAvatar } from '../../social/components/FriendAvatar'
import { useLanguage } from '../../../i18n/LanguageContext'
import { useTheme } from '../../../theme/ThemeContext'
import {
  acceptInvite,
  declineInvite,
  getMyInvitations,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../api/collaboration.api'
import { friendlyError } from '../errorMessages'
import { NOTIFICATION_ICON } from '../notificationMeta'
import { Toast } from '../components/Toast'
import type { AppNotification, TaskInvitation } from '../types'

type Props = SidebarNavHandlers & {
  accessToken: string
  onOpenTask: (taskId: string) => void
  onSignOut: () => void
}

export function NotificationsScreen({ accessToken, onOpenTask, onSignOut, ...nav }: Props) {
  const { t, toggleLanguage } = useLanguage()
  const { mode, toggleTheme } = useTheme()
  const queryClient = useQueryClient()

  const [invitations, setInvitations] = useState<TaskInvitation[] | null>(null)
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)
  const [busyInvite, setBusyInvite] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState(false)

  const load = useCallback(async () => {
    setLoadError(false)
    try {
      const [invites, notifs] = await Promise.all([
        getMyInvitations(accessToken),
        getNotifications(accessToken, 1, 20),
      ])
      setInvitations(invites)
      setNotifications(notifs.items)
      setHasMore(notifs.hasMore)
      setPage(1)
    } catch {
      setLoadError(true)
    }
  }, [accessToken])

  useEffect(() => {
    void load()
  }, [load])

  async function respond(invite: TaskInvitation, action: 'accept' | 'decline') {
    setBusyInvite(invite.id)
    setError('')
    // Optimistic removal from the list.
    const snapshot = invitations ?? []
    setInvitations((prev) => (prev ?? []).filter((i) => i.id !== invite.id))
    try {
      if (action === 'accept') {
        await acceptInvite(invite.taskId, accessToken)
        setNotice(`You joined "${invite.taskTitle}".`)
        // The task is now visible to this user everywhere — refresh the cached
        // task lists and the shared-id set so it appears immediately.
        void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      } else {
        await declineInvite(invite.taskId, accessToken)
        setNotice('Invitation declined.')
      }
    } catch (err) {
      setInvitations(snapshot) // rollback
      setError(friendlyError(err, 'Could not respond to the invitation.'))
    } finally {
      setBusyInvite(null)
    }
  }

  async function openNotification(notification: AppNotification) {
    if (!notification.isRead) {
      setNotifications((prev) =>
        (prev ?? []).map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)),
      )
      void markNotificationRead(notification.id, accessToken).catch(() => undefined)
    }
    if (notification.taskId) onOpenTask(notification.taskId)
  }

  async function loadMore() {
    try {
      const next = await getNotifications(accessToken, page + 1, 20)
      setNotifications((prev) => [...(prev ?? []), ...next.items])
      setHasMore(next.hasMore)
      setPage((p) => p + 1)
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  async function markAll() {
    setNotifications((prev) => (prev ?? []).map((n) => ({ ...n, isRead: true })))
    try {
      await markAllNotificationsRead(accessToken)
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  const unread = (notifications ?? []).filter((n) => !n.isRead).length
  const visibleNotifications = (notifications ?? []).filter((n) => {
    const q = search.trim().toLowerCase()
    return !q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)
  })

  return (
    <AppLayout
      active="notifications"
      panelTitle="Notifications"
      panelCaption={unread ? `${unread} unread` : 'All caught up'}
      panelPercent={unread ? 100 : 0}
      {...nav}
    >
      <PageHeader
        title="Notifications"
        subtitle="Invitations, mentions, comments and task updates."
        toolbar={
          <TopActionBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search notifications"
            themeMode={mode}
            onToggleTheme={toggleTheme}
            languageLabel={t('common.languageToggle')}
            onToggleLanguage={toggleLanguage}
            onProfileClick={onSignOut}
          />
        }
      />

      {loadError ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-4 text-center">
          <p className="text-sm font-semibold text-red-300">Couldn’t load notifications.</p>
          <GhostButton size="sm" className="mt-2" onClick={() => void load()}>
            Retry
          </GhostButton>
        </div>
      ) : (
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Invitations */}
          <section aria-label="Pending invitations">
            <h2 className="mb-2 text-sm font-black">Invitations</h2>
            {invitations === null ? (
              <SkeletonList rows={1} />
            ) : invitations.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-[var(--bp-border)] px-4 py-6 text-center text-sm text-slate-400">
                No pending invitations.
              </p>
            ) : (
              <ul className="space-y-2">
                {invitations.map((invite) => (
                  <li
                    key={invite.id}
                    className="flex flex-col gap-3 rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4 sm:flex-row sm:items-center"
                    style={{ animation: 'bpToastIn 220ms ease-out' }}
                  >
                    <FriendAvatar
                      fullName={invite.invitedBy?.fullName ?? 'Someone'}
                      avatarUrl={invite.invitedBy?.avatarUrl}
                      size={42}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-[var(--bp-text)]">
                        <span className="font-black">{invite.invitedBy?.fullName ?? 'Someone'}</span>{' '}
                        invited you to collaborate on{' '}
                        <span className="font-black">"{invite.taskTitle}"</span>
                      </p>
                      <p className="text-xs text-slate-400">
                        as {invite.role} · {formatTime(invite.invitedAt)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <PrimaryButton
                        size="sm"
                        loading={busyInvite === invite.id}
                        onClick={() => void respond(invite, 'accept')}
                      >
                        Accept
                      </PrimaryButton>
                      <OutlineButton
                        size="sm"
                        disabled={busyInvite === invite.id}
                        onClick={() => void respond(invite, 'decline')}
                      >
                        Decline
                      </OutlineButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Notifications */}
          <section aria-label="Notifications">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-black">
                Recent{unread ? <span className="text-[var(--bp-accent)]"> · {unread} new</span> : null}
              </h2>
              {unread ? (
                <GhostButton size="sm" onClick={() => void markAll()}>
                  Mark all read
                </GhostButton>
              ) : null}
            </div>

            {notifications === null ? (
              <SkeletonList rows={4} />
            ) : visibleNotifications.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-[var(--bp-border)] px-4 py-8 text-center text-sm text-slate-400">
                {notifications.length === 0 ? 'Nothing here yet.' : 'No matching notifications.'}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {visibleNotifications.map((notification) => (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => void openNotification(notification)}
                      className={`flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition hover:border-[var(--bp-accent)]/40 ${
                        notification.isRead
                          ? 'border-[var(--bp-border)] bg-[var(--bp-surface)]'
                          : 'border-[var(--bp-accent)]/30 bg-[var(--bp-accent)]/5'
                      }`}
                    >
                      <span className="mt-0.5 text-lg" aria-hidden>
                        {NOTIFICATION_ICON[notification.type] ?? '🔔'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-[var(--bp-text)]">
                          {notification.title}
                        </span>
                        <span className="block truncate text-xs text-slate-400">{notification.body}</span>
                        <span className="block text-[10px] text-slate-500">
                          {formatTime(notification.sentAt)}
                        </span>
                      </span>
                      {!notification.isRead ? (
                        <span
                          className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--bp-accent)]"
                          aria-label="Unread"
                        />
                      ) : null}
                    </button>
                  </li>
                ))}
                {hasMore ? (
                  <GhostButton size="sm" className="w-full" onClick={() => void loadMore()}>
                    Load more
                  </GhostButton>
                ) : null}
              </ul>
            )}
          </section>
        </div>
      )}

      <Toast message={notice} tone="success" onDone={() => setNotice('')} />
      <Toast message={error} tone="error" onDone={() => setError('')} />
    </AppLayout>
  )
}

function SkeletonList({ rows }: { rows: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-[var(--bp-border)]/40" />
      ))}
    </div>
  )
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
