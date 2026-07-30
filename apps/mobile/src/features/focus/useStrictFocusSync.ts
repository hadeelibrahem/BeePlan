import { useCallback, useEffect, useRef, useState } from 'react';

import {
  pauseStrictMode,
  resumeStrictMode,
  startStrictMode,
  stopStrictMode,
  type UseFocusBlocker,
} from '../../../modules/beeplan-focus-blocker';
import type { ActiveFocus } from '../../lib/useFocusSession';
import type { StrictModePrefs } from './strictModeStorage';
import { decideStrictSync } from './strictSyncDecision';

type Params = {
  /** The live focus session from useFocusSession (null when idle). */
  active: ActiveFocus | null;
  /** Remaining milliseconds from useFocusSession, used to derive the native end time. */
  remainingMs: number;
  prefs: StrictModePrefs;
  blocker: UseFocusBlocker;
};

export type StrictSyncState = {
  /** True while the native start call is in flight. */
  arming: boolean;
  /** Non-null when the most recent arm attempt failed. */
  error: string | null;
  clearError: () => void;
};

/**
 * Single owner of native arm/disarm, driven purely by the JS session lifecycle
 * via the pure {@link decideStrictSync} state machine.
 *
 * MUST be mounted somewhere that outlives navigation between the Focus screen
 * and the full-screen session workspace (the app root), because it deliberately
 * does NOT stop blocking on unmount — only when the focus session actually ends.
 */
export function useStrictFocusSync({ active, remainingMs, prefs, blocker }: Params): StrictSyncState {
  const armedSessionRef = useRef<string | null>(null);
  const [arming, setArming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Snapshot live values the async arm needs, without widening effect deps.
  const remainingRef = useRef(remainingMs);
  remainingRef.current = remainingMs;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const activeRef = useRef(active);
  activeRef.current = active;

  const clearError = useCallback(() => setError(null), []);

  const activeSessionId = active?.sessionId ?? null;
  const activeEndsAtMs = active?.endsAtMs ?? null;
  // Last native end we pushed, so we only refresh when the JS deadline actually
  // moves (an "Add More Time" extension), not on every render.
  const syncedEndRef = useRef<number | null>(null);
  // The JS session is the source of truth for paused; native mirrors it.
  const jsPaused = active?.pausedSinceMs != null;

  useEffect(() => {
    let cancelled = false;

    const action = decideStrictSync({
      available: blocker.available,
      enabled: prefs.enabled,
      blockedCount: prefs.blockedPackages.length,
      usageAccess: blocker.usageAccess,
      activeSessionId,
      jsPaused,
      nativeActive: blocker.status.isActive,
      nativePaused: blocker.status.isPaused,
      nativeSessionId: blocker.status.sessionId,
      armedSessionId: armedSessionRef.current,
    });

    if (action.type === 'noop') return;

    if (action.type === 'disarm') {
      armedSessionRef.current = null;
      setArming(false);
      void stopStrictMode().catch(() => undefined);
      return;
    }

    // Pause / resume the native gate without restarting the service. We keep
    // armedSessionRef pointing at this session — it is still armed, just idle.
    if (action.type === 'pause') {
      armedSessionRef.current = action.sessionId;
      void pauseStrictMode().catch(() => undefined);
      return;
    }

    if (action.type === 'resume') {
      armedSessionRef.current = action.sessionId;
      // Refresh the native end so paused time is not counted against the timer.
      void resumeStrictMode(Date.now() + remainingRef.current).catch(() => undefined);
      return;
    }

    // action.type === 'arm'
    armedSessionRef.current = action.sessionId;
    setArming(true);
    setError(null);

    (async () => {
      try {
        const current = activeRef.current;
        await startStrictMode({
          sessionId: action.sessionId,
          taskTitle: current?.taskTitle ?? null,
          startedAtMs: current?.startedAtMs,
          endsAtMs: Date.now() + remainingRef.current,
          blockedPackages: prefsRef.current.blockedPackages,
          allowEmergencyExit: prefsRef.current.allowEmergencyExit,
        });
        if (!cancelled) setArming(false);
      } catch (err) {
        // Do not leave a misleading armed state — allow a retry on next change.
        if (!cancelled) {
          armedSessionRef.current = null;
          setArming(false);
          setError(err instanceof Error ? err.message : 'App blocking failed to start.');
        }
        void stopStrictMode().catch(() => undefined);
      }
    })();

    return () => {
      cancelled = true;
    };
    // remainingMs excluded on purpose: snapshotted via remainingRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeSessionId,
    jsPaused,
    prefs.enabled,
    prefs.blockedPackages,
    blocker.available,
    blocker.usageAccess,
    blocker.status.isActive,
    blocker.status.isPaused,
    blocker.status.sessionId,
  ]);

  // Keep the native gate's end time in step with JS extensions. When the JS
  // deadline moves forward while the native service is already running our
  // session (and not paused), push the new end so app-blocking does not release
  // at the pre-extension time. Only forward moves are propagated (extensions and
  // pause-shifts), never a shortening; native errors are swallowed as elsewhere.
  useEffect(() => {
    const running =
      blocker.available &&
      blocker.status.isActive &&
      !blocker.status.isPaused &&
      activeSessionId !== null &&
      blocker.status.sessionId === activeSessionId;

    if (!running || activeEndsAtMs === null) {
      syncedEndRef.current = activeEndsAtMs;
      return;
    }

    const previous = syncedEndRef.current;
    if (previous !== null && activeEndsAtMs - previous > 1000) {
      void resumeStrictMode(activeEndsAtMs).catch(() => undefined);
    }
    syncedEndRef.current = activeEndsAtMs;
  }, [
    activeEndsAtMs,
    activeSessionId,
    blocker.available,
    blocker.status.isActive,
    blocker.status.isPaused,
    blocker.status.sessionId,
  ]);

  return { arming, error, clearError };
}
