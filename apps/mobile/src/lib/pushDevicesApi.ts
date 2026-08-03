import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import getExpoPushTokenAsync from 'expo-notifications/build/getExpoPushTokenAsync';
import { getPermissionsAsync, requestPermissionsAsync } from 'expo-notifications/build/NotificationPermissions';
import setNotificationChannelAsync from 'expo-notifications/build/setNotificationChannelAsync';
import { AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types';
import { apiFetch, readJsonOrThrow } from './apiClient';

const INSTALLATION_KEY = 'beeplan_push_installation_id';
const PROJECT_ID = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

export type PushRegistrationState = 'granted' | 'denied' | 'unavailable' | 'registered' | 'failed';

export async function getInstallationId() {
  const existing = await AsyncStorage.getItem(INSTALLATION_KEY);
  if (existing) return existing;
  const value = `${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await AsyncStorage.setItem(INSTALLATION_KEY, value);
  return value;
}

export async function registerCurrentDevice(accessToken: string, explain = false): Promise<PushRegistrationState> {
  if (Platform.OS === 'web' || !PROJECT_ID) return 'unavailable';
  try {
    const current = await getPermissionsAsync();
    if (!current.granted) {
      if (explain) {
        // The caller presents its own explanation UI before invoking this function.
      }
      const requested = await requestPermissionsAsync();
      if (!requested.granted) return 'denied';
    }
    if (Platform.OS === 'android') {
      for (const [id, name, importance] of [['tasks', 'Tasks', AndroidImportance.HIGH], ['calendar', 'Calendar', AndroidImportance.DEFAULT], ['focus', 'Focus', AndroidImportance.HIGH], ['collaboration', 'Collaboration', AndroidImportance.HIGH], ['ai', 'AI Planner', AndroidImportance.DEFAULT], ['reminders', 'Reminders', AndroidImportance.HIGH]] as const) await setNotificationChannelAsync(id, { name, importance, sound: 'default' });
    }
    const token = await getExpoPushTokenAsync({ projectId: PROJECT_ID });
    const installationId = await getInstallationId();
    const response = await apiFetch('/push-devices/register', { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ expoPushToken: token.data, platform: Platform.OS, installationId, deviceName: Application.applicationName ?? undefined, appVersion: Application.nativeApplicationVersion ?? undefined }) });
    await readJsonOrThrow(response, 'push device registration');
    return 'registered';
  } catch (error) {
    if (__DEV__) console.warn('[push] registration failed', error instanceof Error ? error.message : error);
    return 'failed';
  }
}

export async function setPushDeviceEnabled(accessToken: string, enabled: boolean) {
  const installationId = await getInstallationId();
  const response = await apiFetch(`/push-devices/${encodeURIComponent(installationId)}`, { method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) });
  return readJsonOrThrow<{ enabled: boolean }>(response, 'push device update');
}

export async function getPushDeviceStatus(accessToken: string, installationId: string) {
  const response = await apiFetch('/push-devices', { headers: { Authorization: `Bearer ${accessToken}` } });
  const devices = await readJsonOrThrow<Array<{ installationId: string; enabled: boolean }>>(response, 'push devices');
  return devices.find((device) => device.installationId === installationId) ?? null;
}

export async function disableCurrentDevice(accessToken: string) {
  const installationId = await getInstallationId();
  const response = await apiFetch(`/push-devices/${encodeURIComponent(installationId)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } });
  return readJsonOrThrow<{ success: boolean }>(response, 'push device removal');
}
