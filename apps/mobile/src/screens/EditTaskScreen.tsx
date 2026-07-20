import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import { Alert, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import TaskAttachmentPicker from '../components/TaskAttachmentPicker';
import {
  AppScreen,
  BottomActionBar,
  DangerButton,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
} from '../components/layout';
import {
  TaskRecurrenceSheet,
  createRecurrenceSummary,
  type RecurrenceSettings,
} from '../components/TaskRecurrenceSheet';
import { useTheme } from '../theme/useTheme';
import { ManageMembersSection } from '../features/collaboration/components/ManageMembersSection';
import { ReminderAudienceSection } from '../features/collaboration/components/ReminderAudienceSection';
import { FocusAudienceSection } from '../features/collaboration/components/FocusAudienceSection';
import {
  deleteAttachment,
  getAttachments,
  recurrenceToApi,
  recurrenceToUi,
  toApiPriority,
  toApiStatus,
  toUiPriority,
  toUiStatus,
  uploadAttachment,
  type ApiTask,
  type ApiTaskAttachment,
  type TaskPayload,
} from '../lib/tasksApi';
import { createTaskDeleteConfirmationController } from '../features/tasks/taskDeleteConfirmation';
import { useUnsavedBackGuard } from '../navigation/useUnsavedBackGuard';
import { SubtaskManagementSection } from '../components/SubtaskManagementSection';
import { DependencyManagementSection } from '../components/DependencyManagementSection';
import { TASK_REMINDER_OPTIONS, canScheduleTaskReminder, validateTaskReminder } from './editTaskReminder';

type Props = {
  task: ApiTask | null;
  tasks?: ApiTask[];
  accessToken?: string;
  currentUserId?: string;
  onRefresh?: () => void;
  onBack: () => void;
  onCancel: () => void;
  onDelete: () => Promise<void> | void;
  onSave: (payload: TaskPayload) => Promise<ApiTask | undefined> | ApiTask | void;
  onSaved?: (task: ApiTask) => void;
  onSubtasksUpdated?: (task: ApiTask) => void;
  onDependenciesUpdated?: (task: ApiTask) => void;
  onPermissionDenied?: () => void;
  onOpenAiCollaboration?: () => void;
  onLifecycleChange?: (state: EditTaskLifecycleState) => void;
};

export type EditTaskLifecycleState = {
  isDirty: boolean;
  isSubmitting: boolean;
  error: string;
  lastSuccess?: 'saved';
};

const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'] as const;
const STATUSES = ['To Do', 'In Progress', 'Done', 'Missed'] as const;
const CATEGORIES = ['Work', 'Personal', 'Study', 'Health', 'Finance', 'General'];

function toDateInput(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatDateLabel(date: Date | undefined) {
  if (!date) return 'Select date...';
  return new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

function formatTimeLabel(time: string) {
  if (!time) return '--:--';
  const [hoursStr, minutesStr] = time.split(':');
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return time;
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`;
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

export default function EditTaskScreen({
  task,
  tasks = [],
  accessToken,
  currentUserId = '',
  onRefresh,
  onBack,
  onCancel,
  onDelete,
  onSave,
  onSaved,
  onSubtasksUpdated,
  onDependenciesUpdated,
  onPermissionDenied,
  onOpenAiCollaboration,
  onLifecycleChange,
}: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;
  const deleteConfirmationRef = useRef<ReturnType<typeof createTaskDeleteConfirmationController> | null>(null);
  if (!deleteConfirmationRef.current) {
    deleteConfirmationRef.current = createTaskDeleteConfirmationController(
      async () => {
        await onDeleteRef.current();
      },
      Alert.alert,
    );
  }

  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [category, setCategory] = useState(task?.category || 'General');
  const [status, setStatus] = useState(task ? toUiStatus(task.status) : 'To Do');
  const [priority, setPriority] = useState(task ? toUiPriority(task.priority) : 'Medium');
  const [dueDate, setDueDate] = useState<Date | undefined>(toDateInput(task?.dueDate));
  const [dueTime, setDueTime] = useState(task?.dueTime ?? '');
  const [reminderEnabled, setReminderEnabled] = useState(task?.reminderEnabled ?? false);
  const [reminderBeforeMinutes, setReminderBeforeMinutes] = useState(task?.reminderBeforeMinutes ?? 30);
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [estimatedHours, setEstimatedHours] = useState(String(task?.estimatedHours ?? 0));
  const [spentHours, setSpentHours] = useState(String(task?.spentHours ?? 0));
  const [recurrence, setRecurrence] = useState<RecurrenceSettings | null>(
    task ? recurrenceToUi(task.recurrence) : null,
  );
  const [isRecurrenceSheetVisible, setIsRecurrenceSheetVisible] = useState(false);
  const [iosPicker, setIosPicker] = useState<'date' | 'time' | null>(null);
  const [focusEnabled, setFocusEnabled] = useState(task?.isFocusTask ?? false);
  const [error, setError] = useState('');
  const [lastSuccess, setLastSuccess] = useState<'saved' | undefined>(undefined);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [attachments, setAttachments] = useState<ApiTaskAttachment[]>([]);
  const deletingAttachmentIdsRef = useRef(new Set<string>());
  const [draftAttachments, setDraftAttachments] = useState<DocumentPicker.DocumentPickerAsset[]>([]);
  const recurrenceSummary = createRecurrenceSummary(recurrence);

  // Snapshot of the task's editable fields as first loaded, used to detect
  // unsaved edits when the user presses Android hardware back.
  const initialValues = useMemo(
    () => ({
      title: task?.title ?? '',
      description: task?.description ?? '',
      category: task?.category || 'General',
      status: task ? toUiStatus(task.status) : 'To Do',
      priority: task ? toUiPriority(task.priority) : 'Medium',
      dueDateTime: toDateInput(task?.dueDate)?.getTime(),
      dueTime: task?.dueTime ?? '',
      reminderEnabled: task?.reminderEnabled ?? false,
      reminderBeforeMinutes: task?.reminderBeforeMinutes ?? 30,
      notes: task?.notes ?? '',
      estimatedHours: String(task?.estimatedHours ?? 0),
      spentHours: String(task?.spentHours ?? 0),
      focusEnabled: task?.isFocusTask ?? false,
      recurrenceSummary: createRecurrenceSummary(task ? recurrenceToUi(task.recurrence) : null),
    }),
    [task],
  );

  const hasUnsavedChanges =
    title !== initialValues.title ||
    description !== initialValues.description ||
    category !== initialValues.category ||
    status !== initialValues.status ||
    priority !== initialValues.priority ||
    dueDate?.getTime() !== initialValues.dueDateTime ||
    dueTime !== initialValues.dueTime ||
    reminderEnabled !== initialValues.reminderEnabled ||
    reminderBeforeMinutes !== initialValues.reminderBeforeMinutes ||
    notes !== initialValues.notes ||
    estimatedHours !== initialValues.estimatedHours ||
    spentHours !== initialValues.spentHours ||
    focusEnabled !== initialValues.focusEnabled ||
    recurrenceSummary !== initialValues.recurrenceSummary ||
    draftAttachments.length > 0;

  useEffect(() => {
    onLifecycleChange?.({ isDirty: hasUnsavedChanges, isSubmitting: saving || uploadingAttachments, error, lastSuccess });
  }, [error, hasUnsavedChanges, lastSuccess, onLifecycleChange, saving, uploadingAttachments]);

  const { confirmLeave } = useUnsavedBackGuard({
    isDirty: hasUnsavedChanges && !saving,
    onLeave: onCancel,
    title: 'Discard changes?',
    message: 'Your edits have not been saved. Discard them?',
  });

  function confirmDeleteAttachment(file: ApiTaskAttachment) {
    if (!task) return;
    const fileName = file.fileName ?? file.name ?? 'This file';
    Alert.alert('Delete attachment?', `"${fileName}" cannot be recovered after deletion.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (!accessToken || !file.id || deletingAttachmentIdsRef.current.has(file.id)) return;
          deletingAttachmentIdsRef.current.add(file.id);
          const previous = attachments;
          setAttachments((current) => current.filter((item) => item.id !== file.id));
          void deleteAttachment(accessToken, task.id, file.id)
            .catch((deleteError: unknown) => {
              setAttachments(previous);
              setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete attachment.');
            })
            .finally(() => deletingAttachmentIdsRef.current.delete(file.id!));
        },
      },
    ]);
  }

  useEffect(() => {
    if (!task || !accessToken) return;

    let cancelled = false;
    getAttachments(accessToken, task.id)
      .then((items) => {
        if (!cancelled) setAttachments(items);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load attachments.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [task, accessToken]);

  // Viewers can never reach this screen intentionally (the Edit button and
  // the navigation gate both hide it), but this is the last line of
  // defense: any other path that lands here with a non-editor role bounces
  // straight back out before rendering an editable form.
  const canEditShared = task
    ? task.viewerRole === 'owner' || task.viewerRole === 'editor' || task.canEdit === true
    : true;

  useEffect(() => {
    if (task && !canEditShared) {
      onPermissionDenied?.();
    }
  }, [task, canEditShared, onPermissionDenied]);

  const openDatePicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: dueDate ?? new Date(),
        mode: 'date',
        onChange: (event: DateTimePickerEvent, selected?: Date) => {
          if (event.type === 'set' && selected) setDueDate(selected);
        },
      });
      return;
    }
    setIosPicker('date');
  };

  const openTimePicker = () => {
    const initial = new Date();
    if (dueTime) {
      const [h, m] = dueTime.split(':').map(Number);
      if (!Number.isNaN(h)) initial.setHours(h, m || 0, 0, 0);
    }

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: initial,
        mode: 'time',
        is24Hour: false,
        onChange: (event: DateTimePickerEvent, selected?: Date) => {
          if (event.type === 'set' && selected) {
            setDueTime(`${String(selected.getHours()).padStart(2, '0')}:${String(selected.getMinutes()).padStart(2, '0')}`);
          }
        },
      });
      return;
    }
    setIosPicker('time');
  };

  async function handleSave() {
    if (!task) return;
    if (!title.trim()) {
      setError('Task title is required.');
      return;
    }
    const reminderError = validateTaskReminder(reminderEnabled, dueDate, dueTime);
    if (reminderError) { setError(reminderError); return; }

    setSaving(true);
    setError('');

    const estimatedTimeMinutes = Math.round((Number(estimatedHours) || 0) * 60);
    const spentTimeMinutes = Math.round((Number(spentHours) || 0) * 60);

    try {
      const updatedTask = await onSave({
        title: title.trim(),
        description: description.trim(),
        category: category.trim(),
        status: toApiStatus(status),
        priority: toApiPriority(priority),
        dueDate: dueDate ? dueDate.toISOString() : undefined,
        dueTime,
        reminderEnabled,
        reminderBeforeMinutes: reminderEnabled ? reminderBeforeMinutes : undefined,
        notes: notes.trim(),
        estimatedTimeMinutes,
        spentTimeMinutes,
        remainingTimeMinutes: Math.max(estimatedTimeMinutes - spentTimeMinutes, 0),
        isFocusTask: focusEnabled,
        recurrence: recurrenceToApi(recurrence),
      });

      if (!updatedTask) return;

      if (draftAttachments.length && accessToken) {
        setUploadingAttachments(true);
        for (const file of draftAttachments) {
          await uploadAttachment(accessToken, task.id, {
            uri: file.uri,
            name: file.name ?? 'attachment',
            type: file.mimeType ?? 'application/octet-stream',
          });
        }
        const refreshedAttachments = await getAttachments(accessToken, task.id);
        setAttachments(refreshedAttachments);
        setDraftAttachments([]);
      }

      setLastSuccess('saved');
      onSaved?.(updatedTask);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save task changes.');
    } finally {
      setUploadingAttachments(false);
      setSaving(false);
    }
  }

  if (!task) {
    return (
      <AppScreen>
        <PageHeader title="Edit Task" subtitle="No task selected" onBack={onBack} />
        <SectionCard className="mb-3">
          <Text style={{ color: colors.secondaryText }}>This task could not be loaded. Go back and try again.</Text>
        </SectionCard>
      </AppScreen>
    );
  }

  if (!canEditShared) {
    return null;
  }

  function showNotice(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(''), 3000);
  }

  return (
    <AppScreen
      keyboardAvoiding
      footer={
        <BottomActionBar>
          <View className="flex-1 gap-3">
            <View className="flex-row gap-3">
              <SecondaryButton onPress={confirmLeave} className="flex-1">
                Cancel Changes
              </SecondaryButton>
            </View>
            <PrimaryButton onPress={() => void handleSave()} fullWidth disabled={saving || uploadingAttachments}>
              {saving || uploadingAttachments ? 'Saving...' : 'Save Changes'}
            </PrimaryButton>
          </View>
        </BottomActionBar>
      }
    >
      <PageHeader title="Edit Task" subtitle="Update existing task" onBack={confirmLeave} />

      {notice ? (
        <View className="mb-3 rounded-xl px-3 py-2" style={{ backgroundColor: `${colors.success}26` }}>
          <Text style={{ color: colors.success }} className="text-xs font-semibold">
            ✓ {notice}
          </Text>
        </View>
      ) : null}

      <Card title="Task Information">
        <Label text="Task Title" />
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholderTextColor={colors.placeholder}
          className="mb-3 rounded-xl border px-3 py-2.5 text-sm"
          style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }}
        />

        <Label text="Description" />
        <TextInput
          multiline
          value={description}
          onChangeText={setDescription}
          placeholderTextColor={colors.placeholder}
          textAlignVertical="top"
          className="mb-3 h-24 rounded-xl border px-3 py-2.5 text-sm"
          style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }}
        />

        <Label text="Category" />
        <View className="flex-row flex-wrap gap-2">
          {CATEGORIES.map((item) => (
            <Chip key={item} label={item} active={category === item} onPress={() => setCategory(item)} />
          ))}
        </View>
        {error ? <Text className="mt-2 text-sm font-bold text-red-300">{error}</Text> : null}
      </Card>

      <Card title="Subtasks">
        <SubtaskManagementSection
          task={task}
          accessToken={accessToken ?? ''}
          canEdit={canEditShared}
          onError={setError}
          onTaskUpdated={(updated) => {
            onSubtasksUpdated?.(updated);
            onRefresh?.();
          }}
        />
      </Card>

      <Card title="Dependencies">
        <DependencyManagementSection task={task} tasks={tasks} accessToken={accessToken ?? ''} canEdit={canEditShared} onError={setError} onTaskUpdated={(updated) => { onDependenciesUpdated?.(updated); onRefresh?.(); }} />
      </Card>

      <Card title="Task Settings">
        <Label text="Priority" />
        <View className="mb-3 flex-row flex-wrap gap-2">
          {PRIORITIES.map((item) => (
            <Segment
              key={item}
              label={item}
              active={priority === item}
              color={item === 'Low' ? colors.success : item === 'High' || item === 'Urgent' ? colors.error : colors.warning}
              onPress={() => setPriority(item)}
            />
          ))}
        </View>

        <Label text="Status" />
        <View className="mb-3 flex-row flex-wrap gap-2">
          {STATUSES.map((item) => (
            <Chip key={item} label={item} active={status === item} onPress={() => setStatus(item)} />
          ))}
        </View>

        <View className="flex-row gap-2">
          <View className="flex-1">
            <Label text="Due Date" />
            <Select label={formatDateLabel(dueDate)} onPress={openDatePicker} />
          </View>
          <View className="flex-1">
            <Label text="Due Time" />
            <Select label={formatTimeLabel(dueTime)} onPress={openTimePicker} />
          </View>
        </View>
      </Card>

      <Card title="Progress & Time Estimation">
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Label text="Estimated Hours" />
            <TextInput
              value={estimatedHours}
              onChangeText={setEstimatedHours}
              keyboardType="numeric"
              placeholderTextColor={colors.placeholder}
              className="mb-3 rounded-xl border px-3 py-2.5 text-sm"
              style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }}
            />
          </View>
          <View className="flex-1">
            <Label text="Spent Hours" />
            <TextInput
              value={spentHours}
              onChangeText={setSpentHours}
              keyboardType="numeric"
              placeholderTextColor={colors.placeholder}
              className="mb-3 rounded-xl border px-3 py-2.5 text-sm"
              style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }}
            />
          </View>
        </View>
        <Text className="text-xs" style={{ color: colors.secondaryText }}>
          Remaining time is recalculated automatically from estimated minus spent.
        </Text>
      </Card>

      <Card title="Notes">
        <TextInput
          multiline
          value={notes}
          onChangeText={setNotes}
          placeholderTextColor={colors.placeholder}
          textAlignVertical="top"
          className="h-20 rounded-xl border px-3 py-2.5 text-sm"
          style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }}
        />
      </Card>

      <Card title="Attachments">
        <TaskAttachmentPicker
          files={draftAttachments}
          onChange={setDraftAttachments}
          disabled={saving || uploadingAttachments}
          onValidationError={setError}
        />
        <View className="mt-3 gap-2">
          {attachments.map((file) => (
            <View key={file.id ?? file.fileName ?? file.name} className="flex-row items-center gap-3 rounded-xl p-3" style={{ backgroundColor: colors.card }}>
              <View className={`h-9 w-9 items-center justify-center rounded-lg ${attachmentColor(file.fileType ?? file.type, file.fileName ?? file.name)}`}>
                <Text className="text-[9px] font-black text-white">{attachmentLabel(file.fileType ?? file.type, file.fileName ?? file.name)}</Text>
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
              <Pressable
                onPress={() => confirmDeleteAttachment(file)}
                className="rounded-lg px-3 py-1.5 active:opacity-80"
                style={{ backgroundColor: `${colors.error}22` }}
              >
                <Text className="text-xs font-bold" style={{ color: colors.error }}>
                  Delete
                </Text>
              </Pressable>
            </View>
          ))}
          {!attachments.length ? (
            <Text className="text-sm" style={{ color: colors.secondaryText }}>
              No attachments yet.
            </Text>
          ) : null}
        </View>
      </Card>

      <Card title="Recurring Task">
        <Label text="Repeat" />
        <Select label={recurrenceSummary} onPress={() => setIsRecurrenceSheetVisible(true)} />
      </Card>

      <Card title="Reminder">
        <View className="mb-3 flex-row items-center justify-between">
          <View><Text className="text-sm font-bold" style={{ color: colors.text }}>Enable task reminder</Text><Text className="text-xs" style={{ color: colors.secondaryText }}>{canScheduleTaskReminder(dueDate, dueTime) ? 'Remind before this task is due.' : 'Set a due date and time to enable reminders.'}</Text></View>
          <Pressable disabled={!canScheduleTaskReminder(dueDate, dueTime)} accessibilityRole="switch" accessibilityState={{ checked: reminderEnabled, disabled: !canScheduleTaskReminder(dueDate, dueTime) }} accessibilityLabel="Enable task reminder" onPress={() => setReminderEnabled((enabled) => !enabled)} className="h-6 w-11 justify-center rounded-full px-1" style={{ backgroundColor: reminderEnabled ? colors.accent : colors.border, opacity: canScheduleTaskReminder(dueDate, dueTime) ? 1 : 0.5 }}><View className={`h-4 w-4 rounded-full bg-white ${reminderEnabled ? 'self-end' : 'self-start'}`} /></Pressable>
        </View>
        <Label text="Reminder lead time" />
        <Select label={`${TASK_REMINDER_OPTIONS.includes(reminderBeforeMinutes as never) ? reminderBeforeMinutes : 30} minutes before`} onPress={() => reminderEnabled && Alert.alert('Reminder lead time', 'Choose when to be reminded', TASK_REMINDER_OPTIONS.map((value) => ({ text: value === 60 ? '1 hour before' : value === 1440 ? '1 day before' : `${value} minutes before`, onPress: () => setReminderBeforeMinutes(value) })))} />
        <ReminderAudienceSection
          taskId={task.id}
          canEditShared={canEditShared}
          onError={setError}
          onNotice={showNotice}
        />
      </Card>

      <Card title="Focus">
        <FocusAudienceSection
          taskId={task.id}
          canEditShared={canEditShared}
          focusEnabled={focusEnabled}
          onFocusEnabledChange={setFocusEnabled}
          onError={setError}
        />
      </Card>

      {currentUserId &&
      task &&
      (task.viewerRole === 'owner' ||
        task.viewerRole === 'editor' ||
        task.canEdit === true ||
        task.canManageMembers === true) ? (
        <ManageMembersSection task={task} currentUserId={currentUserId} onRefresh={onRefresh} />
      ) : null}

      {currentUserId && task && task.viewerRole === 'owner' && onOpenAiCollaboration ? (
        <Card title="AI Collaboration">
          <Text className="mb-3 text-sm" style={{ color: colors.secondaryText }}>
            See capacity, today's plan, progress, and AI suggestions for splitting this task fairly — you always
            approve before anything changes.
          </Text>
          <Pressable
            onPress={onOpenAiCollaboration}
            className="items-center rounded-lg px-4 py-2.5"
            style={{ backgroundColor: colors.accent }}
          >
            <Text className="font-black" style={{ color: colors.accentText }}>
              Open AI Collaboration
            </Text>
          </Pressable>
        </Card>
      ) : null}

      <Card title="Danger Zone">
        <Text className="mb-3 text-sm" style={{ color: colors.secondaryText }}>Deleting this task cannot be undone.</Text>
        <DangerButton onPress={() => deleteConfirmationRef.current?.requestConfirmation(task.title)} fullWidth>Delete Task</DangerButton>
      </Card>

      <TaskRecurrenceSheet
        visible={isRecurrenceSheetVisible}
        mode={recurrence ? 'edit' : 'create'}
        recurrence={recurrence}
        accessToken={accessToken}
        onClose={() => setIsRecurrenceSheetVisible(false)}
        onSave={setRecurrence}
        onRemove={() => setRecurrence(null)}
      />

      {Platform.OS !== 'android' && (
        <Modal visible={iosPicker !== null} transparent animationType="fade" onRequestClose={() => setIosPicker(null)}>
          <View className="flex-1 items-center justify-center bg-black/50 px-6">
            <View className="w-full rounded-3xl border p-4" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
              {iosPicker === 'date' ? (
                <DateTimePicker
                  value={dueDate ?? new Date()}
                  mode="date"
                  display="inline"
                  themeVariant={theme.mode}
                  accentColor={colors.accent}
                  onChange={(_event, selected) => selected && setDueDate(selected)}
                />
              ) : (
                <DateTimePicker
                  value={(() => {
                    const initial = new Date();
                    if (dueTime) {
                      const [h, m] = dueTime.split(':').map(Number);
                      if (!Number.isNaN(h)) initial.setHours(h, m || 0, 0, 0);
                    }
                    return initial;
                  })()}
                  mode="time"
                  display="spinner"
                  themeVariant={theme.mode}
                  accentColor={colors.accent}
                  onChange={(_event, selected) => {
                    if (selected) {
                      setDueTime(`${String(selected.getHours()).padStart(2, '0')}:${String(selected.getMinutes()).padStart(2, '0')}`);
                    }
                  }}
                />
              )}
              <View className="mt-2 flex-row justify-end">
                <Pressable
                  onPress={() => setIosPicker(null)}
                  className="rounded-full px-4 py-2.5 active:opacity-90"
                  style={{ backgroundColor: colors.accent }}
                >
                  <Text className="text-sm font-black" style={{ color: colors.accentText }}>Done</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </AppScreen>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <SectionCard className="mb-3">
      <Text className="mb-3 text-base font-black" style={{ color: colors.text }}>{title}</Text>
      {children}
    </SectionCard>
  );
}

function Label({ text }: { text: string }) {
  const { theme } = useTheme();

  return (
    <Text className="mb-1.5 text-xs font-black uppercase tracking-wide" style={{ color: theme.colors.secondaryText }}>
      {text}
    </Text>
  );
}

function Segment({ label, active, color, onPress }: { label: string; active?: boolean; color: string; onPress?: () => void }) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="rounded-xl border px-2 py-2 active:opacity-80"
      style={{
        borderColor: active ? colors.accent : colors.border,
        backgroundColor: active ? colors.accentSoft : colors.input,
      }}
    >
      <Text className="text-center text-xs font-bold" style={{ color: active ? colors.accent : color }}>{label}</Text>
    </Pressable>
  );
}

function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="rounded-full px-3 py-2 active:opacity-80"
      style={{ backgroundColor: active ? colors.accent : colors.input }}
    >
      <Text className="text-xs font-bold" style={{ color: active ? colors.accentText : colors.text }}>{label}</Text>
    </Pressable>
  );
}

function Select({ label, onPress }: { label: string; onPress?: () => void }) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="rounded-xl border px-3 py-2.5 active:opacity-80"
      style={{ borderColor: colors.border, backgroundColor: colors.input }}
    >
      <Text className="text-sm" style={{ color: colors.text }}>{label}</Text>
    </Pressable>
  );
}
