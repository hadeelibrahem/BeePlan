import { NativeModule, requireNativeModule } from 'expo';

import type {
  BlockAttemptEvent,
  EmergencyExitEvent,
  FocusBlockerStatus,
  InstalledApp,
  SessionEndedEvent,
  StartStrictModeConfig,
} from './FocusBlocker.types';

/**
 * Strongly typed handle to the native `BeePlanFocusBlocker` Kotlin module.
 *
 * The event map here must match `Events(...)` in the Kotlin module definition.
 * All methods degrade gracefully on unsupported platforms: `requireNativeModule`
 * throws on iOS/web, so consumers should guard with `Platform.OS === 'android'`
 * (the hook in ./hooks/useFocusBlocker does this for you).
 */
declare class BeePlanFocusBlockerModuleType extends NativeModule<{
  onStatusChange: (status: FocusBlockerStatus) => void;
  onBlockAttempt: (event: BlockAttemptEvent) => void;
  onSessionEnded: (event: SessionEndedEvent) => void;
  onEmergencyExit: (event: EmergencyExitEvent) => void;
}> {
  /** Synchronously returns whether Usage Access is granted. */
  hasUsageAccess(): boolean;
  /** Opens the system Usage Access settings screen. */
  openUsageAccessSettings(): void;
  /** Synchronously returns whether "Display over other apps" is granted. */
  hasOverlayPermission(): boolean;
  /** Opens the system "Display over other apps" settings screen. */
  openOverlaySettings(): void;
  /** Returns launchable apps with icons, sorted by label. */
  getInstalledApps(): Promise<InstalledApp[]>;
  /** Arms the foreground service + blocking for the given config. */
  startStrictMode(config: StartStrictModeConfig): Promise<FocusBlockerStatus>;
  /** Tears down the service and blocking. Safe to call when idle. */
  stopStrictMode(): Promise<FocusBlockerStatus>;
  /** Suspends blocking without ending the session. Safe to call when idle/paused. */
  pauseStrictMode(): Promise<FocusBlockerStatus>;
  /**
   * Re-arms blocking for a paused session without restarting the service.
   * `endsAtMs` (ms since epoch), when provided, refreshes the wall-clock end so
   * time spent paused is not counted against the session.
   */
  resumeStrictMode(endsAtMs?: number | null): Promise<FocusBlockerStatus>;
  /** Synchronous snapshot of the current status. */
  getStatus(): FocusBlockerStatus;
  /** Returns raw block events, optionally filtered to a session id. */
  getStatistics(sessionId?: string | null): Promise<unknown>;
  /** Logs an emergency exit and ends the session. */
  emergencyExit(reason: string): Promise<FocusBlockerStatus>;
  /** Temporarily whitelists a package (e.g. after "I really need this app"). */
  allowAppTemporarily(packageName: string, durationMs: number): Promise<void>;
}

// Resolved lazily so importing this file on iOS/web does not throw at module load.
export default requireNativeModule<BeePlanFocusBlockerModuleType>('BeePlanFocusBlocker');
