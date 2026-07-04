import { Pressable, Text, View } from 'react-native';
import {
  BottomNavBar,
  PageHeader,
  ScreenLayout,
} from '../components/layout';
import { toUiPriority, toUiStatus, type ApiTask } from '../lib/tasksApi';
import type { AppTheme } from '../theme/colors';
import { useTheme } from '../theme/useTheme';

type FocusTaskItem = {
  id: string;
  title: string;
  category: string;
  due: string;
  priority: string;
  status: string;
  progress: number;
};

type Props = {
  onBackDashboard: () => void;
  onViewReminders: () => void;
  onViewTaskDetails: (task: FocusTaskItem) => void;
  tasks?: ApiTask[];
};

export default function FocusScreen({ onBackDashboard, onViewReminders, onViewTaskDetails, tasks }: Props) {
  const { theme } = useTheme();
  const focusTasks = (tasks ?? []).filter((task) => task.isFocusTask).map(fromApiTask);

  return (
    <ScreenLayout
      footer={<BottomNavBar active="focus" onNavigateDashboard={onBackDashboard} onNavigateReminders={onViewReminders} />}
    >
      <PageHeader title="Focus" subtitle="Tasks marked for a dedicated focus session" />

      <FocusSection tasks={focusTasks} onViewTaskDetails={onViewTaskDetails} />
    </ScreenLayout>
  );
}

function FocusSection({
  tasks,
  onViewTaskDetails,
}: {
  tasks: FocusTaskItem[];
  onViewTaskDetails: (task: FocusTaskItem) => void;
}) {
  const { theme } = useTheme();

  return (
    <View className="mb-3">
      <Text className="mb-2 text-sm font-bold" style={{ color: theme.colors.text }}>Focus Queue</Text>
      {tasks.map((task) => (
        <FocusCard key={task.id} task={task} onPress={() => onViewTaskDetails(task)} />
      ))}
      {!tasks.length ? (
        <View className="rounded-2xl border p-4" style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.card }}>
          <Text className="text-center text-sm font-bold" style={{ color: theme.colors.text }}>No focus tasks yet.</Text>
          <Text className="mt-1 text-center text-xs" style={{ color: theme.colors.secondaryText }}>
            Turn on Focus Task from a task's details to add it here.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function FocusCard({ task, onPress }: { task: FocusTaskItem; onPress: () => void }) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={task.title}
      className="mb-2 rounded-2xl border p-3 active:opacity-80"
      style={{ borderColor: colors.border, backgroundColor: colors.card }}
    >
      <View className="flex-row items-start gap-3">
        <View className="flex-1">
          <Text className="text-sm font-bold" style={{ color: colors.text }}>{task.title}</Text>

          <View className="mt-1.5 flex-row gap-2">
            <SmallBadge label={task.category} />
            <Text className="text-xs" style={{ color: colors.secondaryText }}>{task.due}</Text>
          </View>

          <View className="mt-2.5 h-1.5 rounded-full" style={{ backgroundColor: colors.progressTrack }}>
            <View
              className="h-1.5 rounded-full"
              style={{
                width: `${task.progress}%`,
                backgroundColor: task.progress === 100 ? colors.success : task.progress === 0 ? colors.border : colors.accent,
              }}
            />
          </View>

          <View className="mt-2 flex-row items-center gap-2">
            <PriorityBadge label={task.priority} theme={theme} />
            <StatusBadge label={task.status} theme={theme} />
            <Text className="ml-auto text-xs" style={{ color: colors.secondaryText }}>{task.progress}%</Text>
          </View>
        </View>

        <Text className="text-base" style={{ color: colors.secondaryText }}>&gt;</Text>
      </View>
    </Pressable>
  );
}

function SmallBadge({ label }: { label: string }) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: colors.surfaceElevated }}>
      <Text className="text-xs" style={{ color: colors.secondaryText }}>{label}</Text>
    </View>
  );
}

function PriorityBadge({ label, theme }: { label: string; theme: AppTheme }) {
  const { colors } = theme;
  const color = label === 'High' || label === 'Urgent' ? colors.error : label === 'Medium' ? colors.warning : colors.success;

  return (
    <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: `${color}33` }}>
      <Text className="text-xs font-bold" style={{ color }}>{label}</Text>
    </View>
  );
}

function StatusBadge({ label, theme }: { label: string; theme: AppTheme }) {
  const { colors } = theme;
  const color =
    label === 'Done' ? colors.success : label === 'In Progress' ? colors.primary : label === 'Missed' ? colors.error : colors.secondaryText;

  return (
    <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: `${color}33` }}>
      <Text className="text-xs font-bold" style={{ color }}>{label}</Text>
    </View>
  );
}

function fromApiTask(task: ApiTask): FocusTaskItem {
  return {
    id: task.id,
    title: task.title,
    category: task.category || 'General',
    due: formatDue(task.dueDate),
    priority: toUiPriority(task.priority),
    status: toUiStatus(task.status),
    progress: task.progress,
  };
}

function formatDue(value?: string) {
  if (!value) return 'No due date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date);
}
