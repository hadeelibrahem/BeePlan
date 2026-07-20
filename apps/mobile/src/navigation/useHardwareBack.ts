import { useEffect } from 'react';
import { BackHandler } from 'react-native';

/**
 * Registers an Android hardware-back handler for as long as the component is
 * mounted. The handler returns `true` to consume the press (handled here) or
 * `false` to let lower-priority handlers / the OS default run.
 *
 * React Native invokes handlers in reverse subscription order, so a screen that
 * mounts after the app-level handler is consulted first — this is what lets a
 * form screen's unsaved-changes guard intercept back before the app navigates.
 *
 * No-op on platforms without a hardware back button (iOS).
 */
export function useHardwareBack(handler: () => boolean): void {
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', handler);
    return () => subscription.remove();
  }, [handler]);
}
