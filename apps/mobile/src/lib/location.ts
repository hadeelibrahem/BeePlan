import * as Location from 'expo-location';

export type LocationSnapshot = {
  latitude: number;
  longitude: number;
  accuracy?: number;
};

/**
 * Requests foreground ("while using the app") location permission. This is the
 * minimum needed to send proximity snapshots while BeePlan is open. Returns true
 * only when granted. Never throws — callers decide how to surface a denial.
 */
export async function requestForegroundLocationPermission(): Promise<boolean> {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.granted) {
      if (__DEV__) console.log('[location] foreground permission already granted');
      return true;
    }
    const requested = await Location.requestForegroundPermissionsAsync();
    if (__DEV__) console.log(`[location] foreground permission ${requested.granted ? 'granted' : 'denied'}`);
    return requested.granted;
  } catch (error) {
    console.error('[location] foreground permission request failed:', error);
    return false;
  }
}

/**
 * Requests background ("always") location permission. Only call this once the
 * user has an active person reminder and has already granted foreground access —
 * asking for background up front is a privacy anti-pattern and iOS rejects it.
 * Background OS-level tracking (app closed) additionally needs expo-task-manager,
 * which is a deliberate follow-up; today snapshots are sent while the app runs.
 */
export async function requestBackgroundLocationPermission(): Promise<boolean> {
  try {
    const foreground = await requestForegroundLocationPermission();
    if (!foreground) return false;
    const current = await Location.getBackgroundPermissionsAsync();
    if (current.granted) return true;
    const requested = await Location.requestBackgroundPermissionsAsync();
    return requested.granted;
  } catch (error) {
    console.error('[location] background permission request failed:', error);
    return false;
  }
}

/**
 * Reads the current device position as a coarse snapshot. Returns null if
 * permission is missing or the fix fails. The coordinates are sent only to
 * BeePlan's own proximity endpoint — never to any AI service.
 */
export async function getCurrentSnapshot(): Promise<LocationSnapshot | null> {
  try {
    const granted = await requestForegroundLocationPermission();
    if (!granted) return null;

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy ?? undefined,
    };
  } catch (error) {
    console.error('[location] failed to get current position:', error);
    return null;
  }
}
