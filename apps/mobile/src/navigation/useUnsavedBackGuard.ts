import { useCallback } from 'react';
import { Alert } from 'react-native';
import { createUnsavedBackGuard } from './unsavedBackGuard';
import { useHardwareBack } from './useHardwareBack';

type Options = {
  /** Whether the form currently has unsaved edits. */
  isDirty: boolean;
  /** Navigate away from the form (typically the screen's onCancel/back). */
  onLeave: () => void;
  /** Optional prompt copy overrides. */
  title?: string;
  message?: string;
};

/**
 * Guards a form screen against losing unsaved edits. Covers two exit paths with
 * the same dirty-aware discard prompt:
 *  - Android hardware back (registered here), and
 *  - the returned `confirmLeave`, which the screen's Cancel button / header back
 *    arrow should call instead of navigating away directly.
 *
 * When the form is clean both paths leave immediately; when dirty they show a
 * discard confirmation first.
 */
export function useUnsavedBackGuard({ isDirty, onLeave, title, message }: Options): { confirmLeave: () => void } {
  const confirmDiscard = useCallback(
    (onDiscard: () => void) =>
      Alert.alert(title ?? 'Discard changes?', message ?? 'You have unsaved changes that will be lost.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: onDiscard },
      ]),
    [title, message],
  );

  const handler = useCallback(
    () => createUnsavedBackGuard({ isDirty: () => isDirty, onLeave, confirmDiscard })(),
    [isDirty, onLeave, confirmDiscard],
  );
  useHardwareBack(handler);

  const confirmLeave = useCallback(() => {
    if (!isDirty) {
      onLeave();
      return;
    }
    confirmDiscard(onLeave);
  }, [isDirty, onLeave, confirmDiscard]);

  return { confirmLeave };
}
