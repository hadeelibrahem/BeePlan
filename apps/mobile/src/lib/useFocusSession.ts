import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  cancelFocusSession,
  finishFocusSession,
  startFocusSession,
  getActiveFocusSession,
  type FocusSessionType,
  type FocusTaskOutcome,
} from './focusApi';

const ACTIVE_KEY = 'beeplan.focus.active';
const BREAK_KEY = 'beeplan.focus.break';

// Persisted so the countdown survives navigation and app restarts: remaining
// time is always derived from wall-clock timestamps, never a ticking counter.
export type ActiveFocus = {
  sessionId: string;
  taskId: string | null;
  taskTitle: string | null;
  subtaskId: string | null;
  subtaskTitle: string | null;
  priority: string | null;
  category: string | null;
  sessionType: FocusSessionType;
  plannedMinutes: number;
  startedAtMs: number;
  pausedTotalMs: number;
  pausedSinceMs: number | null;
  forceComplete: boolean;
};

export type BreakState = { endsAtMs: number; minutes: number; label: string };

export type StartFocusInput = {
  id: string | null;
  title: string | null;
  priority?: string | null;
  category?: string | null;
  subtaskId?: string | null;
  subtaskTitle?: string | null;
};

export type UseFocusSession = ReturnType<typeof useFocusSession>;

export function useFocusSession(options: {
  accessToken: string;
  onSessionFinished?: (taskId: string | null, markedDone: boolean) => void;
}) {
  const { accessToken, onSessionFinished } = options;

  const [active, setActive] = useState<ActiveFocus | null>(null);
  const [breakState, setBreakState] = useState<BreakState | null>(null);
  const [pendingBreak, setPendingBreak] = useState(false);
  const [breakFinished, setBreakFinished] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hydrated, setHydrated] = useState(false);

  const syncFromServer = useCallback(async (): Promise<boolean> => {
    if (!accessToken) return false;
    try {
      const session = await getActiveFocusSession(accessToken);
      if (!session) { setActive(null); return true; }
      setActive((current) => ({
        sessionId: session.id, taskId: session.taskId, taskTitle: session.taskTitle,
        subtaskId: session.subtaskId ?? null, subtaskTitle: session.subtaskTitle ?? null,
        priority: current?.priority ?? null, category: current?.category ?? null,
        sessionType: session.sessionType, plannedMinutes: session.plannedMinutes,
        startedAtMs: new Date(session.startedAt).getTime(), pausedTotalMs: current?.sessionId === session.id ? current.pausedTotalMs : 0,
        pausedSinceMs: null, forceComplete: false,
      }));
      return true;
    } catch { return false; }
  }, [accessToken]);

  // Restore any in-flight session/break from storage on first mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [rawActive, rawBreak] = await Promise.all([
        AsyncStorage.getItem(ACTIVE_KEY),
        AsyncStorage.getItem(BREAK_KEY),
      ]);
      if (cancelled) return;
      if (rawActive) setActive(safeParse<ActiveFocus>(rawActive));
      if (rawBreak) setBreakState(safeParse<BreakState>(rawBreak));
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => { if (hydrated) void syncFromServer(); }, [hydrated, syncFromServer]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void syncFromServer(); });
    return () => subscription.remove();
  }, [syncFromServer]);

  useEffect(() => {
    if (!active && !breakState) return;
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [active, breakState]);

  useEffect(() => {
    if (!hydrated) return;
    if (active) void AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify(active));
    else void AsyncStorage.removeItem(ACTIVE_KEY);
  }, [active, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (breakState) void AsyncStorage.setItem(BREAK_KEY, JSON.stringify(breakState));
    else void AsyncStorage.removeItem(BREAK_KEY);
  }, [breakState, hydrated]);

  const elapsedMs = active ? computeElapsed(active, nowMs) : 0;
  const remainingMs = active ? Math.max(0, active.plannedMinutes * 60_000 - elapsedMs) : 0;
  const sessionComplete = Boolean(active?.forceComplete);

  useEffect(() => {
    if (!active || active.forceComplete) return;
    if (active.pausedSinceMs === null && remainingMs <= 0) {
      setActive((current) =>
        current ? { ...current, forceComplete: true, pausedSinceMs: current.pausedSinceMs ?? Date.now() } : current,
      );
    }
  }, [active, remainingMs]);

  const breakRemainingMs = breakState ? Math.max(0, breakState.endsAtMs - nowMs) : 0;
  useEffect(() => {
    if (breakState && breakRemainingMs <= 0) {
      setBreakState(null);
      setBreakFinished(true);
    }
  }, [breakState, breakRemainingMs]);

  const start = useCallback(
    async (task: StartFocusInput, sessionType: FocusSessionType, minutes: number): Promise<boolean> => {
      if (!accessToken || busy) return false;
      setBusy(true);
      setError('');
      try {
        const session = await startFocusSession(accessToken, {
          taskId: task.id ?? undefined,
          subtaskId: task.subtaskId ?? undefined,
          plannedMinutes: minutes,
          sessionType,
        });
        setActive({
          sessionId: session.id,
          taskId: session.taskId,
          taskTitle: session.taskTitle ?? task.title,
          subtaskId: session.subtaskId ?? task.subtaskId ?? null,
          subtaskTitle: session.subtaskTitle ?? task.subtaskTitle ?? null,
          priority: task.priority ?? null,
          category: task.category ?? null,
          sessionType: session.sessionType,
          plannedMinutes: session.plannedMinutes,
          startedAtMs: new Date(session.startedAt).getTime(),
          pausedTotalMs: 0,
          pausedSinceMs: null,
          forceComplete: false,
        });
        setBreakState(null);
        setPendingBreak(false);
        setBreakFinished(false);
        void syncFromServer();
        return true;
      } catch (startError) {
        setError(startError instanceof Error ? startError.message : 'Unable to start focus session.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [accessToken, busy, syncFromServer],
  );

  const pause = useCallback(() => {
    setActive((current) => (current ? { ...current, pausedSinceMs: Date.now() } : current));
  }, []);

  const resume = useCallback(() => {
    setActive((current) => {
      if (!current || current.pausedSinceMs === null) return current;
      return {
        ...current,
        pausedTotalMs: current.pausedTotalMs + (Date.now() - current.pausedSinceMs),
        pausedSinceMs: null,
      };
    });
  }, []);

  const requestFinish = useCallback(() => {
    setActive((current) =>
      current ? { ...current, forceComplete: true, pausedSinceMs: current.pausedSinceMs ?? Date.now() } : current,
    );
  }, []);

  // "Add More Time": extend the planned duration and resume, folding any paused
  // interval (e.g. from auto-complete) into pausedTotalMs so elapsed time stays
  // accurate. Clears forceComplete so the completion prompt closes.
  const extendSession = useCallback((minutes: number) => {
    setActive((current) => {
      if (!current) return current;
      const pausedTotalMs =
        current.pausedSinceMs !== null
          ? current.pausedTotalMs + (Date.now() - current.pausedSinceMs)
          : current.pausedTotalMs;
      return {
        ...current,
        plannedMinutes: current.plannedMinutes + minutes,
        pausedTotalMs,
        pausedSinceMs: null,
        forceComplete: false,
      };
    });
  }, []);

  const cancel = useCallback(async () => {
    if (!active || !accessToken) return;
    const current = active;
    setActive(null);
    try {
      await cancelFocusSession(accessToken, current.sessionId, {
        actualMinutes: minutesFromMs(computeElapsed(current, Date.now())),
      });
    } catch {
      // Session already cleared from the UI.
    }
    void syncFromServer();
  }, [active, accessToken, syncFromServer]);

  const finishWithOutcome = useCallback(
    async (outcome: FocusTaskOutcome) => {
      if (!active || !accessToken || busy) return;
      const current = active;
      const actualMinutes = Math.min(current.plannedMinutes, minutesFromMs(computeElapsed(current, Date.now())));
      setBusy(true);
      setError('');
      try {
        const { taskUpdated } = await finishFocusSession(accessToken, current.sessionId, {
          actualMinutes,
          taskOutcome: outcome,
        });
        setActive(null);
        onSessionFinished?.(current.taskId, outcome === 'done' && taskUpdated);
        setPendingBreak(true);
      } catch (finishError) {
        setError(finishError instanceof Error ? finishError.message : 'Unable to finish focus session.');
      } finally {
        setBusy(false);
        void syncFromServer();
      }
    },
    [active, accessToken, busy, onSessionFinished, syncFromServer],
  );

  const startBreak = useCallback((minutes: number, label: string) => {
    setPendingBreak(false);
    setBreakFinished(false);
    setBreakState({ endsAtMs: Date.now() + minutes * 60_000, minutes, label });
  }, []);

  const skipBreak = useCallback(() => setPendingBreak(false), []);
  const endBreak = useCallback(() => {
    setBreakState(null);
    setBreakFinished(true);
  }, []);
  const dismissBreakFinished = useCallback(() => setBreakFinished(false), []);
  const clearError = useCallback(() => setError(''), []);

  const completedMinutes = active
    ? Math.min(active.plannedMinutes, minutesFromMs(computeElapsed(active, nowMs)))
    : 0;

  return {
    active,
    breakState,
    pendingBreak,
    breakFinished,
    hydrated,
    hasSession: Boolean(active || breakState),
    nowMs,
    elapsedMs,
    remainingMs,
    sessionComplete,
    breakRemainingMs,
    completedMinutes,
    busy,
    error,
    start,
    pause,
    resume,
    requestFinish,
    extendSession,
    cancel,
    finishWithOutcome,
    startBreak,
    skipBreak,
    endBreak,
    dismissBreakFinished,
    clearError,
    syncFromServer,
  };
}

export function computeElapsed(active: ActiveFocus, nowMs: number): number {
  const pausedExtra = active.pausedSinceMs !== null ? nowMs - active.pausedSinceMs : 0;
  return Math.max(0, nowMs - active.startedAtMs - active.pausedTotalMs - pausedExtra);
}

function minutesFromMs(ms: number): number {
  return Math.max(0, Math.round(ms / 60_000));
}

function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
