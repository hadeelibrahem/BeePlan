import { useState, type ReactNode } from 'react';
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
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
import {
  recurrenceToApi,
  recurrenceToUi,
  toApiPriority,
  toApiStatus,
  toUiPriority,
  toUiStatus,
  type ApiTask,
  type TaskPayload,
} from '../lib/tasksApi';

type Props = {
  task: ApiTask | null;
  onBack: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onSave: (payload: TaskPayload) => Promise<void> | void;
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

export default function EditTaskScreen({ task, onBack, onCancel, onDelete, onSave }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;

  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [category, setCategory] = useState(task?.category || 'General');
  const [status, setStatus] = useState(task ? toUiStatus(task.status) : 'To Do');
  const [priority, setPriority] = useState(task ? toUiPriority(task.priority) : 'Medium');
  const [dueDate, setDueDate] = useState<Date | undefined>(toDateInput(task?.dueDate));
  const [dueTime, setDueTime] = useState(task?.dueTime ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [estimatedHours, setEstimatedHours] = useState(String(task?.estimatedHours ?? 0));
  const [spentHours, setSpentHours] = useState(String(task?.spentHours ?? 0));
  const [recurrence, setRecurrence] = useState<RecurrenceSettings | null>(
    task ? recurrenceToUi(task.recurrence) : null,
  );
  const [isRecurrenceSheetVisible, setIsRecurrenceSheetVisible] = useState(false);
  const [iosPicker, setIosPicker] = useState<'date' | 'time' | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const recurrenceSummary = createRecurrenceSummary(recurrence);

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

    setSaving(true);
    setError('');

    const estimatedTimeMinutes = Math.round((Number(estimatedHours) || 0) * 60);
    const spentTimeMinutes = Math.round((Number(spentHours) || 0) * 60);

    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        category: category.trim(),
        status: toApiStatus(status),
        priority: toApiPriority(priority),
        dueDate: dueDate ? dueDate.toISOString() : undefined,
        dueTime,
        notes: notes.trim(),
        estimatedTimeMinutes,
        spentTimeMinutes,
        remainingTimeMinutes: Math.max(estimatedTimeMinutes - spentTimeMinutes, 0),
        recurrence: recurrenceToApi(recurrence),
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save task changes.');
    } finally {
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

  return (
    <AppScreen
      keyboardAvoiding
      footer={
        <BottomActionBar>
          <View className="flex-1 gap-3">
            <View className="flex-row gap-3">
              <DangerButton onPress={onDelete} className="flex-1">
                Delete Task
              </DangerButton>
              <SecondaryButton onPress={onCancel} className="flex-1">
                Cancel Changes
              </SecondaryButton>
            </View>
            <PrimaryButton onPress={() => void handleSave()} fullWidth disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </PrimaryButton>
          </View>
        </BottomActionBar>
      }
    >
      <PageHeader title="Edit Task" subtitle="Update existing task" onBack={onBack} />

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

      <Card title="Recurring Task">
        <Label text="Repeat" />
        <Select label={recurrenceSummary} onPress={() => setIsRecurrenceSheetVisible(true)} />
      </Card>

      <TaskRecurrenceSheet
        visible={isRecurrenceSheetVisible}
        mode={recurrence ? 'edit' : 'create'}
        recurrence={recurrence}
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
