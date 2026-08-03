import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { getGoogleEvents } from '../../lib/googleCalendarApi';
import { useTheme } from '../../theme/useTheme';

export function GoogleCalendarEvents({ accessToken, date }: { accessToken: string; date: string }) {
  const { theme: { colors } } = useTheme();
  const [events, setEvents] = useState<Array<{ id: string; title: string; startAt?: string | null; allDay: boolean }>>([]);
  useEffect(() => { let active = true; if (!accessToken) return undefined; void getGoogleEvents(accessToken, date).then((value) => { if (active) setEvents(value); }).catch(() => { if (active) setEvents([]); }); return () => { active = false; }; }, [accessToken, date]);
  if (!events.length) return null;
  return <View className="mb-3 rounded-xl border p-3" style={{ borderColor: `${colors.primary}55`, backgroundColor: `${colors.primary}12` }}><Text className="mb-2 text-xs font-black" style={{ color: colors.primary }}>Google Calendar · protected time</Text>{events.map((event) => <View key={event.id} className="mb-1 flex-row items-center gap-2"><View className="h-2 w-2 rounded-full" style={{ backgroundColor: colors.primary }} /><Text className="flex-1 text-xs font-bold" style={{ color: colors.text }} numberOfLines={1}>{event.title}</Text><Text className="text-xs" style={{ color: colors.secondaryText }}>{event.allDay ? 'All day' : event.startAt ? new Date(event.startAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : ''}</Text></View>)}</View>;
}
