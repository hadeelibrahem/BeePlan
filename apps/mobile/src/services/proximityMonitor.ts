import { checkNearby, updateLocationSnapshot } from '../features/social/api/social.api';
import { getCurrentSnapshot, requestForegroundLocationPermission } from '../lib/location';
import { showPersonNearbyNotification } from '../lib/notifications';

/**
 * Foreground proximity monitor for person ("when I see them") reminders.
 *
 * While running, on an interval it:
 *   1. reads the device's current location,
 *   2. pushes it to BeePlan as a snapshot (POST /person-reminders/location-snapshot),
 *   3. asks the backend which reminders should fire now (GET /person-reminders/nearby),
 *   4. shows an immediate local notification for each returned reminder.
 *
 * The backend enforces consent, radius, and cooldown, so this client never
 * decides proximity itself and can't double-fire. Crucially, location data is
 * sent ONLY to BeePlan's own snapshot endpoint — never to any AI service.
 *
 * Start this only while the user has ≥1 active person reminder; the app is
 * responsible for calling start()/stop() based on that. This is FOREGROUND-ONLY:
 * it runs while the app is open. True OS-background updates (app closed) are a
 * follow-up requiring expo-task-manager, and are intentionally not implemented.
 */

const DEFAULT_INTERVAL_MS = 60_000;

let intervalId: ReturnType<typeof setInterval> | null = null;
let running = false;

// Dev-only structured logging so the whole notification path is traceable.
function debug(message: string, extra?: unknown): void {
  if (!__DEV__) return;
  if (extra !== undefined) {
    console.log(`[proximityMonitor] ${message}`, extra);
  } else {
    console.log(`[proximityMonitor] ${message}`);
  }
}

async function tick(): Promise<void> {
  try {
    const snapshot = await getCurrentSnapshot();
    if (!snapshot) {
      debug('tick skipped — no location snapshot (permission denied or fix failed)');
      return;
    }
    debug('location snapshot captured', snapshot);

    await updateLocationSnapshot(snapshot);
    debug('location snapshot sent to backend');

    const hits = await checkNearby();
    debug(`nearby response — ${hits.length} reminder(s) to fire`, hits);

    for (const hit of hits) {
      const id = await showPersonNearbyNotification({
        title: hit.title || `You're near ${hit.targetName}`,
        body: hit.message || `Talk to ${hit.targetName}`,
      });
      debug(
        id
          ? `local notification scheduled (id=${id}) for reminder ${hit.reminderId}`
          : `local notification NOT scheduled for reminder ${hit.reminderId} — notification permission denied`,
      );
    }
  } catch (error) {
    // A failed poll (network blip, permission change) must never crash the app —
    // just log and let the next interval retry.
    debug('tick failed', error);
    if (__DEV__) console.error('[proximityMonitor] tick failed:', error);
  }
}

export async function startProximityMonitor(intervalMs: number = DEFAULT_INTERVAL_MS): Promise<boolean> {
  if (running) {
    debug('start requested but monitor already running');
    return true;
  }

  const granted = await requestForegroundLocationPermission();
  debug(`foreground location permission ${granted ? 'granted' : 'denied'}`);
  if (!granted) {
    console.warn('[proximityMonitor] location permission not granted — monitor not started.');
    return false;
  }

  running = true;
  debug(`monitor started (interval ${intervalMs}ms)`);
  // Run one tick right away so a nearby friend is caught without waiting a full
  // interval, then poll on a cadence.
  void tick();
  intervalId = setInterval(() => void tick(), intervalMs);
  return true;
}

export function stopProximityMonitor(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (running) {
    debug('monitor stopped');
  }
  running = false;
}

export function isProximityMonitorRunning(): boolean {
  return running;
}

export type ProximityDiagnostics = {
  locationPermission: boolean;
  snapshot: { latitude: number; longitude: number } | null;
  snapshotSent: boolean;
  nearbyCount: number;
  hits: { reminderId: string; title: string; targetName: string }[];
  notificationsFired: number;
  error?: string;
};

/**
 * Runs the entire proximity → notification pipeline ONCE and returns a report,
 * for on-device debugging (see the Debug panel in PeopleScreen). Unlike
 * the periodic tick it surfaces the outcome of every step so a tester can see
 * exactly where the pipeline stops. Fires real notifications for any hits.
 */
export async function runProximityDiagnostics(): Promise<ProximityDiagnostics> {
  const report: ProximityDiagnostics = {
    locationPermission: false,
    snapshot: null,
    snapshotSent: false,
    nearbyCount: 0,
    hits: [],
    notificationsFired: 0,
  };

  try {
    report.locationPermission = await requestForegroundLocationPermission();
    debug(`diagnostics: location permission = ${report.locationPermission}`);

    const snapshot = await getCurrentSnapshot();
    report.snapshot = snapshot ? { latitude: snapshot.latitude, longitude: snapshot.longitude } : null;
    debug('diagnostics: snapshot', snapshot);
    if (!snapshot) return report;

    await updateLocationSnapshot(snapshot);
    report.snapshotSent = true;
    debug('diagnostics: snapshot sent');

    const hits = await checkNearby();
    report.nearbyCount = hits.length;
    report.hits = hits.map((h) => ({ reminderId: h.reminderId, title: h.title, targetName: h.targetName }));
    debug(`diagnostics: nearby returned ${hits.length} hit(s)`, hits);

    for (const hit of hits) {
      const id = await showPersonNearbyNotification({
        title: hit.title || `You're near ${hit.targetName}`,
        body: hit.message || `Talk to ${hit.targetName}`,
      });
      if (id) report.notificationsFired += 1;
    }
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    debug('diagnostics failed', error);
  }

  return report;
}
