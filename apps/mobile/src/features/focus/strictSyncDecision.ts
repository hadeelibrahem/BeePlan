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
  /** Whether the native blocker currently reports an active session. */
  nativeActive: boolean;
  /** Session id the native blocker is running, or null. */
  nativeSessionId: string | null;
  /** Session id we last armed, or null. */
  armedSessionId: string | null;
};

export type StrictSyncAction =
  | { type: 'noop' }
  | { type: 'arm'; sessionId: string }
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

  // Already armed for this exact session.
  if (i.armedSessionId === sessionId) {
    // Native drifted to a different session id → re-arm to replace it.
    if (i.nativeActive && i.nativeSessionId !== null && i.nativeSessionId !== sessionId) {
      return { type: 'arm', sessionId };
    }
    return { type: 'noop' };
  }

  // New (or changed) session that should be armed.
  return { type: 'arm', sessionId };
}
