import { Pressable, Switch, Text, TextInput, View } from "react-native";
import type { TaskDestination } from "../lib/tasksApi";
import { useTheme } from "../theme/useTheme";
export function WeatherTravelTaskFields({
  destination,
  enabled,
  travelMode,
  onDestination,
  onEnabled,
  onTravelMode,
}: {
  destination: Partial<TaskDestination>;
  enabled: boolean;
  travelMode: "driving" | "walking" | "cycling";
  onDestination: (value: Partial<TaskDestination>) => void;
  onEnabled: (value: boolean) => void;
  onTravelMode: (value: "driving" | "walking" | "cycling") => void;
}) {
  const {
    theme: { colors },
  } = useTheme();
  const set = (key: keyof TaskDestination, value: any) =>
    onDestination({ ...destination, [key]: value });
  return (
    <View
      className="mt-3 rounded-xl border p-3"
      style={{ borderColor: colors.border }}
    >
      <View className="flex-row items-center justify-between">
        <Text className="font-black" style={{ color: colors.text }}>
          Task Assistant
        </Text>
        <Switch
          accessibilityLabel="Enable Task Context Assistant"
          value={enabled}
          onValueChange={onEnabled}
        />
      </View>
      <TextInput
        accessibilityLabel="Destination name"
        placeholder="Destination name"
        placeholderTextColor={colors.placeholder}
        value={destination.displayName ?? ""}
        onChangeText={(v) => set("displayName", v)}
        className="mt-2 rounded-xl border px-3 py-2"
        style={{ borderColor: colors.border, color: colors.text }}
      />
      <TextInput
        accessibilityLabel="Destination address"
        placeholder="Address"
        placeholderTextColor={colors.placeholder}
        value={destination.address ?? ""}
        onChangeText={(v) => set("address", v)}
        className="mt-2 rounded-xl border px-3 py-2"
        style={{ borderColor: colors.border, color: colors.text }}
      />
      <View className="mt-2 flex-row gap-2">
        <TextInput
          accessibilityLabel="Destination latitude"
          keyboardType="numbers-and-punctuation"
          placeholder="Latitude"
          placeholderTextColor={colors.placeholder}
          value={
            destination.latitude === undefined
              ? ""
              : String(destination.latitude)
          }
          onChangeText={(v) => set("latitude", Number(v))}
          className="flex-1 rounded-xl border px-3 py-2"
          style={{ borderColor: colors.border, color: colors.text }}
        />
        <TextInput
          accessibilityLabel="Destination longitude"
          keyboardType="numbers-and-punctuation"
          placeholder="Longitude"
          placeholderTextColor={colors.placeholder}
          value={
            destination.longitude === undefined
              ? ""
              : String(destination.longitude)
          }
          onChangeText={(v) => set("longitude", Number(v))}
          className="flex-1 rounded-xl border px-3 py-2"
          style={{ borderColor: colors.border, color: colors.text }}
        />
      </View>
      <View className="mt-2 flex-row gap-2">
        {(["driving", "walking", "cycling"] as const).map((mode) => (
          <Pressable
            accessibilityRole="button"
            key={mode}
            onPress={() => onTravelMode(mode)}
            className="rounded-xl border px-3 py-2"
            style={{
              borderColor: travelMode === mode ? colors.accent : colors.border,
            }}
          >
            <Text style={{ color: colors.text }}>{mode}</Text>
          </Pressable>
        ))}
      </View>
      <Text className="mt-2 text-xs" style={{ color: colors.secondaryText }}>
        BeePlan detects relevant preparation. Coordinates are required for
        verified route and weather facts.
      </Text>
    </View>
  );
}
