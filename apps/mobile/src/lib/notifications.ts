// IMPORTANT: do NOT `import * as Notifications from 'expo-notifications'` (or import
// anything from its package root) here. That barrel re-exports
// `DevicePushTokenAutoRegistration.fx`, a side-effect module that unconditionally calls
// `addPushTokenListener` the moment the package is imported — which crashes with
// "Android Push notifications (remote notifications) functionality was removed from
// Expo Go with SDK 53" because Expo Go no longer ships the native remote-push module.
// We only need LOCAL notifications, so we import the specific submodules that provide
// requestPermissionsAsync / scheduleNotificationAsync / setNotificationHandler / Android
// notification channels, none of which touch push tokens.
import { getPermissionsAsync, requestPermissionsAsync } from 'expo-notifications/build/NotificationPermissions';
import { setNotificationHandler } from 'expo-notifications/build/NotificationsHandler';
import { SchedulableTriggerInputTypes } from 'expo-notifications/build/Notifications.types';
import { AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types';
import cancelScheduledNotificationAsync from 'expo-notifications/build/cancelScheduledNotificationAsync';
import scheduleNotificationAsync from 'expo-notifications/build/scheduleNotificationAsync';
import setNotificationChannelAsync from 'expo-notifications/build/setNotificationChannelAsync';
import { Platform } from 'react-native';
import type { ReminderPriority } from '../features/reminders/types/reminders.types';

const DEFAULT_NOTIFICATION_BODY = 'BeePlan Reminder';

// Mirrors the priority dot colors used on ReminderCard, so the notification
// accent color (Android only — iOS does not support per-notification color)
// matches what the user already associates with each priority in the app.
const PRIORITY_NOTIFICATION_COLORS: Record<ReminderPriority, string> = {
  low: '#94A3B8',
  medium: '#fdef4b',
  high: '#FB923C',
  urgent: '#FB7185',
};

setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export class NotificationPermissionDeniedError extends Error {
  constructor() {
    super('Notification permission was denied. Enable notifications in your device settings to get reminded.');
    this.name = 'NotificationPermissionDeniedError';
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const current = await getPermissionsAsync();
    if (current.granted) return true;

    const requested = await requestPermissionsAsync();
    return requested.granted;
  } catch (error) {
    console.error('[notifications] failed to request notification permission:', error);
    return false;
  }
}

export type ScheduleReminderNotificationInput = {
  title: string;
  body?: string;
  triggerDateTime: string;
  priority: ReminderPriority;
};

/**
 * Schedules a LOCAL notification for a Time Reminder. No push tokens, no remote
 * notifications — only `scheduleNotificationAsync` with a DATE trigger. Throws
 * NotificationPermissionDeniedError if the user has not granted permission, and a plain
 * Error if the trigger time is invalid or already in the past — callers should catch and
 * surface these without blocking reminder creation, since the reminder itself is already
 * persisted on the backend by then.
 */
export async function scheduleReminderNotification({
  title,
  body,
  triggerDateTime,
  priority,
}: ScheduleReminderNotificationInput): Promise<string> {
  const granted = await requestNotificationPermission();

  if (!granted) {
    throw new NotificationPermissionDeniedError();
  }

  const triggerDate = new Date(triggerDateTime);

  if (!Number.isFinite(triggerDate.getTime())) {
    throw new Error(`Invalid triggerDateTime for notification: ${triggerDateTime}`);
  }

  if (triggerDate.getTime() <= Date.now()) {
    throw new Error('Cannot schedule a notification for a time in the past.');
  }

  const notificationColor = PRIORITY_NOTIFICATION_COLORS[priority];

  if (Platform.OS === 'android') {
    await setNotificationChannelAsync('reminders', {
      name: 'Reminders',
      importance: AndroidImportance.HIGH,
      sound: 'default',
      lightColor: notificationColor,
    });
  }

  return scheduleNotificationAsync({
    content: {
      title,
      body: body || DEFAULT_NOTIFICATION_BODY,
      sound: 'default',
      // Android-only — accent color of the notification, driven by reminder priority.
      // iOS silently ignores this field; badge is intentionally left unset (disabled).
      color: notificationColor,
    },
    trigger: {
      type: SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
      channelId: Platform.OS === 'android' ? 'reminders' : undefined,
    },
  });
}

/**
 * Cancels a previously scheduled local notification. Resolves without throwing even if the
 * identifier no longer refers to a pending notification (already fired, or never existed).
 */
export async function cancelScheduledNotification(notificationId: string): Promise<void> {
  try {
    await cancelScheduledNotificationAsync(notificationId);
  } catch (error) {
    console.error('[notifications] failed to cancel scheduled notification:', notificationId, error);
  }
}
