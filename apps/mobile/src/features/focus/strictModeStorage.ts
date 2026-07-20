import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persists the user's Strict Mode preferences (whether it's enabled and which
 * apps to block) so the choice survives app restarts and is ready the moment a
 * focus session starts. This is a *preference* store — the live session state
 * lives natively (see BeePlanFocusBlocker) and in useFocusSession.
 */
const KEY = 'beeplan.focus.strictMode';

export type StrictModePrefs = {
  enabled: boolean;
  blockedPackages: string[];
  /** Whether to offer the "I really need this app" escape hatch. */
  allowEmergencyExit: boolean;
};

export const DEFAULT_STRICT_PREFS: StrictModePrefs = {
  enabled: false,
  blockedPackages: [],
  allowEmergencyExit: true,
};

export async function loadStrictPrefs(): Promise<StrictModePrefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_STRICT_PREFS;
    const parsed = JSON.parse(raw) as Partial<StrictModePrefs>;
    return {
      enabled: parsed.enabled ?? false,
      blockedPackages: Array.isArray(parsed.blockedPackages) ? parsed.blockedPackages : [],
      allowEmergencyExit: parsed.allowEmergencyExit ?? true,
    };
  } catch {
    return DEFAULT_STRICT_PREFS;
  }
}

export async function saveStrictPrefs(prefs: StrictModePrefs): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(prefs));
}
