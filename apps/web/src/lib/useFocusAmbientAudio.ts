import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FOCUS_SOUNDS, type FocusSound } from './focusSounds';

type Playback = { audio: HTMLAudioElement; soundId: string };
export function useFocusAmbientAudio() {
  const ref = useRef<Playback | null>(null);
  const [activeSoundId, setActiveSoundId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(.65);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState('');
  const activeSound = useMemo(() => FOCUS_SOUNDS.find(s => s.id === activeSoundId) ?? null, [activeSoundId]);
  const stopPlayback = useCallback((reset = true) => { const playback = ref.current; if (!playback) return; playback.audio.pause(); if (reset) playback.audio.currentTime = 0; playback.audio.src = ''; ref.current = null; }, []);
  const fadeOut = useCallback((durationMs = 380) => new Promise<void>(resolve => { const playback = ref.current; if (!playback) return resolve(); const audio = playback.audio; const starting = audio.volume; const started = performance.now(); const tick = (now: number) => { if (ref.current !== playback) return resolve(); const progress = Math.min(1, (now - started) / durationMs); audio.volume = starting * (1 - progress); if (progress >= 1) { stopPlayback(); resolve(); } else window.requestAnimationFrame(tick); }; window.requestAnimationFrame(tick); }), [stopPlayback]);
  const play = useCallback(async (sound: FocusSound) => { setError(''); const current = ref.current; if (current?.soundId === sound.id) { current.audio.volume = muted ? 0 : volume; try { await current.audio.play(); setIsPlaying(true); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to resume focus sound.'); } return; } await fadeOut(); try { const audio = new Audio(sound.audioFile); audio.loop = true; audio.preload = 'auto'; audio.volume = muted ? 0 : volume; await audio.play(); ref.current = { audio, soundId: sound.id }; setActiveSoundId(sound.id); setIsPlaying(true); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to start focus sound.'); setIsPlaying(false); } }, [fadeOut, muted, volume]);
  const pause = useCallback(() => { ref.current?.audio.pause(); setIsPlaying(false); }, []);
  const stop = useCallback(() => { stopPlayback(); setActiveSoundId(null); setIsPlaying(false); }, [stopPlayback]);
  useEffect(() => { if (ref.current) ref.current.audio.volume = muted ? 0 : volume; }, [muted, volume]);
  useEffect(() => stop, [stop]);
  return { activeSound, error, isPlaying, muted, volume, play, pause, stop, setVolume, toggleMuted: () => setMuted(v => !v) };
}
