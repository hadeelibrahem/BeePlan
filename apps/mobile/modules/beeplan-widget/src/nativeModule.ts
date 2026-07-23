import { Platform } from 'react-native';

import type { BeePlanWidgetSnapshot } from './types';

export const isWidgetSupported = Platform.OS === 'android';

function loadNativeModule(): typeof import('./BeePlanWidgetModule').default | null {
  if (!isWidgetSupported) return null;
  try {
    return require('./BeePlanWidgetModule').default;
  } catch (error) {
    if (__DEV__) console.log('[BeePlanWidget] native module unavailable', String(error));
    return null;
  }
}

const native = loadNativeModule();

export const isWidgetAvailable = native != null;

/**
 * Push a snapshot to the Android home-screen widget. No-op (resolves) on
 * unsupported platforms or when the native module is absent, so callers never
 * need to branch on platform.
 */
export async function setWidgetSnapshot(snapshot: BeePlanWidgetSnapshot): Promise<void> {
  if (!native) return;
  try {
    await native.setSnapshot(JSON.stringify(snapshot));
  } catch (error) {
    if (__DEV__) console.log('[BeePlanWidget] setSnapshot failed', String(error));
  }
}

/** Clear all private widget content (logout). Safe no-op when unavailable. */
export async function clearWidgetSnapshot(): Promise<void> {
  if (!native) return;
  try {
    await native.clearSnapshot();
  } catch (error) {
    if (__DEV__) console.log('[BeePlanWidget] clearSnapshot failed', String(error));
  }
}
