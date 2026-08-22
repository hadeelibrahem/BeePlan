import {
  calculateFocusScrollOffset,
  calculateFooterBottomPadding,
  calculateKeyboardSheetGeometry,
  calculateVisibleContentHeight,
} from './KeyboardSafeForm';

describe('KeyboardSafeForm geometry', () => {
  it('keeps the sheet bottom offset at zero while the keyboard is closed', () => {
    const geometry = calculateKeyboardSheetGeometry({
      rootPageY: 0,
      rootHeight: 853.33,
      keyboardVisible: false,
      keyboardScreenY: 853.33,
    });

    expect(geometry.sheetBottomOffset).toBe(0);
    expect(geometry.availableSheetHeight).toBeCloseTo(833.33);
  });

  it('uses the measured modal overlap as the open-keyboard bottom offset', () => {
    const geometry = calculateKeyboardSheetGeometry({
      rootPageY: 0,
      rootHeight: 853.33,
      keyboardVisible: true,
      keyboardScreenY: 564.97,
    });

    expect(geometry.modalKeyboardOverlap).toBeCloseTo(288.36);
    expect(geometry.sheetBottomOffset).toBeCloseTo(288.36);
    expect(geometry.availableSheetHeight).toBeCloseTo(544.97);
  });

  it('positions the sheet bottom no lower than the measured keyboard top', () => {
    const rootBottomY = 853.33;
    const geometry = calculateKeyboardSheetGeometry({
      rootPageY: 0,
      rootHeight: rootBottomY,
      keyboardVisible: true,
      keyboardScreenY: 564.97,
    });

    expect(rootBottomY - geometry.sheetBottomOffset).toBeCloseTo(geometry.keyboardTopY);
  });

  it('does not add the safe-area inset to the keyboard-open footer or sheet offset', () => {
    const safeAreaBottomInset = 48;
    const geometry = calculateKeyboardSheetGeometry({
      rootPageY: 0,
      rootHeight: 853.33,
      keyboardVisible: true,
      keyboardScreenY: 564.97,
    });

    expect(calculateFooterBottomPadding(true, safeAreaBottomInset)).toBe(16);
    expect(geometry.sheetBottomOffset).toBeCloseTo(288.36);
    expect(geometry.sheetBottomOffset).not.toBeCloseTo(288.36 + safeAreaBottomInset);
    expect(calculateFooterBottomPadding(false, safeAreaBottomInset)).toBe(64);
  });

  it('calculates positive visible content height in one screen coordinate space', () => {
    expect(calculateVisibleContentHeight(250, 220, 440)).toBe(190);
  });

  it('scrolls from post-layout bounds only when the focused field extends below them', () => {
    expect(calculateFocusScrollOffset(20, 465, 440)).toBe(57);
    expect(calculateFocusScrollOffset(20, 420, 440)).toBeNull();
  });
});
