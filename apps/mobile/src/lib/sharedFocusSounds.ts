import AsyncStorage from '@react-native-async-storage/async-storage';
export type SharedSoundEvent = 'started' | 'paused' | 'resumed' | 'lastMinute' | 'completed' | 'endedEarly' | 'joined' | 'left';
export type SharedSoundPreferences = { enabled: boolean; volume: number; events: Record<SharedSoundEvent, boolean> };
const KEY = 'beeplan.sharedFocusSounds';
export const defaultSharedSoundPreferences: SharedSoundPreferences = { enabled: true, volume: .45, events: { started: true, paused: true, resumed: true, lastMinute: true, completed: true, endedEarly: true, joined: true, left: true } };
export async function loadSharedSoundPreferences() { try { return { ...defaultSharedSoundPreferences, ...JSON.parse(await AsyncStorage.getItem(KEY) ?? '{}') }; } catch { return defaultSharedSoundPreferences; } }
export async function saveSharedSoundPreferences(value: SharedSoundPreferences) { await AsyncStorage.setItem(KEY, JSON.stringify(value)); }
