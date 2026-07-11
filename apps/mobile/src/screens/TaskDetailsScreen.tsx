import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  changeTaskStatus,
  getAttachments,
  openAttachment,
  recurrenceToUi,
  toApiStatus,
  toUiPriority,
  toUiStatus,
  updateSubtask,
  type ApiSubtask,
  type ApiTask,
  type ApiTaskActivity,
  type ApiTaskAttachment,
} from '../lib/tasksApi';
import { type DependencyTask } from '../components/TaskDependenciesWorkflowSheet';
import { createRecurrenceSummary, getNextOccurrenceLabel, type RecurrenceSettings } from '../components/TaskRecurrenceSheet';
import { TaskStatusWorkflowSheet, type TaskStatus } from '../components/TaskStatusWorkflowSheet';
import SubtaskDetailSheet from '../components/SubtaskDetailSheet';
import {
  formatDuration,
  getSubtaskIndicator,
  syncTaskSubtaskReminders,
  SUBTASK_INDICATOR_COLOR,
  SUBTASK_PRIORITY_COLOR,
  SUBTASK_PRIORITY_LABEL,
  SUBTASK_STATUS_LABEL,
} from '../lib/subtasks';
import {
  AppScreen,
  BottomActionBar,
  DangerButton,
  OutlineButton,
  PageHeader,
  PrimaryButton,
  SectionCard,
} from '../components/layout';
import { useTheme } from '../theme/useTheme';
import { CollaborationPanel } from '../features/collaboration/components/CollaborationPanel';
import { SharedBadge } from '../features/collaboration/components/SharedBadge';

type Props = {
  task?: ApiTask | null;
  tasks?: ApiTask[];
  accessToken?: string;
  currentUserId?: string;
  onTaskUpdated?: (task: ApiTask) => void;
  onRefresh?: () => void;
  onBack: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onMarkDone?: () => void;
};

export default function TaskDetailsScreen({
  task,
  accessToken = '',
  currentUserId = '',
  onTaskUpdated,
  onRefresh,
  onBack,
  onEdit,
  onDelete,
}: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const [status, setStatus] = useState<TaskStatus>(toTaskStatus(task));
  const [progress, setProgress] = useState(task?.progress ?? 0);
  const [isStatusSheetVisible, setIsStatusSheetVisible] = useState(false);
  const [subtaskItems, setSubtaskItems] = useState<ApiSubtask[]>(task?.subtasks ?? []);
  const [detailSubtaskId, setDetailSubtaskId] = useState<string | null>(null);
  const [sharedMemberCount, setSharedMemberCount] = useState(0);
  const [collabNotice, setCollabNotice] = useState('');
  const [dependencyItems, setDependencyItems] = useState<DependencyTask[]>(
    toDependencyTasks(task?.dependencies),
  );
  const [recurrence, setRecurrence] = useState<RecurrenceSettings | null>(
    task ? recurrenceToUi(task.recurrence) : null,
  );
  const [activityItems, setActivityItems] = useState<ApiTaskActivity[]>(task?.activities ?? []);
  const [attachmentItems, setAttachmentItems] = useState<ApiTaskAttachment[]>([]);
  const [error, setError] = useState('');

  const completedSubtasks = useMemo(() => subtaskItems.filter((item) => item.isDone).length, [subtaskItems]);
  const dependenciesComplete = useMemo(
    () => dependencyItems.length > 0 && dependencyItems.every((item) => item.status === 'Done'),
    [dependencyItems],
  );
  const isBlocked = dependencyItems.length > 0 && !dependenciesComplete;
  const recurrenceSummary = createRecurrenceSummary(recurrence);
  const nextOccurrence = getNextOccurrenceLabel(recurrence);
  const reminderText = task?.reminderEnabled ? `${task.reminderBeforeMinutes ?? 30} minutes before due date` : 'No reminder set';
  const focusText = task?.isFocusTask ? 'Enabled' : 'Not set';
  const latestActivity = useMemo(
    () => [...activityItems].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0],
    [activityItems],
  );

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

    let cancelled = false;
    getAttachments(accessToken, task.id)
      .then((items) => {
        if (!cancelled) setAttachmentItems(items);
      })
      .catch((attachmentError: unknown) => {
        if (!cancelled) {
          setError(attachmentError instanceof Error ? attachmentError.message : 'Unable to load attachments.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [task, accessToken]);

  // Reconcile local subtask reminder notifications whenever the subtask set
  // changes (initial load, toggle, or detail-sheet edit). Fire-and-forget:
  // scheduling failures must never block the UI.
  useEffect(() => {
    if (!subtaskItems.length) return;
    void syncTaskSubtaskReminders(subtaskItems);
  }, [subtaskItems]);

  const detailSubtask = useMemo(
    () => subtaskItems.find((item) => item.id === detailSubtaskId) ?? null,
    [subtaskItems, detailSubtaskId],
  );

  const handleOpenAttachment = useCallback(
    async (attachment: ApiTaskAttachment) => {
      if (!task || !accessToken || !attachment.id) return;

      try {
        await openAttachment(accessToken, task.id, attachment);
      } catch (attachmentError) {
        setError(attachmentError instanceof Error ? attachmentError.message : 'Unable to open attachment.');
      }
    },
    [task, accessToken],
  );

  const saveStatus = useCallback(
    async (next: { status: TaskStatus; progress: number; completionDate?: string; missedReason?: string }) => {
      if (!task || !accessToken) {
        setStatus(next.status);
        setProgress(next.progress);
        setIsStatusSheetVisible(false);
        return;
      }

      if (
        isBlocked &&
        (next.status === 'In Progress' || next.status === 'Done') &&
        next.status !== status
      ) {
        setError('This task cannot start until all its dependencies are completed.');
        setIsStatusSheetVisible(false);
        return;
      }

      const subtasksIncomplete = subtaskItems.length > 0 && completedSubtasks < subtaskItems.length;
      if (next.status === 'Done' && subtasksIncomplete) {
        setError('Complete all subtasks before marking this task as Done.');
        setIsStatusSheetVisible(false);
        return;
      }

      // Optimistic update: apply immediately and close the sheet right away;
      // roll back if the server rejects the change.
      const previousStatus = status;
      const previousProgress = progress;
      setError('');
      setStatus(next.status);
      setProgress(next.progress);
      setIsStatusSheetVisible(false);

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
        setStatus(previousStatus);
        setProgress(previousProgress);
        setError(statusError instanceof Error ? statusError.message : 'Unable to change task status.');
      }
    },
    [task, accessToken, isBlocked, status, subtaskItems, completedSubtasks, progress, onTaskUpdated],
  );

  const handleToggleSubtask = useCallback(
    async (subtask: ApiSubtask) => {
      if (!task || !accessToken) return;

      // Optimistic update: flip the subtask and recompute progress locally,
      // then reconcile with the server response; roll back on error.
      const nextIsDone = !subtask.isDone;
      const previousSubtaskItems = subtaskItems;
      const previousProgress = progress;
      const optimisticSubtasks = subtaskItems.map((item) =>
        item.id === subtask.id ? { ...item, isDone: nextIsDone } : item,
      );
      const optimisticProgress = optimisticSubtasks.length
        ? Math.round((optimisticSubtasks.filter((item) => item.isDone).length / optimisticSubtasks.length) * 100)
        : progress;

      setSubtaskItems(optimisticSubtasks);
      setProgress(optimisticProgress);
      setError('');

      try {
        const updated = await updateSubtask(accessToken, task.id, subtask.id, { isDone: nextIsDone });
        setSubtaskItems(updated.subtasks);
        setActivityItems(updated.activities);
        setProgress(updated.progress);
        onTaskUpdated?.(updated);
      } catch (subtaskError) {
        setSubtaskItems(previousSubtaskItems);
        setProgress(previousProgress);
        setError(subtaskError instanceof Error ? subtaskError.message : 'Unable to update subtask.');
      }
    },
    [task, accessToken, subtaskItems, progress, onTaskUpdated],
  );

  if (!task) {
    return (
      <AppScreen>
        <PageHeader title="Task Details" onBack={onBack} />
        <SectionCard className="mb-3">
          <Text style={{ color: colors.secondaryText }}>This task could not be loaded. Go back and try again.</Text>
        </SectionCard>
      </AppScreen>
    );
  }

  return (
    <AppScreen
      footer={
        <BottomActionBar>
          <DangerButton size="sm" onPress={onDelete} className="flex-1">
            Delete
          </DangerButton>
          <OutlineButton size="sm" onPress={() => setIsStatusSheetVisible(true)} className="flex-1">
            Status
          </OutlineButton>
          <PrimaryButton size="sm" onPress={onEdit} className="flex-1">
            Edit Task
          </PrimaryButton>
        </BottomActionBar>
      }
    >
      <PageHeader title="Task Details" onBack={onBack} />

      {error ? <Text className="mb-3 text-sm font-bold text-red-300">{error}</Text> : null}

      <SectionCard className="mb-3">
        <View className="mb-2 flex-row flex-wrap items-center gap-1.5">
          <Badge label={status} color={getStatusColor(status, colors)} />
          <Badge label={`${toUiPriority(task.priority)} Priority`} color={colors.error} />
          <Badge label={task.category || 'General'} color={colors.accent} />
          {task.isShared || sharedMemberCount > 1 ? (
            <SharedBadge memberCount={sharedMemberCount || undefined} />
          ) : null}
        </View>

        <Text className="text-xl font-black leading-7" style={{ color: colors.text }}>{task.title}</Text>
        <Text className="mt-2 text-sm leading-5" style={{ color: colors.secondaryText }}>
          {task.description || 'No description yet.'}
        </Text>

        <View className="mt-3 gap-2">
          <InfoRow label="Created" value={formatDate(task.createdAt)} />
          <InfoRow label="Updated" value={formatDate(task.updatedAt)} />
          <InfoRow label="Due Date" value={`${formatDate(task.dueDate) || 'No due date'}${task.dueTime ? ` - ${task.dueTime}` : ''}`} />
        </View>
      </SectionCard>

      {collabNotice ? (
        <View className="mb-3 rounded-xl px-3 py-2" style={{ backgroundColor: `${colors.success}26` }}>
          <Text style={{ color: colors.success }} className="text-xs font-semibold">
            ✓ {collabNotice}
          </Text>
        </View>
      ) : null}

      {currentUserId ? (
        <CollaborationPanel
          task={task}
          currentUserId={currentUserId}
          onMembersLoaded={setSharedMemberCount}
          onRefresh={onRefresh}
          onNotice={(m) => {
            setCollabNotice(m);
            setTimeout(() => setCollabNotice(''), 3000);
          }}
          onError={setError}
        />
      ) : null}

      <Card title="Progress">
        <View className="mb-2 flex-row items-center justify-between">
          <Text className="text-sm" style={{ color: colors.secondaryText }}>
            {completedSubtasks} of {subtaskItems.length} subtasks completed
          </Text>
          <Text className="text-2xl font-black" style={{ color: colors.text }}>{progress}%</Text>
        </View>
        <ProgressBar value={progress} color={colors.primary} />
      </Card>

      <Card title="Subtasks">
        {subtaskItems.length ? (
          subtaskItems.map((item) => (
            <SubtaskRow
              key={item.id}
              item={item}
              onToggle={handleToggleSubtask}
              onOpen={(subtask) => setDetailSubtaskId(subtask.id)}
            />
          ))
        ) : (
          <EmptyBlock title="No subtasks yet" description="Steps will appear here once added from Edit Task." />
        )}
      </Card>

      <Card title="Dependencies">
        {dependencyItems.length ? (
          <>
            <View
              className="mb-3 rounded-2xl border p-3"
              style={{
                backgroundColor: dependenciesComplete ? `${colors.success}16` : `${colors.accent}16`,
                borderColor: dependenciesComplete ? `${colors.success}55` : `${colors.accent}55`,
              }}
            >
              <Text className="text-xs font-bold leading-4" style={{ color: dependenciesComplete ? colors.success : colors.accent }}>
                {dependenciesComplete
                  ? 'All dependencies are completed. This task is ready to start.'
                  : 'This task cannot start until all dependencies are completed.'}
              </Text>
            </View>
            {dependencyItems.map((item) => (
              <DependencyRow key={item.id} item={item} />
            ))}
          </>
        ) : (
          <EmptyBlock title="No dependencies" description="Tasks that must finish first will appear here." />
        )}
      </Card>

      <Card title="Automation">
        <AutomationRow label="Reminder" value={reminderText} />
        <AutomationRow label="Recurring" value={`${recurrenceSummary}${recurrence ? ` - ${nextOccurrence}` : ''}`} />
        <AutomationRow label="Focus" value={focusText} isLast />
      </Card>

      <Card title="Notes">
        <Text className="rounded-2xl p-3 text-sm leading-5" style={{ backgroundColor: colors.background, color: colors.secondaryText }}>
          {task.notes || 'No notes yet.'}
        </Text>
      </Card>

      <Card title="Attachments">
        {attachmentItems.length ? (
          <View className="gap-2">
            {attachmentItems.map((file) => (
              <Pressable
                key={file.id ?? file.fileName ?? file.name}
                onPress={() => void handleOpenAttachment(file)}
                className="flex-row items-center gap-3 rounded-2xl p-3 active:opacity-80"
                style={{ backgroundColor: colors.background }}
              >
                <View className={`h-9 w-9 items-center justify-center rounded-lg ${attachmentColor(file.fileType ?? file.type, file.fileName ?? file.name)}`}>
                  <Text className="text-[9px] font-black text-white">
                    {attachmentLabel(file.fileType ?? file.type, file.fileName ?? file.name)}
                  </Text>
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-bold" style={{ color: colors.text }} numberOfLines={1}>
                    {file.fileName ?? file.name}
                  </Text>
                  <Text className="text-xs" style={{ color: colors.secondaryText }}>
                    {formatFileSize(file.fileSize ?? file.size)}
                    {file.fileType ?? file.type ? ` • ${file.fileType ?? file.type}` : ''}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <EmptyBlock title="No attachments yet" description="Files uploaded from Edit Task will appear here." />
        )}
      </Card>

      <Card title="Latest Activity">
        {latestActivity ? (
          <TimelineRow
            item={{
              title: formatActivityTitle(latestActivity.action),
              detail: latestActivity.description,
              time: formatActivityDateTime(latestActivity.createdAt),
            }}
            color={activityColor(latestActivity.action, colors)}
          />
        ) : (
          <EmptyBlock title="No activity yet" description="Changes will appear here as you update the task." />
        )}
      </Card>

      <TaskStatusWorkflowSheet
        visible={isStatusSheetVisible}
        status={status}
        progress={progress}
        hasSubtasks={subtaskItems.length > 0}
        subtasksComplete={subtaskItems.length === 0 || completedSubtasks === subtaskItems.length}
        subtaskProgress={subtaskItems.length ? Math.round((completedSubtasks / subtaskItems.length) * 100) : 0}
        completedSubtasksCount={completedSubtasks}
        totalSubtasksCount={subtaskItems.length}
        onClose={() => setIsStatusSheetVisible(false)}
        onSave={(next) => void saveStatus(next)}
      />
      {task ? (
        <SubtaskDetailSheet
          visible={detailSubtaskId !== null}
          task={{ ...task, subtasks: subtaskItems }}
          subtask={detailSubtask}
          accessToken={accessToken}
          onClose={() => setDetailSubtaskId(null)}
          onEdit={() => {
            setDetailSubtaskId(null);
            onEdit?.();
          }}
          onTaskUpdated={(updated) => {
            setSubtaskItems(updated.subtasks);
            setProgress(updated.progress);
            setStatus(toTaskStatus(updated));
            setActivityItems(updated.activities);
            onTaskUpdated?.(updated);
          }}
        />
      ) : null}
    </AppScreen>
  );
}

function Card({ title, children }: { title?: string; children: ReactNode }) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <SectionCard className="mb-3">
      {title ? <Text className="mb-3 text-base font-black" style={{ color: colors.text }}>{title}</Text> : null}
      {children}
    </SectionCard>
  );
}

function EmptyBlock({ title, description }: { title: string; description: string }) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View className="rounded-2xl border border-dashed p-4" style={{ backgroundColor: colors.background, borderColor: colors.border }}>
      <Text className="text-center font-black" style={{ color: colors.text }}>{title}</Text>
      <Text className="mt-1 text-center text-sm" style={{ color: colors.secondaryText }}>{description}</Text>
    </View>
  );
}

function AutomationRow({ label, value, isLast }: { label: string; value: string; isLast?: boolean }) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View
      className="flex-row items-center justify-between gap-3 py-2.5"
      style={!isLast ? { borderBottomWidth: 1, borderBottomColor: colors.border } : undefined}
    >
      <Text className="text-sm font-bold" style={{ color: colors.text }}>{label}</Text>
      <Text className="flex-1 text-end text-xs" style={{ color: colors.secondaryText }} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View className="rounded-full px-2 py-1" style={{ backgroundColor: `${color}33` }}>
      <Text className="text-[11px] font-black" style={{ color }}>
        {label}
      </Text>
    </View>
  );
}

function toTaskStatus(task?: ApiTask | null): TaskStatus {
  return task ? (toUiStatus(task.status) as TaskStatus) : 'To Do';
}

function toDependencyTasks(items?: ApiTask[] | ApiTask['dependencies']): DependencyTask[] {
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

function formatFileSize(size?: number | string) {
  const value = typeof size === 'string' ? Number(size) : size;
  if (!value || Number.isNaN(value)) return '';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentLabel(type?: string, fileName?: string) {
  const normalized = `${type ?? ''} ${fileName ?? ''}`.toLowerCase();
  if (normalized.includes('pdf')) return 'PDF';
  if (normalized.includes('image') || normalized.match(/\.(png|jpe?g|gif|webp)$/)) return 'IMG';
  if (normalized.match(/\.(docx?|txt)$/) || normalized.includes('word')) return 'DOC';
  if (normalized.match(/\.(xlsx?|csv)$/) || normalized.includes('sheet') || normalized.includes('excel')) return 'XLS';
  if (normalized.match(/\.(pptx?)$/) || normalized.includes('powerpoint')) return 'SLD';
  return 'FILE';
}

function attachmentColor(type?: string, fileName?: string) {
  const normalized = `${type ?? ''} ${fileName ?? ''}`.toLowerCase();
  if (normalized.includes('pdf')) return 'bg-red-500';
  if (normalized.includes('image') || normalized.match(/\.(png|jpe?g|gif|webp)$/)) return 'bg-green-500';
  if (normalized.match(/\.(xlsx?|csv)$/) || normalized.includes('sheet') || normalized.includes('excel')) return 'bg-blue-500';
  if (normalized.match(/\.(docx?|txt)$/) || normalized.includes('word')) return 'bg-indigo-500';
  return 'bg-orange-500';
}

function formatActivityDateTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
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
    <View className="flex-row items-center justify-between rounded-xl px-3 py-2" style={{ backgroundColor: colors.background }}>
      <Text className="text-[10px] font-bold uppercase tracking-wide" style={{ color: colors.secondaryText }}>{label}</Text>
      <Text className="text-sm font-bold" style={{ color: colors.text }}>{value}</Text>
    </View>
  );
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  const { theme } = useTheme();

  return (
    <View className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: theme.colors.progressTrack }}>
      <View className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: color }} />
    </View>
  );
}

const SubtaskRow = memo(function SubtaskRow({
  item,
  onToggle,
  onOpen,
}: {
  item: ApiSubtask;
  onToggle: (item: ApiSubtask) => void;
  onOpen: (item: ApiSubtask) => void;
}) {
  const { theme } = useTheme();
  const { colors } = theme;
  const done = item.isDone || item.status === 'done';
  const indicator = getSubtaskIndicator(item);
  const estimate = formatDuration(item.estimatedDurationMinutes);
  const due = formatSubtaskDue(item.dueDate);

  return (
    <Pressable
      onPress={() => onOpen(item)}
      className="mb-2 flex-row items-start gap-3 rounded-xl p-3"
      style={{ backgroundColor: colors.background }}
    >
      <Pressable
        onPress={() => onToggle(item)}
        accessibilityRole="button"
        accessibilityLabel={done ? 'Mark subtask as not done' : 'Mark subtask as done'}
        className="mt-0.5 h-5 w-5 items-center justify-center rounded-md border"
        style={{ borderColor: done ? colors.success : colors.border, backgroundColor: done ? colors.success : 'transparent' }}
      >
        {done ? <Text className="text-[10px] font-black" style={{ color: colors.accentText }}>✓</Text> : null}
      </Pressable>

      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <View className="h-2 w-2 rounded-full" style={{ backgroundColor: SUBTASK_INDICATOR_COLOR[indicator] }} />
          <Text
            className={`flex-1 text-sm font-bold ${done ? 'line-through' : ''}`}
            style={{ color: done ? colors.secondaryText : colors.text }}
          >
            {item.title}
          </Text>
        </View>

        {(due || estimate) && !done ? (
          <Text className="mt-1 text-xs" style={{ color: colors.secondaryText }}>
            {due}
            {due && estimate ? ' • ' : ''}
            {estimate ? `Est. ${estimate}` : ''}
          </Text>
        ) : null}

        <View className="mt-1.5 flex-row flex-wrap items-center gap-1.5">
          <View className="rounded-md px-1.5 py-0.5" style={{ backgroundColor: `${SUBTASK_PRIORITY_COLOR[item.priority]}22` }}>
            <Text className="text-[10px] font-bold" style={{ color: SUBTASK_PRIORITY_COLOR[item.priority] }}>
              {SUBTASK_PRIORITY_LABEL[item.priority]}
            </Text>
          </View>
          <View className="rounded-md px-1.5 py-0.5" style={{ backgroundColor: `${colors.secondaryText}18` }}>
            <Text className="text-[10px] font-bold" style={{ color: colors.secondaryText }}>
              {SUBTASK_STATUS_LABEL[item.status]}
            </Text>
          </View>
          {item.estimatedDurationSource === 'ai' && item.estimatedDurationMinutes ? (
            <View className="rounded-md px-1.5 py-0.5" style={{ backgroundColor: `${colors.accent}22` }}>
              <Text className="text-[10px] font-bold" style={{ color: colors.accent }}>AI Estimate</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
});

function formatSubtaskDue(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Today • ${time}`;
  return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} • ${time}`;
}

const DependencyRow = memo(function DependencyRow({ item }: { item: DependencyTask }) {
  const { theme } = useTheme();
  const { colors } = theme;
  const color = getDependencyStatusColor(item.status, colors);

  return (
    <View className="mb-2 flex-row items-center gap-3">
      <View className="h-7 w-7 items-center justify-center rounded-full" style={{ backgroundColor: colors.background }}>
        <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      </View>
      <View className="flex-1 rounded-xl p-3" style={{ backgroundColor: colors.background }}>
        <View className="flex-row items-start justify-between gap-2">
          <View className="flex-1">
            <Text className="text-sm font-bold" style={{ color: colors.text }}>{item.title}</Text>
            <Text className="mt-0.5 text-xs" style={{ color: colors.secondaryText }}>
              {item.category} - Due {item.dueDate}
            </Text>
          </View>
          <Badge label={item.status} color={color} />
        </View>
        <Text className="mt-2 text-xs font-bold" style={{ color: colors.secondaryText }}>
          {item.priority} Priority
        </Text>
      </View>
    </View>
  );
});

function getDependencyStatusColor(
  status: DependencyTask['status'],
  colors: ReturnType<typeof useTheme>['theme']['colors'],
) {
  if (status === 'Done') return colors.success;
  if (status === 'Missed' || status === 'Blocked') return colors.error;
  if (status === 'In Progress') return colors.primary;
  return colors.secondaryText;
}

const TimelineRow = memo(function TimelineRow({
  item,
  color,
}: {
  item: { title: string; detail: string; time: string };
  color: string;
}) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View className="flex-row gap-3">
      <View className="mt-1 h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
      <View className="flex-1">
        <Text className="text-sm font-black" style={{ color: colors.text }}>{item.title}</Text>
        <Text className="mt-0.5 text-xs" style={{ color: colors.secondaryText }}>{item.detail}</Text>
        <Text className="mt-1 text-xs font-bold" style={{ color: colors.accent }}>{item.time}</Text>
      </View>
    </View>
  );
});
