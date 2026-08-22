import { Text, View } from 'react-native';
import { PRIORITY_BADGE_META, STATUS_BADGE_META, type BadgeMeta } from '../lib/subtasks';
import { useTheme } from '../theme/useTheme';
import { useLanguage } from '../i18n/LanguageContext';

function Badge({ meta }: { meta: BadgeMeta }) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { colors } = theme;
  const color =
    meta.tone === 'success' ? colors.success :
    meta.tone === 'warning' ? colors.warning :
    meta.tone === 'danger' ? colors.error :
    meta.tone === 'info' ? colors.accentInk : colors.secondaryText;

  return (
    <View className="rounded-md px-2 py-0.5" style={{ backgroundColor: meta.tone === 'info' ? colors.accentSoft : `${color}26` }}>
      <Text className="text-xs font-bold" style={{ color }}>{badgeLabel(meta.label, t)}</Text>
    </View>
  );
}

function badgeLabel(label: string, t: (key: string) => string) {
  const statusKey: Record<string, string> = { todo: 'todo', 'To Do': 'todo', in_progress: 'inProgress', 'In Progress': 'inProgress', done: 'done', Done: 'done', blocked: 'blocked', Blocked: 'blocked', missed: 'missed', Missed: 'missed' };
  const priorityKey: Record<string, string> = { low: 'low', Low: 'low', medium: 'medium', Medium: 'medium', high: 'high', High: 'high', urgent: 'urgent', Urgent: 'urgent' };
  return statusKey[label] ? t(`taskLabels.status.${statusKey[label]}`) : priorityKey[label] ? t(`taskLabels.priority.${priorityKey[label]}`) : label;
}

export function TaskStatusBadge({ status }: { status: string }) {
  return <Badge meta={STATUS_BADGE_META[status] ?? { label: status, tone: 'neutral' }} />;
}

export function TaskPriorityBadge({ priority }: { priority: string }) {
  return <Badge meta={PRIORITY_BADGE_META[priority] ?? { label: priority, tone: 'neutral' }} />;
}
