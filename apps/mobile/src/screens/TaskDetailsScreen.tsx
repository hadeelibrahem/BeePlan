import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';
import {
  TaskDependenciesWorkflowSheet,
  type DependencyTask,
} from '../components/TaskDependenciesWorkflowSheet';
import {
  TaskRecurrenceSheet,
  createRecurrenceSummary,
  getNextOccurrenceLabel,
  type RecurrenceSettings,
} from '../components/TaskRecurrenceSheet';
import { TaskStatusWorkflowSheet, type TaskStatus } from '../components/TaskStatusWorkflowSheet';
import {
  addDependencies,
  addSubtask,
  changeTaskStatus,
  deleteSubtask,
  getDependencies,
  getRecurrence,
  getSubtasks,
  getTaskActivity,
  recurrenceToApi,
  recurrenceToUi,
  removeDependency,
  removeRecurrence,
  replaceDependency,
  saveRecurrence,
  toApiStatus,
  toUiPriority,
  toUiStatus,
  updateSubtask,
  type ApiSubtask,
  type ApiTask,
  type ApiTaskActivity,
} from '../lib/tasksApi';
import {
  AppScreen,
  BottomActionBar,
  DangerButton,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
} from '../components/layout';
import { useTheme } from '../theme/useTheme';

type Props = {
  task?: ApiTask | null;
  accessToken?: string;
  onTaskUpdated?: (task: ApiTask) => void;
  onBack: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onMarkDone?: () => void;
};

type TimelineTone = 'primary' | 'accent' | 'success' | 'warning' | 'secondary';

export default function TaskDetailsScreen({
  task,
  accessToken = '',
  onTaskUpdated,
  onBack,
  onEdit,
  onDelete,
  onMarkDone,
}: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const [status, setStatus] = useState<TaskStatus>(toTaskStatus(task));
  const [progress, setProgress] = useState(task?.progress ?? 0);
  const [isStatusSheetVisible, setIsStatusSheetVisible] = useState(false);
  const [subtaskItems, setSubtaskItems] = useState<ApiSubtask[]>(task?.subtasks ?? []);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [dependencyItems, setDependencyItems] = useState<DependencyTask[]>(
    toDependencyTasks(task?.dependencies),
  );
  const [recurrence, setRecurrence] = useState<RecurrenceSettings | null>(
    task ? recurrenceToUi(task.recurrence) : null,
  );
  const [activityItems, setActivityItems] = useState<ApiTaskActivity[]>(task?.activities ?? []);
  const [isRecurrenceSheetVisible, setIsRecurrenceSheetVisible] = useState(false);
  const [dependencySheet, setDependencySheet] = useState<{
    mode: 'add' | 'edit' | 'remove';
    dependency?: DependencyTask | null;
  } | null>(null);
  const [error, setError] = useState('');

  const currentTaskId = task?.id ?? '';
  const completedSubtasks = subtaskItems.filter((item) => item.isDone).length;
  const dependenciesComplete = dependencyItems.length > 0 && dependencyItems.every((item) => item.status === 'Done');
  const recurrenceSummary = createRecurrenceSummary(recurrence);
  const nextOccurrence = getNextOccurrenceLabel(recurrence);
  const toneColor = (tone: TimelineTone) =>
    tone === 'primary' ? colors.primary : tone === 'accent' ? colors.accent : tone === 'success' ? colors.success : tone === 'warning' ? colors.warning : colors.secondaryText;
  const displayLabels = task?.labelDetails?.length ? task.labelDetails.map((label) => label.name) : task?.labels ?? [];
  const estimatedHoursLabel = formatHours(task?.estimatedHours);
  const spentHoursLabel = formatHours(task?.spentHours);
  const remainingHoursLabel = formatHours(task?.remainingHours);
  const timeProgress = clampPercent(task?.progressPercentage ?? 0);
  const remainingProgress = clampPercent(100 - timeProgress);

  useEffect(() => {
    if (!task) return;
    setStatus(toTaskStatus(task));
    setProgress(task.progress);
    setSubtaskItems(task.subtasks);
    setDependencyItems(toDependencyTasks(task.dependencies));
    setRecurrence(recurrenceToUi(task.recurrence));
    setActivityItems(task.activities);
  }, [task]);

  useEffect(() => {
    if (!task || !accessToken) return;

    Promise.all([
      getSubtasks(accessToken, task.id),
      getDependencies(accessToken, task.id),
      getRecurrence(accessToken, task.id),
      getTaskActivity(accessToken, task.id),
    ])
      .then(([nextSubtasks, nextDependencies, nextRecurrence, nextActivity]) => {
        setSubtaskItems(nextSubtasks);
        setDependencyItems(toDependencyTasks(nextDependencies));
        setRecurrence(recurrenceToUi(nextRecurrence));
        setActivityItems(nextActivity);
      })
      .catch((detailsError: unknown) => {
        console.error('[BeePlan Tasks] Unable to load task details sections', detailsError);
      });
  }, [accessToken, task?.id]);

  async function saveStatus(next: { status: TaskStatus; progress: number; completionDate?: string; missedReason?: string }) {
    if (!task || !accessToken) {
      setStatus(next.status);
      setProgress(next.progress);
      setIsStatusSheetVisible(false);
      return;
    }

    setError('');
    try {
      const updated = await changeTaskStatus(accessToken, task.id, {
        status: toApiStatus(next.status),
        progress: next.progress,
        completionDate: next.completionDate,
        missedReason: next.missedReason,
      });
      setStatus(next.status);
      setProgress(next.progress);
      onTaskUpdated?.(updated);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Unable to change task status.');
    } finally {
      setIsStatusSheetVisible(false);
    }
  }

  async function handleAddSubtask() {
    if (!task || !accessToken || !newSubtaskTitle.trim()) return;

    setError('');
    try {
      const updated = await addSubtask(accessToken, task.id, { title: newSubtaskTitle.trim() });
      setSubtaskItems(updated.subtasks);
      setActivityItems(updated.activities);
      setNewSubtaskTitle('');
      onTaskUpdated?.(updated);
    } catch (subtaskError) {
      setError(subtaskError instanceof Error ? subtaskError.message : 'Unable to add subtask.');
    }
  }

  async function handleToggleSubtask(subtask: ApiSubtask) {
    if (!task || !accessToken) return;

    setError('');
    try {
      const updated = await updateSubtask(accessToken, task.id, subtask.id, { isDone: !subtask.isDone });
      setSubtaskItems(updated.subtasks);
      setActivityItems(updated.activities);
      setProgress(updated.progress);
      onTaskUpdated?.(updated);
    } catch (subtaskError) {
      setError(subtaskError instanceof Error ? subtaskError.message : 'Unable to update subtask.');
    }
  }

  async function handleDeleteSubtask(subtask: ApiSubtask) {
    if (!task || !accessToken) return;

    setError('');
    try {
      const updated = await deleteSubtask(accessToken, task.id, subtask.id);
      setSubtaskItems(updated.subtasks);
      setActivityItems(updated.activities);
      setProgress(updated.progress);
      onTaskUpdated?.(updated);
    } catch (subtaskError) {
      setError(subtaskError instanceof Error ? subtaskError.message : 'Unable to delete subtask.');
    }
  }

  async function handleAddDependencies(tasksToAdd: DependencyTask[]) {
    if (!task || !accessToken) return;
    const filtered = tasksToAdd.filter((item) => item.id !== currentTaskId);
    if (!filtered.length) return;

    setError('');
    try {
      const updated = await addDependencies(accessToken, task.id, filtered.map((item) => item.id));
      setDependencyItems(toDependencyTasks(updated.dependencies));
      onTaskUpdated?.(updated);
    } catch (dependencyError) {
      setError(dependencyError instanceof Error ? dependencyError.message : 'Unable to add dependency.');
    }
  }

  async function handleReplaceDependency(oldDependencyId: string, replacement: DependencyTask) {
    if (!task || !accessToken) return;

    setError('');
    try {
      const updated = await replaceDependency(accessToken, task.id, oldDependencyId, replacement.id);
      setDependencyItems(toDependencyTasks(updated.dependencies));
      onTaskUpdated?.(updated);
    } catch (dependencyError) {
      setError(dependencyError instanceof Error ? dependencyError.message : 'Unable to update dependency.');
    }
  }

  async function handleRemoveDependency(dependencyId: string) {
    if (!task || !accessToken) return;

    setError('');
    try {
      const updated = await removeDependency(accessToken, task.id, dependencyId);
      setDependencyItems(toDependencyTasks(updated.dependencies));
      onTaskUpdated?.(updated);
    } catch (dependencyError) {
      setError(dependencyError instanceof Error ? dependencyError.message : 'Unable to remove dependency.');
    }
  }

  async function handleSaveRecurrence(next: RecurrenceSettings | null) {
    if (!task || !accessToken) {
      setRecurrence(next);
      return;
    }

    setError('');
    setRecurrence(next);
    try {
      const apiRecurrence = recurrenceToApi(next);
      const updated = apiRecurrence
        ? await saveRecurrence(accessToken, task.id, apiRecurrence)
        : await removeRecurrence(accessToken, task.id);
      onTaskUpdated?.(updated);
    } catch (recurrenceError) {
      setError(recurrenceError instanceof Error ? recurrenceError.message : 'Unable to save recurrence.');
    }
  }

  async function handleRemoveRecurrence() {
    if (!task || !accessToken) {
      setRecurrence(null);
      return;
    }

    setError('');
    setRecurrence(null);
    try {
      const updated = await removeRecurrence(accessToken, task.id);
      onTaskUpdated?.(updated);
    } catch (recurrenceError) {
      setError(recurrenceError instanceof Error ? recurrenceError.message : 'Unable to remove recurrence.');
    }
  }

  if (!task) {
    return (
      <AppScreen>
        <PageHeader title="Task Details" onBack={onBack} />
        <SectionCard className="mb-5">
          <Text style={{ color: colors.secondaryText }}>This task could not be loaded. Go back and try again.</Text>
        </SectionCard>
      </AppScreen>
    );
  }

  return (
    <AppScreen
      footer={
        <BottomActionBar>
          <DangerButton onPress={onDelete} className="flex-1">
            Delete
          </DangerButton>
          <SecondaryButton onPress={onEdit} className="flex-1">
            Edit Task
          </SecondaryButton>
          <PrimaryButton onPress={onMarkDone} className="flex-1">
            Done
          </PrimaryButton>
        </BottomActionBar>
      }
    >
      <PageHeader title="Task Details" onBack={onBack} />

      {error ? <Text className="mb-4 text-sm font-bold text-red-300">{error}</Text> : null}

      <SectionCard className="mb-5">
        <View className="mb-5 flex-row items-start justify-between gap-4">
          <View className="flex-1">
            <Text className="text-2xl font-black leading-8" style={{ color: colors.text }}>{task.title}</Text>
            <Text className="mt-3 text-sm leading-6" style={{ color: colors.secondaryText }}>
              {task.description || 'No description yet.'}
            </Text>
          </View>
        </View>

        <View className="mb-5 flex-row flex-wrap gap-2">
          <Pressable
            onPress={() => setIsStatusSheetVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Change task status"
            className="active:scale-[0.98] active:opacity-80"
          >
            <Badge label={status} color={getStatusColor(status, colors)} />
          </Pressable>
          <Badge label={`${toUiPriority(task.priority)} Priority`} color={colors.error} />
          <Badge label={task.category || 'General'} color={colors.accent} />
        </View>

        <View className="gap-3">
          <InfoRow label="Created" value={formatDate(task.createdAt)} />
          <InfoRow label="Updated" value={formatDate(task.updatedAt)} />
          <InfoRow label="Due Date" value={formatDate(task.dueDate) || 'No due date'} />
          <InfoRow label="Due Time" value={task.dueTime || '--:--'} />
        </View>
      </SectionCard>

      <Card title="Progress">
        <View className="mb-5 flex-row items-center justify-between">
          <View>
            <Text className="text-4xl font-black" style={{ color: colors.text }}>{progress}%</Text>
            <Text className="mt-1 text-sm" style={{ color: colors.secondaryText }}>
              {completedSubtasks} of {subtaskItems.length} subtasks completed
            </Text>
          </View>
          <IconTile label="↑" color={colors.primary} />
        </View>

        <ProgressBar value={progress} color={colors.primary} />

        <View className="mt-5 flex-row gap-3">
          <TimePill title="Estimated" value={estimatedHoursLabel} />
          <TimePill title="Spent" value={spentHoursLabel} />
          <TimePill title="Remaining" value={remainingHoursLabel} />
        </View>
      </Card>

      <Card title="Subtasks">
        {subtaskItems.map((item) => (
          <SubtaskRow key={item.id} item={item} onToggle={() => void handleToggleSubtask(item)} onDelete={() => void handleDeleteSubtask(item)} />
        ))}
        {!subtaskItems.length ? (
          <Text className="mb-3 text-sm" style={{ color: colors.secondaryText }}>No subtasks yet.</Text>
        ) : null}
        <View className="flex-row items-center gap-2">
          <TextInput
            value={newSubtaskTitle}
            onChangeText={setNewSubtaskTitle}
            placeholder="Add a subtask..."
            placeholderTextColor={colors.placeholder}
            onSubmitEditing={() => void handleAddSubtask()}
            className="flex-1 rounded-2xl border px-4 py-3 text-sm"
            style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }}
          />
          <Pressable
            onPress={() => void handleAddSubtask()}
            accessibilityRole="button"
            accessibilityLabel="Add subtask"
            className="rounded-2xl px-4 py-3 active:opacity-80"
            style={{ backgroundColor: colors.accent }}
          >
            <Text className="text-xs font-black" style={{ color: colors.accentText }}>+ Add</Text>
          </Pressable>
        </View>
      </Card>

      <Card title="Dependencies" action="+ Add Dependency" onAction={() => setDependencySheet({ mode: 'add' })}>
        {dependencyItems.length ? (
          <View
            className="mb-4 rounded-3xl border p-4"
            style={{
              backgroundColor: dependenciesComplete ? `${colors.success}16` : `${colors.accent}16`,
              borderColor: dependenciesComplete ? `${colors.success}55` : `${colors.accent}55`,
            }}
          >
            <Text className="text-sm font-bold leading-5" style={{ color: dependenciesComplete ? colors.success : colors.accent }}>
              {dependenciesComplete
                ? 'All dependencies are completed. This task is ready to start.'
                : 'This task cannot start until all dependencies are completed.'}
            </Text>
          </View>
        ) : null}

        {dependencyItems.length ? (
          dependencyItems.map((item, index) => (
            <DependencyRow
              key={item.id}
              item={item}
              isLast={index === dependencyItems.length - 1}
              onEdit={() => setDependencySheet({ mode: 'edit', dependency: item })}
              onRemove={() => setDependencySheet({ mode: 'remove', dependency: item })}
            />
          ))
        ) : (
          <View className="rounded-3xl border border-dashed p-6" style={{ backgroundColor: colors.background, borderColor: colors.border }}>
            <Text className="text-center font-black" style={{ color: colors.text }}>
              No dependencies yet
            </Text>
            <Text className="mt-2 text-center text-sm" style={{ color: colors.secondaryText }}>
              Add tasks that must be completed first.
            </Text>
          </View>
        )}
      </Card>

      <SectionCard className="mb-5">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <IconTile label="🔔" color={colors.accent} compact />
            <View>
              <Text className="font-black" style={{ color: colors.text }}>Reminder</Text>
              <Text className="mt-1 text-sm" style={{ color: colors.secondaryText }}>
                {task.reminderEnabled ? `${task.reminderBeforeMinutes ?? 30} minutes before due date` : 'No reminder set'}
              </Text>
            </View>
          </View>
          <Switch value={task.reminderEnabled} disabled trackColor={{ false: colors.border, true: colors.accent }} thumbColor="#FFFFFF" />
        </View>
      </SectionCard>

      <SectionCard className="mb-5">
        <View className="flex-row items-center gap-3">
          <IconTile label="🔁" color={colors.primary} compact />
          <View className="flex-1">
            <Text className="font-black" style={{ color: colors.text }}>Recurring</Text>
            <Text className="mt-1 text-sm" style={{ color: colors.secondaryText }}>{recurrenceSummary}</Text>
            <Text className="mt-1 text-xs" style={{ color: colors.secondaryText }}>{nextOccurrence}</Text>
          </View>
          <Pressable
            onPress={() => setIsRecurrenceSheetVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={recurrence ? 'Edit recurrence' : 'Set recurrence'}
            className="rounded-full px-3 py-2 active:opacity-70"
            style={{ backgroundColor: colors.background }}
          >
            <Text className="text-xs font-black" style={{ color: colors.accent }}>
              {recurrence ? 'Edit' : 'Set'}
            </Text>
          </Pressable>
        </View>
      </SectionCard>

      <Card title="Notes">
        <Text className="rounded-3xl p-4 text-sm leading-6" style={{ backgroundColor: colors.background, color: colors.secondaryText }}>
          {task.notes || 'No notes yet.'}
        </Text>
      </Card>

      <Card title="Activity Timeline">
        {activityItems.length ? (
          activityItems.map((item, index) => (
            <TimelineRow
              key={item.id}
              item={{ title: formatActivityTitle(item.action), detail: item.description, time: formatDate(item.createdAt) }}
              color={activityColor(item.action, colors)}
              isLast={index === activityItems.length - 1}
            />
          ))
        ) : (
          <Text className="text-sm" style={{ color: colors.secondaryText }}>No activity yet.</Text>
        )}
      </Card>

      {displayLabels.length ? (
        <Card title="Labels">
          <View className="flex-row flex-wrap gap-2">
            {displayLabels.map((label, index) => {
              const tones: TimelineTone[] = ['accent', 'primary', 'success', 'warning'];
              const color = toneColor(tones[index % tones.length]);
              return (
                <View key={label} className="rounded-full px-4 py-3" style={{ backgroundColor: `${color}22` }}>
                  <Text className="text-xs font-black" style={{ color }}>
                    {label}
                  </Text>
                </View>
              );
            })}
          </View>
        </Card>
      ) : null}

      <Card title="Time Estimation">
        <View className="gap-4">
          <ChartRow label="Estimated" value={estimatedHoursLabel} percent={100} color={colors.secondaryText} />
          <ChartRow label="Spent" value={spentHoursLabel} percent={timeProgress} color={colors.primary} />
          <ChartRow label="Remaining" value={remainingHoursLabel} percent={remainingProgress} color={colors.accent} />
        </View>
      </Card>

      <TaskStatusWorkflowSheet
        visible={isStatusSheetVisible}
        status={status}
        progress={progress}
        onClose={() => setIsStatusSheetVisible(false)}
        onSave={(next) => void saveStatus(next)}
      />
      <TaskDependenciesWorkflowSheet
        visible={Boolean(dependencySheet)}
        mode={dependencySheet?.mode ?? 'add'}
        currentTaskId={currentTaskId}
        availableTasks={dependencyItems}
        dependencies={dependencyItems}
        dependency={dependencySheet?.dependency}
        onClose={() => setDependencySheet(null)}
        onAdd={(items) => void handleAddDependencies(items)}
        onSaveReplacement={(oldDependencyId, replacement) => void handleReplaceDependency(oldDependencyId, replacement)}
        onRemove={(dependencyId) => void handleRemoveDependency(dependencyId)}
      />
      <TaskRecurrenceSheet
        visible={isRecurrenceSheetVisible}
        mode={recurrence ? 'edit' : 'create'}
        recurrence={recurrence}
        onClose={() => setIsRecurrenceSheetVisible(false)}
        onSave={(next) => void handleSaveRecurrence(next)}
        onRemove={() => void handleRemoveRecurrence()}
      />
    </AppScreen>
  );
}

function Card({
  title,
  action,
  onAction,
  children,
}: {
  title?: string;
  action?: string;
  onAction?: () => void;
  children: ReactNode;
}) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <SectionCard className="mb-5">
      {(title || action) && (
        <View className="mb-5 flex-row items-center justify-between">
          {title ? <Text className="text-lg font-black" style={{ color: colors.text }}>{title}</Text> : <View />}
          {action ? (
            <Pressable
              onPress={onAction}
              accessibilityRole="button"
              accessibilityLabel={action}
              className="rounded-full px-3 py-2 active:opacity-70"
              style={{ backgroundColor: colors.background }}
            >
              <Text className="text-xs font-black" style={{ color: colors.accent }}>{action}</Text>
            </Pressable>
          ) : null}
        </View>
      )}
      {children}
    </SectionCard>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View className="rounded-full px-3 py-2" style={{ backgroundColor: `${color}33` }}>
      <Text className="text-xs font-black" style={{ color }}>
        {label}
      </Text>
    </View>
  );
}

function toTaskStatus(task?: ApiTask | null): TaskStatus {
  return task ? (toUiStatus(task.status) as TaskStatus) : 'To Do';
}

function toDependencyTasks(items?: ApiTask['dependencies']): DependencyTask[] {
  if (!items) return [];
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    category: item.category || 'General',
    status: toUiStatus(item.status) as DependencyTask['status'],
    dueDate: formatDate(item.dueDate) || 'No due date',
    priority: normalizeDependencyPriority(toUiPriority(item.priority)),
  }));
}

function normalizeDependencyPriority(priority: string): DependencyTask['priority'] {
  if (priority === 'Low' || priority === 'High') return priority;
  return 'Medium';
}

function formatDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

function formatHours(value?: number) {
  if (value === undefined || value === null || value <= 0) return '0h';
  return Number.isInteger(value) ? `${value}h` : `${value.toFixed(1)}h`;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(Math.round(value), 100));
}

function formatActivityTitle(action: string) {
  return action
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function activityColor(action: string, colors: ReturnType<typeof useTheme>['theme']['colors']) {
  if (action.includes('created')) return colors.success;
  if (action.includes('status')) return colors.primary;
  if (action.includes('subtask')) return colors.accent;
  if (action.includes('dependency')) return colors.warning;
  if (action.includes('recurrence')) return colors.accent;
  return colors.secondaryText;
}

function getStatusColor(status: TaskStatus, colors: ReturnType<typeof useTheme>['theme']['colors']) {
  if (status === 'Done') return colors.success;
  if (status === 'Missed') return colors.error;
  if (status === 'To Do') return colors.secondaryText;
  return colors.primary;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View className="flex-row items-center justify-between rounded-2xl px-4 py-3" style={{ backgroundColor: colors.background }}>
      <Text className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.secondaryText }}>{label}</Text>
      <Text className="font-bold" style={{ color: colors.text }}>{value}</Text>
    </View>
  );
}

function IconTile({ label, color, compact }: { label: string; color: string; compact?: boolean }) {
  return (
    <View
      className={`${compact ? 'h-10 w-10 rounded-2xl' : 'h-14 w-14 rounded-3xl'} items-center justify-center`}
      style={{ backgroundColor: `${color}22`, borderColor: `${color}66`, borderWidth: 1 }}
    >
      <Text className="text-xs font-black" style={{ color }}>
        {label}
      </Text>
    </View>
  );
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  const { theme } = useTheme();

  return (
    <View className="h-3 overflow-hidden rounded-full" style={{ backgroundColor: theme.colors.progressTrack }}>
      <View className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: color }} />
    </View>
  );
}

function TimePill({ title, value }: { title: string; value: string }) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View className="flex-1 rounded-2xl p-3" style={{ backgroundColor: colors.background }}>
      <Text className="text-[10px] font-bold uppercase" style={{ color: colors.secondaryText }}>{title}</Text>
      <Text className="mt-1 text-sm font-black" style={{ color: colors.text }}>{value}</Text>
    </View>
  );
}

function SubtaskRow({
  item,
  onToggle,
  onDelete,
}: {
  item: ApiSubtask;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View className="mb-3 flex-row items-center gap-3 rounded-2xl p-4" style={{ backgroundColor: colors.background }}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={item.isDone ? 'Mark subtask as not done' : 'Mark subtask as done'}
        className="h-6 w-6 items-center justify-center rounded-lg border"
        style={{ borderColor: item.isDone ? colors.success : colors.border, backgroundColor: item.isDone ? colors.success : 'transparent' }}
      >
        {item.isDone ? <Text className="text-xs font-black" style={{ color: colors.accentText }}>✓</Text> : null}
      </Pressable>

      <Pressable onPress={onToggle} className="flex-1">
        <Text className={`font-bold ${item.isDone ? 'line-through' : ''}`} style={{ color: item.isDone ? colors.secondaryText : colors.text }}>
          {item.title}
        </Text>
      </Pressable>

      <Pressable
        onPress={onDelete}
        accessibilityRole="button"
        accessibilityLabel={`Delete subtask ${item.title}`}
        className="rounded-xl px-3 py-2 active:opacity-80"
        style={{ backgroundColor: `${colors.error}22` }}
      >
        <Text className="text-xs font-black" style={{ color: colors.error }}>Delete</Text>
      </Pressable>
    </View>
  );
}

function DependencyRow({
  item,
  isLast,
  onEdit,
  onRemove,
}: {
  item: DependencyTask;
  isLast: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { theme } = useTheme();
  const { colors } = theme;
  const color = getDependencyStatusColor(item.status, colors);

  return (
    <View>
      <View className="flex-row items-center gap-4">
        <View className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: colors.background }}>
          <View className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
        </View>
        <Pressable
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={`Edit dependency ${item.title}`}
          className="flex-1 rounded-2xl p-4 active:scale-[0.99] active:opacity-90"
          style={{ backgroundColor: colors.background }}
        >
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1">
              <Text className="font-bold" style={{ color: colors.text }}>{item.title}</Text>
              <Text className="mt-1 text-xs" style={{ color: colors.secondaryText }}>
                {item.category} - Due {item.dueDate}
              </Text>
            </View>
            <Badge label={item.status} color={color} />
          </View>

          <View className="mt-3 flex-row items-center justify-between">
            <Text className="text-xs font-bold" style={{ color: colors.secondaryText }}>
              {item.priority} Priority
            </Text>
            <Pressable
              onPress={onRemove}
              accessibilityRole="button"
              accessibilityLabel={`Remove dependency ${item.title}`}
              className="rounded-xl px-3 py-2 active:opacity-80"
              style={{ backgroundColor: `${colors.error}22` }}
            >
              <Text className="text-xs font-black" style={{ color: colors.error }}>
                Remove
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </View>
      {!isLast ? <Text className="ml-4 py-2 text-xl font-black" style={{ color: colors.secondaryText }}>↓</Text> : null}
    </View>
  );
}

function getDependencyStatusColor(
  status: DependencyTask['status'],
  colors: ReturnType<typeof useTheme>['theme']['colors'],
) {
  if (status === 'Done') return colors.success;
  if (status === 'Missed' || status === 'Blocked') return colors.error;
  if (status === 'In Progress') return colors.primary;
  return colors.secondaryText;
}

function TimelineRow({
  item,
  color,
  isLast,
}: {
  item: { title: string; detail: string; time: string };
  color: string;
  isLast: boolean;
}) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View className="flex-row gap-4">
      <View className="items-center">
        <View className="h-4 w-4 rounded-full" style={{ backgroundColor: color }} />
        {!isLast ? <View className="w-px flex-1" style={{ backgroundColor: colors.border }} /> : null}
      </View>
      <View className="mb-5 flex-1">
        <Text className="font-black" style={{ color: colors.text }}>{item.title}</Text>
        <Text className="mt-1 text-sm" style={{ color: colors.secondaryText }}>{item.detail}</Text>
        <Text className="mt-2 text-xs font-bold" style={{ color: colors.accent }}>{item.time}</Text>
      </View>
    </View>
  );
}

function ChartRow({
  label,
  value,
  percent,
  color,
}: {
  label: string;
  value: string;
  percent: number;
  color: string;
}) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View>
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="font-bold" style={{ color: colors.text }}>{label}</Text>
        <Text className="text-sm font-black" style={{ color }}>
          {value}
        </Text>
      </View>
      <View className="h-3 overflow-hidden rounded-full" style={{ backgroundColor: colors.progressTrack }}>
        <View className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: color }} />
      </View>
    </View>
  );
}
