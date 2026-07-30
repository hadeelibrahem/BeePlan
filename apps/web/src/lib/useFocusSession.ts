import { useCallback, useEffect, useState } from 'react'
import {
  cancelFocusSession,
  extendFocusSession,
  finishFocusSession,
  startFocusSession,
  getActiveFocusSession,
  type FocusSessionType,
  type FocusTaskOutcome,
} from './focusApi'

const ACTIVE_KEY = 'beeplan.focus.active'
const BREAK_KEY = 'beeplan.focus.break'

// The active session is persisted so the countdown survives a page refresh or a
// navigation between the Focus page and the full-screen workspace: remaining
// time is always derived from wall-clock timestamps, never a ticking counter.
export type ActiveFocus = {
  sessionId: string
  taskId: string | null
  taskTitle: string | null
  subtaskId: string | null
  subtaskTitle: string | null
  priority: string | null
  category: string | null
  sessionType: FocusSessionType
  plannedMinutes: number
  startedAtMs: number
  // Authoritative deadline (server endsAt + any locally accumulated paused
  // time). The countdown is derived from this, never from a ticking counter,
  // so extensions and refetches always agree with the server.
  endsAtMs: number
  pausedTotalMs: number
  pausedSinceMs: number | null
  forceComplete: boolean
  completionReason?: 'automatic' | 'manual'
}

export type BreakState = { endsAtMs: number; minutes: number; label: string }

export type StartFocusInput = {
  id: string | null
  title: string | null
  priority?: string | null
  category?: string | null
  subtaskId?: string | null
  subtaskTitle?: string | null
}

export type UseFocusSession = ReturnType<typeof useFocusSession>

/** True when a session or break is persisted — used to restore the workspace on load. */
export function hasPersistedFocusSession(): boolean {
  return Boolean(readJson<ActiveFocus>(ACTIVE_KEY) || readJson<BreakState>(BREAK_KEY))
}

export function useFocusSession(options: {
  accessToken: string
  onSessionFinished?: (taskId: string | null, markedDone: boolean) => void
}) {
  const { accessToken, onSessionFinished } = options

  const [active, setActive] = useState<ActiveFocus | null>(() => readJson<ActiveFocus>(ACTIVE_KEY))
  const [breakState, setBreakState] = useState<BreakState | null>(() => readJson<BreakState>(BREAK_KEY))
  const [pendingBreak, setPendingBreak] = useState(false)
  const [breakFinished, setBreakFinished] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [extending, setExtending] = useState(false)
  const [error, setError] = useState('')

  const syncFromServer = useCallback(async (): Promise<boolean> => {
    if (!accessToken) return false
    try {
      const session = await getActiveFocusSession(accessToken)
      if (!session) { setActive(null); return true }
      setActive((current) => {
        // Carry over locally-accumulated paused time for the same session so the
        // deadline stays consistent; a different/new session starts fresh.
        const pausedTotalMs = current?.sessionId === session.id ? current.pausedTotalMs : 0
        return {
          sessionId: session.id, taskId: session.taskId, taskTitle: session.taskTitle,
          subtaskId: session.subtaskId ?? null, subtaskTitle: session.subtaskTitle ?? null,
          priority: current?.priority ?? null, category: current?.category ?? null,
          sessionType: session.sessionType, plannedMinutes: session.plannedMinutes,
          startedAtMs: new Date(session.startedAt).getTime(),
          // Adopt the server's authoritative end time (offset by our paused time)
          // so an extension persisted on the server survives every refetch.
          endsAtMs: new Date(session.endsAt).getTime() + pausedTotalMs,
          pausedTotalMs,
          pausedSinceMs: null, forceComplete: false,
        }
      })
      return true
    } catch { return false }
  }, [accessToken])

  useEffect(() => { void syncFromServer() }, [syncFromServer])
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') void syncFromServer() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [syncFromServer])

  // Tick every second while a session or break is live.
  useEffect(() => {
    if (!active && !breakState) return
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [active, breakState])

  useEffect(() => {
    if (active) writeJson(ACTIVE_KEY, active)
    else window.localStorage.removeItem(ACTIVE_KEY)
  }, [active])

  useEffect(() => {
    if (breakState) writeJson(BREAK_KEY, breakState)
    else window.localStorage.removeItem(BREAK_KEY)
  }, [breakState])

  // Warn before leaving while a session is still open on the server.
  useEffect(() => {
    if (!active) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [active])

  const elapsedMs = active ? computeElapsed(active, nowMs) : 0
  // Remaining is derived from the server-backed end timestamp, frozen at the
  // pause instant while paused. Never a locally decremented counter.
  const timerNowMs = active && active.pausedSinceMs !== null ? active.pausedSinceMs : nowMs
  const remainingMs = active ? Math.max(0, active.endsAtMs - timerNowMs) : 0
  const sessionComplete = Boolean(active?.forceComplete)

  // Auto-complete when the deadline is reached: freeze the timer and surface the
  // completion prompt (the server session stays open until the user answers).
  // A single completion timeout is armed off `endsAtMs`; changing the end time
  // (an extension) or pausing tears down the old timeout and arms a fresh one,
  // so a stale timeout can never finish an extended session at the old end.
  useEffect(() => {
    if (!active || active.forceComplete || active.pausedSinceMs !== null) return
    const fireComplete = () =>
      setActive((current) =>
        current && !current.forceComplete
          ? { ...current, completionReason: 'automatic', forceComplete: true, pausedSinceMs: current.pausedSinceMs ?? Date.now() }
          : current,
      )
    const msLeft = active.endsAtMs - Date.now()
    if (msLeft <= 0) { fireComplete(); return }
    const timeout = window.setTimeout(fireComplete, msLeft)
    return () => window.clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.sessionId, active?.endsAtMs, active?.pausedSinceMs, active?.forceComplete])

  const breakRemainingMs = breakState ? Math.max(0, breakState.endsAtMs - nowMs) : 0
  useEffect(() => {
    if (breakState && breakRemainingMs <= 0) {
      setBreakState(null)
      setBreakFinished(true)
    }
  }, [breakState, breakRemainingMs])

  const start = useCallback(
    async (task: StartFocusInput, sessionType: FocusSessionType, minutes: number): Promise<boolean> => {
      if (!accessToken || busy) return false
      setBusy(true)
      setError('')
      try {
        const session = await startFocusSession(accessToken, {
          taskId: task.id ?? undefined,
          subtaskId: task.subtaskId ?? undefined,
          plannedMinutes: minutes,
          sessionType,
        })
        const nextActive: ActiveFocus = {
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
          endsAtMs: new Date(session.endsAt).getTime(),
          pausedTotalMs: 0,
          pausedSinceMs: null,
          forceComplete: false,
        }
        writeJson(ACTIVE_KEY, nextActive)
        window.localStorage.removeItem(BREAK_KEY)
        setActive(nextActive)
        setBreakState(null)
        setPendingBreak(false)
        setBreakFinished(false)
        void syncFromServer()
        return true
      } catch (startError) {
        setError(startError instanceof Error ? startError.message : 'Unable to start focus session.')
        return false
      } finally {
        setBusy(false)
      }
    },
    [accessToken, busy, syncFromServer],
  )

  const pause = useCallback(() => {
    setActive((current) => (current ? { ...current, pausedSinceMs: Date.now() } : current))
  }, [])

  const resume = useCallback(() => {
    setActive((current) => {
      if (!current || current.pausedSinceMs === null) return current
      // Push the deadline out by the paused gap so paused time is never counted
      // against the session, keeping endsAtMs the single source of truth.
      const pausedGap = Date.now() - current.pausedSinceMs
      return {
        ...current,
        pausedTotalMs: current.pausedTotalMs + pausedGap,
        endsAtMs: current.endsAtMs + pausedGap,
        pausedSinceMs: null,
      }
    })
  }, [])

  const requestFinish = useCallback(() => {
    setActive((current) =>
      current ? { ...current, completionReason: 'manual', forceComplete: true, pausedSinceMs: current.pausedSinceMs ?? Date.now() } : current,
    )
  }, [])

  // "Add More Time": persist the extension on the server, then adopt the
  // authoritative end time it returns. The `extending` guard makes duplicate
  // clicks no-ops (single in-flight request per confirmation). Any in-progress
  // pause is folded into pausedTotalMs so elapsed stays accurate, and
  // forceComplete is cleared so the completion prompt closes.
  const extendSession = useCallback(
    async (minutes: number): Promise<boolean> => {
      if (!accessToken || extending) return false
      const current = active
      if (!current) return false
      setExtending(true)
      setError('')
      try {
        const session = await extendFocusSession(accessToken, current.sessionId, {
          additionalMinutes: minutes,
        })
        setActive((prev) => {
          if (!prev || prev.sessionId !== session.id) return prev
          const pausedTotalMs =
            prev.pausedSinceMs !== null
              ? prev.pausedTotalMs + (Date.now() - prev.pausedSinceMs)
              : prev.pausedTotalMs
          return {
            ...prev,
            plannedMinutes: session.plannedMinutes,
            // Server end time, offset by our accumulated paused time, becomes the
            // new authoritative deadline — the completion timeout re-arms on it.
            endsAtMs: new Date(session.endsAt).getTime() + pausedTotalMs,
            pausedTotalMs,
            pausedSinceMs: null,
            completionReason: undefined,
            forceComplete: false,
          }
        })
        return true
      } catch (extendError) {
        setError(extendError instanceof Error ? extendError.message : 'Unable to add more time.')
        return false
      } finally {
        setExtending(false)
      }
    },
    [accessToken, extending, active],
  )

  const cancel = useCallback(async () => {
    if (!active || !accessToken) return
    const current = active
    setActive(null)
    try {
      await cancelFocusSession(accessToken, current.sessionId, {
        actualMinutes: minutesFromMs(computeElapsed(current, Date.now())),
      })
    } catch {
      // Session already cleared from the UI; ignore transient cancel errors.
    }
    void syncFromServer()
  }, [active, accessToken, syncFromServer])

  const finishWithOutcome = useCallback(
    async (outcome: FocusTaskOutcome) => {
      if (!active || !accessToken || busy) return
      const current = active
      const actualMinutes = Math.min(current.plannedMinutes, minutesFromMs(computeElapsed(current, Date.now())))
      setBusy(true)
      setError('')
      try {
        const { taskUpdated } = await finishFocusSession(accessToken, current.sessionId, {
          actualMinutes,
          taskOutcome: outcome,
        })
        setActive(null)
        onSessionFinished?.(current.taskId, outcome === 'done' && taskUpdated)
        setPendingBreak(true)
      } catch (finishError) {
        setError(finishError instanceof Error ? finishError.message : 'Unable to finish focus session.')
      } finally {
        setBusy(false)
        void syncFromServer()
      }
    },
    [active, accessToken, busy, onSessionFinished, syncFromServer],
  )

  const startBreak = useCallback((minutes: number, label: string) => {
    setPendingBreak(false)
    setBreakFinished(false)
    setBreakState({ endsAtMs: Date.now() + minutes * 60_000, minutes, label })
  }, [])

  const skipBreak = useCallback(() => setPendingBreak(false), [])
  const endBreak = useCallback(() => {
    setBreakState(null)
    setBreakFinished(true)
  }, [])
  const dismissBreakFinished = useCallback(() => setBreakFinished(false), [])
  const clearError = useCallback(() => setError(''), [])

  // Minutes actually completed for the finished-session prompt copy.
  const completedMinutes = active
    ? Math.min(active.plannedMinutes, minutesFromMs(computeElapsed(active, nowMs)))
    : 0

  return {
    active,
    breakState,
    pendingBreak,
    breakFinished,
    nowMs,
    elapsedMs,
    remainingMs,
    sessionComplete,
    breakRemainingMs,
    completedMinutes,
    busy,
    extending,
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
  }
}

export function computeElapsed(active: ActiveFocus, nowMs: number): number {
  const pausedExtra = active.pausedSinceMs !== null ? nowMs - active.pausedSinceMs : 0
  return Math.max(0, nowMs - active.startedAtMs - active.pausedTotalMs - pausedExtra)
}

function minutesFromMs(ms: number): number {
  return Math.max(0, Math.round(ms / 60_000))
}

export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore quota / serialization errors
  }
}
