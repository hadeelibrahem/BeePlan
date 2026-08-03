import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, Switch, Text, View } from 'react-native';
import { SectionCard } from '../../components/layout';
import { getNotificationPreferences, updateNotificationPreferences, type MobileNotificationPreferences } from '../../lib/notificationPreferencesApi';
import { registerCurrentDevice, setPushDeviceEnabled, type PushRegistrationState } from '../../lib/pushDevicesApi';
import { useTheme } from '../../theme/useTheme';

export function MobileNotificationsSettings({ accessToken }: { accessToken: string }) {
  const { theme } = useTheme(); const { colors } = theme;
  const [preferences, setPreferences] = useState<MobileNotificationPreferences | null>(null);
  const [status, setStatus] = useState<PushRegistrationState | 'loading'>('loading');
  useEffect(() => { void getNotificationPreferences(accessToken).then(setPreferences).catch(() => setStatus('failed')); }, [accessToken]);
  const enable = async () => {
    Alert.alert('Allow BeePlan notifications?', 'BeePlan can notify you about tasks, schedule conflicts, focus sessions, and collaboration updates.', [{ text: 'Not now', style: 'cancel' }, { text: 'Continue', onPress: () => void register() }]);
  };
  const register = async () => { const next = await registerCurrentDevice(accessToken, true); setStatus(next); if (next === 'denied') Alert.alert('Notifications are off', 'Enable BeePlan notifications in your device settings.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Open Settings', onPress: () => void Linking.openSettings() }]); if (next === 'registered') { await updateNotificationPreferences(accessToken, { pushNotifications: true }).catch(() => undefined); setPreferences((value) => value ? { ...value, pushNotifications: true } : value); } };
  const toggle = async (enabled: boolean) => { const previous = preferences; setPreferences((value) => value ? { ...value, pushNotifications: enabled } : value); try { await updateNotificationPreferences(accessToken, { pushNotifications: enabled }); if (enabled) await setPushDeviceEnabled(accessToken, true); else await setPushDeviceEnabled(accessToken, false); setStatus(enabled ? 'registered' : 'granted'); } catch { setPreferences(previous); setStatus('failed'); } };
  return <SectionCard><View className="flex-row items-center justify-between gap-4"><View className="flex-1"><Text className="text-sm font-black" style={{ color: colors.text }}>Mobile notifications</Text><Text className="mt-1 text-xs" style={{ color: colors.secondaryText }}>{status === 'denied' ? 'Permission denied — open system settings to enable push.' : status === 'failed' ? 'Could not register this device.' : status === 'registered' ? 'This device can receive BeePlan alerts.' : 'Receive important BeePlan alerts on your phone.'}</Text></View><Switch value={preferences?.pushNotifications ?? false} onValueChange={(value) => value ? void enable() : void toggle(false)} disabled={!preferences} /></View>{status !== 'registered' && status !== 'granted' ? <Pressable onPress={() => void enable()} className="mt-3 rounded-xl p-3" style={{ backgroundColor: colors.accent }}><Text className="text-center text-sm font-black" style={{ color: colors.accentText }}>Enable mobile notifications</Text></Pressable> : null}</SectionCard>;
}
