import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View, type GestureResponderEvent } from 'react-native';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { createGuardedSoundPlayer, type GuardedSoundPlayer } from '../lib/focusSoundPlayer';
import { DangerButton, OutlineButton, PrimaryButton, SecondaryButton } from '../components/layout';
import { BREAK_PRESETS, formatFocusClock, labelForFocusType, type FocusTaskOutcome } from '../lib/focusApi';
import { FOCUS_SOUND_CATEGORIES, FOCUS_SOUNDS, type FocusSound } from '../lib/focusSounds';
import type { UseFocusSession } from '../lib/useFocusSession';
import type { ApiTask } from '../lib/tasksApi';
import type { AppTheme } from '../theme/colors';
import { useTheme } from '../theme/useTheme';
import { focusParentLabel, focusPrimaryTitle } from '../lib/focusDisplay';
import { MobileIcon } from '../components/layout';
import { useStrictFocus } from '../features/focus/StrictFocusContext';
import { StrictStatsSheet } from '../features/focus/StrictStatsSheet';

const FOCUS_SOUND_ASSETS: Record<string, number> = {
  ambient: require('../../assets/focus-sounds/ambient.mp3') as number,
  birds: require('../../assets/focus-sounds/birds.mp3') as number,
  'brown-noise': require('../../assets/focus-sounds/brown-noise.mp3') as number,
  'coffee-shop': require('../../assets/focus-sounds/coffee-shop.mp3') as number,
  fan: require('../../assets/focus-sounds/fan.mp3') as number,
  fireplace: require('../../assets/focus-sounds/fireplace.mp3') as number,
  forest: require('../../assets/focus-sounds/forest.mp3') as number,
  'heavy-rain': require('../../assets/focus-sounds/heavy-rain.mp3') as number,
  library: require('../../assets/focus-sounds/library.mp3') as number,
  lofi: require('../../assets/focus-sounds/lofi.mp3') as number,
  meditation: require('../../assets/focus-sounds/meditation.mp3') as number,
  'ocean-waves': require('../../assets/focus-sounds/ocean-waves.mp3') as number,
  'pink-noise': require('../../assets/focus-sounds/pink-noise.mp3') as number,
  rain: require('../../assets/focus-sounds/rain.mp3') as number,
  river: require('../../assets/focus-sounds/river.mp3') as number,
  'soft-piano': require('../../assets/focus-sounds/soft-piano.mp3') as number,
  thunder: require('../../assets/focus-sounds/thunder.mp3') as number,
  'white-noise': require('../../assets/focus-sounds/white-noise.mp3') as number,
};

type Props = {
  focus: UseFocusSession;
  tasks?: ApiTask[];
  onExit: () => void;
};

export default function FocusSessionScreen({ focus, tasks = [], onExit }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
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
  } = focus;

  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [soundsOpen, setSoundsOpen] = useState(false);
  const soundPlayer = useFocusSoundPlayer();
  const stopSound = soundPlayer.stop;

  // --- Strict Mode -----------------------------------------------------------
  const strict = useStrictFocus();
  const [statsOpen, setStatsOpen] = useState(false);
  const [showStrictExit, setShowStrictExit] = useState(false);
  const strictActive =
    strict.blocker.status.isActive && strict.blocker.status.sessionId === (active?.sessionId ?? null);

  // End a strict session early with a logged reason, then cancel the focus
  // session itself. emergencyExit stops native blocking + records the reason.
  const confirmStrictExit = useCallback(
    async (reason: string) => {
      setShowStrictExit(false);
      await strict.blocker.emergencyExit(reason);
      await focus.cancel();
    },
    [strict.blocker, focus],
  );

  // Cancel: for a strict session require the deliberate emergency-exit flow;
  // otherwise keep the existing one-tap cancel behaviour.
  const handleCancelPress = useCallback(() => {
    if (strictActive) setShowStrictExit(true);
    else void focus.cancel();
  }, [strictActive, focus]);

  const activeTask = useMemo(() => tasks.find((task) => task.id === active?.taskId) ?? null, [tasks, active?.taskId]);
  const activeSubtask = useMemo(
    () => activeTask?.subtasks?.find((subtask) => subtask.id === active?.subtaskId) ?? null,
    [activeTask, active?.subtaskId],
  );
  // Disable "Mark Complete"/"mark done" when the unit is already done.
  const completionAlreadyDone = active?.subtaskId
    ? Boolean(activeSubtask?.isDone)
    : activeTask?.status === 'done';

  // Nothing left to show (cancelled, break skipped) → return to Focus page.
  const nothingToShow = !active && !breakState && !pendingBreak && !breakFinished;
  useEffect(() => {
    if (nothingToShow) onExit();
  }, [nothingToShow, onExit]);

  useEffect(() => {
    if (!active) stopSound();
  }, [active, stopSound]);

  const handleExitFocus = () => {
    if (active && !sessionComplete) setShowExitConfirm(true);
    else onExit();
  };

  const totalMs = active ? active.plannedMinutes * 60_000 : 0;
  const fraction = active ? (sessionComplete ? 1 : Math.min(1, elapsedMs / totalMs)) : 0;
  const percent = Math.round(fraction * 100);

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <View className="flex-1 items-center justify-between px-6 pb-8 pt-14">
        <View className="flex-row items-center gap-2">
          <View
            className="h-7 w-7 items-center justify-center rounded-lg"
            style={{ backgroundColor: colors.accent }}
          >
            <Text className="text-sm font-black" style={{ color: colors.accentText }}>
              B
            </Text>
          </View>
          <Text className="text-xs font-black uppercase" style={{ color: colors.secondaryText, letterSpacing: 3 }}>
            BeePlan Focus
          </Text>
        </View>

        <View className="w-full items-center">
          {active ? (
            <ActiveTimer
              theme={theme}
              title={focusPrimaryTitle(active)}
              subtitle={focusParentLabel(active)}
              typeLabel={`${labelForFocusType(active.sessionType)} • ${active.plannedMinutes} min`}
              priority={active.priority}
              category={active.category}
              center={sessionComplete ? 'Done' : formatFocusClock(remainingMs)}
              fraction={fraction}
              status={sessionComplete ? 'Session complete' : active.pausedSinceMs !== null ? `Paused • ${percent}%` : `${percent}% complete`}
            />
          ) : pendingBreak ? (
            <BreakOffer theme={theme} onPick={focus.startBreak} onSkip={focus.skipBreak} />
          ) : breakState ? (
            <BreakTimer
              theme={theme}
              label={breakState.label}
              center={formatFocusClock(breakRemainingMs)}
              fraction={Math.min(1, 1 - breakRemainingMs / (breakState.minutes * 60_000))}
              onEnd={focus.endBreak}
            />
          ) : breakFinished ? (
            <BreakFinished
              theme={theme}
              onDone={() => {
                focus.dismissBreakFinished();
                onExit();
              }}
            />
          ) : null}

          {active && !sessionComplete ? (
            <View className="mt-6 w-full gap-2">
              {active.pausedSinceMs !== null ? (
                <PrimaryButton fullWidth onPress={focus.resume}>
                  Resume
                </PrimaryButton>
              ) : (
                <SecondaryButton fullWidth onPress={focus.pause}>
                  Pause
                </SecondaryButton>
              )}
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <PrimaryButton fullWidth onPress={focus.requestFinish}>
                    Finish
                  </PrimaryButton>
                </View>
                <View className="flex-1">
                  <DangerButton fullWidth onPress={handleCancelPress}>
                    Cancel
                  </DangerButton>
                </View>
              </View>
            </View>
          ) : null}

          {strictActive || strict.sync.arming || strict.sync.error ? (
            <StrictStatusCard
              theme={theme}
              active={strictActive}
              arming={strict.sync.arming}
              error={strict.sync.error}
              blockedCount={strict.blocker.status.blockedPackages.length}
              usageAccess={strict.blocker.usageAccess}
              attempts={strict.blockAttempts}
              onViewAttempts={() => setStatsOpen(true)}
            />
          ) : null}
        </View>

        <View className="flex-row flex-wrap items-center justify-center gap-1">
          <UtilityButton theme={theme} label="White Noise" onPress={() => setSoundsOpen(true)} />
          <UtilityButton theme={theme} label="Ambient" onPress={() => setSoundsOpen(true)} />
          {soundPlayer.activeSound && soundPlayer.isPlaying ? (
            <View className="rounded-xl px-3 py-2" style={{ backgroundColor: colors.card }}>
              <Text className="text-xs font-bold" style={{ color: colors.secondaryText }}>
                🎧 Playing: <Text style={{ color: colors.text }}>{soundPlayer.activeSound.name}</Text>
              </Text>
            </View>
          ) : null}
          <UtilityButton theme={theme} label="Exit Focus" accent onPress={handleExitFocus} />
        </View>
      </View>

      <Modal visible={Boolean(active && sessionComplete)} transparent animationType="fade">
        <CompletionModal
          theme={theme}
          minutes={completedMinutes}
          busy={busy}
          isSubtask={Boolean(active?.subtaskId)}
          alreadyDone={completionAlreadyDone}
          onOutcome={(outcome) => void focus.finishWithOutcome(outcome)}
          onAddTime={() => focus.extendSession(10)}
        />
      </Modal>

      <Modal visible={showExitConfirm} transparent animationType="fade">
        <ExitConfirm theme={theme} onStay={() => setShowExitConfirm(false)} onLeave={() => { setShowExitConfirm(false); onExit(); }} />
      </Modal>

      <Modal visible={showStrictExit} transparent animationType="fade">
        <StrictExitConfirm
          theme={theme}
          onStay={() => setShowStrictExit(false)}
          onExit={(reason) => void confirmStrictExit(reason)}
        />
      </Modal>

      <StrictStatsSheet
        visible={statsOpen}
        sessionId={active?.sessionId ?? strict.blocker.status.sessionId}
        focusMinutes={completedMinutes}
        endReason={strict.lastEndReason}
        onClose={() => setStatsOpen(false)}
      />

      <FocusSoundsSheet
        visible={soundsOpen}
        theme={theme}
        activeSound={soundPlayer.activeSound}
        isPlaying={soundPlayer.isPlaying}
        muted={soundPlayer.muted}
        volume={soundPlayer.volume}
        onClose={() => setSoundsOpen(false)}
        onMuteToggle={soundPlayer.toggleMuted}
        onPause={soundPlayer.pause}
        onPlay={soundPlayer.play}
        onStop={soundPlayer.stop}
        onVolumeChange={soundPlayer.setVolume}
      />
    </View>
  );
}

// --- Focus sounds ----------------------------------------------------------

function useFocusSoundPlayer() {
  const player = useAudioPlayer(null, { keepAudioSessionActive: true });
  const [activeSoundId, setActiveSoundId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.65);
  const [muted, setMuted] = useState(false);

  // A guarded controller that no-ops after the player is released and never
  // forwards a null source to replace(). Recreated only if the player identity
  // changes (it's stable across renders and Fast Refresh).
  const playerRef = useRef(player);
  const controllerRef = useRef<GuardedSoundPlayer | null>(null);
  if (!controllerRef.current || playerRef.current !== player) {
    playerRef.current = player;
    controllerRef.current = createGuardedSoundPlayer(player, (id) => FOCUS_SOUND_ASSETS[id]);
  }
  const controller = controllerRef.current;

  const activeSound = useMemo(
    () => FOCUS_SOUNDS.find((sound) => sound.id === activeSoundId) ?? null,
    [activeSoundId],
  );

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true });
  }, []);

  const pause = useCallback(() => {
    controller.pause();
    setIsPlaying(false);
  }, [controller]);

  const stop = useCallback(() => {
    controller.stop();
    setActiveSoundId(null);
    setIsPlaying(false);
  }, [controller]);

  const play = useCallback(
    async (sound: FocusSound) => {
      console.log(`[FocusSound] play requested (${sound.id})`); // TEMP debug
      if (controller.isReleased()) {
        console.log('[FocusSound] playback skipped (controller released)'); // TEMP debug
        return;
      }

      if (activeSoundId === sound.id) {
        controller.resume({ volume, muted });
        setIsPlaying(true);
        return;
      }

      // Fade the previous sound out (or just pause if nothing was playing),
      // then load the new one — but bail if a newer op or unmount intervened.
      const token = controller.beginFade();
      if (activeSoundId) {
        await fadeOutPlayer(controller, token);
      } else {
        controller.pause();
      }
      if (!controller.isFadeCurrent(token)) {
        console.log('[FocusSound] playback skipped (superseded during fade)'); // TEMP debug
        return;
      }

      if (!controller.loadAndPlay(sound.id, { volume, muted })) return;
      setActiveSoundId(sound.id);
      setIsPlaying(true);
    },
    [activeSoundId, controller, muted, volume],
  );

  useEffect(() => {
    controller.applyVolume({ volume, muted });
  }, [controller, muted, volume]);

  // useAudioPlayer releases the native player on unmount, which stops playback.
  // We only flip our guard so any in-flight async work (fades, awaited ops)
  // stops touching the released object — we never call player methods here.
  //
  // Effect cleanups also run on every Fast Refresh, where expo-audio keeps the
  // native player alive — so setup must re-arm the guard via markMounted(), or
  // one refresh would leave the ref-cached controller silently dead forever
  // (the regression that stopped all focus sounds).
  useEffect(() => {
    controller.markMounted();
    return () => {
      controller.markReleased();
    };
  }, [controller]);

  return {
    activeSound,
    isPlaying,
    muted,
    volume,
    pause,
    play,
    stop,
    setVolume,
    toggleMuted: () => setMuted((current) => !current),
  };
}

// Ramps the player volume down to 0 over `durationMs`, then pauses and rewinds.
// Aborts immediately if the fade token is superseded or the player is released.
function fadeOutPlayer(controller: GuardedSoundPlayer, token: number, durationMs = 380): Promise<void> {
  const startVolume = controller.readVolume();
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (!controller.isFadeCurrent(token)) {
        clearInterval(interval);
        resolve();
        return;
      }
      const progress = Math.min(1, (Date.now() - startedAt) / durationMs);
      if (!controller.fadeStep(token, startVolume * (1 - progress))) {
        clearInterval(interval);
        resolve();
        return;
      }
      if (progress >= 1) {
        clearInterval(interval);
        controller.pauseAndRewind();
        resolve();
      }
    }, 16);
  });
}

function FocusSoundsSheet({
  visible,
  theme,
  activeSound,
  isPlaying,
  muted,
  volume,
  onClose,
  onMuteToggle,
  onPause,
  onPlay,
  onStop,
  onVolumeChange,
}: {
  visible: boolean;
  theme: AppTheme;
  activeSound: FocusSound | null;
  isPlaying: boolean;
  muted: boolean;
  volume: number;
  onClose: () => void;
  onMuteToggle: () => void;
  onPause: () => void;
  onPlay: (sound: FocusSound) => void;
  onStop: () => void;
  onVolumeChange: (volume: number) => void;
}) {
  const { colors } = theme;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end" style={{ backgroundColor: '#00000088' }}>
        <View className="max-h-[88%] rounded-t-3xl border p-5" style={{ backgroundColor: colors.surfaceElevated, borderColor: colors.border }}>
          <View className="mb-4 flex-row items-start justify-between gap-3">
            <View>
              <Text className="text-[10px] font-black uppercase" style={{ color: colors.accent, letterSpacing: 2 }}>
                Focus sounds
              </Text>
              <Text className="mt-1 text-xl font-black" style={{ color: colors.text }}>
                White Noise
              </Text>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" className="rounded-xl px-3 py-2 active:opacity-70">
              <Text className="text-xs font-black" style={{ color: colors.secondaryText }}>
                Close
              </Text>
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
            {FOCUS_SOUND_CATEGORIES.map((category) => (
              <View key={category} className="mb-5">
                <Text className="mb-2 text-xs font-black uppercase" style={{ color: colors.secondaryText }}>
                  {category}
                </Text>
                <View className="gap-2">
                  {FOCUS_SOUNDS.filter((sound) => sound.category === category).map((sound) => {
                    const active = activeSound?.id === sound.id;
                    const playing = active && isPlaying;
                    return (
                      <View
                        key={sound.id}
                        className="rounded-2xl border p-3"
                        style={{
                          backgroundColor: active ? colors.accentSoft : colors.card,
                          borderColor: active ? colors.accent : colors.border,
                        }}
                      >
                        <View className="flex-row items-center justify-between gap-3">
                          <View className="flex-1">
                            <View className="flex-row items-center gap-2">
                              <MobileIcon name={sound.icon} color={colors.accent} size={20} accessibilityLabel={`${sound.name} sound`} />
                              <Text numberOfLines={1} className="text-sm font-black" style={{ color: colors.text }}>
                                {sound.name}
                              </Text>
                            </View>
                            {active ? (
                              <View className="mt-2 self-start rounded-full px-2 py-0.5" style={{ backgroundColor: colors.accent }}>
                                <Text className="text-[10px] font-black" style={{ color: colors.accentText }}>
                                  Currently Playing
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          <Pressable
                            onPress={() => (playing ? onPause() : onPlay(sound))}
                            accessibilityRole="button"
                            className="rounded-xl px-3 py-2 active:opacity-70"
                            style={{ backgroundColor: colors.background }}
                          >
                            <Text className="text-xs font-black" style={{ color: colors.text }}>
                              {playing ? '⏸ Pause' : '▶ Play'}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>

          <View className="mt-2 border-t pt-4" style={{ borderColor: colors.border }}>
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-xs font-black uppercase" style={{ color: colors.secondaryText }}>
                Volume
              </Text>
              <Text className="text-xs font-bold" style={{ color: colors.secondaryText }}>
                {Math.round(volume * 100)}%
              </Text>
            </View>
            <MobileVolumeSlider theme={theme} value={volume} onChange={onVolumeChange} />
            <View className="mt-4 flex-row gap-2">
              <View className="flex-1">
                <SecondaryButton fullWidth onPress={onMuteToggle}>
                  {muted ? 'Unmute' : 'Mute'}
                </SecondaryButton>
              </View>
              <View className="flex-1">
                <OutlineButton fullWidth onPress={onStop}>
                  Stop
                </OutlineButton>
              </View>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function MobileVolumeSlider({
  theme,
  value,
  onChange,
}: {
  theme: AppTheme;
  value: number;
  onChange: (value: number) => void;
}) {
  const [width, setWidth] = useState(1);
  const { colors } = theme;

  const updateFromPress = (event: GestureResponderEvent) => {
    onChange(clamp(event.nativeEvent.locationX / width, 0, 1));
  };

  return (
    <Pressable
      onLayout={(event) => setWidth(Math.max(1, event.nativeEvent.layout.width))}
      onPress={updateFromPress}
      accessibilityRole="adjustable"
      className="h-8 justify-center"
    >
      <View className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: colors.progressTrack }}>
        <View className="h-2 rounded-full" style={{ backgroundColor: colors.accent, width: `${Math.round(value * 100)}%` }} />
      </View>
    </Pressable>
  );
}

// --- Timers ----------------------------------------------------------------

function ActiveTimer({
  theme,
  title,
  subtitle,
  typeLabel,
  priority,
  category,
  center,
  fraction,
  status,
}: {
  theme: AppTheme;
  title: string;
  subtitle?: string | null;
  typeLabel: string;
  priority: string | null;
  category: string | null;
  center: string;
  fraction: number;
  status: string;
}) {
  const { colors } = theme;
  return (
    <View className="w-full items-center">
      <Text className="text-xs font-black uppercase" style={{ color: colors.accent, letterSpacing: 2 }}>
        {typeLabel}
      </Text>
      <Text numberOfLines={1} className="mt-2 text-center text-xl font-black" style={{ color: colors.text }}>
        {title}
      </Text>
      {subtitle ? (
        <Text numberOfLines={1} className="mt-1 text-center text-sm font-semibold" style={{ color: colors.secondaryText }}>
          {subtitle}
        </Text>
      ) : null}
      <View className="mt-2 flex-row items-center gap-2">
        {priority ? <Badge theme={theme} label={priority} type={priority} /> : null}
        {category ? (
          <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: colors.surfaceElevated }}>
            <Text className="text-[11px] font-bold" style={{ color: colors.secondaryText }}>
              {category}
            </Text>
          </View>
        ) : null}
      </View>

      <TimerDisc theme={theme} center={center} fraction={fraction} />
      <Text className="mt-4 text-sm font-semibold" style={{ color: colors.secondaryText }}>
        {status}
      </Text>
    </View>
  );
}

function BreakTimer({
  theme,
  label,
  center,
  fraction,
  onEnd,
}: {
  theme: AppTheme;
  label: string;
  center: string;
  fraction: number;
  onEnd: () => void;
}) {
  const { colors } = theme;
  return (
    <View className="w-full items-center">
      <Text className="text-xs font-black uppercase" style={{ color: colors.success, letterSpacing: 2 }}>
        Break
      </Text>
      <Text className="mt-2 text-xl font-black" style={{ color: colors.text }}>
        {label}
      </Text>
      <TimerDisc theme={theme} center={center} fraction={fraction} />
      <Text className="mt-4 text-sm font-semibold" style={{ color: colors.secondaryText }}>
        Relax — no task prompt after this.
      </Text>
      <View className="mt-5 w-40">
        <OutlineButton fullWidth onPress={onEnd}>
          End break
        </OutlineButton>
      </View>
    </View>
  );
}

function TimerDisc({ theme, center, fraction }: { theme: AppTheme; center: string; fraction: number }) {
  const { colors } = theme;
  return (
    <View className="mt-6 items-center">
      <View
        className="h-56 w-56 items-center justify-center rounded-full border-8"
        style={{ borderColor: colors.border, backgroundColor: colors.card }}
      >
        <Text className="text-6xl font-black" style={{ color: colors.text }}>
          {center}
        </Text>
      </View>
      <View className="mt-4 h-2 w-56 rounded-full" style={{ backgroundColor: colors.progressTrack }}>
        <View
          className="h-2 rounded-full"
          style={{ width: `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`, backgroundColor: colors.accent }}
        />
      </View>
    </View>
  );
}

// --- Break offer / finished ------------------------------------------------

function BreakOffer({
  theme,
  onPick,
  onSkip,
}: {
  theme: AppTheme;
  onPick: (minutes: number, label: string) => void;
  onSkip: () => void;
}) {
  const { colors } = theme;
  return (
    <View className="w-full items-center rounded-3xl border p-6" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
      <Text className="text-xl font-black" style={{ color: colors.text }}>
        Nice work — take a break?
      </Text>
      <View className="mt-5 w-full gap-2">
        {BREAK_PRESETS.map((preset) => (
          <PrimaryButton key={preset.label} fullWidth onPress={() => onPick(preset.minutes, preset.label)}>
            {preset.label} • {preset.minutes} min
          </PrimaryButton>
        ))}
        <SecondaryButton fullWidth onPress={onSkip}>
          Skip break
        </SecondaryButton>
      </View>
    </View>
  );
}

function BreakFinished({ theme, onDone }: { theme: AppTheme; onDone: () => void }) {
  const { colors } = theme;
  return (
    <View className="w-full items-center rounded-3xl border p-6" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
      <Text className="text-xl font-black" style={{ color: colors.text }}>
        Break finished
      </Text>
      <Text className="mt-1 text-sm" style={{ color: colors.secondaryText }}>
        Ready for another focus session?
      </Text>
      <View className="mt-5 w-full">
        <PrimaryButton fullWidth onPress={onDone}>
          Back to Focus
        </PrimaryButton>
      </View>
    </View>
  );
}

// --- Modals ----------------------------------------------------------------

function CompletionModal({
  theme,
  minutes,
  busy,
  isSubtask,
  alreadyDone,
  onOutcome,
  onAddTime,
}: {
  theme: AppTheme;
  minutes: number;
  busy: boolean;
  isSubtask: boolean;
  alreadyDone: boolean;
  onOutcome: (outcome: FocusTaskOutcome) => void;
  onAddTime: () => void;
}) {
  const { colors } = theme;
  return (
    <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: '#00000099' }}>
      <View className="w-full rounded-3xl border p-6" style={{ backgroundColor: colors.surfaceElevated, borderColor: colors.border }}>
        <Text className="text-center text-2xl font-black" style={{ color: colors.text }}>
          Great job!
        </Text>
        <Text className="mt-1 text-center text-sm" style={{ color: colors.secondaryText }}>
          You completed {minutes} {minutes === 1 ? 'minute' : 'minutes'} of focus.
        </Text>
        <Text className="mt-4 text-center text-sm font-black" style={{ color: colors.text }}>
          Did you finish this {isSubtask ? 'subtask' : 'task'}?
        </Text>
        {isSubtask ? (
          <View className="mt-4 gap-2">
            <PrimaryButton fullWidth disabled={busy || alreadyDone} onPress={() => onOutcome('done')}>
              Mark Complete
            </PrimaryButton>
            <SecondaryButton fullWidth disabled={busy} onPress={() => onOutcome('keep')}>
              Continue Later
            </SecondaryButton>
            <OutlineButton fullWidth disabled={busy} onPress={onAddTime}>
              Add More Time
            </OutlineButton>
          </View>
        ) : (
          <View className="mt-4 gap-2">
            <PrimaryButton fullWidth disabled={busy || alreadyDone} onPress={() => onOutcome('done')}>
              Yes, mark task done
            </PrimaryButton>
            <SecondaryButton fullWidth disabled={busy} onPress={() => onOutcome('partial')}>
              Partially completed
            </SecondaryButton>
            <OutlineButton fullWidth disabled={busy} onPress={() => onOutcome('keep')}>
              Not yet
            </OutlineButton>
          </View>
        )}
      </View>
    </View>
  );
}

function ExitConfirm({ theme, onStay, onLeave }: { theme: AppTheme; onStay: () => void; onLeave: () => void }) {
  const { colors } = theme;
  return (
    <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: '#00000099' }}>
      <View className="w-full rounded-3xl border p-6" style={{ backgroundColor: colors.surfaceElevated, borderColor: colors.border }}>
        <Text className="text-center text-lg font-black" style={{ color: colors.text }}>
          Leave focus?
        </Text>
        <Text className="mt-1 text-center text-sm" style={{ color: colors.secondaryText }}>
          A focus session is still active. Leave anyway?
        </Text>
        <View className="mt-5 flex-row gap-2">
          <View className="flex-1">
            <SecondaryButton fullWidth onPress={onStay}>
              Stay
            </SecondaryButton>
          </View>
          <View className="flex-1">
            <DangerButton fullWidth onPress={onLeave}>
              Leave
            </DangerButton>
          </View>
        </View>
      </View>
    </View>
  );
}

// --- Small pieces ----------------------------------------------------------

function UtilityButton({
  theme,
  label,
  accent,
  onPress,
}: {
  theme: AppTheme;
  label: string;
  accent?: boolean;
  onPress: () => void;
}) {
  const { colors } = theme;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="rounded-xl px-3 py-2 active:opacity-70">
      <Text className="text-xs font-bold" style={{ color: accent ? colors.accent : colors.secondaryText }}>
        {label}
      </Text>
    </Pressable>
  );
}

function Badge({ theme, label, type }: { theme: AppTheme; label: string; type: string }) {
  const { colors } = theme;
  const normalized = type.toLowerCase();
  const color = normalized === 'high' || normalized === 'urgent' ? colors.error : normalized === 'medium' ? colors.warning : colors.success;
  return (
    <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: `${color}33` }}>
      <Text className="text-[11px] font-bold capitalize" style={{ color }}>
        {label}
      </Text>
    </View>
  );
}

// --- Strict Mode pieces ----------------------------------------------------

function StrictStatusCard({
  theme,
  active,
  arming,
  error,
  blockedCount,
  usageAccess,
  attempts,
  onViewAttempts,
}: {
  theme: AppTheme;
  active: boolean;
  arming: boolean;
  error: string | null;
  blockedCount: number;
  usageAccess: boolean;
  attempts: number;
  onViewAttempts: () => void;
}) {
  const { colors } = theme;

  if (error) {
    return (
      <View className="mt-5 w-full rounded-2xl border p-4" style={{ borderColor: colors.error, backgroundColor: `${colors.error}18` }}>
        <Text className="text-xs font-black uppercase" style={{ color: colors.error, letterSpacing: 1 }}>
          App blocking did not activate
        </Text>
        <Text className="mt-1 text-xs" style={{ color: colors.secondaryText }}>
          {error} Your focus timer is still running normally.
        </Text>
      </View>
    );
  }

  if (arming && !active) {
    return (
      <View className="mt-5 w-full rounded-2xl border p-4" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
        <Text className="text-xs font-semibold" style={{ color: colors.secondaryText }}>
          Activating app blocking…
        </Text>
      </View>
    );
  }

  return (
    <View className="mt-5 w-full rounded-2xl border p-4" style={{ borderColor: colors.accent, backgroundColor: colors.accentSoft }}>
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: colors.accent }}>
            <Text className="text-[10px] font-black uppercase" style={{ color: colors.accentText, letterSpacing: 1 }}>
              Strict Mode active
            </Text>
          </View>
        </View>
        <Text className="text-xs font-semibold" style={{ color: usageAccess ? colors.success : colors.warning }}>
          {usageAccess ? 'Usage Access ✓' : 'Permission lost'}
        </Text>
      </View>

      <View className="mt-3 flex-row items-center justify-between">
        <View>
          <Text className="text-[10px] font-black uppercase" style={{ color: colors.secondaryText }}>
            Blocking
          </Text>
          <Text className="text-sm font-black" style={{ color: colors.text }}>
            {blockedCount} app{blockedCount === 1 ? '' : 's'}
          </Text>
        </View>
        <View>
          <Text className="text-[10px] font-black uppercase" style={{ color: colors.secondaryText }}>
            Blocked attempts
          </Text>
          <Text className="text-sm font-black" style={{ color: colors.text }}>
            {attempts}
          </Text>
        </View>
        <Pressable onPress={onViewAttempts} accessibilityRole="button" className="rounded-xl px-3 py-2 active:opacity-70" style={{ backgroundColor: colors.surface }}>
          <Text className="text-xs font-black" style={{ color: colors.primary }}>
            View details
          </Text>
        </Pressable>
      </View>

      {!usageAccess ? (
        <Text className="mt-2 text-[11px]" style={{ color: colors.warning }}>
          Usage Access was revoked — blocking can't enforce until it's re-granted.
        </Text>
      ) : null}
    </View>
  );
}

function StrictExitConfirm({
  theme,
  onStay,
  onExit,
}: {
  theme: AppTheme;
  onStay: () => void;
  onExit: (reason: string) => void;
}) {
  const { colors } = theme;
  const reasons = [
    { key: 'emergency', label: 'Real emergency' },
    { key: 'need-app', label: 'I need a blocked app' },
    { key: 'done-early', label: 'Finished early' },
    { key: 'other', label: 'Other reason' },
  ];
  return (
    <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: '#00000099' }}>
      <View className="w-full rounded-3xl border p-6" style={{ backgroundColor: colors.surfaceElevated, borderColor: colors.border }}>
        <Text className="text-center text-lg font-black" style={{ color: colors.text }}>
          End strict session early?
        </Text>
        <Text className="mt-1 text-center text-sm" style={{ color: colors.secondaryText }}>
          This stops app blocking and ends your focus session. Pick a reason — it's saved to your stats.
        </Text>
        <View className="mt-4 gap-2">
          {reasons.map((reason) => (
            <DangerButton key={reason.key} fullWidth onPress={() => onExit(reason.key)}>
              {reason.label}
            </DangerButton>
          ))}
          <SecondaryButton fullWidth onPress={onStay}>
            Keep focusing
          </SecondaryButton>
        </View>
      </View>
    </View>
  );
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}
