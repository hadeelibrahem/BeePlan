import { memo, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import {
  BottomNavBar,
  EmptyState,
  FilterTabs,
  FloatingActionButton,
  PageHeader,
  ScreenLayout,
  SearchInput,
  StatsCard,
  MobileIcon,
} from '../components/layout';
import { TaskFiltersSheet } from '../components/TaskFiltersSheet';
import {
  getTaskFilterSummary,
  getTasks,
  changeTaskStatus,
  dismissRecurrenceSuggestion,
  getRecurrenceSuggestions,
  toUiPriority,
  toUiStatus,
  type ApiTask,
  type ApiTaskStatus,
  type TaskDueFilter,
  type TaskFilters,
} from '../lib/tasksApi';
import { useTheme } from '../theme/useTheme';
import { TaskPriorityBadge, TaskStatusBadge } from '../components/TaskBadges';
import { queryKeys } from '../lib/queryKeys';

type TaskListItem = {
  id: string;
  title: string;
  category: string;
  due: string;
  priority: string;
  status: string;
  progress: number;
  dueDate?: string;
  createdAt?: string;
  isShared?: boolean;
};

type Props = {
  onBackDashboard: () => void;
  onViewFocus?: () => void;
  onViewReminders: () => void;
  onCreateTask: () => void;
  onViewTaskDetails: (task: TaskListItem) => void;
  accessToken?: string | null;
  tasks?: ApiTask[];
  loading?: boolean;
  error?: string;
  sharedTaskIds?: Set<string>;
  onTaskUpdated?: (task: ApiTask) => void;
};

type TaskFilter = 'all' | 'todo' | 'inProgress' | 'done' | 'missed';

const FILTERS: { value: TaskFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'todo', label: 'To Do' },
  { value: 'inProgress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
  { value: 'missed', label: 'Missed' },
];

const DUE_FILTER_LABELS: Record<TaskDueFilter, string> = {
  today: 'Today',
  upcoming: 'Upcoming',
  overdue: 'Overdue',
};
type SortField = 'due' | 'priority' | 'created' | 'title';
const SORT_STORAGE_KEY = 'beeplan-task-sort';
const PRIORITY_RANK: Record<string, number> = { Low: 1, Medium: 2, High: 3, Urgent: 4 };

function mapTabToApiStatus(tab: TaskFilter): ApiTaskStatus | undefined {
  if (tab === 'todo') return 'todo';
  if (tab === 'inProgress') return 'in_progress';
  if (tab === 'done') return 'done';
  if (tab === 'missed') return 'missed';
  return undefined;
}

export default function AllTasksScreen({
  onBackDashboard,
  onViewFocus,
  onViewReminders,
  onCreateTask,
  onViewTaskDetails,
  accessToken,
  tasks,
  loading,
  error,
  sharedTaskIds,
  onTaskUpdated,
}: Props) {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskFilter>('all');
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [dueFilter, setDueFilter] = useState<TaskDueFilter | null>(null);
  const [focusActive, setFocusActive] = useState(false);
  const [completedActive, setCompletedActive] = useState(false);
  const [highPriorityActive, setHighPriorityActive] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<{ field: SortField; direction: 'asc' | 'desc' }>({ field: 'due', direction: 'asc' });
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [suggestions, setSuggestions] = useState<import('../lib/tasksApi').RecurrenceSuggestion[]>([]);
  useEffect(() => { void AsyncStorage.getItem(SORT_STORAGE_KEY).then((saved) => { if (saved) setSort(JSON.parse(saved)); }).catch(() => undefined); }, []);
  useEffect(() => { if (accessToken) void getRecurrenceSuggestions(accessToken).then((result) => setSuggestions(result.suggestions)).catch(() => setSuggestions([])); }, [accessToken]);

  const filters: TaskFilters = useMemo(() => {
    const next: TaskFilters = {};
    const status = mapTabToApiStatus(statusFilter);
    if (status) next.status = status;
    if (dueFilter) next.due = dueFilter;
    if (focusActive) next.focus = true;
    if (completedActive) next.completed = true;
    if (highPriorityActive) next.priority = 'high';
    if (categoryFilter) next.category = categoryFilter;
    return next;
  }, [statusFilter, dueFilter, focusActive, completedActive, highPriorityActive, categoryFilter]);

  const hasActiveFilters =
    statusFilter !== 'all' ||
    Boolean(dueFilter) ||
    focusActive ||
    completedActive ||
    highPriorityActive ||
    Boolean(categoryFilter);

  const tasksQuery = useQuery({
    queryKey: queryKeys.tasks.list(filters),
    queryFn: () => getTasks(accessToken ?? '', filters),
    enabled: Boolean(accessToken),
  });

  const summaryQuery = useQuery({
    queryKey: queryKeys.tasks.filterSummary,
    queryFn: () => getTaskFilterSummary(accessToken ?? ''),
    enabled: Boolean(accessToken),
  });

  const taskItems = useMemo(() => (tasks?.length ? tasks.map(fromApiTask) : []), [tasks]);
  const statusCounts = useMemo(
    () => ({
      todo: taskItems.filter((task) => task.status === 'To Do').length,
      inProgress: taskItems.filter((task) => task.status === 'In Progress').length,
      done: taskItems.filter((task) => task.status === 'Done').length,
      missed: taskItems.filter((task) => task.status === 'Missed').length,
    }),
    [taskItems],
  );

  const filteredTasks = useMemo(
    () =>
      (tasksQuery.data ?? [])
        .map(fromApiTask)
        .filter((task) => task.title.toLowerCase().includes(search.trim().toLowerCase()))
        .sort((left, right) => {
          const value = sort.field === 'title' ? left.title.localeCompare(right.title) : sort.field === 'priority' ? PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority] : Date.parse(sort.field === 'created' ? left.createdAt ?? '' : left.dueDate ?? '') - Date.parse(sort.field === 'created' ? right.createdAt ?? '' : right.dueDate ?? '');
          return (Number.isNaN(value) ? 0 : value) * (sort.direction === 'asc' ? 1 : -1);
        }),
    [tasksQuery.data, search, sort],
  );

  async function updateStatus(task: TaskListItem, status: ApiTaskStatus) {
    if (!accessToken || pendingIds.has(task.id)) return;
    const previous = queryClient.getQueriesData<ApiTask[]>({ queryKey: queryKeys.tasks.all });
    const progress = status === 'done' ? 100 : status === 'todo' ? 0 : task.progress;
    setPendingIds((current) => new Set(current).add(task.id));
    queryClient.setQueriesData<ApiTask[]>({ queryKey: queryKeys.tasks.all }, (current) => current?.map((item) => item.id === task.id ? { ...item, status, progress } : item));
    try { onTaskUpdated?.(await changeTaskStatus(accessToken, task.id, { status, progress })); }
    catch (mutationError) { previous.forEach(([key, value]) => queryClient.setQueryData(key, value)); Alert.alert('Unable to update task', mutationError instanceof Error ? mutationError.message : 'Please try again.'); }
    finally { setPendingIds((current) => { const next = new Set(current); next.delete(task.id); return next; }); }
  }
  function updateSort(field: SortField) { setSort((current) => { const next = field === current.field ? { field, direction: current.direction === 'asc' ? 'desc' as const : 'asc' as const } : { field, direction: field === 'priority' ? 'desc' as const : 'asc' as const }; void AsyncStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(next)); return next; }); }

  function clearFilters() {
    setStatusFilter('all');
    setDueFilter(null);
    setFocusActive(false);
    setCompletedActive(false);
    setHighPriorityActive(false);
    setCategoryFilter(null);
  }

  function toggleDueFilter(value: TaskDueFilter) {
    setDueFilter((current) => (current === value ? null : value));
  }

  const activeChips: { key: string; label: string; onRemove: () => void }[] = [];
  if (statusFilter !== 'all') {
    activeChips.push({
      key: 'status',
      label: FILTERS.find((filter) => filter.value === statusFilter)?.label ?? statusFilter,
      onRemove: () => setStatusFilter('all'),
    });
  }
  if (dueFilter) {
    activeChips.push({ key: 'due', label: DUE_FILTER_LABELS[dueFilter], onRemove: () => setDueFilter(null) });
  }
  if (focusActive) {
    activeChips.push({ key: 'focus', label: 'Focus Tasks', onRemove: () => setFocusActive(false) });
  }
  if (completedActive) {
    activeChips.push({ key: 'completed', label: 'Completed', onRemove: () => setCompletedActive(false) });
  }
  if (highPriorityActive) {
    activeChips.push({ key: 'highPriority', label: 'High Priority', onRemove: () => setHighPriorityActive(false) });
  }
  if (categoryFilter) {
    activeChips.push({ key: 'category', label: categoryFilter, onRemove: () => setCategoryFilter(null) });
  }

  const listLoading = loading || tasksQuery.isLoading;
  const listError = error || (tasksQuery.error instanceof Error ? tasksQuery.error.message : '');

  return (
    <ScreenLayout
      scroll={false}
      fab={<FloatingActionButton onPress={onCreateTask} aboveNavBar />}
      footer={<BottomNavBar active="tasks" onNavigateDashboard={onBackDashboard} onNavigateFocus={onViewFocus} onNavigateReminders={onViewReminders} />}
    >
      <FlatList
        className="flex-1"
        data={filteredTasks}
        keyExtractor={(task) => task.id}
        renderItem={({ item }) => <TaskCard task={item} isShared={sharedTaskIds?.has(item.id) || item.isShared} pending={pendingIds.has(item.id)} onToggle={() => void updateStatus(item, item.status === 'Done' ? 'todo' : 'done')} onChangeStatus={() => Alert.alert('Change status', item.title, [{ text: 'To Do', onPress: () => void updateStatus(item, 'todo') }, { text: 'In Progress', onPress: () => void updateStatus(item, 'in_progress') }, { text: 'Done', onPress: () => void updateStatus(item, 'done') }, { text: 'Missed', onPress: () => void updateStatus(item, 'missed') }, { text: 'Cancel', style: 'cancel' }])} onPress={() => onViewTaskDetails(item)} />}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={tasksQuery.isRefetching} onRefresh={() => { if (!tasksQuery.isRefetching) void tasksQuery.refetch(); }} tintColor={theme.colors.accent} />}
        // Rows are simple/uniform enough that this beats measuring layout on
        // scroll, and it lets FlatList jump to an offset without rendering
        // every row in between first.
        initialNumToRender={12}
        windowSize={7}
        removeClippedSubviews
        ListHeaderComponent={
          <>
            <PageHeader title="All Tasks" subtitle="Manage, filter, and track all your tasks" />

            <View className="mb-3 flex-row items-center gap-2">
              <View className="flex-1">
                <SearchInput value={search} onChangeText={setSearch} placeholder="Search tasks..." />
              </View>
              <Pressable
                onPress={() => setFiltersVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Open filters"
                className="h-11 items-center justify-center rounded-xl border px-4 active:opacity-80"
                style={{
                  borderColor: hasActiveFilters ? theme.colors.accent : theme.colors.border,
                  backgroundColor: hasActiveFilters ? theme.colors.accentSoft : theme.colors.card,
                }}
              >
                <View className="flex-row items-center gap-1">
                  <MobileIcon name="filter" color={hasActiveFilters ? theme.colors.accent : theme.colors.secondaryText} size={14} />
                  <Text className="text-xs font-black" style={{ color: hasActiveFilters ? theme.colors.accent : theme.colors.secondaryText }}>Filters{hasActiveFilters ? ` (${activeChips.length})` : ''}</Text>
                </View>
              </Pressable>
            </View>

            <FilterTabs tabs={FILTERS} active={statusFilter} onChange={setStatusFilter} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2 mt-2"><View className="flex-row gap-2">{(['due', 'priority', 'created', 'title'] as SortField[]).map((field) => <Pressable key={field} onPress={() => updateSort(field)} accessibilityRole="button" accessibilityLabel={`Sort by ${field}`} className="rounded-full border px-3 py-1.5" style={{ borderColor: sort.field === field ? theme.colors.accent : theme.colors.border }}><Text className="text-xs font-bold" style={{ color: sort.field === field ? theme.colors.accent : theme.colors.secondaryText }}>{field === 'due' ? 'Due date' : field === 'created' ? 'Created' : field[0].toUpperCase() + field.slice(1)}{sort.field === field ? ` ${sort.direction === 'asc' ? '↑' : '↓'}` : ''}</Text></Pressable>)}</View></ScrollView>
            {suggestions.map((suggestion) => <View key={suggestion.id} className="mb-2 rounded-xl border p-3" style={{ borderColor: theme.colors.accent, backgroundColor: theme.colors.accentSoft }}><Text className="text-xs font-black" style={{ color: theme.colors.text }}>BeePlan noticed a pattern</Text><Text className="mt-1 text-sm" style={{ color: theme.colors.secondaryText }}>{suggestion.reason}</Text><Text className="mt-1 text-xs" style={{ color: theme.colors.secondaryText }}>{suggestion.preview}</Text><View className="mt-2 flex-row gap-3"><Pressable onPress={() => onViewTaskDetails({ id: suggestion.sourceTaskId, title: suggestion.taskTitle, category: '', due: '', priority: 'Medium', status: 'To Do', progress: 0 })} accessibilityRole="button" accessibilityLabel={`Review recurrence suggestion for ${suggestion.taskTitle}`}><Text className="text-xs font-bold" style={{ color: theme.colors.accent }}>Review</Text></Pressable><Pressable onPress={() => { setSuggestions((current) => current.filter((item) => item.id !== suggestion.id)); if (accessToken) void dismissRecurrenceSuggestion(accessToken, suggestion.id).catch(() => void getRecurrenceSuggestions(accessToken).then((result) => setSuggestions(result.suggestions))); }} accessibilityRole="button" accessibilityLabel="Dismiss recurrence suggestion"><Text className="text-xs font-bold" style={{ color: theme.colors.secondaryText }}>Dismiss</Text></Pressable></View></View>)}

            {activeChips.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3 mt-3">
                <View className="flex-row items-center gap-2">
                  {activeChips.map((chip) => (
                    <Pressable
                      key={chip.key}
                      onPress={chip.onRemove}
                      className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5"
                      style={{ backgroundColor: theme.colors.accentSoft }}
                    >
                      <Text className="text-xs font-bold" style={{ color: theme.colors.accent }}>
                        {chip.label} &times;
                      </Text>
                    </Pressable>
                  ))}
                  <Pressable
                    onPress={clearFilters}
                    className="rounded-full border px-3 py-1.5"
                    style={{ borderColor: theme.colors.border }}
                  >
                    <Text className="text-xs font-bold" style={{ color: theme.colors.secondaryText }}>
                      Clear Filters
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            )}

            {listError ? <Text className="mb-3 text-sm font-bold text-red-300">{listError}</Text> : null}
            {listLoading ? <Text className="mb-3 text-sm font-bold" style={{ color: theme.colors.accent }}>Loading tasks...</Text> : null}

            <View className="mb-3 flex-row justify-between">
              <StatsCard icon="tasks" value={String(taskItems.length)} title="All Tasks" width="full" />
            </View>
            <View className="mb-3 flex-row flex-wrap justify-between gap-y-2">
              <MiniStat icon="tasks" label="To Do" value={String(statusCounts.todo)} />
              <MiniStat icon="focus" label="Progress" value={String(statusCounts.inProgress)} />
              <MiniStat icon="check" label="Done" value={String(statusCounts.done)} />
              <MiniStat icon="priority" label="Missed" value={String(statusCounts.missed)} />
            </View>

            <Text className="mb-2 text-sm font-bold" style={{ color: theme.colors.text }}>Tasks</Text>
          </>
        }
        ListEmptyComponent={
          !listLoading ? (
            <EmptyState
              icon="0"
              title="No tasks match the selected filters."
              description={
                hasActiveFilters || search
                  ? 'Try clearing a filter or adjusting your search.'
                  : "You don't have any tasks yet — create one to get started."
              }
            />
          ) : null
        }
      />

      <TaskFiltersSheet
        visible={filtersVisible}
        onClose={() => setFiltersVisible(false)}
        summary={summaryQuery.data}
        dueFilter={dueFilter}
        focusActive={focusActive}
        completedActive={completedActive}
        highPriorityActive={highPriorityActive}
        categoryFilter={categoryFilter}
        onToggleDue={toggleDueFilter}
        onToggleFocus={() => setFocusActive((value) => !value)}
        onToggleCompleted={() => setCompletedActive((value) => !value)}
        onToggleHighPriority={() => setHighPriorityActive((value) => !value)}
        onSelectCategory={setCategoryFilter}
        onClear={clearFilters}
      />
    </ScreenLayout>
  );
}

function MiniStat({ icon, label, value }: { icon: import('../components/layout').MobileIconName; label: string; value: string }) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View className="w-[23%] items-center rounded-xl border py-3" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
      <MobileIcon name={icon} color={colors.accent} size={16} accessibilityLabel={`${label} icon`} />
      <Text className="mt-0.5 text-sm font-black" style={{ color: colors.text }}>{value}</Text>
      <Text className="mt-0.5 text-center text-[10px] font-bold" style={{ color: colors.secondaryText }}>{label}</Text>
    </View>
  );
}

const TaskCard = memo(function TaskCard({ task, isShared, pending, onPress, onToggle, onChangeStatus }: { task: TaskListItem; isShared?: boolean; pending: boolean; onPress: () => void; onToggle: () => void; onChangeStatus: () => void }) {
  const { theme } = useTheme();
  const { colors } = theme;
  const isDone = task.status === 'Done';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={task.title}
      className="mb-2 rounded-2xl border p-3 active:opacity-80"
      style={{ borderColor: colors.border, backgroundColor: colors.card }}
    >
      <View className="flex-row items-start gap-3">
        <Pressable onPress={onToggle} disabled={pending} accessibilityRole="checkbox" accessibilityState={{ checked: isDone, disabled: pending }} accessibilityLabel={isDone ? 'Reopen task' : 'Complete task'}
          className="mt-1 h-5 w-5 rounded-md border"
          style={{ borderColor: isDone ? colors.success : colors.border, backgroundColor: isDone ? colors.success : 'transparent' }}
        />

        <View className="flex-1">
          <Text className={`text-sm font-bold ${isDone ? 'line-through' : ''}`} style={{ color: isDone ? colors.secondaryText : colors.text }}>
            {task.title}
          </Text>

          <View className="mt-1.5 flex-row gap-2">
            <SmallBadge label={task.category} />
            {isShared ? <SmallBadge label="Shared" /> : null}
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
            <TaskPriorityBadge priority={task.priority} />
            <Pressable onPress={onChangeStatus} accessibilityRole="button" accessibilityLabel={`Change status, currently ${task.status}`}><TaskStatusBadge status={task.status} /></Pressable>
            <Text className="ml-auto text-xs" style={{ color: colors.secondaryText }}>{task.progress}%</Text>
          </View>
        </View>

        <Text className="text-base" style={{ color: colors.secondaryText }}>&gt;</Text>
      </View>
    </Pressable>
  );
})

function SmallBadge({ label }: { label: string }) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: colors.surfaceElevated }}>
      <Text className="text-xs" style={{ color: colors.secondaryText }}>{label}</Text>
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
    dueDate: task.dueDate,
    createdAt: task.createdAt,
    isShared: task.isShared,
  };
}

function formatDue(value?: string) {
  if (!value) return 'No due date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date);
}
