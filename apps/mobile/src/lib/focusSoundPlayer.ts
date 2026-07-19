// Lifecycle-safe wrapper around an expo-audio `AudioPlayer`.
//
// expo-audio's `useAudioPlayer` returns a native `SharedObject`. Two runtime
// hazards come with it:
//
//   1. `player.replace(source)` rejects `null`/`undefined` on Android
//      ("received null"), so we must never forward a missing source.
//   2. `useAudioPlayer` releases the shared object on unmount. Any method call
//      after that throws "Cannot use shared object that was already released".
//      Async callbacks (fades, awaited operations) and Fast Refresh can all
//      race past the release.
//
// One extra wrinkle drives the mounted/released API shape: React fires effect
// cleanups on every Fast Refresh, not just on unmount, while expo-audio
// deliberately keeps the native player alive across Fast Refresh
// (see useReleasingSharedObject). The unmount guard must therefore be
// re-armable — `markReleased()` in the cleanup, `markMounted()` in the setup —
// or a single Fast Refresh would silence audio for the rest of the app's life.
// Only a native "already released" error is treated as permanent.
//
// This controller centralises the guards so the React hook stays declarative
// and the tricky rules are unit-testable without native modules.

/** The subset of `expo-audio`'s `AudioPlayer` this controller drives. */
export type SoundPlayerLike = {
  volume: number;
  muted: boolean;
  loop: boolean;
  play(): void;
  pause(): void;
  replace(source: number | string | { uri?: string; assetId?: number }): void;
  seekTo(seconds: number): Promise<void> | void;
};

export type SoundVolume = {
  volume: number;
  muted: boolean;
};

// TEMP debug logging while diagnosing the silent-playback regression.
const debug = (message: string): void => {
  // eslint-disable-next-line no-console
  console.log(`[FocusSound] ${message}`);
};

/** True only for the native "shared object already released" failure. */
const isReleaseError = (error: unknown): boolean =>
  error instanceof Error && /already released|shared object/i.test(error.message);

/**
 * Wraps a player so every command is a no-op once the underlying shared object
 * has been (or is being) released, and so a missing audio source can never
 * reach `replace()`. Native "already released" errors that still slip through a
 * race are swallowed rather than crashing the render tree.
 */
export function createGuardedSoundPlayer(
  player: SoundPlayerLike,
  resolveAsset: (soundId: string) => number | string | { uri?: string; assetId?: number } | undefined | null,
) {
  // Unmount guard: armed by `markReleased()` (effect cleanup), disarmed by
  // `markMounted()` (effect setup). Cleanups also fire on Fast Refresh while
  // the native player stays alive, so this flag must be reversible.
  let unmounted = false;
  // The native shared object is gone for real; nothing can revive this.
  let dead = false;
  // Monotonic token used to cancel a fade (or any deferred step) as soon as a
  // newer operation — play, stop, or unmount — supersedes it.
  let fadeToken = 0;

  const released = (): boolean => unmounted || dead;

  const run = (fn: () => void): boolean => {
    if (released()) return false;
    try {
      fn();
      return true;
    } catch (error) {
      if (isReleaseError(error)) {
        // The shared object was released underneath us (unmount / Fast Refresh
        // race). Permanent: short-circuit everything from now on.
        dead = true;
        debug('released');
      } else {
        // Any other native hiccup fails this one command only — bricking the
        // controller here is what silenced playback after transient errors.
        debug(`playback skipped (player call failed: ${error instanceof Error ? error.message : String(error)})`);
      }
      return false;
    }
  };

  const isReleased = () => released();

  const isFadeCurrent = (token: number): boolean => !released() && token === fadeToken;

  const pauseAndRewind = (): boolean =>
    run(() => {
      player.pause();
      void Promise.resolve(player.seekTo(0)).catch(() => undefined);
    });

  return {
    /** True once the controller has been marked released. */
    isReleased,

    /**
     * Mark the player unusable. Idempotent: the native release is owned by
     * `useAudioPlayer`, so this only flips our guard and cancels pending fades.
     * Reversible via `markMounted()` because effect cleanups also run on Fast
     * Refresh, where the native player survives.
     */
    markReleased(): void {
      unmounted = true;
      fadeToken += 1;
      debug('released');
    },

    /**
     * Re-arm the controller from an effect setup. Undoes `markReleased()` after
     * a Fast Refresh re-fires the cleanup/setup pair; a genuinely dead native
     * player (caught "already released" error) stays dead.
     */
    markMounted(): void {
      unmounted = false;
    },

    /** Load a sound by id and start it. No-ops if the asset is missing. */
    loadAndPlay(soundId: string, { volume, muted }: SoundVolume): boolean {
      if (released()) {
        debug('playback skipped (controller released)');
        return false;
      }
      const asset = resolveAsset(soundId);
      // Guard 1: never hand null/undefined to replace().
      if (asset == null) {
        debug(`playback skipped (no asset for "${soundId}")`);
        return false;
      }
      fadeToken += 1;
      debug('loading asset');
      return run(() => {
        player.replace(asset);
        debug('replace success');
        player.loop = true;
        player.volume = muted ? 0 : volume;
        player.muted = muted;
        player.play();
        debug('play started');
      });
    },

    /** Resume the currently-loaded sound. */
    resume({ volume, muted }: SoundVolume): boolean {
      return run(() => {
        player.volume = muted ? 0 : volume;
        player.muted = muted;
        player.play();
      });
    },

    /** Pause without unloading. */
    pause(): boolean {
      return run(() => player.pause());
    },

    /**
     * Stop playback and rewind. We intentionally do NOT `replace(null)` to
     * unload (that crashes on Android); pausing at position 0 is an equivalent
     * "stopped" state and keeps the player reusable for the next sound.
     * Bumps the fade token so any in-flight fade is cancelled.
     */
    stop(): boolean {
      fadeToken += 1;
      return pauseAndRewind();
    },

    /**
     * Pause and rewind without cancelling the current fade token — used as the
     * tail of a fade-out, after which the caller loads the next sound under the
     * same token.
     */
    pauseAndRewind,

    /** Apply volume/mute to the live player. */
    applyVolume({ volume, muted }: SoundVolume): boolean {
      return run(() => {
        player.volume = muted ? 0 : volume;
        player.muted = muted;
      });
    },

    /** Begin a fade: claim a token the caller checks with `isFadeCurrent`. */
    beginFade(): number {
      return ++fadeToken;
    },

    /** True while `token` is still the active fade and the player is alive. */
    isFadeCurrent,

    /** Read the current volume (0 if the player is unavailable). */
    readVolume(): number {
      if (released()) return 0;
      try {
        return player.volume;
      } catch (error) {
        if (isReleaseError(error)) {
          dead = true;
          debug('released');
        }
        return 0;
      }
    },

    /** Set volume as one fade step; returns false if the step should stop. */
    fadeStep(token: number, nextVolume: number): boolean {
      if (!isFadeCurrent(token)) return false;
      return run(() => {
        player.volume = nextVolume;
      });
    },
  };
}

export type GuardedSoundPlayer = ReturnType<typeof createGuardedSoundPlayer>;
