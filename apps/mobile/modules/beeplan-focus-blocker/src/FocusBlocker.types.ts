/**
 * Public type surface for the BeePlanFocusBlocker native module.
 *
 * These types are the single source of truth shared by the native bridge,
 * the React hooks, and any screen that consumes strict focus mode. The native
 * Kotlin side mirrors these shapes exactly (see BlockerController.statusMap /
 * BlockEventStore.toMap), so keep the two in sync when editing.
 */

/** A launchable application installed on the device. */
export type InstalledApp = {
  /** Stable Android package identifier, e.g. "com.instagram.android". */
  packageName: string;
  /** Human-readable label shown in the picker, e.g. "Instagram". */
  appName: string;
  /**
   * Launcher icon encoded as a base64 PNG data URI (`data:image/png;base64,…`)
   * or `null` when the icon could not be rasterised. Never a bare display name.
   */
  icon: string | null;
  /** True when the OS flags the app as a system app (Chrome, etc. may be system). */
  system: boolean;
};

/** Reason a strict session stopped, surfaced on the `onSessionEnded` event. */
export type SessionEndReason = 'completed' | 'stopped' | 'emergencyExit';

/** Live status of the native blocker, mirrored into React state. */
export type FocusBlockerStatus = {
  /** True while the foreground monitoring service is running. */
  isActive: boolean;
  /** True when app blocking (not just the timer) is armed. */
  strict: boolean;
  /** Identifier of the owning focus session, or null when idle. */
  sessionId: string | null;
  /** Title of the task being focused on, shown on the block screen. */
  taskTitle: string | null;
  /** Wall-clock end time (ms since epoch), or null when idle. */
  endsAtMs: number | null;
  /** Derived remaining milliseconds, clamped at 0. */
  remainingMs: number;
  /** Packages currently being blocked. */
  blockedPackages: string[];
  /** Whether Usage Access has been granted — required for foreground detection. */
  hasUsageAccess: boolean;
  /**
   * Whether "Display over other apps" is granted. Strongly recommended: without
   * it the block screen cannot reliably appear on Android 14+.
   */
  canDrawOverlays: boolean;
};

/** Configuration passed to `startStrictMode`. */
export type StartStrictModeConfig = {
  /** Focus session id; ties block statistics back to the session. */
  sessionId: string;
  /** Task title rendered on the block screen and notification. */
  taskTitle?: string | null;
  /** Wall-clock start time in ms since epoch. Used for the block-screen progress ring. */
  startedAtMs?: number;
  /** Wall-clock end time in ms since epoch. The native countdown derives from this. */
  endsAtMs: number;
  /** Packages to interrupt while the session is active. */
  blockedPackages: string[];
  /** Copy shown under the timer on the block screen. */
  motivationalMessage?: string;
  /** When false, the "I really need this app" escape hatch is hidden. Defaults to true. */
  allowEmergencyExit?: boolean;
};

/** A single logged attempt to open a blocked app. */
export type BlockEvent = {
  sessionId: string;
  packageName: string;
  appName: string;
  /** When the attempt was detected (ms since epoch). */
  timestampMs: number;
  /** How long the block screen held the user before they returned (ms). */
  interruptedMs: number;
};

/** Aggregated statistics for a session, computed natively. */
export type BlockStatistics = {
  sessionId: string | null;
  totalAttempts: number;
  totalInterruptedMs: number;
  byPackage: { packageName: string; appName: string; attempts: number }[];
  events: BlockEvent[];
};

/** Payload for the `onBlockAttempt` event. */
export type BlockAttemptEvent = {
  sessionId: string;
  packageName: string;
  appName: string;
  timestampMs: number;
};

/** Payload for the `onSessionEnded` event. */
export type SessionEndedEvent = {
  sessionId: string;
  reason: SessionEndReason;
};

/** Payload for the `onEmergencyExit` event. */
export type EmergencyExitEvent = {
  sessionId: string;
  reason: string;
  timestampMs: number;
};

/** Event map consumed by `addListener`. */
export type FocusBlockerEvents = {
  onStatusChange: (status: FocusBlockerStatus) => void;
  onBlockAttempt: (event: BlockAttemptEvent) => void;
  onSessionEnded: (event: SessionEndedEvent) => void;
  onEmergencyExit: (event: EmergencyExitEvent) => void;
};
