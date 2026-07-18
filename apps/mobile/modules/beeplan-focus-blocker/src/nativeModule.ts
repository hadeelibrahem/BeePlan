import { Platform } from "react-native";
import type { EventSubscription } from "expo-modules-core";

import type {
  BlockStatistics,
  FocusBlockerEvents,
  FocusBlockerStatus,
  InstalledApp,
  StartStrictModeConfig,
} from "./types";

export const isFocusBlockerSupported = Platform.OS === "android";

function loadNativeModule():
  typeof import("./BeePlanFocusBlockerModule").default | null {
  if (!isFocusBlockerSupported) return null;
  try {
    const mod = require("./BeePlanFocusBlockerModule").default;
    if (__DEV__)
      console.log("[StrictMode] native module available", mod != null);
    return mod;
  } catch (error) {
    if (__DEV__)
      console.log("[StrictMode] native module available", false, String(error));
    return null;
  }
}

const native = loadNativeModule();

export const isFocusBlockerAvailable = native != null;

export const IDLE_STATUS: FocusBlockerStatus = {
  isActive: false,
  strict: false,
  sessionId: null,
  taskTitle: null,
  endsAtMs: null,
  remainingMs: 0,
  blockedPackages: [],
  hasUsageAccess: false,
  canDrawOverlays: false,
};

export function hasUsageAccess(): boolean {
  return native?.hasUsageAccess() ?? false;
}

export function openUsageAccessSettings(): void {
  native?.openUsageAccessSettings();
}

export function hasOverlayPermission(): boolean {
  return native?.hasOverlayPermission() ?? false;
}

export function openOverlaySettings(): void {
  native?.openOverlaySettings();
}

export async function getInstalledApps(): Promise<InstalledApp[]> {
  return (await native?.getInstalledApps()) ?? [];
}

export async function startStrictMode(
  config: StartStrictModeConfig,
): Promise<FocusBlockerStatus> {
  return (await native?.startStrictMode(config)) ?? IDLE_STATUS;
}

export async function stopStrictMode(): Promise<FocusBlockerStatus> {
  return (await native?.stopStrictMode()) ?? IDLE_STATUS;
}

export function getStatus(): FocusBlockerStatus {
  return native?.getStatus() ?? IDLE_STATUS;
}

export async function getStatistics(
  sessionId?: string | null,
): Promise<BlockStatistics> {
  const raw = await native?.getStatistics(sessionId ?? null);
  return (
    (raw as BlockStatistics | undefined) ?? {
      sessionId: sessionId ?? null,
      totalAttempts: 0,
      totalInterruptedMs: 0,
      byPackage: [],
      events: [],
    }
  );
}

export async function emergencyExit(
  reason: string,
): Promise<FocusBlockerStatus> {
  return (await native?.emergencyExit(reason)) ?? IDLE_STATUS;
}

export async function allowAppTemporarily(
  packageName: string,
  durationMs: number,
): Promise<void> {
  await native?.allowAppTemporarily(packageName, durationMs);
}

export function subscribeToEvents<K extends keyof FocusBlockerEvents>(
  event: K,
  listener: FocusBlockerEvents[K],
): EventSubscription {
  if (!native) return { remove() {} } as EventSubscription;
  return native.addListener(event as never, listener as never);
}
