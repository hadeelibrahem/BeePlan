import { useEffect } from "react";
import { Platform, Pressable, Switch, Text, View } from "react-native";

import { useTheme } from "../../theme/useTheme";
import { useStrictFocus } from "./StrictFocusContext";
import { isStrictModeToggleInteractive } from "./strictModeRules";

/**
 * Compact Strict Mode configuration embedded in the "Start Focus Session" modal.
 * Reads/writes the shared prefs via context; the actual app picker lives in
 * StrictModeSetupSheet, opened through `onEditApps`.
 *
 * The toggle is interactive on ALL Android builds (it only configures a
 * preference). Whether blocking can actually run is a separate concern surfaced
 * as a non-blocking note and enforced later — at session start and in
 * useStrictFocusSync — never by disabling the control here. On iOS/web the whole
 * section is hidden.
 */
export function StrictModeSection({ onEditApps }: { onEditApps: () => void }) {
  const { theme } = useTheme();
  const { colors } = theme;
  const { blocker, prefs, setPrefs } = useStrictFocus();

  if (!blocker.supported) return null; // iOS / web - keep the normal flow clean.

  const appCount = prefs.blockedPackages.length;
  const enabled = prefs.enabled;
  const toggleInteractive = isStrictModeToggleInteractive({
    supported: blocker.supported,
    available: blocker.available,
  });

  useEffect(() => {
    if (__DEV__) console.log("[StrictMode] enabled changed", enabled);
  }, [enabled]);

  const handleToggle = (value: boolean) => {
    if (__DEV__) {
      console.log("[StrictMode] toggle pressed", {
        nextEnabled: value,
        platform: Platform.OS,
        available: blocker.available,
        supported: blocker.supported,
        prevEnabled: enabled,
      });
    }
    setPrefs({ ...prefs, enabled: value });
  };

  const handleChooseApps = () => {
    if (__DEV__) console.log("[StrictMode] choose apps pressed");
    onEditApps();
  };

  return (
    <View
      style={{
        marginBottom: 8,
        borderWidth: 1,
        borderColor: enabled ? colors.accent : colors.border,
        backgroundColor: enabled ? colors.accentSoft : colors.card,
        borderRadius: 16,
        padding: 14,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ fontSize: 14, fontWeight: "800", color: colors.text }}>
            Strict Mode
          </Text>
          <Text
            style={{ fontSize: 12, color: colors.secondaryText, marginTop: 2 }}
          >
            Block distracting apps until the session ends.
          </Text>
        </View>
        {/* Always interactive on Android — configuring a preference never needs the native module. */}
        <Switch
          disabled={!toggleInteractive}
          value={enabled}
          onValueChange={handleToggle}
        />
      </View>

      {/* Informational only — does NOT disable the control. */}
      {!blocker.available ? (
        <Text style={{ fontSize: 12, color: colors.warning, marginTop: 10 }}>
          App blocking needs a development build (not available in Expo Go). You
          can still choose apps now — blocking activates once you run a
          dev/release build.
        </Text>
      ) : null}

      {enabled ? (
        <View style={{ marginTop: 12, gap: 8 }}>
          <Pressable
            onPress={handleChooseApps}
            accessibilityRole="button"
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 12,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 13, color: colors.text }}>
              {appCount > 0
                ? `Blocking ${appCount} app${appCount === 1 ? "" : "s"}`
                : "No apps chosen yet"}
            </Text>
            <Text
              style={{ fontSize: 13, fontWeight: "800", color: colors.primary }}
            >
              Choose apps
            </Text>
          </Pressable>

          {appCount === 0 ? (
            <Text style={{ fontSize: 12, color: colors.warning }}>
              Pick at least one app to start a strict session.
            </Text>
          ) : null}

          {blocker.available && !blocker.usageAccess ? (
            <Text style={{ fontSize: 12, color: colors.warning }}>
              Usage Access permission is required — you'll be prompted when you
              start.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
