import { useEffect, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import {
  getTaskAssistantPreferences,
  updateTaskAssistantPreferences,
  type TaskAssistantPreferences,
} from "../../lib/tasksApi";
import { useTheme } from "../../theme/useTheme";
import { useLanguage } from "../../i18n/LanguageContext";
const toggles: [keyof TaskAssistantPreferences, string][] = [
  ["proactiveAssistanceEnabled", "Proactive assistance"],
  ["dynamicPreparationEnabled", "Dynamic preparation lists"],
  ["dynamicPackingEnabled", "Dynamic packing lists"],
  ["contextTimelineEnabled", "Context timeline"],
  ["contextualNotificationsEnabled", "Contextual notifications"],
  ["preparationChecklistsEnabled", "Preparation checklists"],
  ["travelAdviceEnabled", "Travel and departure advice"],
  ["weatherAdviceEnabled", "Weather advice"],
  ["documentAdviceEnabled", "Document reminders"],
  ["clothingAdviceEnabled", "Clothing suggestions"],
  ["umbrellaAdviceEnabled", "Umbrella reminders"],
  ["hydrationAdviceEnabled", "Hydration reminders"],
  ["electronicsAdviceEnabled", "Electronics"],
  ["medicationAdviceEnabled", "Medication"],
  ["departureRemindersEnabled", "Departure reminders"],
];
export function WeatherTravelSettings({ token }: { token: string }) {
  const { t } = useLanguage();
  const {
    theme: { colors },
  } = useTheme();
  const [value, setValue] = useState<TaskAssistantPreferences | null>(null);
  const [status, setStatus] = useState("");
  useEffect(() => {
    void getTaskAssistantPreferences(token)
      .then(setValue)
      .catch(() => setStatus("Could not load settings."));
  }, [token]);
  if (!value)
    return (
      <Text style={{ color: colors.secondaryText }}>
        {status || "Loading Task Assistant…"}
      </Text>
    );
  const set = <K extends keyof TaskAssistantPreferences>(
    key: K,
    next: TaskAssistantPreferences[K],
  ) => setValue({ ...value, [key]: next });
  return (
    <View
      className="rounded-2xl border p-4"
      style={{ borderColor: colors.border, backgroundColor: colors.card }}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="font-black" style={{ color: colors.text }}>
            {t('mobileSettings.assistant')}
          </Text>
          <Text
            className="mt-1 text-xs"
            style={{ color: colors.secondaryText }}
          >
            {t('mobileSettings.assistantHelp')}
          </Text>
        </View>
        <Switch
          accessibilityLabel={t('mobileSettings.enableAssistant')}
          value={value.enabled}
          onValueChange={(next) => set("enabled", next)}
        />
      </View>
      {toggles.map(([key, label]) => (
        <View key={key} className="mt-3 flex-row items-center justify-between">
          <Text style={{ color: colors.text }}>{label}</Text>
          <Switch
            accessibilityLabel={label}
            value={Boolean(value[key])}
            onValueChange={(next) => set(key, next as never)}
          />
        </View>
      ))}
      <Text
        className="mt-4 text-xs font-bold"
        style={{ color: colors.secondaryText }}
      >
        {t('mobileSettings.timing')}: {value.notificationMode.replaceAll("_", " ")}
      </Text>
      <View className="mt-2 flex-row gap-2">
        {(["smart", "minimal", "important_only"] as const).map((mode) => (
          <Pressable
            key={mode}
            onPress={() => set("notificationMode", mode)}
            className="rounded-lg border px-2 py-1"
            style={{
              borderColor:
                value.notificationMode === mode ? colors.accent : colors.border,
            }}
          >
            <Text className="text-xs" style={{ color: colors.text }}>
              {mode.replaceAll("_", " ")}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          void updateTaskAssistantPreferences(token, value)
            .then(setValue)
            .then(() => setStatus("Saved"))
            .catch(() => setStatus("Could not save settings."))
        }
        className="mt-4 rounded-xl p-3"
        style={{ backgroundColor: colors.accent }}
      >
        <Text
          className="text-center font-black"
          style={{ color: colors.accentText }}
        >
          {t('mobileSettings.saveAssistant')}
        </Text>
      </Pressable>
      <Text
        accessibilityLiveRegion="polite"
        className="mt-2 text-xs"
        style={{ color: colors.secondaryText }}
      >
        {status}
      </Text>
    </View>
  );
}
