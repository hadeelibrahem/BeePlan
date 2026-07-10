import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import {
  BottomNavBar,
  DangerButton,
  InputField,
  OutlineButton,
  PrimaryButton,
  ScreenLayout,
  SecondaryButton,
} from '../../../components/layout';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useTheme } from '../../../theme/useTheme';
import { requestForegroundLocationPermission } from '../../../lib/location';
import { requestNotificationPermission, showPersonNearbyNotification } from '../../../lib/notifications';
import { runProximityDiagnostics, startProximityMonitor } from '../../../services/proximityMonitor';
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
} from '../api/social.api';
import type {
  FriendRequest,
  FriendSummary,
  LocationSharingPermission,
  PermissionStatus,
} from '../types/social.types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Props = {
  onBack: () => void;
  onSignOut?: () => void;
};

export function PeopleScreen({ onBack, onSignOut }: Props) {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const { colors } = theme;

  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [permissions, setPermissions] = useState<LocationSharingPermission[]>([]);
  const [search, setSearch] = useState('');
  const [email, setEmail] = useState('');
  const [addingFriend, setAddingFriend] = useState(false);
  const [addError, setAddError] = useState('');

  const PERMISSION_LABELS: Record<PermissionStatus, string> = {
    pending: t('reminders.person.status.pending'),
    active: t('reminders.person.status.active'),
    expired: t('reminders.person.status.expired'),
    revoked: t('reminders.person.status.revoked'),
    rejected: t('reminders.person.status.rejected'),
  };

  const refresh = useCallback(async () => {
    try {
      const [f, r, p] = await Promise.all([getFriends(), getFriendRequests(), getLocationSharing()]);
      setFriends(f);
      setRequests(r);
      setPermissions(p);
    } catch (error) {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('people.errors.load'));
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async (action: () => Promise<unknown>, successMessage?: string) => {
      try {
        await action();
        if (successMessage) Alert.alert(t('common.done'), successMessage);
        await refresh();
      } catch (error) {
        Alert.alert(t('common.error'), error instanceof Error ? error.message : t('common.somethingWentWrong'));
      }
    },
    [refresh, t],
  );

  const handleAddFriend = async () => {
    setAddError('');
    if (!EMAIL_RE.test(email.trim())) {
      setAddError(t('people.addFriend.invalidEmail'));
      return;
    }
    setAddingFriend(true);
    try {
      await sendFriendRequest(email.trim().toLowerCase());
      setEmail('');
      Alert.alert(t('common.done'), t('people.addFriend.sent'));
      await refresh();
    } catch (error) {
      setAddError(error instanceof Error ? error.message : t('common.somethingWentWrong'));
    } finally {
      setAddingFriend(false);
    }
  };

  const handleRemoveFriend = (friend: FriendSummary) => {
    Alert.alert(
      t('people.friends.remove'),
      t('people.friends.removeConfirm', { name: friend.fullName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('people.friends.remove'),
          style: 'destructive',
          onPress: () => void run(() => removeFriend(friend.userId), t('people.friends.removed')),
        },
      ],
    );
  };

  // When the OWNER approves sharing, start posting snapshots immediately — the
  // friend's reminder can't fire until this device is sending its location.
  const handleAcceptSharing = async (id: string) => {
    try {
      await acceptLocationSharing(id);
      const granted = await requestForegroundLocationPermission();
      if (granted) void startProximityMonitor();
      Alert.alert(
        t('people.sharing.approved'),
        granted ? t('people.sharing.approvedGranted') : t('people.sharing.approvedNoLocation'),
      );
      await refresh();
    } catch (error) {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('common.somethingWentWrong'));
    }
  };

  async function handleSendTestNotification() {
    const notifGranted = await requestNotificationPermission();
    const id = await showPersonNearbyNotification({
      title: 'BeePlan test notification',
      body: 'If you can see this, local notifications work in the foreground.',
    });
    Alert.alert('Test notification', `Notification permission: ${notifGranted ? 'granted' : 'DENIED'}\nScheduled: ${id ? `yes (id ${id})` : 'no'}`);
  }

  async function handleRunDiagnostics() {
    const r = await runProximityDiagnostics();
    Alert.alert(
      'Proximity diagnostics',
      [
        `1. Location permission: ${r.locationPermission ? 'granted' : 'DENIED'}`,
        `2. Snapshot: ${r.snapshot ? `${r.snapshot.latitude.toFixed(5)}, ${r.snapshot.longitude.toFixed(5)}` : 'NONE'}`,
        `3. Snapshot sent to API: ${r.snapshotSent ? 'yes' : 'no'}`,
        `4. /nearby returned: ${r.nearbyCount} reminder(s)`,
        `5. Notifications fired: ${r.notificationsFired}`,
        r.hits.length ? `Hits: ${r.hits.map((h) => h.title).join(', ')}` : '',
        r.error ? `Error: ${r.error}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  const incomingRequests = requests.filter((r) => r.direction === 'incoming');
  const outgoingRequests = requests.filter((r) => r.direction === 'outgoing');
  const incomingSharing = permissions.filter((p) => p.direction === 'incoming');
  const outgoingSharing = permissions.filter((p) => p.direction === 'outgoing');

  const filteredFriends = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((f) => f.fullName.toLowerCase().includes(q) || f.email.toLowerCase().includes(q));
  }, [friends, search]);

  const cardStyle = { borderColor: colors.border, backgroundColor: colors.surface };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
  };

  return (
    <ScreenLayout
      headerSubtitle={t('people.subtitle')}
      onProfilePress={onSignOut}
      footer={<BottomNavBar active="reminders" onNavigateDashboard={onBack} />}
    >
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        className="mb-3 h-8 w-8 items-center justify-center rounded-full border active:opacity-70"
        style={{ borderColor: colors.border, backgroundColor: colors.surfaceElevated }}
      >
        <Text className="text-sm font-black" style={{ color: colors.text }}>{'←'}</Text>
      </Pressable>

      {/* Friends */}
      <View className="mb-4 rounded-2xl border p-4" style={cardStyle}>
        <Text className="mb-2 text-sm font-black" style={{ color: colors.text }}>{t('people.friends.title')}</Text>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('people.searchPlaceholder')}
          placeholderTextColor={colors.placeholder}
          className="mb-2 rounded-xl border px-3 py-2 text-sm"
          style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }}
        />
        {filteredFriends.length === 0 ? (
          <Text className="text-xs" style={{ color: colors.secondaryText }}>
            {friends.length === 0 ? t('people.friends.empty') : t('people.friends.noMatch')}
          </Text>
        ) : (
          filteredFriends.map((friend) => (
            <View key={friend.userId} className="flex-row items-center justify-between border-b py-2.5" style={{ borderColor: colors.border }}>
              <View className="min-w-0 flex-1 pr-2">
                <Text className="text-sm font-semibold" style={{ color: colors.text }}>{friend.fullName}</Text>
                <Text className="text-[11px]" style={{ color: colors.secondaryText }}>{friend.email}</Text>
              </View>
              <DangerButton size="sm" onPress={() => handleRemoveFriend(friend)}>{t('people.friends.remove')}</DangerButton>
            </View>
          ))
        )}
      </View>

      {/* Add friend */}
      <View className="mb-4 rounded-2xl border p-4" style={cardStyle}>
        <Text className="mb-2 text-sm font-black" style={{ color: colors.text }}>{t('people.addFriend.title')}</Text>
        <InputField
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            setAddError('');
          }}
          placeholder={t('people.addFriend.placeholder')}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        {!!addError && <Text className="mb-1 text-xs" style={{ color: colors.error }}>{addError}</Text>}
        <PrimaryButton onPress={() => void handleAddFriend()} disabled={!email.trim() || addingFriend} loading={addingFriend} size="sm">
          {t('people.addFriend.send')}
        </PrimaryButton>
      </View>

      {/* Friend requests */}
      <View className="mb-4 rounded-2xl border p-4" style={cardStyle}>
        <Text className="mb-1 text-sm font-black" style={{ color: colors.text }}>{t('people.requests.title')}</Text>

        <Text className="mb-1 mt-2 text-[11px] font-bold uppercase" style={{ color: colors.secondaryText }}>{t('people.requests.incoming')}</Text>
        {incomingRequests.length === 0 ? (
          <Text className="text-xs" style={{ color: colors.secondaryText }}>{t('people.requests.noIncoming')}</Text>
        ) : (
          incomingRequests.map((req) => (
            <View key={req.id} className="mb-2 flex-row items-center justify-between">
              <Text className="flex-1 text-sm" style={{ color: colors.text }}>{req.user.fullName}</Text>
              <View className="flex-row gap-2">
                <SecondaryButton size="sm" onPress={() => void run(() => acceptFriendRequest(req.id), t('people.requests.added'))}>{t('people.requests.accept')}</SecondaryButton>
                <OutlineButton size="sm" onPress={() => void run(() => rejectFriendRequest(req.id))}>{t('people.requests.decline')}</OutlineButton>
              </View>
            </View>
          ))
        )}

        <Text className="mb-1 mt-3 text-[11px] font-bold uppercase" style={{ color: colors.secondaryText }}>{t('people.requests.outgoing')}</Text>
        {outgoingRequests.length === 0 ? (
          <Text className="text-xs" style={{ color: colors.secondaryText }}>{t('people.requests.noOutgoing')}</Text>
        ) : (
          outgoingRequests.map((req) => (
            <View key={req.id} className="mb-2 flex-row items-center justify-between">
              <Text className="flex-1 text-sm" style={{ color: colors.text }}>{req.user.fullName}</Text>
              <View className="flex-row items-center gap-2">
                <Text className="text-[11px] font-semibold" style={{ color: colors.warning }}>{t('people.requests.pending')}</Text>
                <OutlineButton size="sm" onPress={() => void run(() => cancelFriendRequest(req.id), t('people.requests.cancelled'))}>{t('people.requests.cancel')}</OutlineButton>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Location sharing requests */}
      <View className="mb-4 rounded-2xl border p-4" style={cardStyle}>
        <Text className="text-sm font-black" style={{ color: colors.text }}>{t('people.sharing.title')}</Text>
        <Text className="mb-2 text-[11px]" style={{ color: colors.secondaryText }}>{t('people.sharing.explainer')}</Text>
        {incomingSharing.length === 0 ? (
          <Text className="text-xs" style={{ color: colors.secondaryText }}>{t('people.sharing.empty')}</Text>
        ) : (
          incomingSharing.map((perm) => (
            <View key={perm.id} className="mb-2 flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-sm" style={{ color: colors.text }}>{perm.friend?.fullName ?? t('people.sharing.aFriend')}</Text>
                <Text className="text-xs" style={{ color: colors.secondaryText }}>{PERMISSION_LABELS[perm.status]}</Text>
              </View>
              {perm.status === 'pending' ? (
                <View className="flex-row gap-2">
                  <SecondaryButton size="sm" onPress={() => void handleAcceptSharing(perm.id)}>{t('people.sharing.approve')}</SecondaryButton>
                  <OutlineButton size="sm" onPress={() => void run(() => rejectLocationSharing(perm.id))}>{t('people.sharing.reject')}</OutlineButton>
                </View>
              ) : perm.status === 'active' ? (
                <DangerButton size="sm" onPress={() => void run(() => revokeLocationSharing(perm.id), t('people.sharing.revoked'))}>{t('people.sharing.revoke')}</DangerButton>
              ) : null}
            </View>
          ))
        )}
      </View>

      {/* My permissions */}
      <View className="mb-4 rounded-2xl border p-4" style={cardStyle}>
        <Text className="mb-2 text-sm font-black" style={{ color: colors.text }}>{t('people.permissions.title')}</Text>

        <Text className="mb-1 text-[11px] font-bold uppercase" style={{ color: colors.secondaryText }}>{t('people.permissions.granted')}</Text>
        {incomingSharing.length === 0 ? (
          <Text className="mb-2 text-xs" style={{ color: colors.secondaryText }}>{t('people.permissions.noneGranted')}</Text>
        ) : (
          incomingSharing.map((perm) => (
            <PermissionRow key={perm.id} name={perm.friend?.fullName ?? t('people.sharing.aFriend')} statusLabel={PERMISSION_LABELS[perm.status]} lastActivity={formatDate(perm.lastActivityAt)} colors={colors} t={t} />
          ))
        )}

        <Text className="mb-1 mt-3 text-[11px] font-bold uppercase" style={{ color: colors.secondaryText }}>{t('people.permissions.requested')}</Text>
        {outgoingSharing.length === 0 ? (
          <Text className="text-xs" style={{ color: colors.secondaryText }}>{t('people.permissions.noneRequested')}</Text>
        ) : (
          outgoingSharing.map((perm) => (
            <PermissionRow key={perm.id} name={perm.friend?.fullName ?? t('people.sharing.aFriend')} statusLabel={PERMISSION_LABELS[perm.status]} radiusMeters={perm.radiusMeters} lastActivity={formatDate(perm.lastActivityAt)} colors={colors} t={t} />
          ))
        )}
      </View>

      {/* Debug panel (dev builds only). */}
      {__DEV__ && (
        <View className="mb-4 rounded-2xl border p-4" style={{ borderColor: colors.warning, backgroundColor: colors.input }}>
          <Text className="mb-1 text-sm font-black" style={{ color: colors.text }}>Debug (dev only)</Text>
          <View className="flex-row flex-wrap gap-2">
            <SecondaryButton size="sm" onPress={() => void handleSendTestNotification()}>Send test notification</SecondaryButton>
            <SecondaryButton size="sm" onPress={() => void handleRunDiagnostics()}>Run check now</SecondaryButton>
          </View>
        </View>
      )}
    </ScreenLayout>
  );
}

function PermissionRow({
  name,
  statusLabel,
  radiusMeters,
  lastActivity,
  colors,
  t,
}: {
  name: string;
  statusLabel: string;
  radiusMeters?: number | null;
  lastActivity: string;
  colors: { text: string; secondaryText: string; border: string; bg?: string };
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <View className="mb-2 rounded-xl border px-3 py-2" style={{ borderColor: colors.border }}>
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-semibold" style={{ color: colors.text }}>{name}</Text>
        <Text className="text-[11px] font-bold" style={{ color: colors.secondaryText }}>{statusLabel}</Text>
      </View>
      <View className="mt-1 flex-row flex-wrap gap-x-3">
        {radiusMeters != null && (
          <Text className="text-[11px]" style={{ color: colors.secondaryText }}>
            {t('people.permissions.radius')}: {radiusMeters} {t('reminders.person.meters')}
          </Text>
        )}
        {!!lastActivity && (
          <Text className="text-[11px]" style={{ color: colors.secondaryText }}>
            {t('people.permissions.lastActivity')}: {lastActivity}
          </Text>
        )}
      </View>
    </View>
  );
}
