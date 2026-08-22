import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { PrimaryButton, SecondaryButton, OutlineButton, DangerButton } from '../components/layout/Buttons'
import {
  BREAK_PRESETS,
  SESSION_TYPE_PRESETS,
  formatFocusMinutes,
  getFocusRecommendation,
  getFocusStats,
  type FocusRecommendation,
  type FocusSessionType,
  type FocusStats,
  type FocusTaskOutcome,
} from '../lib/focusApi'
import { formatClock, type ActiveFocus, type UseFocusSession } from '../lib/useFocusSession'
import {
  FOCUS_EXTENSION_MAX_MINUTES,
  FOCUS_EXTENSION_MIN_MINUTES,
  QUICK_EXTENSION_OPTIONS,
  validateExtensionMinutes,
} from '../lib/focusExtension'
import { focusParentLabel, focusPrimaryTitle } from '../lib/focusDisplay'
import { shouldPlayCompletionBell } from '../lib/completionBell'
import { FOCUS_SOUND_CATEGORIES, FOCUS_SOUNDS, type FocusSound } from '../lib/focusSounds'
import { useFocusAmbientAudio } from '../lib/useFocusAmbientAudio'
import { FocusSoundsPanel as ExtractedFocusSoundsPanel } from '../components/focus/FocusSoundsPanel'
import type { ApiTask } from '../lib/tasksApi'
import { useLanguage } from '../i18n/LanguageContext'

type FocusSessionScreenProps = {
  accessToken: string
  focus: UseFocusSession
  tasks: ApiTask[]
  onExit: () => void
}

export default function FocusSessionScreen({
  accessToken,
  focus,
  tasks,
  onExit,
}: FocusSessionScreenProps) {
  const { t } = useLanguage()
  const {
    active,
    breakState,
    pendingBreak,
    breakFinished,
    remainingMs,
    elapsedMs,
    breakRemainingMs,
    sessionComplete,
    completedMinutes,
    busy,
    extending,
  } = focus

  const [stats, setStats] = useState<FocusStats | null>(null)
  const [recommendation, setRecommendation] = useState<FocusRecommendation | null>(null)
  const [showAddTime, setShowAddTime] = useState(false)
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [soundsOpen, setSoundsOpen] = useState(false)
  const [toast, setToast] = useState('')
  const soundPlayer = useFocusAmbientAudio()
  const stopSound = soundPlayer.stop
  useFocusCompletionBell(active?.sessionId, active?.completionReason, sessionComplete, remainingMs)

  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    Promise.all([getFocusStats(accessToken), getFocusRecommendation(accessToken).catch(() => null)])
      .then(([statsData, rec]) => {
        if (cancelled) return
        setStats(statsData)
        setRecommendation(rec)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [accessToken, sessionComplete])

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // Nothing left to show (session cancelled, break skipped) → return to Focus page.
  const nothingToShow = !active && !breakState && !pendingBreak && !breakFinished
  useEffect(() => {
    if (nothingToShow) onExit()
  }, [nothingToShow, onExit])

  useEffect(() => {
    if (!active) stopSound()
  }, [active, stopSound])

  const activeTask = useMemo(
    () => tasks.find((task) => task.id === active?.taskId) ?? null,
    [tasks, active?.taskId],
  )
  // Whether the unit being focused is already complete (disables "Mark Complete").
  const completionAlreadyDone = active?.subtaskId
    ? Boolean(activeTask?.subtasks?.find((subtask) => subtask.id === active.subtaskId)?.isDone)
    : activeTask?.status === 'done'

  const flashToast = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast((current) => (current === message ? '' : current)), 2600)
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenEnabled) {
      flashToast('Fullscreen is not supported in this browser.')
      return
    }
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen().catch(() => flashToast('Could not enter fullscreen.'))
  }, [flashToast])

  const handleExitFocus = useCallback(() => {
    if (active && !sessionComplete) setShowExitConfirm(true)
    else onExit()
  }, [active, sessionComplete, onExit])

  // Persist the extension, then close the sheet only if it succeeded (leaving it
  // open on error so the message stays visible).
  const handleAddTime = useCallback(
    async (minutes: number) => {
      const ok = await focus.extendSession(minutes)
      if (ok) setShowAddTime(false)
    },
    [focus],
  )

  const fullscreenSupported = typeof document !== 'undefined' && document.fullscreenEnabled

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[var(--bp-bg)] text-[var(--bp-text)]">
      <CalmBackground />

      <div className="relative z-10 flex h-full w-full">
        <main className="flex h-full flex-1 flex-col items-center justify-between px-6 py-8">
          <header className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] text-sm font-black text-[var(--bp-accent-text)]">
              B
            </span>
            <span className="text-sm font-black uppercase tracking-[0.2em] text-[var(--bp-muted)]">
              {t('focusSession.brand')}
            </span>
          </header>

          <section className="flex flex-col items-center">
            {active ? (
              <ActiveTimer
                active={active}
                remainingMs={remainingMs}
                elapsedMs={elapsedMs}
                complete={sessionComplete}
              />
            ) : pendingBreak ? (
              <BreakOffer onPick={focus.startBreak} onSkip={focus.skipBreak} />
            ) : breakState ? (
              <BreakTimer label={breakState.label} remainingMs={breakRemainingMs} minutes={breakState.minutes} onEnd={focus.endBreak} />
            ) : breakFinished ? (
              <BreakFinished
                onNew={() => {
                  focus.dismissBreakFinished()
                  onExit()
                }}
                onExit={() => {
                  focus.dismissBreakFinished()
                  onExit()
                }}
              />
            ) : null}

            {active && !sessionComplete ? (
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                {active.pausedSinceMs !== null ? (
                  <PrimaryButton onClick={focus.resume}>{t('focusSession.resume')}</PrimaryButton>
                ) : (
                  <SecondaryButton onClick={focus.pause}>{t('focusSession.pause')}</SecondaryButton>
                )}
                <OutlineButton onClick={() => setShowAddTime(true)}>{t('focusSession.addTime')}</OutlineButton>
                <PrimaryButton onClick={focus.requestFinish}>{t('focusSession.finish')}</PrimaryButton>
                <DangerButton onClick={() => void focus.cancel()}>{t('focusSession.cancel')}</DangerButton>
              </div>
            ) : null}
          </section>

          <BottomUtilities
            fullscreenSupported={fullscreenSupported}
            isFullscreen={isFullscreen}
            playingSound={soundPlayer.isPlaying ? soundPlayer.activeSound : null}
            onSounds={() => setSoundsOpen(true)}
            onToggleFullscreen={toggleFullscreen}
            onExit={handleExitFocus}
          />
        </main>

        <SidePanel active={active} stats={stats} recommendation={recommendation} task={activeTask} />
      </div>

      {active && sessionComplete ? (
        <CompletionModal
          minutes={completedMinutes}
          busy={busy}
          isSubtask={Boolean(active.subtaskId)}
          alreadyDone={completionAlreadyDone}
          onOutcome={(outcome) => void focus.finishWithOutcome(outcome)}
          onAddTime={() => setShowAddTime(true)}
        />
      ) : null}

      {showAddTime && active ? (
        <AddTimeModal
          busy={extending}
          onCancel={() => setShowAddTime(false)}
          onConfirm={(minutes) => void handleAddTime(minutes)}
        />
      ) : null}

      {showExitConfirm ? (
        <ExitConfirmModal
          onStay={() => setShowExitConfirm(false)}
          onLeave={() => {
            setShowExitConfirm(false)
            onExit()
          }}
        />
      ) : null}

      {soundsOpen ? (
        <ExtractedFocusSoundsPanel
          activeSound={soundPlayer.activeSound}
          isPlaying={soundPlayer.isPlaying}
          muted={soundPlayer.muted}
          volume={soundPlayer.volume}
          error={soundPlayer.error}
          onClose={() => setSoundsOpen(false)}
          onMuteToggle={soundPlayer.toggleMuted}
          onPause={soundPlayer.pause}
          onPlay={soundPlayer.play}
          onStop={soundPlayer.stop}
          onVolumeChange={soundPlayer.setVolume}
        />
      ) : null}

      {toast ? (
        <div className="pointer-events-none absolute bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-full border border-[var(--bp-border)] bg-[var(--bp-surface)] px-4 py-2 text-xs font-semibold text-[var(--bp-text)] shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  )
}

const COMPLETION_AUDIO_LIMIT_MS = 10_000

function useFocusCompletionBell(sessionId: string | undefined, completionReason: 'automatic' | 'manual' | undefined, sessionComplete: boolean, remainingMs: number) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const stopTimeoutRef = useRef<number | null>(null)
  const playedSessionIdRef = useRef<string | null>(null)
  const previousRemainingRef = useRef<number | null>(null)

  const clearCompletionTimeout = useCallback(() => {
    if (stopTimeoutRef.current !== null) {
      window.clearTimeout(stopTimeoutRef.current)
      stopTimeoutRef.current = null
    }
  }, [])

  const stopCompletionAudio = useCallback(() => {
    clearCompletionTimeout()
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.currentTime = 0
  }, [clearCompletionTimeout])

  useEffect(() => {
    const audio = new Audio('/focus-complete.mp3')
    audio.preload = 'auto'
    audioRef.current = audio
    audio.ontimeupdate = () => { if (audio.currentTime >= 10) stopCompletionAudio() }
    return () => { stopCompletionAudio(); audio.ontimeupdate = null; audio.src = ''; audioRef.current = null }
  }, [stopCompletionAudio])

  useEffect(() => {
    previousRemainingRef.current = null
    stopCompletionAudio()
  }, [sessionId, stopCompletionAudio])

  useEffect(() => {
    if (!sessionComplete) stopCompletionAudio()
  }, [sessionComplete, stopCompletionAudio])

  useEffect(() => {
    const remaining = sessionId ? (sessionComplete ? 0 : Math.ceil(remainingMs / 1000)) : 0
    const previous = previousRemainingRef.current
    const prefs = JSON.parse(localStorage.getItem('beeplan_settings_preferences') ?? '{}') as { focusCompletionSound?: boolean }
    const shouldPlay = shouldPlayCompletionBell({
      previousRemaining: previous,
      remaining,
      completionKey: completionReason === 'automatic' ? sessionId ?? null : null,
      playedKey: playedSessionIdRef.current,
      enabled: prefs.focusCompletionSound !== false,
    })
    if (shouldPlay) {
      playedSessionIdRef.current = sessionId ?? null
      const audio = audioRef.current
      if (audio) {
        stopCompletionAudio()
        audio.loop = false
        audio.currentTime = 0
        void audio.play().then(() => { stopTimeoutRef.current = window.setTimeout(stopCompletionAudio, COMPLETION_AUDIO_LIMIT_MS) }).catch(() => undefined)
      }
    }
    previousRemainingRef.current = remaining
  }, [completionReason, remainingMs, sessionComplete, sessionId, stopCompletionAudio])
}

// --- Calm animated background ---------------------------------------------

function CalmBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="focus-blob focus-blob-a"
        style={{ top: '-10%', left: '-5%', width: '46vw', height: '46vw', background: 'var(--bp-accent)', opacity: 0.14 }}
      />
      <div
        className="focus-blob focus-blob-b"
        style={{ bottom: '-15%', right: '-8%', width: '52vw', height: '52vw', background: 'var(--bp-accent)', opacity: 0.08 }}
      />
      <div
        className="focus-blob focus-blob-a"
        style={{ top: '30%', right: '20%', width: '28vw', height: '28vw', background: 'var(--bp-text)', opacity: 0.04 }}
      />
    </div>
  )
}

// --- Timers ----------------------------------------------------------------

function ActiveTimer({
  active,
  remainingMs,
  elapsedMs,
  complete,
}: {
  active: ActiveFocus
  remainingMs: number
  elapsedMs: number
  complete: boolean
}) {
  const { t } = useLanguage()
  const totalMs = active.plannedMinutes * 60_000
  const fraction = complete ? 1 : Math.min(1, elapsedMs / totalMs)
  const percent = Math.round(fraction * 100)

  return (
    <div className="flex flex-col items-center">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--bp-accent-ink)]">
        {labelForType(active.sessionType)} • {t('focusUi.minutes', { count: active.plannedMinutes })}
      </p>
      <h1 className="mt-2 max-w-xl truncate text-center text-2xl font-black text-[var(--bp-text)]">
        {focusPrimaryTitle(active)}
      </h1>
      {focusParentLabel(active) ? (
        <p className="mt-1 max-w-xl truncate text-center text-sm font-semibold text-[var(--bp-muted)]">
          {focusParentLabel(active)}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        {active.priority ? <Badge label={active.priority} type={active.priority} /> : null}
        {active.category ? (
          <span className="rounded-full bg-[var(--bp-surface)] px-2.5 py-1 text-[11px] font-bold text-[var(--bp-muted)]">
            {active.category}
          </span>
        ) : null}
      </div>

      <div className="mt-6">
        <TimerRing fraction={fraction} centerLabel={complete ? t('focusSession.done') : formatClock(remainingMs)} />
      </div>
      <p className="mt-4 text-sm font-semibold text-[var(--bp-muted)]">
        {complete ? t('focusSession.sessionComplete') : active.pausedSinceMs !== null ? t('focusSession.pausedProgress', { percent }) : t('focusSession.percentComplete', { percent })}
      </p>
    </div>
  )
}

function BreakTimer({
  label,
  remainingMs,
  minutes,
  onEnd,
}: {
  label: string
  remainingMs: number
  minutes: number
  onEnd: () => void
}) {
  const { t } = useLanguage()
  const totalMs = minutes * 60_000
  const fraction = Math.min(1, 1 - remainingMs / totalMs)

  return (
    <div className="flex flex-col items-center">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-green-400">{t('focusSession.break')}</p>
      <h1 className="mt-2 text-2xl font-black text-[var(--bp-text)]">{label}</h1>
      <div className="mt-6">
        <TimerRing fraction={fraction} centerLabel={formatClock(remainingMs)} accent="var(--bp-accent)" />
      </div>
      <p className="mt-4 text-sm font-semibold text-[var(--bp-muted)]">{t('focusSession.breakHelper')}</p>
      <div className="mt-6">
        <OutlineButton onClick={onEnd}>{t('focusSession.endBreak')}</OutlineButton>
      </div>
    </div>
  )
}

function TimerRing({
  fraction,
  centerLabel,
  accent = 'var(--bp-accent)',
}: {
  fraction: number
  centerLabel: string
  accent?: string
}) {
  const radius = 130
  const stroke = 14
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - Math.min(1, Math.max(0, fraction)))

  return (
    <div className="relative h-72 w-72">
      <div
        className="focus-ring-glow absolute inset-6 rounded-full"
        style={{ background: accent, filter: 'blur(40px)', opacity: 0.25 }}
      />
      <svg viewBox="0 0 300 300" className="h-full w-full -rotate-90">
        <circle cx="150" cy="150" r={radius} fill="none" stroke="var(--bp-border)" strokeWidth={stroke} />
        <circle
          cx="150"
          cy="150"
          r={radius}
          fill="none"
          stroke={accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.9s linear' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span dir="ltr" className="text-6xl font-black tabular-nums text-[var(--bp-text)]">{centerLabel}</span>
      </div>
    </div>
  )
}

// --- Break offer / finished ------------------------------------------------

function BreakOffer({
  onPick,
  onSkip,
}: {
  onPick: (minutes: number, label: string) => void
  onSkip: () => void
}) {
  const { t } = useLanguage()
  return (
    <div className="flex flex-col items-center rounded-3xl border border-[var(--bp-border)] bg-[var(--bp-surface)]/80 px-8 py-10 backdrop-blur">
       <h1 className="text-2xl font-black text-[var(--bp-text)]">{t('focusSession.niceWork')}</h1>
       <p className="mt-1 text-sm text-[var(--bp-muted)]">{t('focusSession.breakDescription')}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {BREAK_PRESETS.map((preset) => (
          <PrimaryButton key={preset.label} onClick={() => onPick(preset.minutes, preset.label)}>
            {preset.label} • {t('focusUi.minutes', { count: preset.minutes })}
          </PrimaryButton>
        ))}
         <SecondaryButton onClick={onSkip}>{t('focusSession.skipBreak')}</SecondaryButton>
      </div>
    </div>
  )
}

function BreakFinished({ onNew, onExit }: { onNew: () => void; onExit: () => void }) {
  const { t } = useLanguage()
  return (
    <div className="flex flex-col items-center rounded-3xl border border-[var(--bp-border)] bg-[var(--bp-surface)]/80 px-8 py-10 backdrop-blur">
       <h1 className="text-2xl font-black text-[var(--bp-text)]">{t('focusSession.breakFinished')}</h1>
       <p className="mt-1 text-sm text-[var(--bp-muted)]">{t('focusSession.anotherSession')}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
         <PrimaryButton onClick={onNew}>{t('focusSession.startSession')}</PrimaryButton>
         <SecondaryButton onClick={onExit}>{t('focusSession.exit')}</SecondaryButton>
      </div>
    </div>
  )
}

// --- Completion modal ------------------------------------------------------

function CompletionModal({
  minutes,
  busy,
  isSubtask,
  alreadyDone,
  onOutcome,
  onAddTime,
}: {
  minutes: number
  busy: boolean
  isSubtask: boolean
  alreadyDone: boolean
  onOutcome: (outcome: FocusTaskOutcome) => void
  onAddTime: () => void
}) {
  const { t } = useLanguage()
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md animate-[scaleUp_0.3s_ease-out] rounded-3xl border border-[var(--bp-border)] bg-[var(--bp-surface-elevated)] p-6 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--bp-accent-soft)] text-2xl">
          🎉
        </div>
        <h2 className="text-2xl font-black text-[var(--bp-text)]">{t('focusSession.greatJob')}</h2>
        <p className="mt-1 text-sm text-[var(--bp-muted)]">
          {t('focusSession.completedFocus', { minutes })}
        </p>
        <p className="mt-4 text-sm font-black text-[var(--bp-text)]">
          {t('focusSession.finishTask', { item: isSubtask ? t('focusSession.subtask') : t('focusSession.task') })}
        </p>
        {isSubtask ? (
          <div className="mt-4 grid gap-2">
            <PrimaryButton onClick={() => onOutcome('done')} disabled={busy || alreadyDone}>
              {t('focusSessionCompletion.markComplete')}
            </PrimaryButton>
            <SecondaryButton onClick={() => onOutcome('keep')} disabled={busy}>
              {t('focusSessionCompletion.continueLater')}
            </SecondaryButton>
            <OutlineButton onClick={onAddTime} disabled={busy}>
              {t('focusSession.addMoreTime')}
            </OutlineButton>
          </div>
        ) : (
          <div className="mt-4 grid gap-2">
            <PrimaryButton onClick={() => onOutcome('done')} disabled={busy || alreadyDone}>
              {t('focusSessionCompletion.yesMarkDone')}
            </PrimaryButton>
            <SecondaryButton onClick={() => onOutcome('partial')} disabled={busy}>
              {t('focusSessionCompletion.partiallyCompleted')}
            </SecondaryButton>
            <OutlineButton onClick={() => onOutcome('keep')} disabled={busy}>
              {t('focusSessionCompletion.notYet')}
            </OutlineButton>
          </div>
        )}
      </div>
    </div>
  )
}

// --- Add-time modal --------------------------------------------------------

function AddTimeModal({
  busy,
  onCancel,
  onConfirm,
}: {
  busy: boolean
  onCancel: () => void
  onConfirm: (minutes: number) => void
}) {
  const { t } = useLanguage()
  const [selected, setSelected] = useState<number | 'custom'>(10)
  const [customValue, setCustomValue] = useState('')

  const rawMinutes = selected === 'custom' ? customValue : selected
  const validation = validateExtensionMinutes(rawMinutes)
  const canSubmit = validation.error === null && !busy
  // Only surface the message once the user has typed a custom value; a selected
  // quick option is always valid, so no message shows for those.
  const showError = Boolean(
    validation.error && selected === 'custom' && customValue.trim() !== '',
  )

  const handleConfirm = () => {
    if (validation.error !== null || busy) return
    onConfirm(validation.minutes)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 px-4 backdrop-blur-sm md:items-center">
      <div className="w-full max-w-md rounded-t-[28px] border border-[var(--bp-border)] bg-[var(--bp-surface-elevated)] p-6 md:rounded-3xl">
        <div className="mx-auto mb-5 h-1.5 w-14 rounded-full bg-[var(--bp-border)] md:hidden" />
        <h2 className="text-xl font-black text-[var(--bp-text)]">{t('focusSession.addMoreTime')}</h2>
        <p className="mt-1 text-sm text-[var(--bp-muted)]">{t('focusSession.extendSession')}</p>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {QUICK_EXTENSION_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setSelected(option)}
              className={`rounded-2xl border px-3 py-3 text-sm font-black transition active:scale-[0.98] ${
                selected === option
                  ? 'border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] text-[var(--bp-text)]'
                  : 'border-[var(--bp-border)] bg-[var(--bp-surface)] text-[var(--bp-muted)] hover:border-[var(--bp-accent)]/50'
              }`}
            >
              +{option}m
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSelected('custom')}
            className={`rounded-2xl border px-3 py-3 text-sm font-black transition active:scale-[0.98] ${
              selected === 'custom'
                ? 'border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] text-[var(--bp-text)]'
                : 'border-[var(--bp-border)] bg-[var(--bp-surface)] text-[var(--bp-muted)] hover:border-[var(--bp-accent)]/50'
            }`}
          >
            {t('focusSession.custom')}
          </button>
        </div>

        {selected === 'custom' ? (
          <label className="mt-4 block">
            <span className="text-xs font-black uppercase tracking-wide text-[var(--bp-muted)]">
              {t('focusSession.minutes')} ({FOCUS_EXTENSION_MIN_MINUTES}–{FOCUS_EXTENSION_MAX_MINUTES})
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={FOCUS_EXTENSION_MIN_MINUTES}
              max={FOCUS_EXTENSION_MAX_MINUTES}
              step={1}
              autoFocus
              value={customValue}
               placeholder={t('focusSession.customMinutesPlaceholder')}
              onChange={(event) => setCustomValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleConfirm()
              }}
              className="mt-2 w-full rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-4 py-3 text-sm font-semibold text-[var(--bp-text)] outline-none focus:border-[var(--bp-accent)]"
            />
          </label>
        ) : null}

        {showError ? (
          <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300">
            {validation.error}
          </p>
        ) : null}

        <footer className="mt-5 grid grid-cols-2 gap-3">
          <SecondaryButton onClick={onCancel} disabled={busy}>
             {t('focusSession.cancel')}
          </SecondaryButton>
          <PrimaryButton onClick={handleConfirm} disabled={!canSubmit}>
            {busy
               ? t('focusSession.adding')
              : validation.error === null
                 ? t('focusHome.startWithDuration', { duration: t('focusUi.minutes', { count: validation.minutes }) })
                 : t('focusSession.addTime')}
          </PrimaryButton>
        </footer>
      </div>
    </div>
  )
}

function ExitConfirmModal({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
  const { t } = useLanguage()
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm animate-[scaleUp_0.3s_ease-out] rounded-3xl border border-[var(--bp-border)] bg-[var(--bp-surface-elevated)] p-6 text-center">
         <h2 className="text-lg font-black text-[var(--bp-text)]">{t('focusSession.leaveFocus')}</h2>
         <p className="mt-1 text-sm text-[var(--bp-muted)]">{t('focusSession.leaveWarning')}</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
           <SecondaryButton onClick={onStay}>{t('focusSession.stay')}</SecondaryButton>
           <DangerButton onClick={onLeave}>{t('focusSession.leave')}</DangerButton>
        </div>
      </div>
    </div>
  )
}

// --- Focus sounds ----------------------------------------------------------

type SoundPlayback = {
  audio: HTMLAudioElement
  soundId: string
}

function useFocusSoundPlayer() {
  const playbackRef = useRef<SoundPlayback | null>(null)
  const [activeSoundId, setActiveSoundId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(0.65)
  const [muted, setMuted] = useState(false)
  const [error, setError] = useState('')

  const activeSound = useMemo(
    () => FOCUS_SOUNDS.find((sound) => sound.id === activeSoundId) ?? null,
    [activeSoundId],
  )

  const stopPlayback = useCallback((reset = true) => {
    const playback = playbackRef.current
    if (!playback) return
    playback.audio.pause()
    if (reset) playback.audio.currentTime = 0
    playback.audio.src = ''
    playbackRef.current = null
  }, [])

  const fadeOutPlayback = useCallback(
    (durationMs = 380) =>
      new Promise<void>((resolve) => {
        const playback = playbackRef.current
        if (!playback) {
          resolve()
          return
        }

        const audio = playback.audio
        const startingVolume = audio.volume
        const startedAt = performance.now()

        const tick = (now: number) => {
          if (playbackRef.current !== playback) {
            resolve()
            return
          }

          const progress = Math.min(1, (now - startedAt) / durationMs)
          audio.volume = startingVolume * (1 - progress)

          if (progress >= 1) {
            stopPlayback()
            resolve()
            return
          }

          window.requestAnimationFrame(tick)
        }

        window.requestAnimationFrame(tick)
      }),
    [stopPlayback],
  )

  const play = useCallback(
    async (sound: FocusSound) => {
      setError('')

      const current = playbackRef.current
      if (current?.soundId === sound.id) {
        current.audio.volume = muted ? 0 : volume
        try {
          await current.audio.play()
          setActiveSoundId(sound.id)
          setIsPlaying(true)
        } catch (playError) {
          setError(playError instanceof Error ? playError.message : 'Unable to resume focus sound.')
        }
        return
      }

      await fadeOutPlayback()

      try {
        const audio = new Audio(sound.audioFile)
        audio.loop = true
        audio.preload = 'auto'
        audio.volume = muted ? 0 : volume
        await audio.play()
        playbackRef.current = { audio, soundId: sound.id }
        setActiveSoundId(sound.id)
        setIsPlaying(true)
      } catch (playError) {
        setError(playError instanceof Error ? playError.message : 'Unable to start focus sound.')
        setIsPlaying(false)
      }
    },
    [fadeOutPlayback, muted, volume],
  )

  const pause = useCallback(() => {
    playbackRef.current?.audio.pause()
    setIsPlaying(false)
  }, [])

  const stop = useCallback(() => {
    stopPlayback()
    setActiveSoundId(null)
    setIsPlaying(false)
  }, [stopPlayback])

  useEffect(() => {
    if (playbackRef.current) {
      playbackRef.current.audio.volume = muted ? 0 : volume
    }
  }, [muted, volume])

  useEffect(() => stop, [stop])

  return {
    activeSound,
    error,
    isPlaying,
    muted,
    volume,
    play,
    pause,
    stop,
    setVolume,
    toggleMuted: () => setMuted((current) => !current),
  }
}
void useFocusSoundPlayer;

function FocusSoundsPanel({
  activeSound,
  isPlaying,
  muted,
  volume,
  error,
  onClose,
  onMuteToggle,
  onPause,
  onPlay,
  onStop,
  onVolumeChange,
}: {
  activeSound: FocusSound | null
  isPlaying: boolean
  muted: boolean
  volume: number
  error: string
  onClose: () => void
  onMuteToggle: () => void
  onPause: () => void
  onPlay: (sound: FocusSound) => void
  onStop: () => void
  onVolumeChange: (volume: number) => void
}) {
  const { t } = useLanguage()
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/45 px-4 pb-5 backdrop-blur-sm md:items-center md:pb-0">
      <section className="max-h-[86vh] w-full max-w-2xl overflow-hidden rounded-3xl border border-[var(--bp-border)] bg-[var(--bp-surface-elevated)] shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-[var(--bp-border)] px-5 py-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--bp-accent-ink)]">{t('focusUi.focusSounds')}</p>
            <h2 className="mt-1 text-xl font-black text-[var(--bp-text)]">{t('focusUi.whiteNoise')}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-2 text-xs font-black text-[var(--bp-muted)] transition hover:bg-[var(--bp-bg)]"
          >
            {t('focusUi.close')}
          </button>
        </header>

        <div className="max-h-[58vh] overflow-y-auto px-5 py-4">
          {FOCUS_SOUND_CATEGORIES.map((category) => (
            <div key={category} className="mb-5 last:mb-0">
              <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-[var(--bp-muted)]">{category}</h3>
              <div className="grid gap-2 md:grid-cols-2">
                {FOCUS_SOUNDS.filter((sound) => sound.category === category).map((sound) => {
                  const active = activeSound?.id === sound.id
                  const playing = active && isPlaying
                  return (
                    <div
                      key={sound.id}
                      className={`rounded-2xl border p-3 transition ${
                        active
                          ? 'border-[var(--bp-accent)] bg-[var(--bp-accent-soft)]'
                          : 'border-[var(--bp-border)] bg-[var(--bp-surface)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xl" aria-hidden="true">
                              {sound.icon}
                            </span>
                            <p className="truncate text-sm font-black text-[var(--bp-text)]">{sound.name}</p>
                          </div>
                          {active ? (
                            <span className="mt-2 inline-flex rounded-full border border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] px-2 py-0.5 text-[10px] font-black text-[var(--bp-accent-text)]">
                              {t('focusSession.focusSounds')}
                            </span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => (playing ? onPause() : onPlay(sound))}
                          className="shrink-0 rounded-xl bg-[var(--bp-bg)] px-3 py-2 text-xs font-black text-[var(--bp-text)] transition hover:text-[var(--bp-accent-ink)]"
                        >
                          {playing ? '⏸ Pause' : '▶ Play'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <footer className="border-t border-[var(--bp-border)] px-5 py-4">
          {error ? (
            <p className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300">
              {error}
            </p>
          ) : null}
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <label className="flex flex-1 items-center gap-3">
              <span className="w-16 text-xs font-black uppercase text-[var(--bp-muted)]">{t('focusUi.volume')}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(event) => onVolumeChange(Number(event.target.value))}
                className="w-full accent-[var(--bp-accent)]"
              />
              <span className="w-10 text-end text-xs font-bold text-[var(--bp-muted)]">{Math.round(volume * 100)}%</span>
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onMuteToggle}
                className="rounded-xl border border-[var(--bp-border)] px-3 py-2 text-xs font-black text-[var(--bp-text)] transition hover:border-[var(--bp-accent)]"
              >
                {muted ? t('focusUi.unmute') : t('focusUi.mute')}
              </button>
              <button
                type="button"
                onClick={onStop}
                className="rounded-xl border border-[var(--bp-border)] px-3 py-2 text-xs font-black text-[var(--bp-text)] transition hover:border-[var(--bp-accent)]"
              >
                {t('focusUi.stop')}
              </button>
            </div>
          </div>
        </footer>
      </section>
    </div>
  )
}

void FocusSoundsPanel;

// --- Bottom utilities ------------------------------------------------------

function BottomUtilities({
  fullscreenSupported,
  isFullscreen,
  playingSound,
  onSounds,
  onToggleFullscreen,
  onExit,
}: {
  fullscreenSupported: boolean
  isFullscreen: boolean
  playingSound: FocusSound | null
  onSounds: () => void
  onToggleFullscreen: () => void
  onExit: () => void
}) {
  const { t } = useLanguage()
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)]/70 px-3 py-2 backdrop-blur">
      <UtilityButton onClick={onSounds}>{t('focusUi.whiteNoise')}</UtilityButton>
      <UtilityButton onClick={onSounds}>{t('focusUi.ambientSounds')}</UtilityButton>
      {playingSound ? (
        <div className="rounded-xl bg-[var(--bp-bg)] px-3 py-2 text-xs font-bold text-[var(--bp-muted)]">
          🎧 {t('focusSession.focusSounds')}: <span className="text-[var(--bp-text)]">{playingSound.name}</span>
        </div>
      ) : null}
      {fullscreenSupported ? (
        <UtilityButton onClick={onToggleFullscreen}>{isFullscreen ? t('focusUi.exitFullscreen') : t('focusUi.fullscreen')}</UtilityButton>
      ) : null}
      <UtilityButton onClick={onExit} accent>
        {t('focusUi.exitFocus')}
      </UtilityButton>
    </div>
  )
}

function UtilityButton({
  children,
  onClick,
  accent,
}: {
  children: ReactNode
  onClick: () => void
  accent?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-3 py-2 text-xs font-bold transition hover:bg-[var(--bp-bg)] ${
        accent ? 'text-[var(--bp-accent-ink)]' : 'text-[var(--bp-muted)]'
      }`}
    >
      {children}
    </button>
  )
}

// --- Side panel (desktop only) ---------------------------------------------

function SidePanel({
  active,
  stats,
  recommendation,
  task,
}: {
  active: ActiveFocus | null
  stats: FocusStats | null
  recommendation: FocusRecommendation | null
  task: ApiTask | null
}) {
  const { t } = useLanguage()
  const estimatedRemaining = task
    ? Math.max(0, (task.estimatedTimeMinutes ?? 0) - (task.spentTimeMinutes ?? 0))
    : 0

  return (
    <aside className="hidden w-72 shrink-0 flex-col gap-3 border-s border-[var(--bp-border)] bg-[var(--bp-surface)]/60 p-5 backdrop-blur lg:flex">
      <p className="text-[10px] font-black uppercase tracking-wide text-[var(--bp-muted)]">{t('focusSession.sessionInsight')}</p>
      <PanelStat label={t('focusSession.todayFocus')} value={stats ? formatFocusMinutes(stats.focusMinutesToday) : '—'} />
      <PanelStat label={t('focusSession.sessionsToday')} value={stats ? String(stats.sessionsToday) : '—'} />
      <PanelStat label={t('focusSession.currentStreak')} value={stats ? t('focusSession.days', { count: stats.currentStreak }) : '—'} />
      <PanelStat
        label={t('focusSession.estimatedRemaining')}
        value={task ? formatFocusMinutes(estimatedRemaining) : '—'}
      />
      <div className="mt-2 rounded-2xl border border-[var(--bp-accent)]/30 bg-[var(--bp-accent-soft)] p-3">
        <p className="text-[10px] font-black uppercase tracking-wide text-[var(--bp-accent-ink)]">{t('focusSession.aiTip')}</p>
        <p className="mt-1 text-xs leading-5 text-[var(--bp-text)]">{buildTip(active, recommendation)}</p>
      </div>
    </aside>
  )
}

function PanelStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-bg)]/60 p-3">
      <p className="text-[10px] font-black uppercase tracking-wide text-[var(--bp-muted)]">{label}</p>
      <p className="mt-1 truncate text-lg font-black text-[var(--bp-text)]">{value}</p>
    </div>
  )
}

// --- Helpers ---------------------------------------------------------------

function Badge({ label, type }: { label: string; type: string }) {
  const normalized = type.toLowerCase()
  const color =
    normalized === 'high' || normalized === 'urgent'
      ? 'bg-red-500/20 text-red-300'
      : normalized === 'medium'
        ? 'bg-orange-500/20 text-orange-300'
        : normalized === 'low'
          ? 'bg-green-500/20 text-green-300'
          : 'bg-slate-500/20 text-[var(--bp-subtle)]'
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${color}`}>{label}</span>
}

function labelForType(type: FocusSessionType): string {
  return SESSION_TYPE_PRESETS.find((item) => item.type === type)?.label ?? 'Focus'
}

function buildTip(active: ActiveFocus | null, recommendation: FocusRecommendation | null): string {
  if (active && recommendation && recommendation.taskId === active.taskId && recommendation.reason) {
    return recommendation.reason
  }
  const priority = (active?.priority ?? '').toLowerCase()
  if (priority === 'urgent' || priority === 'high') {
    return 'This task requires deep concentration. Try avoiding interruptions for the next focus block.'
  }
  return 'Silence notifications and give this task your full attention until the timer ends.'
}
