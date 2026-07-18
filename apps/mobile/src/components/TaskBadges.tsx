import { Text, View } from 'react-native';
import { PRIORITY_BADGE_META, STATUS_BADGE_META, type BadgeMeta } from '../lib/subtasks';
import { useTheme } from '../theme/useTheme';

function Badge({ meta }: { meta: BadgeMeta }) {
  const { theme } = useTheme();
  const { colors } = theme;
  const color =
    meta.tone === 'success' ? colors.success :
    meta.tone === 'warning' ? colors.warning :
    meta.tone === 'danger' ? colors.error :
    meta.tone === 'info' ? colors.primary : colors.secondaryText;

  return (
    <View className="rounded-md px-2 py-0.5" style={{ backgroundColor: `${color}26` }}>
      <Text className="text-xs font-bold" style={{ color }}>{meta.label}</Text>
    </View>
  );
}

export function TaskStatusBadge({ status }: { status: string }) {
  return <Badge meta={STATUS_BADGE_META[status] ?? { label: status, tone: 'neutral' }} />;
}

export function TaskPriorityBadge({ priority }: { priority: string }) {
  return <Badge meta={PRIORITY_BADGE_META[priority] ?? { label: priority, tone: 'neutral' }} />;
}
