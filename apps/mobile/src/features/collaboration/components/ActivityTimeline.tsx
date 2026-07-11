import { Text, View } from 'react-native';
import { useTheme } from '../../../theme/useTheme';
import type { ApiTaskActivity } from '../../../lib/tasksApi';

const ICON: Record<string, string> = {
  created: '✨',
  updated: '📝',
  status_changed: '🔄',
  progress_updated: '📈',
  priority_changed: '⚡',
  due_date_changed: '📅',
  member_invited: '✉️',
  member_joined: '🤝',
  member_removed: '🚪',
  role_changed: '🎭',
  ownership_transferred: '👑',
  comment_added: '💬',
  subtask_completed: '✅',
  subtask_updated: '☑️',
  subtask_added: '➕',
  reminder_updated: '🔔',
};

function title(action: string) {
  return action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ActivityTimeline({ activities }: { activities: ApiTaskActivity[] }) {
  const { theme } = useTheme();
  const { colors } = theme;
  const sorted = [...activities].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  if (sorted.length === 0) {
    return (
      <Text style={{ color: colors.secondaryText }} className="py-3 text-center text-sm">
        No activity yet. Changes will appear here.
      </Text>
    );
  }

  return (
    <View className="gap-3">
      {sorted.map((activity) => (
        <View key={activity.id} className="flex-row gap-3">
          <View
            className="h-7 w-7 items-center justify-center rounded-full border"
            style={{ borderColor: colors.border, backgroundColor: colors.surfaceElevated }}
          >
            <Text className="text-xs">{ICON[activity.action] ?? '•'}</Text>
          </View>
          <View className="flex-1">
            <Text style={{ color: colors.text }} className="text-xs font-bold">
              {title(activity.action)}
            </Text>
            <Text style={{ color: colors.secondaryText }} className="text-xs" numberOfLines={2}>
              {activity.description}
            </Text>
            <Text style={{ color: colors.textSubtle }} className="text-[10px]">
              {new Date(activity.createdAt).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}
