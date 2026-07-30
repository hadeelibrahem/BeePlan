import type { TaskDestination } from '../lib/tasksApi'
export function WeatherTravelTaskFields({ destination, enabled, travelMode, onDestination, onEnabled, onTravelMode }: {
  destination: Partial<TaskDestination>; enabled: boolean; travelMode: 'driving'|'walking'|'cycling';
  onDestination: (value: Partial<TaskDestination>) => void; onEnabled: (value: boolean) => void; onTravelMode: (value: 'driving'|'walking'|'cycling') => void;
}) {
  const set = (key: keyof TaskDestination, value: string | number) => onDestination({ ...destination, [key]: value })
  return <fieldset className="mt-4 rounded-xl border border-[var(--bp-border)] p-3"><legend className="px-2 text-sm font-black text-[var(--bp-text)]">Weather &amp; Travel Assistance</legend>
    <label className="flex items-center justify-between text-sm font-bold text-[var(--bp-text)]">Enabled<input type="checkbox" checked={enabled} onChange={(e) => onEnabled(e.target.checked)} /></label>
    <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs text-[var(--bp-muted)]">Destination name<input className={input} value={destination.displayName ?? ''} onChange={(e) => set('displayName', e.target.value)} /></label><label className="text-xs text-[var(--bp-muted)]">Address<input className={input} value={destination.address ?? ''} onChange={(e) => set('address', e.target.value)} /></label><label className="text-xs text-[var(--bp-muted)]">Latitude<input className={input} type="number" step="any" value={destination.latitude ?? ''} onChange={(e) => set('latitude', Number(e.target.value))} /></label><label className="text-xs text-[var(--bp-muted)]">Longitude<input className={input} type="number" step="any" value={destination.longitude ?? ''} onChange={(e) => set('longitude', Number(e.target.value))} /></label><label className="text-xs text-[var(--bp-muted)]">Travel mode<select className={input} value={travelMode} onChange={(e) => onTravelMode(e.target.value as any)}><option value="driving">Driving</option><option value="walking">Walking</option><option value="cycling">Cycling</option></select></label></div>
    <p className="mt-2 text-xs text-[var(--bp-muted)]">Coordinates are required and are never guessed. Use a saved place when available.</p>
  </fieldset>
}
const input = 'mt-1 w-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 py-2 text-[var(--bp-text)]'
