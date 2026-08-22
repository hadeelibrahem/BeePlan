import {
  forwardRef,
  type ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Keyboard,
  Platform,
  ScrollView,
  type LayoutRectangle,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type View as NativeView,
  type ViewStyle,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from './tokens';

type MeasuredLayout = LayoutRectangle & { pageY: number };
type FocusedField = { name: string; node: NativeView };

export type KeyboardSafeFormHandle = {
  scrollToField: (name: string, node: NativeView | null) => void;
};

type KeyboardSafeFormProps = {
  children: ReactNode;
  actions: ReactNode;
  header?: ReactNode;
  sheetStyle?: ViewStyle;
};

const EMPTY_LAYOUT: MeasuredLayout = { x: 0, y: 0, width: 0, height: 0, pageY: 0 };

export function calculateKeyboardSheetGeometry({
  rootPageY,
  rootHeight,
  keyboardVisible,
  keyboardScreenY,
}: {
  rootPageY: number;
  rootHeight: number;
  keyboardVisible: boolean;
  keyboardScreenY: number;
}) {
  const rootBottomY = rootPageY + rootHeight;
  const keyboardTopY = keyboardVisible ? keyboardScreenY : rootBottomY;
  const modalKeyboardOverlap = keyboardVisible ? Math.max(0, rootBottomY - keyboardTopY) : 0;
  return {
    keyboardTopY,
    modalKeyboardOverlap,
    sheetBottomOffset: modalKeyboardOverlap,
    availableSheetHeight: Math.max(0, rootHeight - modalKeyboardOverlap - spacing.lg),
  };
}

export function calculateFooterBottomPadding(keyboardVisible: boolean, safeAreaBottomInset: number) {
  return spacing.base + (keyboardVisible ? 0 : safeAreaBottomInset);
}

export function calculateVisibleContentHeight(bodyTopY: number, bodyHeight: number, visibleBottomY: number) {
  return Math.max(0, Math.min(bodyTopY + bodyHeight, visibleBottomY) - bodyTopY);
}

export function calculateFocusScrollOffset(
  currentScrollOffset: number,
  focusedBottomY: number,
  visibleBottomY: number,
) {
  const overflow = focusedBottomY + spacing.md - visibleBottomY;
  return overflow > 0 ? Math.max(0, currentScrollOffset + overflow) : null;
}

/**
 * A modal form whose usable height is derived from the modal window and the
 * keyboard's real screen position. This also works when an Android Modal's
 * window does not inherit the Activity's adjustResize behavior.
 */
export const KeyboardSafeForm = forwardRef<KeyboardSafeFormHandle, KeyboardSafeFormProps>(
  function KeyboardSafeForm({ children, actions, header, sheetStyle }, ref) {
    const insets = useSafeAreaInsets();
    const { height: windowHeight } = useWindowDimensions();
    const rootRef = useRef<NativeView>(null);
    const sheetRef = useRef<NativeView>(null);
    const scrollRef = useRef<ScrollView>(null);
    const focusedFieldRef = useRef<FocusedField | null>(null);
    const scrollOffsetRef = useRef(0);
    const beforeKeyboardRef = useRef({ windowHeight, rootHeight: 0, sheetHeight: 0 });
    const lastDiagnosticRef = useRef('');
    const [keyboard, setKeyboard] = useState({ visible: false, height: 0, screenY: windowHeight });
    const [rootLayout, setRootLayout] = useState(EMPTY_LAYOUT);
    const [sheetLayout, setSheetLayout] = useState(EMPTY_LAYOUT);
    const [bodyLayout, setBodyLayout] = useState(EMPTY_LAYOUT);
    const [footerHeight, setFooterHeight] = useState(0);

    const geometry = calculateKeyboardSheetGeometry({
      rootPageY: rootLayout.pageY,
      rootHeight: rootLayout.height,
      keyboardVisible: keyboard.visible,
      keyboardScreenY: keyboard.screenY,
    });
    const keyboardOverlap = geometry.modalKeyboardOverlap;
    const availableHeight = geometry.availableSheetHeight;

    const measureView = useCallback((node: NativeView | null, layout: LayoutRectangle, save: (value: MeasuredLayout) => void) => {
      save({ ...layout, pageY: layout.y });
      if (!node) return;
      node.measureInWindow((_x, pageY) => save({ ...layout, pageY }));
    }, []);

    const scrollFocusedFieldIntoView = useCallback(() => {
      const focused = focusedFieldRef.current;
      if (!focused || !sheetLayout.height) return;
      focused.node.measureInWindow((_x, fieldY, _width, fieldHeight) => {
        // All values below are screen Y coordinates from measureInWindow.
        const sheetBottomY = sheetLayout.pageY + sheetLayout.height;
        const bodyBottomY = bodyLayout.height ? bodyLayout.pageY + bodyLayout.height : sheetBottomY;
        const visibleBottomY = Math.min(geometry.keyboardTopY, sheetBottomY - footerHeight, bodyBottomY);
        const targetOffset = calculateFocusScrollOffset(
          scrollOffsetRef.current,
          fieldY + fieldHeight,
          visibleBottomY,
        );
        if (targetOffset !== null) {
          scrollRef.current?.scrollTo({ y: targetOffset, animated: true });
        }
      });
    }, [bodyLayout, footerHeight, geometry.keyboardTopY, sheetLayout]);

    useImperativeHandle(ref, () => ({
      scrollToField(name, node) {
        if (!node) return;
        focusedFieldRef.current = { name, node };
        requestAnimationFrame(scrollFocusedFieldIntoView);
      },
    }), [scrollFocusedFieldIntoView]);

    useEffect(() => {
      const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
      const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
      const show = Keyboard.addListener(showEvent, event => {
        beforeKeyboardRef.current = {
          windowHeight,
          rootHeight: rootLayout.height,
          sheetHeight: sheetLayout.height,
        };
        setKeyboard({
          visible: true,
          height: event.endCoordinates.height,
          screenY: event.endCoordinates.screenY,
        });
        requestAnimationFrame(scrollFocusedFieldIntoView);
      });
      const hide = Keyboard.addListener(hideEvent, () => {
        setKeyboard({ visible: false, height: 0, screenY: windowHeight });
        focusedFieldRef.current = null;
      });
      return () => {
        show.remove();
        hide.remove();
      };
    }, [rootLayout.height, scrollFocusedFieldIntoView, sheetLayout.height, windowHeight]);

    useEffect(() => {
      if (!keyboard.visible || !sheetLayout.height || !bodyLayout.height || !footerHeight) return;
      const focused = focusedFieldRef.current;
      const before = beforeKeyboardRef.current;
      const rootResized = before.rootHeight > 0 && Math.abs(before.rootHeight - rootLayout.height) > 1;
      const windowResized = Math.abs(before.windowHeight - windowHeight) > 1;
      const sheetResized = before.sheetHeight > 0 && Math.abs(before.sheetHeight - sheetLayout.height) > 1;
      const sheetTopY = sheetLayout.pageY;
      const sheetBottomY = sheetTopY + sheetLayout.height;
      const visibleBottomY = Math.min(
        geometry.keyboardTopY,
        sheetBottomY - footerHeight,
        bodyLayout.pageY + bodyLayout.height,
      );

      // Wait for the padding-driven sheet layout before measuring focus or
      // reporting geometry captured at the previous bottom position.
      if (sheetBottomY > geometry.keyboardTopY + 1) return;

      const logDiagnostic = (focusedY: number | null, focusedBottomY: number | null) => {
        const diagnostic = {
          windowHeightBeforeKeyboard: before.windowHeight,
          windowHeightAfterKeyboard: windowHeight,
          keyboardHeight: keyboard.height,
          safeAreaBottomInset: insets.bottom,
          modalRootHeight: rootLayout.height,
          sheetHeight: sheetLayout.height,
          scrollableBodyHeight: bodyLayout.height,
          actionFooterHeight: footerHeight,
          focusedField: focused?.name ?? null,
          focusedY,
          focusedBottomY,
          visibleContentHeightAboveKeyboard: calculateVisibleContentHeight(
            bodyLayout.pageY,
            bodyLayout.height,
            visibleBottomY,
          ),
          sheetResized,
          rootWindowResized: rootResized || windowResized,
          onlyRootWindowResized: (rootResized || windowResized) && !sheetResized,
          modalKeyboardOverlap: keyboardOverlap,
          availableSheetHeight: availableHeight,
          sheetBottomOffset: geometry.sheetBottomOffset,
          sheetTopY,
          sheetBottomY,
          keyboardTopY: geometry.keyboardTopY,
        };
        const signature = JSON.stringify(diagnostic);
        if (__DEV__ && signature !== lastDiagnosticRef.current) {
          lastDiagnosticRef.current = signature;
          console.info('FeedbackKeyboardDebug', diagnostic);
        }
      };

      if (focused) {
        focused.node.measureInWindow((_x, fieldY, _width, fieldHeight) => (
          logDiagnostic(fieldY - sheetTopY, fieldY + fieldHeight)
        ));
      } else {
        logDiagnostic(null, null);
      }
      requestAnimationFrame(scrollFocusedFieldIntoView);
    }, [
      availableHeight,
      bodyLayout,
      footerHeight,
      insets.bottom,
      keyboard,
      keyboardOverlap,
      rootLayout,
      scrollFocusedFieldIntoView,
      sheetLayout,
      windowHeight,
    ]);

    return (
      <View
        ref={rootRef}
        className="flex-1 justify-end"
        style={{ paddingBottom: geometry.sheetBottomOffset }}
        testID="keyboard-safe-root"
        onLayout={event => measureView(rootRef.current, event.nativeEvent.layout, setRootLayout)}
      >
        <View
          ref={sheetRef}
          className="flex-shrink rounded-t-3xl"
          style={[sheetStyle, { maxHeight: availableHeight || undefined }]}
          testID="keyboard-safe-form"
          onLayout={event => measureView(sheetRef.current, event.nativeEvent.layout, setSheetLayout)}
        >
          {header ? (
            <View testID="keyboard-safe-header" style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
              {header}
            </View>
          ) : null}
          <ScrollView
            ref={scrollRef}
            testID="keyboard-safe-scroll-body"
            style={{ flexShrink: 1 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            contentContainerStyle={{
              paddingHorizontal: spacing.lg,
              paddingTop: header ? spacing.base : spacing.lg,
              paddingBottom: spacing.base,
            }}
            onLayout={event => {
              const layout = event.nativeEvent.layout;
              (scrollRef.current as unknown as NativeView | null)?.measureInWindow(
                (_x, pageY) => setBodyLayout({ ...layout, pageY }),
              );
            }}
            onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
              scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
            onContentSizeChange={scrollFocusedFieldIntoView}
          >
            {children}
          </ScrollView>
          <View
            testID="keyboard-safe-footer"
            onLayout={event => setFooterHeight(event.nativeEvent.layout.height)}
            style={{
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.md,
              paddingBottom: calculateFooterBottomPadding(keyboard.visible, insets.bottom),
            }}
          >
            {actions}
          </View>
        </View>
      </View>
    );
  },
);
