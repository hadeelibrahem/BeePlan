import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import {
  NotificationPermissionDeniedError,
  cancelScheduledNotification,
  scheduleReminderNotification,
} from '../../../lib/notifications';
import type { Reminder } from '../types/reminders.types';

// Maps reminder id -> the identifier scheduleNotificationAsync resolved with, so a later
// edit can cancel the exact previously-scheduled notification instead of leaving it to
// fire at the old date/time alongside a new one.
const STORAGE_KEY = 'beeplan_reminder_notification_ids';

async function readNotificationIdMap(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch (error) {
    console.error('[reminderNotificationSync] failed to read stored notification ids:', error);
    return {};
  }
}

async function writeNotificationIdMap(map: Record<string, string>): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (error) {
    console.error('[reminderNotificationSync] failed to persist stored notification ids:', error);
  }
}

/**
 * Cancels any local notification previously scheduled for this reminder (if one was
 * recorded), then schedules a fresh one if it's still a time reminder with a future
 * trigger. Used after both create and edit so an edited reminder never ends up with two
 * live notifications or one still pointing at the old date/time. Permission-denied and
 * scheduling errors are caught and surfaced via Alert, matching the original create-only
 * behavior, so a notification failure never blocks the reminder save itself.
 */
export async function scheduleTimeReminderNotification(reminder: Reminder): Promise<void> {
  const map = await readNotificationIdMap();
  const existingNotificationId = map[reminder.id];

  if (existingNotificationId) {
    await cancelScheduledNotification(existingNotificationId);
    console.log(
      '[reminderNotificationSync] canceled old notification for reminder',
      reminder.id,
      existingNotificationId,
    );
    delete map[reminder.id];
    await writeNotificationIdMap(map);
  }

  if (reminder.type !== 'time' || !reminder.remindAt) return;

  try {
    const notificationId = await scheduleReminderNotification({
      title: reminder.title,
      body: reminder.description,
      triggerDateTime: reminder.remindAt,
      priority: reminder.priority,
    });

    console.log(
      '[reminderNotificationSync] scheduled new notification for reminder',
      reminder.id,
      notificationId,
    );

    const latestMap = await readNotificationIdMap();
    latestMap[reminder.id] = notificationId;
    await writeNotificationIdMap(latestMap);
  } catch (error) {
    if (error instanceof NotificationPermissionDeniedError) {
      console.warn('[reminderNotificationSync] notification permission denied:', error.message);
      Alert.alert('Notifications disabled', error.message);
      return;
    }

    console.error('[reminderNotificationSync] failed to schedule notification:', error);
  }
}
