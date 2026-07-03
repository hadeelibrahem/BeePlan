import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  BottomNavBar,
  FilterTabs,
  FloatingActionButton,
  PageHeader,
  ScreenLayout,
  SearchInput,
  StatsCard,
} from '../components/layout';
import { toUiPriority, toUiStatus, type ApiTask } from '../lib/tasksApi';
import type { AppTheme } from '../theme/colors';
import { useTheme } from '../theme/useTheme';

type TaskListItem = {
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
  onCreateTask: () => void;
  onViewTaskDetails: (task: TaskListItem) => void;
  tasks?: ApiTask[];
  loading?: boolean;
  error?: string;
};

type TaskFilter = 'all' | 'todo' | 'inProgress' | 'done' | 'missed';

const FILTERS: { value: TaskFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'todo', label: 'To Do' },
  { value: 'inProgress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
  { value: 'missed', label: 'Missed' },
];

const fallbackTasks: TaskListItem[] = [
  { id: 'fallback-1', title: 'Design new landing page hero section', category: 'Design', due: 'Today', priority: 'High', status: 'In Progress', progress: 65 },
  { id: 'fallback-2', title: 'Review mobile app design mockups', category: 'Design', due: 'Today', priority: 'Medium', status: 'To Do', progress: 0 },
  { id: 'fallback-3', title: 'Team sync - weekly standup notes', category: 'Meeting', due: 'Today', priority: 'Low', status: 'Done', progress: 100 },
  { id: 'fallback-4', title: 'Code review for payment module PR', category: 'Development', due: 'Tomorrow', priority: 'High', status: 'To Do', progress: 0 },
  { id: 'fallback-5', title: 'Finalize Q3 marketing strategy deck', category: 'Marketing', due: 'Jun 7', priority: 'High', status: 'In Progress', progress: 72 },
];

export default function AllTasksScreen({
  onBackDashboard,
  onViewReminders,
  onCreateTask,
  onViewTaskDetails,
  tasks,
  loading,
  error,
}: Props) {
  const { theme } = useTheme();
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<TaskFilter>('all');
  const taskItems = tasks?.length ? tasks.map(fromApiTask) : fallbackTasks;
  const filteredTasks = taskItems.filter((task) => {
    const matchesSearch = task.title.toLowerCase().includes(search.trim().toLowerCase());
    if (!matchesSearch) return false;
    if (activeFilter === 'todo') return task.status === 'To Do';
    if (activeFilter === 'inProgress') return task.status === 'In Progress';
    if (activeFilter === 'done') return task.status === 'Done';
    if (activeFilter === 'missed') return task.status === 'Missed';
    return true;
  });

  return (
    <ScreenLayout
      fab={<FloatingActionButton onPress={onCreateTask} aboveNavBar />}
      footer={<BottomNavBar active="tasks" onNavigateDashboard={onBackDashboard} onNavigateReminders={onViewReminders} />}
    >
      <PageHeader title="All Tasks" subtitle="Manage, filter, and track all your tasks" />

      <SearchInput value={search} onChangeText={setSearch} placeholder="Search tasks..." />
      <FilterTabs tabs={FILTERS} active={activeFilter} onChange={setActiveFilter} />

      {error ? <Text className="mb-4 text-sm font-bold text-red-300">{error}</Text> : null}
      {loading ? <Text className="mb-4 text-sm font-bold" style={{ color: theme.colors.accent }}>Loading tasks...</Text> : null}

      <View className="mb-5 flex-row justify-between">
        <StatsCard icon="ALL" value={String(taskItems.length)} title="All Tasks" width="full" />
      </View>
      <View className="mb-5 flex-row flex-wrap justify-between gap-y-3">
        <MiniStat icon="TD" label="To Do" value={String(taskItems.filter((task) => task.status === 'To Do').length)} />
        <MiniStat icon="IP" label="Progress" value={String(taskItems.filter((task) => task.status === 'In Progress').length)} />
        <MiniStat icon="DN" label="Done" value={String(taskItems.filter((task) => task.status === 'Done').length)} />
        <MiniStat icon="MS" label="Missed" value={String(taskItems.filter((task) => task.status === 'Missed').length)} />
      </View>

      <TaskSection title="Tasks" tasks={filteredTasks} onViewTaskDetails={onViewTaskDetails} />
    </ScreenLayout>
  );
}

function MiniStat({ icon, label, value }: { icon: string; label: string; value: string }) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View className="w-[23%] items-center rounded-2xl border py-4" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
      <Text className="text-xs font-black" style={{ color: colors.accent }}>{icon}</Text>
      <Text className="mt-1 text-sm font-black" style={{ color: colors.text }}>{value}</Text>
      <Text className="mt-0.5 text-center text-[10px] font-bold" style={{ color: colors.secondaryText }}>{label}</Text>
    </View>
  );
}

function TaskSection({
  title,
  tasks,
  onViewTaskDetails,
}: {
  title: string;
  tasks: TaskListItem[];
  onViewTaskDetails: (task: TaskListItem) => void;
}) {
  const { theme } = useTheme();

  return (
    <View className="mb-5">
      <Text className="mb-3 font-bold" style={{ color: theme.colors.text }}>{title}</Text>
      {tasks.map((task) => (
        <TaskCard key={task.id ?? task.title} task={task} onPress={() => onViewTaskDetails(task)} />
      ))}
      {!tasks.length ? (
        <View className="rounded-3xl border p-6" style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.card }}>
          <Text className="text-center font-bold" style={{ color: theme.colors.secondaryText }}>No tasks found.</Text>
        </View>
      ) : null}
    </View>
  );
}

function TaskCard({ task, onPress }: { task: TaskListItem; onPress: () => void }) {
  const { theme } = useTheme();
  const { colors } = theme;
  const isDone = task.status === 'Done';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={task.title}
      className="mb-4 rounded-3xl border p-4 active:opacity-80"
      style={{ borderColor: colors.border, backgroundColor: colors.card }}
    >
      <View className="flex-row items-start gap-4">
        <View
          className="mt-1 h-6 w-6 rounded-lg border"
          style={{ borderColor: isDone ? colors.success : colors.border, backgroundColor: isDone ? colors.success : 'transparent' }}
        />

        <View className="flex-1">
          <Text className={`font-bold ${isDone ? 'line-through' : ''}`} style={{ color: isDone ? colors.secondaryText : colors.text }}>
            {task.title}
          </Text>

          <View className="mt-2 flex-row gap-2">
            <SmallBadge label={task.category} />
            <Text className="text-xs" style={{ color: colors.secondaryText }}>{task.due}</Text>
          </View>

          <View className="mt-4 h-2 rounded-full" style={{ backgroundColor: colors.progressTrack }}>
            <View
              className="h-2 rounded-full"
              style={{
                width: `${task.progress}%`,
                backgroundColor: task.progress === 100 ? colors.success : task.progress === 0 ? colors.border : colors.accent,
              }}
            />
          </View>

          <View className="mt-3 flex-row items-center gap-2">
            <PriorityBadge label={task.priority} theme={theme} />
            <StatusBadge label={task.status} theme={theme} />
            <Text className="ml-auto text-xs" style={{ color: colors.secondaryText }}>{task.progress}%</Text>
          </View>
        </View>

        <Text className="text-xl" style={{ color: colors.secondaryText }}>&gt;</Text>
      </View>
    </Pressable>
  );
}

function SmallBadge({ label }: { label: string }) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View className="rounded-full px-3 py-1" style={{ backgroundColor: colors.surfaceElevated }}>
      <Text className="text-xs" style={{ color: colors.secondaryText }}>{label}</Text>
    </View>
  );
}

function PriorityBadge({ label, theme }: { label: string; theme: AppTheme }) {
  const { colors } = theme;
  const color = label === 'High' || label === 'Urgent' ? colors.error : label === 'Medium' ? colors.warning : colors.success;

  return (
    <View className="rounded-full px-3 py-1" style={{ backgroundColor: `${color}33` }}>
      <Text className="text-xs font-bold" style={{ color }}>{label}</Text>
    </View>
  );
}

function StatusBadge({ label, theme }: { label: string; theme: AppTheme }) {
  const { colors } = theme;
  const color =
    label === 'Done' ? colors.success : label === 'In Progress' ? colors.primary : label === 'Missed' ? colors.error : colors.secondaryText;

  return (
    <View className="rounded-full px-3 py-1" style={{ backgroundColor: `${color}33` }}>
      <Text className="text-xs font-bold" style={{ color }}>{label}</Text>
    </View>
  );
}

function fromApiTask(task: ApiTask): TaskListItem {
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
