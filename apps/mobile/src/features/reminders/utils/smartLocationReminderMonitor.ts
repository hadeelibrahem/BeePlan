import {
  Accuracy,
  ActivityType,
  getCurrentPositionAsync,
  hasStartedLocationUpdatesAsync,
  startLocationUpdatesAsync,
  stopLocationUpdatesAsync,
  watchPositionAsync,
  type LocationObject,
  type LocationSubscription,
} from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as TaskManager from 'expo-task-manager';
import { Alert } from 'react-native';
import {
  requestBackgroundLocationPermission,
  requestForegroundLocationPermission,
} from '../../../lib/location';
import {
  NotificationPermissionDeniedError,
  requestNotificationPermission,
  showImmediateReminderNotification,
} from '../../../lib/notifications';
import { markSmartLocationTriggered } from '../api/reminders.api';
import { searchNearbyPlacesByCategory, type NearbyGeoapifyPlace } from '../services/geoapifyPlacesService';
import type { GeneralLocationCategory, Reminder } from '../types/reminders.types';

const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_RADIUS_METERS = 200;
const DEFAULT_COOLDOWN_MINUTES = 1440;
const BACKGROUND_TASK_NAME = 'beeplan-location-reminders';
const MONITOR_STATE_STORAGE_KEY = 'beeplan_location_reminder_monitor_state';
const TRANSITION_STATE_STORAGE_KEY = 'beeplan_location_reminder_transition_state';
const AUTH_STORAGE_KEY = 'beeplan_auth_session';

type NearbySearchCacheEntry = {
  expiresAt: number;
  places: NearbyGeoapifyPlace[];
};

type PersistedMonitorState = {
  reminders: Reminder[];
  savedAt: string;
};

type StoredTransitionState = Record<string, boolean>;

type SmartLocationReminderMonitorOptions = {
  reminders: Reminder[];
  accessToken: string;
  onReminderTriggered: (reminder: Reminder) => void;
};

const nearbySearchCache = new Map<string, NearbySearchCacheEntry>();
const triggerInFlightIds = new Set<string>();
const insideStateByReminderId = new Map<string, boolean>();

function debug(message: string, data?: Record<string, unknown>) {
  if (!__DEV__) return;
  if (data) {
    console.log(`[locationReminderMonitor] ${message}`, data);
  } else {
    console.log(`[locationReminderMonitor] ${message}`);
  }
}

function labelizeCategory(category: GeneralLocationCategory) {
  return category
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function isEligibleSmartCategory(reminder: Reminder) {
  if (reminder.status !== 'active') return false;
  if (!reminder.smartLocationEnabled || !reminder.smartPlaceCategory) return false;
  if (reminder.triggerOnEnter === false) return false;

  if (!reminder.lastTriggeredAt) return true;

  const lastTriggeredTime = new Date(reminder.lastTriggeredAt).getTime();
  if (!Number.isFinite(lastTriggeredTime)) return true;

  const cooldownMinutes = reminder.triggerCooldown ?? DEFAULT_COOLDOWN_MINUTES;
  return Date.now() - lastTriggeredTime > cooldownMinutes * 60 * 1000;
}

function getSpecificPlaceTarget(reminder: Reminder) {
  if (reminder.status !== 'active' || reminder.type !== 'location') return null;
  if (reminder.location?.mode !== 'specific_place') return null;

  const place = reminder.location.specificPlace;
  const latitude = place?.latitude;
  const longitude = place?.longitude;
  const radiusMeters = reminder.location.radiusMeters ?? DEFAULT_RADIUS_METERS;
  const trigger = reminder.location.trigger ?? 'arrive';

  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !(radiusMeters > 0)
  ) {
    debug('specific-place reminder ignored because coordinates/radius are invalid', {
      reminderId: reminder.id,
      latitude,
      longitude,
      radiusMeters,
    });
    return null;
  }

  return {
    latitude,
    longitude,
    radiusMeters,
    trigger,
    placeName: place?.placeName ?? reminder.title,
  };
}

function isEligibleSpecificPlace(reminder: Reminder) {
  return Boolean(getSpecificPlaceTarget(reminder));
}

function hasMonitorableReminder(reminders: Reminder[]) {
  return reminders.some((reminder) => isEligibleSmartCategory(reminder) || isEligibleSpecificPlace(reminder));
}

function cacheKey({
  category,
  latitude,
  longitude,
  radiusMeters,
}: {
  category: GeneralLocationCategory;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}) {
  return [
    category,
    latitude.toFixed(3),
    longitude.toFixed(3),
    Math.round(radiusMeters / 50) * 50,
  ].join(':');
}

async function getNearbyPlaces(input: {
  category: GeneralLocationCategory;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}) {
  const key = cacheKey(input);
  const cached = nearbySearchCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.places;
  }

  const places = await searchNearbyPlacesByCategory(input);
  nearbySearchCache.set(key, {
    places,
    expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
  });
  return places;
}

async function handleLocationUpdate(
  location: LocationObject,
  { reminders, accessToken, onReminderTriggered }: SmartLocationReminderMonitorOptions,
  source: 'foreground' | 'background' | 'initial' = 'foreground',
) {
  const userPoint = {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
  };

  debug('current coordinates', {
    source,
    latitude: userPoint.latitude,
    longitude: userPoint.longitude,
    accuracy: location.coords.accuracy,
  });

  for (const reminder of reminders.filter(isEligibleSpecificPlace)) {
    const target = getSpecificPlaceTarget(reminder);
    if (!target || triggerInFlightIds.has(reminder.id)) continue;

    const distance = distanceMeters(userPoint, target);
    const isInside = distance <= target.radiusMeters;
    const previousInside = insideStateByReminderId.get(reminder.id);
    const transition =
      target.trigger === 'arrive'
        ? previousInside === false && isInside
        : previousInside === true && !isInside;

    debug('specific-place reminder distance check', {
      reminderId: reminder.id,
      title: reminder.title,
      triggerType: target.trigger,
      currentLatitude: userPoint.latitude,
      currentLongitude: userPoint.longitude,
      targetLatitude: target.latitude,
      targetLongitude: target.longitude,
      distanceMeters: Math.round(distance),
      configuredRadiusMeters: target.radiusMeters,
      previousInside,
      isInside,
    });

    insideStateByReminderId.set(reminder.id, isInside);
    void persistTransitionState();

    if (!transition) continue;

    debug(target.trigger === 'arrive' ? 'outside-to-inside transition' : 'inside-to-outside transition', {
      reminderId: reminder.id,
      distanceMeters: Math.round(distance),
      configuredRadiusMeters: target.radiusMeters,
    });

    try {
      triggerInFlightIds.add(reminder.id);
      const id = await showImmediateReminderNotification({
        title: reminder.title,
        body: `${target.trigger === 'arrive' ? 'Arrived at' : 'Left'} ${target.placeName}`,
        priority: reminder.priority,
        data: {
          type: 'reminder',
          reminderId: reminder.id,
          url: `beeplan://reminders/${reminder.id}`,
        },
      });
      debug('notification triggered', { reminderId: reminder.id, notificationId: id });

      const updated = await markSmartLocationTriggered(reminder.id, accessToken);
      if (updated) {
        onReminderTriggered(updated);
        await persistMonitorState(reminders.map((item) => (item.id === updated.id ? updated : item)));
      }
    } catch (error) {
      if (error instanceof NotificationPermissionDeniedError) {
        console.warn('[locationReminderMonitor] notification permission failure:', error.message);
        Alert.alert('Notifications disabled', error.message);
      } else {
        console.error('[locationReminderMonitor] specific-place reminder check failed:', error);
      }
    } finally {
      triggerInFlightIds.delete(reminder.id);
    }
  }

  const eligibleReminders = reminders.filter(isEligibleSmartCategory);
  for (const reminder of eligibleReminders) {
    if (triggerInFlightIds.has(reminder.id) || !reminder.smartPlaceCategory) continue;

    const radiusMeters = reminder.triggerRadius ?? reminder.location?.radiusMeters ?? DEFAULT_RADIUS_METERS;

    try {
      const nearbyPlaces = await getNearbyPlaces({
        category: reminder.smartPlaceCategory,
        latitude: userPoint.latitude,
        longitude: userPoint.longitude,
        radiusMeters,
      });
      const matchingPlace = nearbyPlaces.find((place) => {
        const geoapifyDistance = place.distanceMeters;
        const computedDistance = distanceMeters(userPoint, place);
        const distance = geoapifyDistance > 0 ? geoapifyDistance : computedDistance;
        debug('smart/category reminder distance check', {
          reminderId: reminder.id,
          category: reminder.smartPlaceCategory,
          currentLatitude: userPoint.latitude,
          currentLongitude: userPoint.longitude,
          targetLatitude: place.latitude,
          targetLongitude: place.longitude,
          distanceMeters: Math.round(distance),
          configuredRadiusMeters: radiusMeters,
        });
        return distance <= radiusMeters;
      });

      if (!matchingPlace) continue;

      triggerInFlightIds.add(reminder.id);
      const categoryLabel = labelizeCategory(reminder.smartPlaceCategory);
      await showImmediateReminderNotification({
        title: `You're near a ${categoryLabel.toLowerCase()}.`,
        body: `Don't forget:\n${reminder.title}.`,
        priority: reminder.priority,
        data: {
          type: 'reminder',
          reminderId: reminder.id,
          url: `beeplan://reminders/${reminder.id}`,
        },
      });

      const updated = await markSmartLocationTriggered(reminder.id, accessToken);
      debug('notification triggered', { reminderId: reminder.id, category: reminder.smartPlaceCategory });
      if (updated) onReminderTriggered(updated);
    } catch (error) {
      if (error instanceof NotificationPermissionDeniedError) {
        Alert.alert('Notifications disabled', error.message);
      } else {
        console.error('[smartLocationReminderMonitor] location reminder check failed:', error);
      }
    } finally {
      triggerInFlightIds.delete(reminder.id);
    }
  }
}

async function getStoredAccessToken() {
  const raw = await SecureStore.getItemAsync(AUTH_STORAGE_KEY);
  if (!raw) return null;

  try {
    return (JSON.parse(raw) as { accessToken?: string }).accessToken ?? null;
  } catch {
    return null;
  }
}

async function readPersistedMonitorState() {
  const raw = await AsyncStorage.getItem(MONITOR_STATE_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as PersistedMonitorState;
  } catch {
    return null;
  }
}

async function persistMonitorState(reminders: Reminder[]) {
  const monitorable = reminders.filter((reminder) => isEligibleSmartCategory(reminder) || isEligibleSpecificPlace(reminder));
  await AsyncStorage.setItem(
    MONITOR_STATE_STORAGE_KEY,
    JSON.stringify({ reminders: monitorable, savedAt: new Date().toISOString() } satisfies PersistedMonitorState),
  );
}

async function loadTransitionState() {
  const raw = await AsyncStorage.getItem(TRANSITION_STATE_STORAGE_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw) as StoredTransitionState;
    insideStateByReminderId.clear();
    Object.entries(parsed).forEach(([id, isInside]) => {
      insideStateByReminderId.set(id, isInside);
    });
  } catch {
    await AsyncStorage.removeItem(TRANSITION_STATE_STORAGE_KEY);
  }
}

async function persistTransitionState() {
  const state = Object.fromEntries(insideStateByReminderId.entries());
  await AsyncStorage.setItem(TRANSITION_STATE_STORAGE_KEY, JSON.stringify(state));
}

if (!TaskManager.isTaskDefined(BACKGROUND_TASK_NAME)) {
  TaskManager.defineTask<{ locations?: LocationObject[] }>(BACKGROUND_TASK_NAME, async ({ data, error }) => {
    if (error) {
      console.error('[locationReminderMonitor] background-task failure:', error);
      return;
    }

    const locations = data?.locations ?? [];
    if (!locations.length) return;

    try {
      await loadTransitionState();
      const state = await readPersistedMonitorState();
      const accessToken = await getStoredAccessToken();
      if (!state?.reminders?.length || !accessToken) {
        debug('background location update skipped - missing reminders or auth token', {
          reminderCount: state?.reminders?.length ?? 0,
          hasAccessToken: Boolean(accessToken),
        });
        return;
      }

      for (const location of locations) {
        await handleLocationUpdate(
          location,
          {
            reminders: state.reminders,
            accessToken,
            onReminderTriggered: () => undefined,
          },
          'background',
        );
      }
    } catch (taskError) {
      console.error('[locationReminderMonitor] background-task processing failed:', taskError);
    }
  });
  debug('background task registered', { taskName: BACKGROUND_TASK_NAME });
} else {
  debug('background task already registered', { taskName: BACKGROUND_TASK_NAME });
}

async function startBackgroundUpdates() {
  try {
    const permissionGranted = await requestBackgroundLocationPermission();
    if (!permissionGranted) {
      console.warn('[locationReminderMonitor] background location permission denied.');
      return false;
    }
    debug('background permission granted');

    const started = await hasStartedLocationUpdatesAsync(BACKGROUND_TASK_NAME);
    if (!started) {
      await startLocationUpdatesAsync(BACKGROUND_TASK_NAME, {
        accuracy: Accuracy.Balanced,
        activityType: ActivityType.OtherNavigation,
        distanceInterval: 50,
        timeInterval: 60000,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'BeePlan location reminders',
          notificationBody: 'Monitoring active location reminders.',
        },
      });
      debug('background location task registration requested', { taskName: BACKGROUND_TASK_NAME });
    }

    debug('background location task started', { taskName: BACKGROUND_TASK_NAME });
    return true;
  } catch (error) {
    console.error('[locationReminderMonitor] background-task failure:', error);
    return false;
  }
}

export async function startSmartLocationReminderMonitor(options: SmartLocationReminderMonitorOptions) {
  if (!hasMonitorableReminder(options.reminders)) {
    try {
      if (await hasStartedLocationUpdatesAsync(BACKGROUND_TASK_NAME)) {
        await stopLocationUpdatesAsync(BACKGROUND_TASK_NAME);
        debug('background location task stopped - no active location reminders');
      }
    } catch (error) {
      console.error('[locationReminderMonitor] failed to stop background location task:', error);
    }
    return null;
  }

  await persistMonitorState(options.reminders);
  await loadTransitionState();

  const permissionGranted = await requestForegroundLocationPermission();
  if (!permissionGranted) {
    console.warn('[locationReminderMonitor] foreground location permission denied.');
    return null;
  }
  debug('foreground permission granted');
  const notificationPermission = await requestNotificationPermission();
  if (!notificationPermission) {
    console.warn('[locationReminderMonitor] notification permission denied; reminders can be monitored but alerts will not show.');
  } else {
    debug('notification permission granted');
  }

  debug('location monitor started', {
    specificPlaceReminders: options.reminders.filter(isEligibleSpecificPlace).length,
    smartCategoryReminders: options.reminders.filter(isEligibleSmartCategory).length,
  });
  void startBackgroundUpdates();

  getCurrentPositionAsync({ accuracy: Accuracy.Balanced })
    .then((location) => handleLocationUpdate(location, options, 'initial'))
    .catch((error: unknown) => {
      console.error('[locationReminderMonitor] initial location lookup failed:', error);
    });

  return watchPositionAsync(
    {
      accuracy: Accuracy.Balanced,
      distanceInterval: 75,
      timeInterval: 120000,
    },
    (location) => {
      void handleLocationUpdate(location, options, 'foreground');
    },
  );
}

export function stopSmartLocationReminderMonitor(subscription: LocationSubscription | null) {
  subscription?.remove();
  debug('foreground location monitor stopped');
}
