import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createGuardedSoundPlayer, type SoundPlayerLike } from './focusSoundPlayer.ts'

type Call = string

// A stand-in for expo-audio's AudioPlayer that records the calls made to it and
// can be flipped into a "released" state that throws on every access — exactly
// how a released native SharedObject behaves.
function makeFakePlayer() {
  const calls: Call[] = []
  let released = false
  const guardReleased = () => {
    if (released) throw new Error('Cannot use shared object that was already released')
  }
  const player: SoundPlayerLike & { release(): void; _calls: Call[]; _volume: number } = {
    _calls: calls,
    _volume: 1,
    get volume() {
      guardReleased()
      return this._volume
    },
    set volume(v: number) {
      guardReleased()
      this._volume = v
      calls.push(`volume:${v}`)
    },
    set muted(v: boolean) {
      guardReleased()
      calls.push(`muted:${v}`)
    },
    get muted() {
      return false
    },
    set loop(v: boolean) {
      guardReleased()
      calls.push(`loop:${v}`)
    },
    get loop() {
      return false
    },
    play() {
      guardReleased()
      calls.push('play')
    },
    pause() {
      guardReleased()
      calls.push('pause')
    },
    replace(source) {
      guardReleased()
      // Mirror the Android crash: replace() must never receive null/undefined.
      if (source == null) throw new Error('The 2nd argument cannot be cast to AudioSource (received null)')
      calls.push(`replace:${JSON.stringify(source)}`)
    },
    seekTo(seconds: number) {
      guardReleased()
      calls.push(`seekTo:${seconds}`)
      return Promise.resolve()
    },
    release() {
      released = true
    },
  }
  return player
}

const assets: Record<string, number> = { rain: 101, ocean: 202 }
const resolve = (id: string) => assets[id]

describe('createGuardedSoundPlayer', () => {
  it('loads and plays a known sound without ever passing null to replace', () => {
    const player = makeFakePlayer()
    const c = createGuardedSoundPlayer(player, resolve)

    const ok = c.loadAndPlay('rain', { volume: 0.5, muted: false })
    assert.equal(ok, true)
    assert.deepEqual(player._calls, ['replace:101', 'loop:true', 'volume:0.5', 'muted:false', 'play'])
  })

  it('never calls replace when the asset is missing', () => {
    const player = makeFakePlayer()
    const c = createGuardedSoundPlayer(player, resolve)

    const ok = c.loadAndPlay('does-not-exist', { volume: 0.5, muted: false })
    assert.equal(ok, false)
    assert.deepEqual(player._calls, []) // replace(undefined) never reached
  })

  it('stop pauses and rewinds instead of replacing with null', () => {
    const player = makeFakePlayer()
    const c = createGuardedSoundPlayer(player, resolve)
    c.loadAndPlay('rain', { volume: 0.5, muted: false })
    player._calls.length = 0

    c.stop()
    assert.deepEqual(player._calls, ['pause', 'seekTo:0'])
    assert.ok(!player._calls.some((call) => call.startsWith('replace')))
  })

  it('no-ops every command after markReleased (unmount)', () => {
    const player = makeFakePlayer()
    const c = createGuardedSoundPlayer(player, resolve)

    c.markReleased()
    assert.equal(c.isReleased(), true)

    assert.equal(c.loadAndPlay('rain', { volume: 1, muted: false }), false)
    assert.equal(c.resume({ volume: 1, muted: false }), false)
    assert.equal(c.pause(), false)
    assert.equal(c.stop(), false)
    assert.equal(c.applyVolume({ volume: 1, muted: false }), false)
    assert.deepEqual(player._calls, [])
  })

  it('swallows "already released" thrown by the native player mid-operation', () => {
    const player = makeFakePlayer()
    const c = createGuardedSoundPlayer(player, resolve)

    // Simulate useAudioPlayer releasing the shared object underneath us without
    // our controller being told first.
    player.release()

    // Must not throw, and must mark itself released so later calls short-circuit.
    assert.doesNotThrow(() => c.pause())
    assert.equal(c.isReleased(), true)
    // Subsequent commands short-circuit without touching the player.
    assert.equal(c.resume({ volume: 1, muted: false }), false)
  })

  it('cancels a stale fade once a newer operation supersedes its token', () => {
    const player = makeFakePlayer()
    const c = createGuardedSoundPlayer(player, resolve)

    const token = c.beginFade()
    assert.equal(c.isFadeCurrent(token), true)

    // A newer play/stop bumps the token.
    c.loadAndPlay('ocean', { volume: 1, muted: false })
    assert.equal(c.isFadeCurrent(token), false)

    // A fade step under the stale token must be ignored.
    player._calls.length = 0
    assert.equal(c.fadeStep(token, 0.2), false)
    assert.deepEqual(player._calls, [])
  })

  it('applies fade steps only while the token is current', () => {
    const player = makeFakePlayer()
    const c = createGuardedSoundPlayer(player, resolve)
    c.loadAndPlay('rain', { volume: 1, muted: false })

    const token = c.beginFade()
    player._calls.length = 0
    assert.equal(c.fadeStep(token, 0.4), true)
    assert.deepEqual(player._calls, ['volume:0.4'])
  })

  it('readVolume returns 0 and marks released when the player throws', () => {
    const player = makeFakePlayer()
    const c = createGuardedSoundPlayer(player, resolve)
    player.release()

    assert.equal(c.readVolume(), 0)
    assert.equal(c.isReleased(), true)
  })

  // Regression: React fires effect cleanups on every Fast Refresh while
  // expo-audio keeps the native player alive. markReleased() from the cleanup
  // must be reversible by markMounted() from the setup, or the ref-cached
  // controller stays dead and no sound ever plays again.
  it('markMounted re-arms the controller after a Fast Refresh cleanup', () => {
    const player = makeFakePlayer()
    const c = createGuardedSoundPlayer(player, resolve)

    c.markReleased() // effect cleanup (Fast Refresh)
    c.markMounted() // effect setup re-runs; native player is still alive

    assert.equal(c.isReleased(), false)
    assert.equal(c.loadAndPlay('rain', { volume: 0.5, muted: false }), true)
    assert.deepEqual(player._calls, ['replace:101', 'loop:true', 'volume:0.5', 'muted:false', 'play'])
  })

  it('markMounted cannot revive a natively released player', () => {
    const player = makeFakePlayer()
    const c = createGuardedSoundPlayer(player, resolve)

    player.release()
    c.pause() // detects the native release and marks the controller dead
    assert.equal(c.isReleased(), true)

    c.markMounted()
    assert.equal(c.isReleased(), true)
    assert.equal(c.loadAndPlay('rain', { volume: 1, muted: false }), false)
  })

  // Regression: a transient non-release error (e.g. a bad source) must fail
  // only that command — treating every throw as "released" bricked all
  // future playback silently.
  it('a non-release player error does not permanently disable the controller', () => {
    const player = makeFakePlayer()
    const original = player.replace.bind(player)
    let failNextReplace = true
    player.replace = (source) => {
      if (failNextReplace) {
        failNextReplace = false
        throw new Error('The 2nd argument cannot be cast to AudioSource (received null)')
      }
      original(source)
    }
    const c = createGuardedSoundPlayer(player, resolve)

    assert.equal(c.loadAndPlay('rain', { volume: 1, muted: false }), false)
    assert.equal(c.isReleased(), false)

    assert.equal(c.loadAndPlay('ocean', { volume: 1, muted: false }), true)
    assert.ok(player._calls.includes('replace:202'))
    assert.ok(player._calls.includes('play'))
  })
})
