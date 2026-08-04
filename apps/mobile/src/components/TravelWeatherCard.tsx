import { useEffect, useState } from "react";
import { Pressable, Switch, Text, TextInput, View } from "react-native";
import {
  getTaskAssistant,
  refreshTaskAssistant,
  updateTaskAssistantSuggestion,
  updateTaskAssistantNotification,
  type ApiTask,
  type TaskAssistantState,
} from "../lib/tasksApi";
import { useTheme } from "../theme/useTheme";
export function TravelWeatherCard({
  token,
  task,
}: {
  token: string;
  task: ApiTask;
}) {
  const {
    theme: { colors },
  } = useTheme();
  const [state, setState] = useState<TaskAssistantState | null>(null);
  useEffect(() => {
    void getTaskAssistant(token, task.id).then(setState);
  }, [task.id, task.updatedAt]);
  const update = (id: string, payload: { status?: string; quantity?: string }) =>
    updateTaskAssistantSuggestion(token, task.id, id, payload).then(
      setState,
    );
  return (
    <View
      accessibilityLabel="Task Assistant"
      className="mx-4 mb-3 rounded-2xl border p-4"
      style={{ borderColor: colors.border, backgroundColor: colors.card }}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="font-black" style={{ color: colors.text }}>
            Task Assistant
          </Text>
          <Text
            className="mt-1 text-xs"
            style={{ color: colors.secondaryText }}
          >
            {state
              ? `${state.context.primaryContext.replaceAll("_", " ")} · ${state.context.confidence}`
              : "Detecting context…"}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            void refreshTaskAssistant(token, task.id).then(setState)
          }
        >
          <Text className="font-bold" style={{ color: colors.accent }}>
            Refresh
          </Text>
        </Pressable>
      </View>
      {state ? (
        <>
          <Text
            className="mt-2 text-xs"
            style={{ color: colors.secondaryText }}
          >
            {state.context.confidenceReason}
          </Text>
          {state.timeline.length ? <View className="mt-4"><Text className="font-black" style={{ color: colors.text }}>Context Timeline</Text>{state.timeline.map((stage) => <View key={stage.id} className="mt-2 border-s ps-3" style={{ borderColor: colors.border }}><Text className="font-bold" style={{ color: colors.text }}>{stage.title}</Text><Text className="text-xs" style={{ color: colors.secondaryText }}>{stage.scheduledAt ? new Date(stage.scheduledAt).toLocaleString() : "Timing pending"}</Text></View>)}</View> : null}
          {state.suggestions.map((item) => (
            <View
              key={item.id}
              className="mt-3 rounded-xl border p-3"
              style={{ borderColor: colors.border }}
            >
              <View className="flex-row items-start gap-3">
                <Switch
                  accessibilityLabel={`Complete ${item.title}`}
                  value={item.status === "completed"}
                  onValueChange={(done) =>
                    void update(item.id, { status: done ? "completed" : "pending" })
                  }
                />
                <View className="flex-1">
                  <Text className="font-bold" style={{ color: colors.text }}>
                    {item.title}
                  </Text>
                  <Text
                    className="text-sm"
                    style={{ color: colors.secondaryText }}
                  >
                    {item.description}
                  </Text>
                  <Text
                    className="mt-1 text-xs"
                    style={{ color: colors.secondaryText }}
                  >
                    Why: {item.reason}
                  </Text>
                  {item.category ? <TextInput accessibilityLabel={`Quantity for ${item.title}`} defaultValue={item.quantity ?? ""} placeholder="Quantity or note" placeholderTextColor={colors.secondaryText} onEndEditing={(event) => void update(item.id, { quantity: event.nativeEvent.text })} className="mt-2 rounded-lg border px-2 py-1" style={{ borderColor: colors.border, color: colors.text }} /> : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Dismiss ${item.title}`}
                  onPress={() => void update(item.id, { status: "dismissed" })}
                >
                  <Text
                    className="text-xs"
                    style={{ color: colors.secondaryText }}
                  >
                    Dismiss
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
          {!state.suggestions.length ? (
            <Text className="mt-3" style={{ color: colors.secondaryText }}>
              No relevant preparation suggestions.
            </Text>
          ) : null}
          {state.contextualNotifications.length ? <View className="mt-4"><Text className="font-black" style={{ color: colors.text }}>Scheduled contextual notifications</Text>{state.contextualNotifications.map((notification) => <View key={notification.id} className="mt-2 flex-row items-center justify-between"><Text className="flex-1 text-xs" style={{ color: colors.secondaryText }}>{new Date(notification.scheduledAt).toLocaleString()} — {notification.body}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Disable ${notification.body}`} onPress={() => void updateTaskAssistantNotification(token, task.id, notification.id, { status: "dismissed" }).then(setState)}><Text className="text-xs font-bold" style={{ color: colors.accent }}>Disable</Text></Pressable></View>)}</View> : null}
        </>
      ) : null}
    </View>
  );
}
