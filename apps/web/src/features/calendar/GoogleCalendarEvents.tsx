import { useEffect, useState } from 'react'
import { CalendarDays, ExternalLink } from 'lucide-react'

type GoogleEvent = { id: string; title: string; location?: string | null; startAt?: string | null; endAt?: string | null; allDay: boolean; status: string }
export function GoogleCalendarEvents({ token, date }: { token: string; date: string }) {
  const [events, setEvents] = useState<GoogleEvent[]>([])
  useEffect(() => { if (!token) return; let active = true; const from = new Date(`${date}T00:00:00`).toISOString(); const to = new Date(`${date}T23:59:59`).toISOString(); fetch(`${(import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, '')}/google-calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.ok ? response.json() : []).then((data) => { if (active) setEvents(data as GoogleEvent[]) }).catch(() => { if (active) setEvents([]) }); return () => { active = false } }, [token, date])
  if (!events.length) return null
  return <div className="mb-4 rounded-xl border border-blue-400/20 bg-blue-400/5 p-3"><div className="mb-2 flex items-center justify-between"><p className="flex items-center gap-2 text-xs font-black text-blue-300"><CalendarDays size={14} /> Google Calendar · protected time</p><ExternalLink size={13} className="text-blue-300" /></div><div className="space-y-1">{events.map((event) => <div key={event.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs"><span className="h-2 w-2 rounded-full bg-blue-400" /><span className="font-bold">{event.title}</span><span className="text-[var(--bp-muted)]">{event.allDay ? 'All day' : event.startAt ? new Date(event.startAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : ''}</span></div>)}</div></div>
}
