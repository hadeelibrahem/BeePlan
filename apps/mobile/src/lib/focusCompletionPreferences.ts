import AsyncStorage from '@react-native-async-storage/async-storage';

export const FOCUS_COMPLETION_SOUND_KEY = 'beeplan.focus.completionSound';
let enabled = true;
const listeners = new Set<(value: boolean) => void>();

export async function loadFocusCompletionSoundEnabled(): Promise<boolean> {
  try { enabled = (await AsyncStorage.getItem(FOCUS_COMPLETION_SOUND_KEY)) !== 'false'; } catch { enabled = true; }
  return enabled;
}

export async function setFocusCompletionSoundEnabled(value: boolean): Promise<void> {
  enabled = value;
  await AsyncStorage.setItem(FOCUS_COMPLETION_SOUND_KEY, String(value));
  listeners.forEach((listener) => listener(value));
}

export function subscribeFocusCompletionSound(listener: (value: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
