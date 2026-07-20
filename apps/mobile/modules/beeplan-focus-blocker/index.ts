import type {
  BlockAttemptEvent,
  EmergencyExitEvent,
  FocusBlockerStatus,
  InstalledApp,
  SessionEndedEvent,
  StartStrictModeConfig,
} from "./src/types";

export * from "./src/types";
export {
  useFocusBlocker,
  type UseFocusBlocker,
  type UseFocusBlockerOptions,
} from "./src/hooks/useFocusBlocker";
export {
  allowAppTemporarily,
  emergencyExit,
  getInstalledApps,
  getStatistics,
  getStatus,
  hasOverlayPermission,
  hasUsageAccess,
  isFocusBlockerAvailable,
  isFocusBlockerSupported,
  openOverlaySettings,
  openUsageAccessSettings,
  pauseStrictMode,
  resumeStrictMode,
  startStrictMode,
  stopStrictMode,
  subscribeToEvents,
} from "./src/nativeModule";

export type {
  BlockAttemptEvent,
  EmergencyExitEvent,
  FocusBlockerStatus,
  InstalledApp,
  SessionEndedEvent,
  StartStrictModeConfig,
};
