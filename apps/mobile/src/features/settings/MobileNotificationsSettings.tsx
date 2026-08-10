import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, Switch, Text, View } from 'react-native';
import { SectionCard } from '../../components/layout';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type MobileNotificationPreferences,
} from '../../lib/notificationPreferencesApi';
import {
  getDefaultAndroidPushChannelStatus,
  registerCurrentDevice,
  setPushDeviceEnabled,
  type AndroidPushChannelStatus,
  type PushRegistrationState,
} from '../../lib/pushDevicesApi';
import { useTheme } from '../../theme/useTheme';

export function MobileNotificationsSettings({ accessToken }: { accessToken: string }) {
  const { theme } = useTheme();
  const { colors } = theme;
  const [preferences, setPreferences] = useState<MobileNotificationPreferences | null>(null);
  const [status, setStatus] = useState<PushRegistrationState | 'loading'>('loading');
  const [channel, setChannel] = useState<AndroidPushChannelStatus | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      getNotificationPreferences(accessToken),
      registerCurrentDevice(accessToken, false),
      getDefaultAndroidPushChannelStatus(),
    ]).then(([nextPreferences, nextStatus, nextChannel]) => {
      if (!active) return;
      setPreferences(nextPreferences);
      setStatus(nextStatus);
      setChannel(nextChannel);
    }).catch(() => {
      if (active) setStatus('failed');
    });
    return () => { active = false; };
  }, [accessToken]);

  const enable = async () => {
    Alert.alert(
      'Allow BeePlan notifications?',
      'BeePlan can notify you about tasks, schedule conflicts, focus sessions, and collaboration updates.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Continue', onPress: () => void register() },
      ],
    );
  };

  const register = async () => {
    const next = await registerCurrentDevice(accessToken, true);
    setStatus(next);
    setChannel(await getDefaultAndroidPushChannelStatus().catch(() => null));
    if (next === 'denied') {
      Alert.alert(
        'Notifications are off',
        'Enable BeePlan notifications in your device settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => void Linking.openSettings() },
        ],
      );
    }
    if (next === 'registered') {
      await updateNotificationPreferences(accessToken, { pushNotifications: true }).catch(() => undefined);
      setPreferences((value) => value ? { ...value, pushNotifications: true } : value);
    }
  };

  const toggle = async (enabled: boolean) => {
    const previous = preferences;
    setPreferences((value) => value ? { ...value, pushNotifications: enabled } : value);
    try {
      await updateNotificationPreferences(accessToken, { pushNotifications: enabled });
      await setPushDeviceEnabled(accessToken, enabled);
      setStatus(enabled ? 'registered' : 'granted');
    } catch {
      setPreferences(previous);
      setStatus('failed');
    }
  };

  const description = status === 'denied'
    ? 'Permission denied - open system settings to enable push.'
    : status === 'failed'
      ? 'Could not register this device. Retry when you are online.'
      : status === 'registered'
        ? 'This device is registered for BeePlan alerts.'
        : status === 'loading'
          ? 'Checking this device registration...'
          : 'Receive important BeePlan alerts on your phone.';
  const permissionLabel = status === 'loading'
    ? 'Checking...'
    : status === 'denied'
      ? 'Denied'
      : status === 'unavailable'
        ? 'Unavailable'
        : 'Granted';
  const registrationLabel = status === 'registered'
    ? 'Registered'
    : status === 'failed'
      ? 'Registration failed'
      : status === 'loading'
        ? 'Checking...'
        : 'Not registered';
  const channelLabel = !channel
    ? null
    : !channel.exists
      ? 'Preparing sound channel...'
      : channel.soundEnabled
        ? `Sound enabled · ${channel.vibrationEnabled ? 'Vibration enabled' : 'Vibration off'}`
        : 'Sound disabled in Android settings';

  return (
    <SectionCard>
      <View className="flex-row items-center justify-between gap-4">
        <View className="flex-1">
          <Text className="text-sm font-black" style={{ color: colors.text }}>Mobile notifications</Text>
          <Text className="mt-1 text-xs" style={{ color: colors.secondaryText }}>{description}</Text>
          <Text className="mt-2 text-xs" style={{ color: colors.secondaryText }}>
            Android permission: {permissionLabel}
          </Text>
          <Text className="mt-1 text-xs" style={{ color: colors.secondaryText }}>
            Device: {registrationLabel} · Push: {preferences?.pushNotifications ? 'Enabled' : 'Disabled'}
          </Text>
          {channelLabel ? (
            <Text className="mt-1 text-xs" style={{ color: colors.secondaryText }}>
              Android channel: {channelLabel}
            </Text>
          ) : null}
        </View>
        <Switch
          value={preferences?.pushNotifications ?? false}
          onValueChange={(value) => value ? void enable() : void toggle(false)}
          disabled={!preferences}
        />
      </View>
      {status !== 'registered' && status !== 'granted' ? (
        <Pressable
          onPress={() => void enable()}
          className="mt-3 rounded-xl p-3"
          style={{ backgroundColor: colors.accent }}
        >
          <Text className="text-center text-sm font-black" style={{ color: colors.accentText }}>
            {status === 'failed' ? 'Retry device registration' : 'Enable mobile notifications'}
          </Text>
        </Pressable>
      ) : null}
      {channel ? (
        <Pressable
          onPress={() => void Linking.openSettings()}
          className="mt-3 rounded-xl border p-3"
          style={{ borderColor: colors.border }}
        >
          <Text className="text-center text-sm font-black" style={{ color: colors.text }}>
            Open Android notification settings
          </Text>
        </Pressable>
      ) : null}
    </SectionCard>
  );
}
