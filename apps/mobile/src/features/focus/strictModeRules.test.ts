import assert from "node:assert/strict";
import test from "node:test";

import {
  closeStrictSetup,
  decideStrictStartGate,
  getStrictModeLayerVisibility,
  isStrictModeToggleInteractive,
  openStrictSetup,
} from "./strictModeRules.ts";

test("toggle stays interactive when Android support exists even if native module is unavailable", () => {
  assert.equal(
    isStrictModeToggleInteractive({ supported: true, available: false }),
    true,
  );
});

test("toggle is not interactive on unsupported platforms", () => {
  assert.equal(
    isStrictModeToggleInteractive({ supported: false, available: false }),
    false,
  );
});

test("strict start is blocked with a clear dev-build message when the native module is unavailable", () => {
  assert.deepEqual(
    decideStrictStartGate({
      supported: true,
      available: false,
      enabled: true,
      blockedCount: 2,
      usageAccess: true,
    }),
    {
      type: "unsupported",
      message:
        "Strict Mode needs a BeePlan development or release build on Android. This install cannot block apps, so a strict session cannot start here.",
    },
  );
});

test("strict start opens the setup sheet when no blocked apps are configured", () => {
  assert.deepEqual(
    decideStrictStartGate({
      supported: true,
      available: true,
      enabled: true,
      blockedCount: 0,
      usageAccess: true,
    }),
    { type: "choose-apps" },
  );
});

test("strict start requests usage access before starting a strict session", () => {
  assert.deepEqual(
    decideStrictStartGate({
      supported: true,
      available: true,
      enabled: true,
      blockedCount: 2,
      usageAccess: false,
    }),
    {
      type: "request-usage-access",
      message:
        "Grant Usage Access, then return to BeePlan to start your strict session.",
    },
  );
});

test("opening and closing the setup sheet preserves the in-progress start draft", () => {
  const draft = {
    taskId: "task-1",
    sessionType: "custom",
    customMinutes: "45",
    strictEnabled: true,
  };

  const opened = openStrictSetup({ setupOpen: false, draft });
  const closed = closeStrictSetup(opened);

  assert.equal(opened.setupOpen, true);
  assert.equal(closed.setupOpen, false);
  assert.deepEqual(closed.draft, draft);
});

test("layer visibility hides the start modal while the setup sheet is open", () => {
  assert.deepEqual(getStrictModeLayerVisibility(true, true), {
    startModalVisible: false,
    setupSheetVisible: true,
  });
  assert.deepEqual(getStrictModeLayerVisibility(true, false), {
    startModalVisible: true,
    setupSheetVisible: false,
  });
});
