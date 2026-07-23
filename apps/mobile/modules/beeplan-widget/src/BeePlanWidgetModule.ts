import { NativeModule, requireNativeModule } from 'expo';

/**
 * Strongly typed handle to the native `BeePlanWidget` Kotlin module.
 *
 * `requireNativeModule` throws on iOS/web, so all consumers must guard with
 * `Platform.OS === 'android'` (the `nativeModule` wrapper below does this).
 */
declare class BeePlanWidgetModuleType extends NativeModule {
  /**
   * Persist the widget snapshot (a JSON string of {@link BeePlanWidgetSnapshot})
   * and repaint every placed widget. The token is intentionally NOT part of the
   * payload — only render-safe fields are stored.
   */
  setSnapshot(snapshotJson: string): Promise<void>;
  /** Clear all stored widget data (used on logout) and repaint to a safe state. */
  clearSnapshot(): Promise<void>;
}

export default requireNativeModule<BeePlanWidgetModuleType>('BeePlanWidget');
