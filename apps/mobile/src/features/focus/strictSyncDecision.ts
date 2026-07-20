/**
 * Pure decision function behind useStrictFocusSync — extracted so the whole
 * arm/disarm state machine is unit-testable without a React renderer (the repo
 * runs plain `node --test` on pure modules).
 *
 * It answers a single question: given the JS session, the user's prefs, the
 * native blocker status and what we believe is currently armed, what should
 * happen next?
 */

export type StrictSyncInputs = {
  /** Native module linked and callable (false on iOS / Expo Go). */
  available: boolean;
  /** Strict Mode toggled on in prefs. */
  enabled: boolean;
  /** Number of apps the user chose to block. */
  blockedCount: number;
  /** Usage Access granted (required for foreground detection). */
  usageAccess: boolean;
  /** Current JS focus session id, or null when idle. */
  activeSessionId: string | null;
  /** Whether the JS focus session is currently paused (pausedSinceMs !== null). */
  jsPaused: boolean;
  /** Whether the native blocker currently reports an active session. */
  nativeActive: boolean;
  /** Whether the native blocker currently reports the session as paused. */
  nativePaused: boolean;
  /** Session id the native blocker is running, or null. */
  nativeSessionId: string | null;
  /** Session id we last armed, or null. */
  armedSessionId: string | null;
};

export type StrictSyncAction =
  | { type: 'noop' }
  | { type: 'arm'; sessionId: string }
  | { type: 'pause'; sessionId: string }
  | { type: 'resume'; sessionId: string }
  | { type: 'disarm'; reason: 'ended' | 'disabled' | 'stale' };

export function decideStrictSync(i: StrictSyncInputs): StrictSyncAction {
  const shouldArm =
    i.available &&
    i.enabled &&
    i.blockedCount > 0 &&
    i.usageAccess &&
    i.activeSessionId !== null;

  if (!shouldArm) {
    // We armed something that should no longer be armed → tear it down.
    if (i.armedSessionId !== null) {
      return { type: 'disarm', reason: i.activeSessionId === null ? 'ended' : 'disabled' };
    }
    // Reconcile drift: native is blocking but there is no JS session for it.
    if (i.available && i.activeSessionId === null && i.nativeActive) {
      return { type: 'disarm', reason: 'stale' };
    }
    return { type: 'noop' };
  }

  const sessionId = i.activeSessionId as string;
  const armedForThis = i.armedSessionId === sessionId;
  const nativeForThis = i.nativeActive && i.nativeSessionId === sessionId;

  // No native session for this id yet (and we did not arm it) → start fresh.
  // Keying off nativeForThis as well means a session the native side is already
  // running (e.g. after a JS reload) is adopted rather than started twice.
  if (!armedForThis && !nativeForThis) {
    return { type: 'arm', sessionId };
  }

  // We armed this id but native drifted to a different one → replace it.
  if (armedForThis && i.nativeActive && i.nativeSessionId !== null && i.nativeSessionId !== sessionId) {
    return { type: 'arm', sessionId };
  }

  // Native is running our session: reconcile only the paused gate, never restart
  // the service. This is what makes Pause actually release the blocked apps.
  if (nativeForThis && i.jsPaused && !i.nativePaused) {
    return { type: 'pause', sessionId };
  }
  if (nativeForThis && !i.jsPaused && i.nativePaused) {
    return { type: 'resume', sessionId };
  }

  return { type: 'noop' };
}
