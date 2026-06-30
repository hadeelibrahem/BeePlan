import { useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import {
  AppScreen,
  BottomActionBar,
  DangerButton,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
} from '../components/layout';
import DeleteSubtaskModal from '../components/DeleteSubtaskModal';
import SubtaskFormModal, { type SubtaskFormValues } from '../components/SubtaskFormModal';
import { useTheme } from '../theme/useTheme';

type Props = {
  onBack: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onSave: () => void;
};

const initialSubtasks = [
  { title: 'Executive summary slide', done: true },
  { title: 'Q2 performance review data', done: true },
  { title: 'Channel allocation strategy', done: true },
  { title: 'Executive presentation rehearsal', done: false },
];

const dependencies = ['Finish market research report', 'Approve creative assets'];
const attachments = ['Q3_Marketing_Strategy_v3.pdf', 'competitor_analysis_2026.xlsx'];

export default function EditTaskScreen({ onBack, onCancel, onDelete, onSave }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;

  const [subtasks, setSubtasks] = useState(initialSubtasks);
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [editingSubtaskIndex, setEditingSubtaskIndex] = useState<number | null>(null);
  const [deletingSubtaskIndex, setDeletingSubtaskIndex] = useState<number | null>(null);

  const handleAddSubtask = (values: SubtaskFormValues) => {
    setSubtasks((current) => [...current, { title: values.title, done: false }]);
    setAddingSubtask(false);
  };

  const handleEditSubtask = (values: SubtaskFormValues) => {
    if (editingSubtaskIndex === null) return;
    setSubtasks((current) =>
      current.map((item, index) => (index === editingSubtaskIndex ? { ...item, title: values.title } : item)),
    );
    setEditingSubtaskIndex(null);
  };

  const handleConfirmDelete = () => {
    if (deletingSubtaskIndex === null) return;
    setSubtasks((current) => current.filter((_, index) => index !== deletingSubtaskIndex));
    setDeletingSubtaskIndex(null);
  };

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
            <PrimaryButton onPress={onSave} fullWidth>
              Save Changes
            </PrimaryButton>
          </View>
        </BottomActionBar>
      }
    >
      <PageHeader title="Edit Task" subtitle="Update existing task" onBack={onBack} />

      <Card title="Task Information">
        <Label text="Task Title" />
        <Input defaultValue="Finalize Q3 Marketing Strategy Deck" />

        <Label text="Description" />
        <Input
          multiline
          heightClass="h-32"
          defaultValue="Create a comprehensive marketing strategy presentation covering Q3 goals, channel allocation, budget breakdown, competitor analysis, and KPIs."
        />

        <Label text="Category" />
        <Select label="Marketing" />
      </Card>

      <Card title="Task Settings">
        <Label text="Priority" />
        <View className="mb-5 flex-row gap-2">
          <Segment label="Low" color={colors.success} />
          <Segment label="Medium" color={colors.warning} />
          <Segment active label="High" color={colors.error} />
        </View>

        <Label text="Status" />
        <View className="mb-5 flex-row flex-wrap gap-2">
          <Chip label="To Do" />
          <Chip active label="In Progress" />
          <Chip label="Done" />
          <Chip label="Missed" />
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1">
            <Label text="Due Date" />
            <Select label="2026-07-03" />
          </View>
          <View className="flex-1">
            <Label text="Due Time" />
            <Select label="5:00 PM" />
          </View>
        </View>
      </Card>

      <Card title="Progress Overview">
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-sm" style={{ color: colors.secondaryText }}>13 of 18 subtasks completed</Text>
          <Text className="text-3xl font-black" style={{ color: colors.accent }}>72%</Text>
        </View>
        <View className="h-3 overflow-hidden rounded-full" style={{ backgroundColor: colors.progressTrack }}>
          <View className="h-full w-[72%] rounded-full" style={{ backgroundColor: colors.accent }} />
        </View>
      </Card>

      <Card title="Editable Subtasks" action="+ Add" onAction={() => setAddingSubtask(true)}>
        {subtasks.map((item, index) => (
          <View
            key={item.title}
            className="mb-3 flex-row items-center gap-3 rounded-2xl border p-3"
            style={{ borderColor: colors.border, backgroundColor: colors.background }}
          >
            <View
              className="h-6 w-6 items-center justify-center rounded-lg border"
              style={{ borderColor: item.done ? colors.success : colors.border, backgroundColor: item.done ? colors.success : 'transparent' }}
            >
              {item.done ? <Text className="text-[9px] font-black" style={{ color: colors.accentText }}>✓</Text> : null}
            </View>
            <TextInput
              defaultValue={item.title}
              className="flex-1 rounded-xl px-3 py-2 text-sm"
              style={{ backgroundColor: colors.input, color: colors.text }}
            />
            <Pressable onPress={() => setEditingSubtaskIndex(index)} accessibilityRole="button" accessibilityLabel="Edit subtask">
              <Text className="text-xs font-black" style={{ color: colors.secondaryText }}>EDIT</Text>
            </Pressable>
            <Pressable onPress={() => setDeletingSubtaskIndex(index)} accessibilityRole="button" accessibilityLabel="Delete subtask">
              <Text className="text-xs font-black" style={{ color: colors.error }}>DEL</Text>
            </Pressable>
          </View>
        ))}
      </Card>

      <Card title="Reminder & Recurring">
        <Label text="Reminder" />
        <Select label="30 minutes before" />

        <Label text="Recurring Task" />
        <Select label="Every Monday" />
      </Card>

      <Card title="Dependencies" action="+ Add">
        {dependencies.map((item) => (
          <View key={item} className="mb-3 rounded-2xl border p-4" style={{ borderColor: colors.border, backgroundColor: colors.background }}>
            <Text className="font-bold" style={{ color: colors.text }}>{item}</Text>
            <Text className="mt-1 text-xs" style={{ color: colors.secondaryText }}>Connected task dependency</Text>
          </View>
        ))}
      </Card>

      <Card title="Notes">
        <Input multiline heightClass="h-28" defaultValue="Confirm the final budget numbers before exporting. Keep the deck direct and executive-friendly." />
      </Card>

      <Card title="Attachments" action="Upload">
        {attachments.map((item) => (
          <View
            key={item}
            className="mb-3 flex-row items-center gap-3 rounded-2xl border p-4"
            style={{ borderColor: colors.border, backgroundColor: colors.background }}
          >
            <View className="h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: colors.accent }}>
              <Text className="text-[9px] font-black" style={{ color: colors.accentText }}>FILE</Text>
            </View>
            <View className="flex-1">
              <Text className="font-bold" style={{ color: colors.text }}>{item}</Text>
              <Text className="text-xs" style={{ color: colors.secondaryText }}>Uploaded today</Text>
            </View>
            <Text className="text-xs font-black" style={{ color: colors.error }}>DEL</Text>
          </View>
        ))}
      </Card>

      <Card title="Activity Information">
        <InfoRow label="Created Date" value="2026-06-20" />
        <InfoRow label="Last Updated" value="2026-06-28" />
      </Card>

      <Card title="Time Tracking">
        <InfoRow label="Estimated Time" value="24h" />
        <InfoRow label="Time Spent" value="16h" />
        <InfoRow label="Remaining Time" value="8h" />
      </Card>

      <SubtaskFormModal
        visible={addingSubtask}
        mode="add"
        onCancel={() => setAddingSubtask(false)}
        onSubmit={handleAddSubtask}
      />

      <SubtaskFormModal
        visible={editingSubtaskIndex !== null}
        mode="edit"
        initialValues={editingSubtaskIndex !== null ? { title: subtasks[editingSubtaskIndex]?.title } : undefined}
        onCancel={() => setEditingSubtaskIndex(null)}
        onDelete={() => {
          setDeletingSubtaskIndex(editingSubtaskIndex);
          setEditingSubtaskIndex(null);
        }}
        onSubmit={handleEditSubtask}
      />

      <DeleteSubtaskModal
        visible={deletingSubtaskIndex !== null}
        subtaskTitle={deletingSubtaskIndex !== null ? subtasks[deletingSubtaskIndex]?.title : undefined}
        onCancel={() => setDeletingSubtaskIndex(null)}
        onConfirm={handleConfirmDelete}
      />
    </AppScreen>
  );
}

function Card({ title, action, onAction, children }: { title: string; action?: string; onAction?: () => void; children: ReactNode }) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <SectionCard className="mb-5">
      <View className="mb-5 flex-row items-center justify-between">
        <Text className="text-lg font-black" style={{ color: colors.text }}>{title}</Text>
        {action ? (
          <Pressable onPress={onAction} accessibilityRole="button" accessibilityLabel={action} className="active:opacity-70">
            <Text className="text-sm font-black" style={{ color: colors.accent }}>{action}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </SectionCard>
  );
}

function Label({ text }: { text: string }) {
  const { theme } = useTheme();

  return (
    <Text className="mb-2 text-xs font-black uppercase tracking-wide" style={{ color: theme.colors.secondaryText }}>
      {text}
    </Text>
  );
}

function Input({ defaultValue, multiline, heightClass = '' }: { defaultValue: string; multiline?: boolean; heightClass?: string }) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <TextInput
      defaultValue={defaultValue}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : undefined}
      className={`mb-5 rounded-2xl border px-4 py-4 text-sm ${heightClass}`}
      style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }}
    />
  );
}

function Select({ label }: { label: string }) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      className="mb-5 rounded-2xl border px-4 py-4 active:opacity-80"
      style={{ borderColor: colors.border, backgroundColor: colors.input }}
    >
      <Text className="font-bold" style={{ color: colors.text }}>{label}</Text>
    </Pressable>
  );
}

function Segment({ label, active, color }: { label: string; active?: boolean; color: string }) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-1 rounded-2xl border px-3 py-3 active:opacity-80"
      style={{
        borderColor: active ? colors.accent : colors.border,
        backgroundColor: active ? colors.accentSoft : colors.input,
      }}
    >
      <Text className="text-center text-xs font-black" style={{ color }}>{label}</Text>
    </Pressable>
  );
}

function Chip({ label, active }: { label: string; active?: boolean }) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      className="rounded-full border px-4 py-3 active:opacity-80"
      style={{ borderColor: active ? colors.accent : colors.border, backgroundColor: active ? colors.accent : colors.input }}
    >
      <Text className="text-xs font-black" style={{ color: active ? colors.accentText : colors.text }}>{label}</Text>
    </Pressable>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View className="mb-3 flex-row items-center justify-between rounded-2xl p-4" style={{ backgroundColor: colors.background }}>
      <Text className="text-xs font-black uppercase" style={{ color: colors.secondaryText }}>{label}</Text>
      <Text className="font-black" style={{ color: colors.text }}>{value}</Text>
    </View>
  );
}
