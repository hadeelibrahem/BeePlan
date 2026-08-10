export type SharedSoundEvent = 'started' | 'paused' | 'resumed' | 'lastMinute' | 'completed' | 'endedEarly' | 'joined' | 'left' | 'ready'
export type SharedSoundPreferences = { enabled: boolean; volume: number; events: Record<SharedSoundEvent, boolean> }
const KEY = 'beeplan.sharedFocusSounds'
const defaults: SharedSoundPreferences = { enabled: true, volume: 0.45, events: { started: true, paused: true, resumed: true, lastMinute: true, completed: true, endedEarly: true, joined: true, left: true, ready: true } }
export function loadSharedSoundPreferences(): SharedSoundPreferences { try { const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return { ...defaults, ...saved, events: { ...defaults.events, ...(saved.events ?? {}) } } } catch { return defaults } }
export function saveSharedSoundPreferences(value: SharedSoundPreferences) { localStorage.setItem(KEY, JSON.stringify(value)) }
const played = new Set<string>()
let activeEventAudio: HTMLAudioElement | null = null
let activeEventTimer: number | null = null
export function stopSharedFocusSound() { if (activeEventTimer !== null) window.clearTimeout(activeEventTimer); activeEventTimer = null; if (activeEventAudio) { activeEventAudio.onended = null; activeEventAudio.pause(); activeEventAudio.currentTime = 0; activeEventAudio = null } }
export function playSharedFocusSound(event: SharedSoundEvent, eventKey: string) { const prefs = loadSharedSoundPreferences(); const key = `${event}:${eventKey}`; if (!prefs.enabled || !prefs.events[event] || played.has(key)) return; played.add(key); stopSharedFocusSound(); const audio = new Audio('/focus-complete.mp3'); audio.loop = false; audio.volume = prefs.volume; activeEventAudio = audio; const finish = () => { if (activeEventAudio === audio) stopSharedFocusSound() }; audio.onended = finish; activeEventTimer = window.setTimeout(finish, 4000); void audio.play().catch(finish) }
