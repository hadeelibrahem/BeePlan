import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import {
  IDLE_STATUS,
  allowAppTemporarily,
  emergencyExit,
  getInstalledApps,
  getStatus,
  hasOverlayPermission as nativeHasOverlayPermission,
  hasUsageAccess as nativeHasUsageAccess,
  isFocusBlockerAvailable,
  isFocusBlockerSupported,
  openOverlaySettings,
  openUsageAccessSettings,
  startStrictMode,
  stopStrictMode,
  subscribeToEvents,
} from "../nativeModule";
import type {
  BlockAttemptEvent,
  FocusBlockerStatus,
  InstalledApp,
  StartStrictModeConfig,
} from "../types";

export type UseFocusBlockerOptions = {
  /** Fired every time the user tries to open a blocked app. */
  onBlockAttempt?: (event: BlockAttemptEvent) => void;
  /** Fired when the native session ends (completed, stopped or emergency exit). */
  onSessionEnded?: (sessionId: string, reason: string) => void;
};

export type UseFocusBlocker = ReturnType<typeof useFocusBlocker>;

/**
 * React binding for the native strict focus blocker.
 *
 * Owns a mirror of the native status, keeps a live `remainingMs` countdown in
 * JS, and re-checks Usage Access whenever the app returns to the foreground
 * (the user may have granted it in Settings while we were backgrounded).
 */
export function useFocusBlocker(options: UseFocusBlockerOptions = {}) {
  // Callbacks are invoked via cbRef so listeners don't re-subscribe each render.
  const [status, setStatus] = useState<FocusBlockerStatus>(() =>
    isFocusBlockerAvailable ? getStatus() : IDLE_STATUS,
  );
  const [usageAccess, setUsageAccess] = useState<boolean>(() =>
    isFocusBlockerAvailable ? nativeHasUsageAccess() : false,
  );
  const [overlayAccess, setOverlayAccess] = useState<boolean>(() =>
    isFocusBlockerAvailable ? nativeHasOverlayPermission() : false,
  );
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);

  // Latest callbacks without re-subscribing native listeners on every render.
  const cbRef = useRef(options);
  cbRef.current = options;

  const refreshUsageAccess = useCallback(() => {
    const granted = isFocusBlockerAvailable ? nativeHasUsageAccess() : false;
    setUsageAccess(granted);
    return granted;
  }, []);

  const refreshOverlayAccess = useCallback(() => {
    const granted = isFocusBlockerAvailable
      ? nativeHasOverlayPermission()
      : false;
    setOverlayAccess(granted);
    return granted;
  }, []);

  const refreshStatus = useCallback(() => {
    if (!isFocusBlockerAvailable) return IDLE_STATUS;
    const next = getStatus();
    setStatus(next);
    return next;
  }, []);

  // Native event subscriptions (status/attempt/session end).
  useEffect(() => {
    if (!isFocusBlockerAvailable) return;
    const subs = [
      subscribeToEvents("onStatusChange", (next) => setStatus(next)),
      subscribeToEvents("onBlockAttempt", (event) =>
        cbRef.current.onBlockAttempt?.(event),
      ),
      subscribeToEvents("onSessionEnded", (event) => {
        refreshStatus();
        cbRef.current.onSessionEnded?.(event.sessionId, event.reason);
      }),
      subscribeToEvents("onEmergencyExit", (event) => {
        cbRef.current.onSessionEnded?.(
          event.sessionId,
          `emergencyExit:${event.reason}`,
        );
      }),
    ];
    return () => subs.forEach((sub) => sub.remove());
  }, [refreshStatus]);

  // Re-check permission + status on foreground; sync back from native truth.
  useEffect(() => {
    if (!isFocusBlockerAvailable) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refreshUsageAccess();
        refreshOverlayAccess();
        refreshStatus();
      }
    });
    return () => sub.remove();
  }, [refreshStatus, refreshUsageAccess, refreshOverlayAccess]);

  // JS-side 1s countdown so the UI ticks even without native status pushes.
  useEffect(() => {
    if (!status.isActive || status.endsAtMs === null) return;
    const id = setInterval(() => {
      setStatus((current) => {
        if (!current.isActive || current.endsAtMs === null) return current;
        const remainingMs = Math.max(0, current.endsAtMs - Date.now());
        return remainingMs === current.remainingMs
          ? current
          : { ...current, remainingMs };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [status.isActive, status.endsAtMs]);

  const loadInstalledApps = useCallback(async () => {
    if (!isFocusBlockerAvailable) return [];
    setLoadingApps(true);
    try {
      const apps = await getInstalledApps();
      setInstalledApps(apps);
      return apps;
    } finally {
      setLoadingApps(false);
    }
  }, []);

  const start = useCallback(async (config: StartStrictModeConfig) => {
    const next = await startStrictMode(config);
    setStatus(next);
    return next;
  }, []);

  const stop = useCallback(async () => {
    const next = await stopStrictMode();
    setStatus(next);
    return next;
  }, []);

  const exitEmergency = useCallback(async (reason: string) => {
    const next = await emergencyExit(reason);
    setStatus(next);
    return next;
  }, []);

  return {
    /** True on Android (the only platform Strict Mode targets). */
    supported: isFocusBlockerSupported,
    /** True when the native module is actually linked (false in Expo Go / iOS). */
    available: isFocusBlockerAvailable,
    status,
    usageAccess,
    /** Whether "Display over other apps" is granted (reliable block screen). */
    overlayAccess,
    installedApps,
    loadingApps,
    refreshUsageAccess,
    refreshOverlayAccess,
    refreshStatus,
    openUsageAccessSettings,
    openOverlaySettings,
    loadInstalledApps,
    start,
    stop,
    emergencyExit: exitEmergency,
    allowAppTemporarily,
  };
}
