import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { createGuardedSoundPlayer, type GuardedSoundPlayer } from './focusSoundPlayer';
import { FOCUS_SOUNDS, type FocusSound } from './focusSounds';
import { defaultSharedSoundPreferences, loadSharedSoundPreferences, type SharedSoundEvent } from './sharedFocusSounds';

const COMPLETION_ASSET = require('../../assets/focus-complete.mp3') as number;
const FOCUS_SOUND_ASSETS: Record<string, number> = {
  ambient: require('../../assets/focus-sounds/ambient.mp3'), birds: require('../../assets/focus-sounds/birds.mp3'), 'brown-noise': require('../../assets/focus-sounds/brown-noise.mp3'), 'coffee-shop': require('../../assets/focus-sounds/coffee-shop.mp3'), fan: require('../../assets/focus-sounds/fan.mp3'), fireplace: require('../../assets/focus-sounds/fireplace.mp3'), forest: require('../../assets/focus-sounds/forest.mp3'), 'heavy-rain': require('../../assets/focus-sounds/heavy-rain.mp3'), library: require('../../assets/focus-sounds/library.mp3'), lofi: require('../../assets/focus-sounds/lofi.mp3'), meditation: require('../../assets/focus-sounds/meditation.mp3'), 'ocean-waves': require('../../assets/focus-sounds/ocean-waves.mp3'), 'pink-noise': require('../../assets/focus-sounds/pink-noise.mp3'), rain: require('../../assets/focus-sounds/rain.mp3'), river: require('../../assets/focus-sounds/river.mp3'), 'soft-piano': require('../../assets/focus-sounds/soft-piano.mp3'), thunder: require('../../assets/focus-sounds/thunder.mp3'), 'white-noise': require('../../assets/focus-sounds/white-noise.mp3'),
};
const played = new Set<string>();

export function useFocusAudio() {
  const player = useAudioPlayer(null, { keepAudioSessionActive: true });
  const [activeSoundId, setActiveSoundId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.65);
  const [muted, setMuted] = useState(false);
  const controllerRef = useRef<GuardedSoundPlayer | null>(null);
  const playerRef = useRef(player);
  const cueTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (!controllerRef.current || playerRef.current !== player) { playerRef.current = player; controllerRef.current = createGuardedSoundPlayer(player, id => id === 'shared-cue' ? COMPLETION_ASSET : FOCUS_SOUND_ASSETS[id]); }
  const controller = controllerRef.current;
  const activeSound = useMemo(() => FOCUS_SOUNDS.find(s => s.id === activeSoundId) ?? null, [activeSoundId]);
  useEffect(() => { void setAudioModeAsync({ playsInSilentMode: true }); controller.markMounted(); return () => { controller.markReleased(); if (cueTimeout.current) clearTimeout(cueTimeout.current); }; }, [controller]);
  const stop = useCallback(() => { controller.stop(); setActiveSoundId(null); setIsPlaying(false); }, [controller]);
  const pause = useCallback(() => { controller.pause(); setIsPlaying(false); }, [controller]);
  const play = useCallback(async (sound: FocusSound) => { if (activeSoundId === sound.id) { controller.resume({ volume, muted }); setIsPlaying(true); return; } controller.stop(); if (controller.loadAndPlay(sound.id, { volume, muted })) { setActiveSoundId(sound.id); setIsPlaying(true); } }, [activeSoundId, controller, muted, volume]);
  useEffect(() => { controller.applyVolume({ volume, muted }); }, [controller, muted, volume]);
  const playSharedEvent = useCallback(async (event: SharedSoundEvent, eventKey: string) => {
    if (played.has(eventKey)) return false;
    const prefs = await loadSharedSoundPreferences();
    if (!prefs.enabled || !prefs.events[event]) return false;
    played.add(eventKey); controller.stop();
    if (!controller.loadAndPlay('shared-cue', { volume: prefs.volume, muted: false, loop: false })) return false;
    cueTimeout.current = setTimeout(() => controller.stop(), 1200);
    return true;
  }, [controller]);
  const testSharedSound = useCallback(async () => { const prefs = await loadSharedSoundPreferences(); if (!prefs.enabled) return false; controller.stop(); if (!controller.loadAndPlay('shared-cue', { volume: prefs.volume, muted: false, loop: false })) return false; cueTimeout.current = setTimeout(() => controller.stop(), 1200); return true; }, [controller]);
  return { activeSound, isPlaying, muted, volume, pause, play, stop, setVolume, toggleMuted: () => setMuted(v => !v), playSharedEvent, testSharedSound };
}
