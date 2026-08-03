import { useEffect, useState } from 'react';
import { Alert, Image, Linking, Pressable, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import { SectionCard } from '../../components/layout';
import type { AuthUser } from '../../lib/api';
import { getGoogleCalendarStatus, type GoogleCalendarStatus } from '../../lib/googleCalendarApi';
import { getInstallationId, getPushDeviceStatus } from '../../lib/pushDevicesApi';
import { changePassword, updateProfile, validateProfileDraft } from './settingsApi';
import { useTheme } from '../../theme/useTheme';

type Props = { accessToken: string; user: AuthUser; onUpdated: (user: AuthUser) => void };

export function AccountPrivacySection({ accessToken, user, onUpdated }: Props) {
  const { theme: { colors } } = useTheme();
  const [profile, setProfile] = useState({ fullName: user.fullName, username: user.username, email: user.email, avatarUrl: user.avatarUrl ?? '', timezone: user.timezone });
  const [password, setPassword] = useState({ current: '', next: '', confirm: '' });
  const [locationStatus, setLocationStatus] = useState('Checking…');
  const [calendar, setCalendar] = useState<GoogleCalendarStatus | null>(null);
  const [pushStatus, setPushStatus] = useState('Checking…');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setProfile({ fullName: user.fullName, username: user.username, email: user.email, avatarUrl: user.avatarUrl ?? '', timezone: user.timezone }); }, [user]);
  useEffect(() => { void Location.getForegroundPermissionsAsync().then((value) => setLocationStatus(value.granted ? 'Allowed while using the app' : value.canAskAgain ? 'Not granted' : 'Blocked in system settings')).catch(() => setLocationStatus('Unavailable')); void getGoogleCalendarStatus(accessToken).then(setCalendar).catch(() => setCalendar(null)); void getInstallationId().then((id) => getPushDeviceStatus(accessToken, id)).then((value) => setPushStatus(value?.enabled ? 'Registered and enabled' : value ? 'Registered but disabled' : 'Not registered')).catch(() => setPushStatus('Unavailable')); }, [accessToken]);

  async function saveProfile() {
    const validationError = validateProfileDraft(profile); if (validationError) return setMessage(validationError);
    setBusy(true); setMessage(''); const previous = user;
    try { const updated = await updateProfile(accessToken, { ...profile, username: profile.username.trim().toLowerCase(), avatarUrl: profile.avatarUrl.trim() || null }); onUpdated(updated); setMessage('Profile saved.'); }
    catch (error) { setProfile({ fullName: previous.fullName, username: previous.username, email: previous.email, avatarUrl: previous.avatarUrl ?? '', timezone: previous.timezone }); setMessage(error instanceof Error ? error.message : 'Unable to save profile.'); }
    finally { setBusy(false); }
  }

  async function savePassword() {
    if (!password.current || password.next.length < 8 || password.next !== password.confirm) return setMessage('Enter the current password and matching valid new password.');
    setBusy(true); setMessage(''); try { await changePassword(accessToken, password.current, password.next); setPassword({ current: '', next: '', confirm: '' }); setMessage('Password changed.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to change password.'); } finally { setBusy(false); }
  }

  async function refreshLocation() { const value = await Location.getForegroundPermissionsAsync(); setLocationStatus(value.granted ? 'Allowed while using the app' : value.canAskAgain ? 'Not granted' : 'Blocked in system settings'); }

  return <View className="gap-4 px-4"><SectionCard><Text className="text-base font-black" style={{ color: colors.text }}>Profile</Text><View className="mt-3 flex-row items-center gap-3">{profile.avatarUrl ? <Image source={{ uri: profile.avatarUrl }} className="h-12 w-12 rounded-full" /> : <View className="h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: colors.accentSoft }}><Text className="text-lg font-black" style={{ color: colors.accentInk }}>{profile.fullName[0]?.toUpperCase() ?? '?'}</Text></View>}<Text className="text-sm font-bold" style={{ color: colors.text }}>{profile.email}</Text></View>{([['Display name', 'fullName'], ['Username', 'username'], ['Email', 'email'], ['Avatar URL', 'avatarUrl'], ['Timezone', 'timezone']] as const).map(([label, key]) => <View key={key} className="mt-2"><Text className="mb-1 text-xs font-bold" style={{ color: colors.secondaryText }}>{label}</Text><TextInput accessibilityLabel={label} value={profile[key]} editable={key !== 'email' || true} onChangeText={(value) => setProfile((current) => ({ ...current, [key]: value }))} autoCapitalize={key === 'username' ? 'none' : 'sentences'} className="rounded-xl border px-3 py-2" style={{ borderColor: colors.border, color: colors.text, backgroundColor: colors.input }} /></View>)}<Pressable disabled={busy} onPress={() => void saveProfile()} className="mt-3 rounded-xl p-3" style={{ backgroundColor: colors.accent, opacity: busy ? 0.6 : 1 }}><Text className="text-center text-sm font-black" style={{ color: colors.accentText }}>Save profile</Text></Pressable></SectionCard>{user.authProvider === 'password' ? <SectionCard><Text className="text-base font-black" style={{ color: colors.text }}>Password & security</Text>{(['current', 'next', 'confirm'] as const).map((key) => <TextInput key={key} accessibilityLabel={key === 'current' ? 'Current password' : key === 'next' ? 'New password' : 'Confirm new password'} secureTextEntry value={password[key]} onChangeText={(value) => setPassword((current) => ({ ...current, [key]: value }))} placeholder={key === 'current' ? 'Current password' : key === 'next' ? 'New password' : 'Confirm new password'} placeholderTextColor={colors.placeholder} className="mt-2 rounded-xl border px-3 py-2" style={{ borderColor: colors.border, color: colors.text, backgroundColor: colors.input }} />)}<Pressable disabled={busy} onPress={() => void savePassword()} className="mt-3 rounded-xl border p-3" style={{ borderColor: colors.border }}><Text className="text-center text-sm font-black" style={{ color: colors.text }}>Change password</Text></Pressable></SectionCard> : null}<SectionCard><Text className="text-base font-black" style={{ color: colors.text }}>Privacy & connected services</Text><Row label="Location permission" value={locationStatus} action="Open system settings" onPress={() => void Linking.openSettings().then(refreshLocation)} colors={colors} /><Row label="Location sharing" value="Manage in People" colors={colors} /><Row label="Google Calendar" value={calendar?.connected ? `Connected${calendar.email ? ` · ${calendar.email}` : ''}` : 'Not connected'} colors={colors} /><Row label="Push device" value={pushStatus} colors={colors} /></SectionCard>{message ? <Text accessibilityLiveRegion="polite" className="px-1 text-xs font-bold" style={{ color: colors.accentInk }}>{message}</Text> : null}</View>;
}

function Row({ label, value, action, onPress, colors }: { label: string; value: string; action?: string; onPress?: () => void; colors: { text: string; secondaryText: string; border: string; accentInk: string } }) { return <View className="mt-3 flex-row items-center justify-between gap-3 border-b pb-3" style={{ borderColor: colors.border }}><View className="flex-1"><Text className="text-sm font-bold" style={{ color: colors.text }}>{label}</Text><Text className="mt-1 text-xs" style={{ color: colors.secondaryText }}>{value}</Text></View>{action && onPress ? <Pressable onPress={onPress}><Text className="text-xs font-black" style={{ color: colors.accentInk }}>{action}</Text></Pressable> : null}</View>; }
