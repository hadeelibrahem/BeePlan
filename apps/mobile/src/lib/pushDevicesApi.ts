import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import getExpoPushTokenAsync from 'expo-notifications/build/getExpoPushTokenAsync';
import { getPermissionsAsync, requestPermissionsAsync } from 'expo-notifications/build/NotificationPermissions';
import getNotificationChannelAsync from 'expo-notifications/build/getNotificationChannelAsync';
import setNotificationChannelAsync from 'expo-notifications/build/setNotificationChannelAsync';
import {
  AndroidAudioContentType,
  AndroidAudioUsage,
  AndroidImportance,
} from 'expo-notifications/build/NotificationChannelManager.types';
import { apiFetch, readJsonOrThrow } from './apiClient';

const INSTALLATION_KEY = 'beeplan_push_installation_id';
export const EXPO_PROJECT_ID = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
export const BEEPLAN_DEFAULT_ANDROID_CHANNEL_ID = 'beeplan-default-v2';
export const BEEPLAN_DEFAULT_ANDROID_CHANNEL = {
  name: 'BeePlan alerts',
  importance: AndroidImportance.HIGH,
  sound: 'default',
  enableVibrate: true,
  vibrationPattern: [0, 250, 250, 250],
  showBadge: true,
  audioAttributes: {
    usage: AndroidAudioUsage.NOTIFICATION,
    contentType: AndroidAudioContentType.SONIFICATION,
    flags: {
      enforceAudibility: false,
      requestHardwareAudioVideoSynchronization: false,
    },
  },
};

function maskToken(token: string) {
  return token.length > 16 ? `${token.slice(0, 8)}…${token.slice(-4)}` : '[masked]';
}

function maskInstallationId(installationId: string) {
  return installationId.length > 12
    ? `${installationId.slice(0, 7)}…${installationId.slice(-4)}`
    : '[masked]';
}

export type PushRegistrationState = 'granted' | 'denied' | 'unavailable' | 'registered' | 'failed';

export async function getInstallationId() {
  const existing = await AsyncStorage.getItem(INSTALLATION_KEY);
  if (existing) return existing;
  const value = `${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await AsyncStorage.setItem(INSTALLATION_KEY, value);
  return value;
}

export type PushRegistrationDependencies = {
  platform: string;
  projectId?: string;
  getPermission: typeof getPermissionsAsync;
  requestPermission: typeof requestPermissionsAsync;
  createAndroidChannel: typeof setNotificationChannelAsync;
  getExpoToken: typeof getExpoPushTokenAsync;
  getInstallationId: () => Promise<string>;
  register: (accessToken: string, payload: { expoPushToken: string; platform: 'android' | 'ios'; installationId: string; deviceName?: string; appVersion?: string }) => Promise<void>;
};

const CHANNELS = [
  ['tasks', 'Tasks', AndroidImportance.HIGH],
  ['calendar', 'Calendar', AndroidImportance.DEFAULT],
  ['focus', 'Focus', AndroidImportance.HIGH],
  ['collaboration', 'Collaboration', AndroidImportance.HIGH],
  ['ai', 'AI Planner', AndroidImportance.DEFAULT],
  ['reminders', 'Reminders', AndroidImportance.HIGH],
] as const;

export async function registerPushDevice(
  accessToken: string,
  requestPermission: boolean,
  dependencies: PushRegistrationDependencies,
): Promise<PushRegistrationState> {
  if (!['android', 'ios'].includes(dependencies.platform) || !dependencies.projectId) {
    if (__DEV__) console.warn('[push] registration_failure', { reason: 'unavailable', platform: dependencies.platform, hasProjectId: Boolean(dependencies.projectId) });
    return 'unavailable';
  }
  let stage: 'permission' | 'token' | 'backend' = 'permission';
  try {
    let permission = await dependencies.getPermission();
    if (__DEV__) console.log('[push] permission_status', { platform: dependencies.platform, granted: permission.granted, canAskAgain: permission.canAskAgain });
    if (!permission.granted && requestPermission && permission.canAskAgain) {
      permission = await dependencies.requestPermission();
      if (__DEV__) console.log('[push] permission_status', { platform: dependencies.platform, granted: permission.granted, canAskAgain: permission.canAskAgain, requested: true });
    }
    if (!permission.granted) return 'denied';

    if (dependencies.platform === 'android') {
      await dependencies.createAndroidChannel(
        BEEPLAN_DEFAULT_ANDROID_CHANNEL_ID,
        BEEPLAN_DEFAULT_ANDROID_CHANNEL,
      );
      for (const [id, name, importance] of CHANNELS) {
        await dependencies.createAndroidChannel(id, { name, importance, sound: 'default' });
      }
    }

    stage = 'token';
    if (__DEV__) console.log('[push] token_request_started', { platform: dependencies.platform, projectIdConfigured: true });
    const token = await dependencies.getExpoToken({ projectId: dependencies.projectId });
    const installationId = await dependencies.getInstallationId();
    if (__DEV__) console.log('[push] token_obtained', { token: maskToken(token.data), platform: dependencies.platform, projectIdConfigured: true });
    const payload = {
      expoPushToken: token.data,
      platform: dependencies.platform as 'android' | 'ios',
      installationId,
      deviceName: Application.applicationName ?? undefined,
      appVersion: Application.nativeApplicationVersion ?? undefined,
    };
    stage = 'backend';
    if (__DEV__) console.log('[push] backend_registration_started', { platform: payload.platform, installationId: maskInstallationId(installationId), token: maskToken(token.data) });
    await dependencies.register(accessToken, payload);
    if (__DEV__) console.log('[push] backend_registration_success', { platform: payload.platform, installationId: maskInstallationId(installationId) });
    return 'registered';
  } catch (error) {
    const details = { message: error instanceof Error ? error.message : String(error), retryable: true };
    if (__DEV__ && stage === 'backend') console.warn('[push] backend_registration_failed', details);
    if (__DEV__ && stage === 'token') console.warn('[push] token_request_failed', details);
    if (__DEV__) console.warn('[push] registration_failure', { ...details, stage });
    return 'failed';
  }
}

export async function registerCurrentDevice(accessToken: string, requestPermission = false): Promise<PushRegistrationState> {
  return registerPushDevice(accessToken, requestPermission, {
    platform: Platform.OS,
    projectId: EXPO_PROJECT_ID,
    getPermission: getPermissionsAsync,
    requestPermission: requestPermissionsAsync,
    createAndroidChannel: setNotificationChannelAsync,
    getExpoToken: getExpoPushTokenAsync,
    getInstallationId,
    register: async (currentAccessToken, payload) => {
      const response = await apiFetch('/push-devices/register', {
        method: 'POST',
        headers: { Authorization: `Bearer ${currentAccessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await readJsonOrThrow(response, 'push device registration');
    },
  });
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

export type AndroidPushChannelStatus = {
  exists: boolean;
  id: string;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  badgeEnabled: boolean;
  importance: AndroidImportance | null;
};

export async function getDefaultAndroidPushChannelStatus(): Promise<AndroidPushChannelStatus | null> {
  if (Platform.OS !== 'android') return null;
  const channel = await getNotificationChannelAsync(BEEPLAN_DEFAULT_ANDROID_CHANNEL_ID);
  if (!channel) {
    return {
      exists: false,
      id: BEEPLAN_DEFAULT_ANDROID_CHANNEL_ID,
      soundEnabled: false,
      vibrationEnabled: false,
      badgeEnabled: false,
      importance: null,
    };
  }
  return {
    exists: true,
    id: channel.id,
    soundEnabled: channel.sound !== null,
    vibrationEnabled: channel.enableVibrate,
    badgeEnabled: channel.showBadge,
    importance: channel.importance,
  };
}
