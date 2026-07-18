export type StrictToggleInputs = {
  supported: boolean;
  available: boolean;
};

export type StrictStartGateInputs = {
  supported: boolean;
  available: boolean;
  enabled: boolean;
  blockedCount: number;
  usageAccess: boolean;
};

export type StrictStartGateDecision =
  | { type: "start-normal" }
  | { type: "unsupported"; message: string }
  | { type: "choose-apps" }
  | { type: "request-usage-access"; message: string };

export function isStrictModeToggleInteractive({
  supported,
}: StrictToggleInputs): boolean {
  return supported;
}

export function decideStrictStartGate(
  inputs: StrictStartGateInputs,
): StrictStartGateDecision {
  if (!inputs.supported || !inputs.enabled) return { type: "start-normal" };

  if (!inputs.available) {
    return {
      type: "unsupported",
      message:
        "Strict Mode needs a BeePlan development or release build on Android. This install cannot block apps, so a strict session cannot start here.",
    };
  }

  if (inputs.blockedCount === 0) return { type: "choose-apps" };

  if (!inputs.usageAccess) {
    return {
      type: "request-usage-access",
      message:
        "Grant Usage Access, then return to BeePlan to start your strict session.",
    };
  }

  return { type: "start-normal" };
}

export type StrictSetupTransitionState<TDraft> = {
  setupOpen: boolean;
  draft: TDraft;
};

export function openStrictSetup<TDraft>(
  state: StrictSetupTransitionState<TDraft>,
): StrictSetupTransitionState<TDraft> {
  return { ...state, setupOpen: true };
}

export function closeStrictSetup<TDraft>(
  state: StrictSetupTransitionState<TDraft>,
): StrictSetupTransitionState<TDraft> {
  return { ...state, setupOpen: false };
}

export function getStrictModeLayerVisibility(
  hasStartTask: boolean,
  setupOpen: boolean,
) {
  return {
    startModalVisible: hasStartTask && !setupOpen,
    setupSheetVisible: setupOpen,
  };
}
