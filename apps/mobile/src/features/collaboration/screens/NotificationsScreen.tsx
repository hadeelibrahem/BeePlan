import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { BottomNavBar, PrimaryButton, ScreenLayout } from '../../../components/layout';
import { useTheme } from '../../../theme/useTheme';
import { Avatar } from '../components/Avatar';
import {
  acceptInvite,
  declineInvite,
  getMyInvitations,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../api/collaboration.api';
import { friendlyError } from '../errorMessages';
import { NOTIFICATION_ICON, type AppNotification, type TaskInvitation } from '../types';
import { queryKeys } from '../../../lib/queryKeys';

type Props = {
  onBack: () => void;
  onSignOut?: () => void;
  onOpenTask: (taskId: string) => void;
};

export function NotificationsScreen({ onBack, onSignOut, onOpenTask }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const queryClient = useQueryClient();

  const [invitations, setInvitations] = useState<TaskInvitation[] | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [invites, notifs] = await Promise.all([getMyInvitations(), getNotifications(1, 20)]);
      setInvitations(invites);
      setNotifications(notifs.items);
      setHasMore(notifs.hasMore);
      setPage(1);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function flash(tone: 'success' | 'error', text: string) {
    setBanner({ tone, text });
    setTimeout(() => setBanner(null), 3000);
  }

  async function respond(invite: TaskInvitation, action: 'accept' | 'decline') {
    setBusy(invite.id);
    const snapshot = invitations ?? [];
    setInvitations((prev) => (prev ?? []).filter((i) => i.id !== invite.id));
    try {
      if (action === 'accept') {
        await acceptInvite(invite.taskId);
        flash('success', `You joined "${invite.taskTitle}".`);
        void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      } else {
        await declineInvite(invite.taskId);
        flash('success', 'Invitation declined.');
      }
    } catch (err) {
      setInvitations(snapshot);
      flash('error', friendlyError(err, 'Could not respond to the invitation.'));
    } finally {
      setBusy(null);
    }
  }

  async function openNotification(n: AppNotification) {
    if (!n.isRead) {
      setNotifications((prev) => (prev ?? []).map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      void markNotificationRead(n.id).catch(() => undefined);
    }
    if (n.taskId) onOpenTask(n.taskId);
  }

  async function markAll() {
    setNotifications((prev) => (prev ?? []).map((x) => ({ ...x, isRead: true })));
    try {
      await markAllNotificationsRead();
    } catch {
      /* non-fatal */
    }
  }

  async function loadMore() {
    try {
      const next = await getNotifications(page + 1, 20);
      setNotifications((prev) => [...(prev ?? []), ...next.items]);
      setHasMore(next.hasMore);
      setPage((p) => p + 1);
    } catch {
      /* ignore */
    }
  }

  const unread = (notifications ?? []).filter((n) => !n.isRead).length;

  return (
    <ScreenLayout
      headerSubtitle="Invitations, mentions & updates"
      onProfilePress={onSignOut}
      footer={<BottomNavBar active="reminders" onNavigateDashboard={onBack} />}
    >
      <View className="mb-3 flex-row items-center gap-2">
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          className="h-8 w-8 items-center justify-center rounded-full border active:opacity-70"
          style={{ borderColor: colors.border, backgroundColor: colors.surfaceElevated }}
        >
          <Text style={{ color: colors.text }} className="text-sm font-black">
            ←
          </Text>
        </Pressable>
        <Text style={{ color: colors.text }} className="text-lg font-black">
          Notifications
        </Text>
      </View>

      {banner ? (
        <View
          className="mb-3 rounded-xl px-3 py-2"
          style={{ backgroundColor: banner.tone === 'success' ? `${colors.success}26` : `${colors.error}26` }}
        >
          <Text style={{ color: banner.tone === 'success' ? colors.success : colors.error }} className="text-xs font-semibold">
            {banner.text}
          </Text>
        </View>
      ) : null}

      {loadError ? (
        <Pressable onPress={() => void load()} className="items-center rounded-2xl border p-4" style={{ borderColor: colors.border }}>
          <Text style={{ color: colors.error }} className="text-sm font-semibold">
            Couldn’t load. Tap to retry.
          </Text>
        </Pressable>
      ) : (
        <>
          {/* Invitations */}
          <Text style={{ color: colors.text }} className="mb-2 text-sm font-black">
            Invitations
          </Text>
          {invitations === null ? (
            <ActivityIndicator color={colors.accent} className="py-4" />
          ) : invitations.length === 0 ? (
            <View className="mb-4 rounded-2xl border border-dashed p-4" style={{ borderColor: colors.border }}>
              <Text style={{ color: colors.secondaryText }} className="text-center text-sm">
                No pending invitations.
              </Text>
            </View>
          ) : (
            <View className="mb-4 gap-2">
              {invitations.map((invite) => (
                <View
                  key={invite.id}
                  className="rounded-2xl border p-3"
                  style={{ borderColor: colors.border, backgroundColor: colors.card }}
                >
                  <View className="flex-row items-center gap-3">
                    <Avatar fullName={invite.invitedBy?.fullName ?? 'Someone'} avatarUrl={invite.invitedBy?.avatarUrl} size={40} />
                    <View className="flex-1">
                      <Text style={{ color: colors.text }} className="text-sm">
                        <Text className="font-black">{invite.invitedBy?.fullName ?? 'Someone'}</Text> invited you to{' '}
                        <Text className="font-black">"{invite.taskTitle}"</Text>
                      </Text>
                      <Text style={{ color: colors.secondaryText }} className="text-xs">
                        as {invite.role} · {formatTime(invite.invitedAt)}
                      </Text>
                    </View>
                  </View>
                  <View className="mt-3 flex-row gap-2">
                    <View className="flex-1">
                      <PrimaryButton size="sm" loading={busy === invite.id} onPress={() => void respond(invite, 'accept')}>
                        Accept
                      </PrimaryButton>
                    </View>
                    <Pressable
                      onPress={() => void respond(invite, 'decline')}
                      disabled={busy === invite.id}
                      className="flex-1 items-center justify-center rounded-xl border py-2.5"
                      style={{ borderColor: colors.border }}
                    >
                      <Text style={{ color: colors.text }} className="text-xs font-bold">
                        Decline
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Notifications */}
          <View className="mb-2 flex-row items-center justify-between">
            <Text style={{ color: colors.text }} className="text-sm font-black">
              Recent{unread ? ` · ${unread} new` : ''}
            </Text>
            {unread ? (
              <Pressable onPress={() => void markAll()}>
                <Text style={{ color: colors.accent }} className="text-xs font-bold">
                  Mark all read
                </Text>
              </Pressable>
            ) : null}
          </View>

          {notifications === null ? (
            <ActivityIndicator color={colors.accent} className="py-4" />
          ) : notifications.length === 0 ? (
            <View className="rounded-2xl border border-dashed p-6" style={{ borderColor: colors.border }}>
              <Text style={{ color: colors.secondaryText }} className="text-center text-sm">
                Nothing here yet.
              </Text>
            </View>
          ) : (
            <View className="gap-1.5">
              {notifications.map((n) => (
                <Pressable
                  key={n.id}
                  onPress={() => void openNotification(n)}
                  className="flex-row items-start gap-3 rounded-xl border px-3 py-3"
                  style={{
                    borderColor: n.isRead ? colors.border : colors.accent,
                    backgroundColor: n.isRead ? colors.card : `${colors.accent}0d`,
                  }}
                >
                  <Text className="text-lg">{NOTIFICATION_ICON[n.type] ?? '🔔'}</Text>
                  <View className="flex-1">
                    <Text style={{ color: colors.text }} className="text-sm font-bold">
                      {n.title}
                    </Text>
                    <Text style={{ color: colors.secondaryText }} className="text-xs" numberOfLines={2}>
                      {n.body}
                    </Text>
                    <Text style={{ color: colors.textSubtle }} className="text-[10px]">
                      {formatTime(n.sentAt)}
                    </Text>
                  </View>
                  {!n.isRead ? (
                    <View className="mt-1 h-2 w-2 rounded-full" style={{ backgroundColor: colors.accent }} />
                  ) : null}
                </Pressable>
              ))}
              {hasMore ? (
                <Pressable onPress={() => void loadMore()} className="items-center py-2">
                  <Text style={{ color: colors.secondaryText }} className="text-xs font-semibold">
                    Load more
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </>
      )}
    </ScreenLayout>
  );
}

function formatTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
