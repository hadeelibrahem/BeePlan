/**
 * Pure decision logic for protecting an unsaved form from an Android
 * hardware-back press. Extracted from any react-native imports so it can be
 * unit-tested; the RN wiring (Alert + BackHandler) lives in useUnsavedBackGuard.
 */

export type ConfirmDiscard = (onDiscard: () => void) => void;

export type UnsavedBackGuardOptions = {
  /** Returns true when the form has unsaved edits. */
  isDirty: () => boolean;
  /** Shows the "discard changes?" prompt; invokes its callback if confirmed. */
  confirmDiscard: ConfirmDiscard;
  /** Leaves the form (typically the screen's onCancel/back navigation). */
  onLeave: () => void;
};

/**
 * Builds a hardware-back handler for a form screen.
 *
 * Returns `true` (consume the event) when the form is dirty — a discard prompt
 * is shown and navigation is deferred until the user confirms. Returns `false`
 * (do not consume) when the form is clean, letting the app's central back
 * handler navigate to the parent screen as usual.
 */
export function createUnsavedBackGuard(options: UnsavedBackGuardOptions): () => boolean {
  return function handleHardwareBack(): boolean {
    if (!options.isDirty()) return false;
    options.confirmDiscard(options.onLeave);
    return true;
  };
}
