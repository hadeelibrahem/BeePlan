import { useCallback, useEffect, useRef, useState } from 'react';

import {
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

  useEffect(() => {
    let cancelled = false;

    const action = decideStrictSync({
      available: blocker.available,
      enabled: prefs.enabled,
      blockedCount: prefs.blockedPackages.length,
      usageAccess: blocker.usageAccess,
      activeSessionId,
      nativeActive: blocker.status.isActive,
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
    prefs.enabled,
    prefs.blockedPackages,
    blocker.available,
    blocker.usageAccess,
    blocker.status.isActive,
    blocker.status.sessionId,
  ]);

  return { arming, error, clearError };
}
