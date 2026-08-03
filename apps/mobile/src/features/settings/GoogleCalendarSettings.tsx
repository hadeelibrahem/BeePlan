import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, Switch, Text, View } from 'react-native';
import { SectionCard } from '../../components/layout';
import { disconnectGoogleCalendar, getGoogleCalendarStatus, getGoogleCalendars, getGoogleConnectUrl, getGoogleSyncJobs, retryGoogleSyncJob, selectGoogleCalendars, syncGoogleCalendar, updateGoogleCalendarSettings, type GoogleCalendar, type GoogleCalendarStatus, type GoogleSyncJob } from '../../lib/googleCalendarApi';
import { useTheme } from '../../theme/useTheme';

export function GoogleCalendarSettings({ accessToken }: { accessToken: string }) {
  const { theme: { colors } } = useTheme();
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null);
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [jobs, setJobs] = useState<GoogleSyncJob[]>([]);
  const [direction, setDirection] = useState('two_way');
  const [flags, setFlags] = useState({ tasks: true, focus: true, reminders: false, blocks: true });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const next = await getGoogleCalendarStatus(accessToken);
      setStatus(next);
      setDirection(next.syncDirection ?? 'two_way');
      setFlags({ tasks: next.syncTasks ?? true, focus: next.syncFocusSessions ?? true, reminders: next.syncReminders ?? false, blocks: next.syncCalendarBlocks ?? true });
      if (next.connected) {
        const [nextCalendars, nextJobs] = await Promise.all([getGoogleCalendars(accessToken), getGoogleSyncJobs(accessToken)]);
        setCalendars(nextCalendars); setJobs(nextJobs);
      } else { setCalendars([]); setJobs([]); }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to load Google Calendar.'); }
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  async function connect() {
    try { const { url } = await getGoogleConnectUrl(accessToken); await Linking.openURL(url); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to start Google Calendar connection.'); }
  }

  async function save() {
    setBusy(true); setMessage('');
    try {
      await selectGoogleCalendars(accessToken, calendars.filter((item) => item.selected).map((item) => item.id));
      await updateGoogleCalendarSettings(accessToken, { syncDirection: direction, defaultReminderMinutes: 10, syncTasks: flags.tasks, syncFocusSessions: flags.focus, syncReminders: flags.reminders, syncCalendarBlocks: flags.blocks });
      setMessage('Google Calendar settings saved.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save Google Calendar settings.'); }
    finally { setBusy(false); }
  }

  async function sync() {
    setBusy(true); setMessage('');
    try { const result = await syncGoogleCalendar(accessToken); setStatus((current) => current ? { ...current, lastSyncedAt: result.lastSyncedAt } : current); setJobs(await getGoogleSyncJobs(accessToken)); setMessage(`${result.imported} events synced.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Google Calendar sync failed.'); }
    finally { setBusy(false); }
  }

  function disconnect() {
    Alert.alert('Disconnect Google Calendar?', 'Imported events will no longer update on this device.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Disconnect', style: 'destructive', onPress: async () => { setBusy(true); try { await disconnectGoogleCalendar(accessToken); await load(); setMessage('Google Calendar disconnected.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to disconnect Google Calendar.'); } finally { setBusy(false); } } }]);
  }

  if (!status?.connected) return <SectionCard><Text className="text-base font-black" style={{ color: colors.text }}>Google Calendar</Text><Text className="mt-1 text-xs" style={{ color: colors.secondaryText }}>Protect meetings while BeePlan plans your work.</Text><Pressable accessibilityRole="button" accessibilityLabel="Connect Google Calendar" onPress={() => void connect()} className="mt-3 rounded-xl p-3" style={{ backgroundColor: colors.accent }}><Text className="text-center text-sm font-black" style={{ color: colors.accentText }}>Connect Google Calendar</Text></Pressable>{message ? <Text accessibilityLiveRegion="polite" className="mt-2 text-xs" style={{ color: colors.error }}>{message}</Text> : null}</SectionCard>;

  return <SectionCard><View className="flex-row items-start justify-between"><View className="flex-1"><Text className="text-base font-black" style={{ color: colors.text }}>Google Calendar</Text><Text className="mt-1 text-xs" style={{ color: colors.secondaryText }}>{status.email ?? 'Connected account'}</Text></View><Text className="text-xs font-black" style={{ color: colors.success }}>Connected</Text></View><Text className="mt-3 text-xs" style={{ color: colors.secondaryText }}>Last sync: {status.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString() : 'Never'}</Text><Text className="mt-3 text-xs font-black" style={{ color: colors.text }}>Calendars to sync</Text>{calendars.map((calendar) => <View key={calendar.id} className="mt-2 flex-row items-center gap-2"><Switch value={calendar.selected} onValueChange={(selected) => setCalendars((current) => current.map((item) => item.id === calendar.id ? { ...item, selected } : item))} /><Text className="flex-1 text-sm" style={{ color: colors.text }}>{calendar.summary}</Text></View>)}<Text className="mt-3 text-xs font-black" style={{ color: colors.text }}>Sync direction</Text><View className="mt-2 flex-row gap-2">{(['import_only', 'export_only', 'two_way'] as const).map((value) => <Pressable key={value} accessibilityRole="button" onPress={() => setDirection(value)} className="rounded-xl border px-3 py-2" style={{ borderColor: direction === value ? colors.accent : colors.border, backgroundColor: direction === value ? colors.accentSoft : colors.surface }}><Text className="text-xs font-bold" style={{ color: colors.text }}>{value === 'two_way' ? 'Two-way' : value === 'import_only' ? 'Import' : 'Export'}</Text></Pressable>)}</View>{([['tasks', 'Scheduled tasks'], ['focus', 'Focus sessions'], ['reminders', 'Timed reminders']] as const).map(([key, label]) => <View key={key} className="mt-2 flex-row items-center justify-between"><Text className="text-sm" style={{ color: colors.text }}>{label}</Text><Switch value={flags[key]} onValueChange={(value) => setFlags((current) => ({ ...current, [key]: value }))} /></View>)}<View className="mt-4 flex-row gap-2"><Pressable disabled={busy} onPress={() => void save()} className="flex-1 rounded-xl p-3" style={{ backgroundColor: colors.accent, opacity: busy ? 0.6 : 1 }}><Text className="text-center text-xs font-black" style={{ color: colors.accentText }}>Save</Text></Pressable><Pressable disabled={busy} onPress={() => void sync()} className="flex-1 rounded-xl border p-3" style={{ borderColor: colors.border, opacity: busy ? 0.6 : 1 }}><Text className="text-center text-xs font-black" style={{ color: colors.text }}>Sync now</Text></Pressable><Pressable disabled={busy} onPress={disconnect} className="rounded-xl border p-3" style={{ borderColor: colors.error }}><Text className="text-xs font-black" style={{ color: colors.error }}>Disconnect</Text></Pressable></View>{jobs.filter((job) => job.status === 'failed' || job.status === 'conflict').map((job) => <View key={job.id} className="mt-2 flex-row items-center justify-between"><Text className="flex-1 text-xs" style={{ color: colors.error }}>{job.lastError ?? `Sync ${job.status}`}</Text><Pressable onPress={() => void retryGoogleSyncJob(accessToken, job.id).then(load)}><Text className="text-xs font-black" style={{ color: colors.accentInk }}>Retry</Text></Pressable></View>)}{message ? <Text accessibilityLiveRegion="polite" className="mt-2 text-xs" style={{ color: colors.accentInk }}>{message}</Text> : null}</SectionCard>;
}
