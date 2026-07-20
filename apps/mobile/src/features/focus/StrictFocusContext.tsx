import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  useFocusBlocker,
  type UseFocusBlocker,
} from "../../../modules/beeplan-focus-blocker";
import type { ActiveFocus } from "../../lib/useFocusSession";
import {
  DEFAULT_STRICT_PREFS,
  loadStrictPrefs,
  saveStrictPrefs,
  type StrictModePrefs,
} from "./strictModeStorage";
import { useStrictFocusSync, type StrictSyncState } from "./useStrictFocusSync";

type StrictFocusValue = {
  blocker: UseFocusBlocker;
  prefs: StrictModePrefs;
  prefsLoaded: boolean;
  setPrefs: (prefs: StrictModePrefs) => void;
  sync: StrictSyncState;
  /** Blocked-app open attempts recorded for the current session. */
  blockAttempts: number;
  /** Reason the last native session ended: 'completed' | 'stopped' | 'emergencyExit:*' | null. */
  lastEndReason: string | null;
};

const StrictFocusContext = createContext<StrictFocusValue | null>(null);

/**
 * Shared owner of everything Strict Mode needs, mounted once at the app root so
 * it survives navigation between the Focus screen and the session workspace.
 *
 * It takes the live `active`/`remainingMs` from the app's single
 * `useFocusSession` instance and drives native arm/disarm through
 * `useStrictFocusSync`. Screens read state via `useStrictFocus()` and never
 * touch the native module directly.
 */
export function StrictFocusProvider({
  active,
  remainingMs,
  children,
}: {
  active: ActiveFocus | null;
  remainingMs: number;
  children: ReactNode;
}) {
  const [prefs, setPrefsState] =
    useState<StrictModePrefs>(DEFAULT_STRICT_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [blockAttempts, setBlockAttempts] = useState(0);
  const [lastEndReason, setLastEndReason] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const blocker = useFocusBlocker({
    onBlockAttempt: () => setBlockAttempts((count) => count + 1),
    onSessionEnded: (_sessionId, reason) => setLastEndReason(reason),
  });

  useEffect(() => {
    void loadStrictPrefs().then((loaded) => {
      setPrefsState(loaded);
      setPrefsLoaded(true);
    });
  }, []);

  const setPrefs = useCallback((next: StrictModePrefs) => {
    setPrefsState(next);
    void saveStrictPrefs(next);
  }, []);

  // Reset per-session counters whenever the focus session identity changes.
  useEffect(() => {
    const id = active?.sessionId ?? null;
    if (id !== sessionIdRef.current) {
      sessionIdRef.current = id;
      setBlockAttempts(0);
      if (id) setLastEndReason(null);
    }
  }, [active?.sessionId]);

  const sync = useStrictFocusSync({ active, remainingMs, prefs, blocker });

  return (
    <StrictFocusContext.Provider
      value={{
        blocker,
        prefs,
        prefsLoaded,
        setPrefs,
        sync,
        blockAttempts,
        lastEndReason,
      }}
    >
      {children}
    </StrictFocusContext.Provider>
  );
}

/** Reads the shared Strict Mode state. Throws outside a StrictFocusProvider. */
export function useStrictFocus(): StrictFocusValue {
  const value = useContext(StrictFocusContext);
  if (!value)
    throw new Error("useStrictFocus must be used within a StrictFocusProvider");
  return value;
}
