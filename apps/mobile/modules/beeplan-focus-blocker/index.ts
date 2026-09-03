import type {
  BlockAttemptEvent,
  EmergencyExitEvent,
  BeeJustificationRequestEvent,
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
  installSignedTemporaryGrant,
  configureAppGuardRequestClient,
  getPendingAppGuardRequest,
  deliverAppGuardRequestResult,
  isAppGuardResultDeliveryAvailable,
  expireAppGuardRequest,
  allowAppTemporarily,
  emergencyExit,
  getInstalledApps,
  getManagementCapability,
  getSuspendedPackages,
  getStatistics,
  getStatus,
  hasOverlayPermission,
  hasUsageAccess,
  isFocusBlockerAvailable,
  isAppGuardRestrictionSyncAvailable,
  isFocusBlockerSupported,
  openOverlaySettings,
  openUsageAccessSettings,
  pauseStrictMode,
  resumeStrictMode,
  reconcileSuspendedPackages,
  startStrictMode,
  setAppGuardRestrictionSources,
  setGuardianRestrictionSources,
  stopStrictMode,
  suspendPackages,
  subscribeToEvents,
  unsuspendPackages,
} from "./src/nativeModule";

export type {
  BlockAttemptEvent,
  EmergencyExitEvent,
  BeeJustificationRequestEvent,
  FocusBlockerStatus,
  InstalledApp,
  SessionEndedEvent,
  StartStrictModeConfig,
};
