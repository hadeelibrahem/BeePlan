import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  Switch,
  Text,
  View,
} from "react-native";

import {
  PrimaryButton,
  OutlineButton,
  SearchInput,
} from "../../components/layout";
import { useTheme } from "../../theme/useTheme";
import type {
  InstalledApp,
  UseFocusBlocker,
} from "../../../modules/beeplan-focus-blocker";
import type { StrictModePrefs } from "./strictModeStorage";

type Props = {
  visible: boolean;
  blocker: UseFocusBlocker;
  initialPrefs: StrictModePrefs;
  onClose: () => void;
  onSaved: (prefs: StrictModePrefs) => void;
};

/**
 * Bottom-sheet-style setup for Strict Mode: gates on Usage Access, lets the user
 * toggle strict mode and pick which installed apps to block, then persists the
 * choice. Presentation-only — all native access goes through `blocker`.
 */
export function StrictModeSetupSheet({
  visible,
  blocker,
  initialPrefs,
  onClose,
  onSaved,
}: Props) {
  const { theme } = useTheme();
  const { colors } = theme;

  const [enabled, setEnabled] = useState(initialPrefs.enabled);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialPrefs.blockedPackages),
  );
  const [allowExit, setAllowExit] = useState(initialPrefs.allowEmergencyExit);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  // Load apps + re-check permission whenever the sheet opens.
  useEffect(() => {
    if (!visible) return;
    blocker.refreshUsageAccess();
    blocker.refreshOverlayAccess();
    if (blocker.installedApps.length === 0) void blocker.loadInstalledApps();
    setEnabled(initialPrefs.enabled);
    setSelected(new Set(initialPrefs.blockedPackages));
    setAllowExit(initialPrefs.allowEmergencyExit);
    setQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return blocker.installedApps;
    return blocker.installedApps.filter((app) =>
      app.appName.toLowerCase().includes(q),
    );
  }, [blocker.installedApps, query]);

  const toggle = (pkg: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(pkg)) next.delete(pkg);
      else next.add(pkg);
      return next;
    });

  const handleSave = async () => {
    setSaving(true);
    const prefs: StrictModePrefs = {
      enabled,
      blockedPackages: Array.from(selected),
      allowEmergencyExit: allowExit,
    };
    try {
      onSaved(prefs);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const unsupported = !blocker.supported; // iOS / web
  const unavailable = blocker.supported && !blocker.available; // Expo Go / no dev build
  const needsPermission = !unsupported && !unavailable && !blocker.usageAccess;
  const canSave = !unsupported && !needsPermission;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "rgba(0,0,0,0.4)",
        }}
      >
        <View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 28,
            maxHeight: "88%",
          }}
        >
          <View style={{ alignItems: "center", marginBottom: 12 }}>
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.border,
              }}
            />
          </View>

          <Text style={{ fontSize: 20, fontWeight: "800", color: colors.text }}>
            Strict Focus Mode
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: colors.secondaryText,
              marginTop: 4,
              marginBottom: 16,
            }}
          >
            Block distracting apps until your focus session finishes.
          </Text>

          {unsupported ? (
            <InfoCard
              colors={colors}
              title="Android only"
              body="Strict Focus Mode blocks distracting apps using Android system APIs and is not available on this platform. Your focus timer works everywhere."
            />
          ) : needsPermission ? (
            <View
              style={{
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.cardBorder,
                borderRadius: 16,
                padding: 16,
              }}
            >
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: "700",
                  color: colors.text,
                  marginBottom: 6,
                }}
              >
                Usage Access needed
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: colors.secondaryText,
                  marginBottom: 14,
                }}
              >
                BeePlan needs Usage Access to detect which app is in the
                foreground so it can enforce blocking. It is never used for
                anything else.
              </Text>
              <PrimaryButton
                fullWidth
                onPress={blocker.openUsageAccessSettings}
              >
                Open Settings
              </PrimaryButton>
              <View style={{ height: 8 }} />
              <OutlineButton fullWidth onPress={blocker.refreshUsageAccess}>
                I've granted it
              </OutlineButton>
            </View>
          ) : (
            <>
              {unavailable ? (
                <InfoCard
                  colors={colors}
                  title="Requires a development build"
                  body="This install cannot scan installed apps or block them yet because BeePlan's native module is missing. You can still save your Strict Mode preference here, and any existing blocked-app list will be preserved for a dev or release build."
                />
              ) : null}

              {!unavailable && !blocker.overlayAccess ? (
                <View
                  style={{
                    backgroundColor: `${colors.warning}22`,
                    borderWidth: 1,
                    borderColor: colors.warning,
                    borderRadius: 14,
                    padding: 12,
                    marginBottom: 12,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: colors.text,
                      marginBottom: 4,
                    }}
                  >
                    Recommended: Display over other apps
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: colors.secondaryText,
                      marginBottom: 10,
                    }}
                  >
                    Without this, the block screen may not reliably appear on
                    Android 14+. Blocking still logs attempts, but granting this
                    makes it dependable.
                  </Text>
                  <OutlineButton
                    fullWidth
                    onPress={blocker.openOverlaySettings}
                  >
                    Grant permission
                  </OutlineButton>
                </View>
              ) : null}

              <Row label="Enable Strict Mode" colors={colors}>
                <Switch value={enabled} onValueChange={setEnabled} />
              </Row>
              <Row label="Allow emergency exit" colors={colors}>
                <Switch value={allowExit} onValueChange={setAllowExit} />
              </Row>

              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: colors.text,
                  marginTop: 12,
                  marginBottom: 8,
                }}
              >
                Apps to block ({selected.size})
              </Text>
              {unavailable ? (
                <View
                  style={{
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor: colors.cardBorder,
                    borderRadius: 16,
                    padding: 16,
                  }}
                >
                  <Text style={{ fontSize: 13, color: colors.secondaryText }}>
                    Install a BeePlan development or release build on Android to
                    browse installed apps here.
                    {selected.size > 0
                      ? ` ${selected.size} previously selected app${selected.size === 1 ? "" : "s"} will stay saved.`
                      : " You can still turn Strict Mode on now and finish app selection later."}
                  </Text>
                </View>
              ) : (
                <>
                  <SearchInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search apps"
                  />

                  {blocker.loadingApps ? (
                    <View style={{ paddingVertical: 32, alignItems: "center" }}>
                      <ActivityIndicator color={colors.primary} />
                    </View>
                  ) : (
                    <FlatList
                      data={filtered}
                      keyExtractor={(item) => item.packageName}
                      style={{ marginTop: 8, maxHeight: 320 }}
                      keyboardShouldPersistTaps="handled"
                      renderItem={({ item }) => (
                        <AppRow
                          app={item}
                          checked={selected.has(item.packageName)}
                          onToggle={toggle}
                          colors={colors}
                        />
                      )}
                    />
                  )}
                </>
              )}
            </>
          )}

          <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
            <View style={{ flex: 1 }}>
              <OutlineButton fullWidth onPress={onClose}>
                Cancel
              </OutlineButton>
            </View>
            <View style={{ flex: 1 }}>
              <PrimaryButton
                fullWidth
                onPress={handleSave}
                disabled={saving || !canSave}
              >
                {saving ? "Saving…" : "Save"}
              </PrimaryButton>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function InfoCard({
  colors,
  title,
  body,
}: {
  colors: any;
  title: string;
  body: string;
}) {
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        borderRadius: 16,
        padding: 16,
      }}
    >
      <Text
        style={{
          fontSize: 15,
          fontWeight: "700",
          color: colors.text,
          marginBottom: 6,
        }}
      >
        {title}
      </Text>
      <Text style={{ fontSize: 13, color: colors.secondaryText }}>{body}</Text>
    </View>
  );
}

function Row({
  label,
  colors,
  children,
}: {
  label: string;
  colors: any;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <Text style={{ fontSize: 15, color: colors.text }}>{label}</Text>
      {children}
    </View>
  );
}

function AppRow({
  app,
  checked,
  onToggle,
  colors,
}: {
  app: InstalledApp;
  checked: boolean;
  onToggle: (pkg: string) => void;
  colors: any;
}) {
  return (
    <Pressable
      onPress={() => onToggle(app.packageName)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
      }}
    >
      {app.icon ? (
        <Image
          source={{ uri: app.icon }}
          style={{ width: 36, height: 36, borderRadius: 8 }}
        />
      ) : (
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            backgroundColor: colors.card,
          }}
        />
      )}
      <Text
        style={{ flex: 1, marginLeft: 12, fontSize: 15, color: colors.text }}
        numberOfLines={1}
      >
        {app.appName}
      </Text>
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          borderWidth: 2,
          borderColor: checked ? colors.primary : colors.border,
          backgroundColor: checked ? colors.primary : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked && (
          <Text
            style={{
              color: colors.accentText,
              fontSize: 14,
              fontWeight: "900",
            }}
          >
            ✓
          </Text>
        )}
      </View>
    </Pressable>
  );
}
