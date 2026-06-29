import { useState, type ReactNode } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import BeePlanLogo from '../components/BeePlanLogo';
import DeleteSubtaskModal from '../components/DeleteSubtaskModal';
import SubtaskFormModal, { type SubtaskFormValues } from '../components/SubtaskFormModal';

type Props = {
  onBack: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onSave: () => void;
};

const palette = {
  bg: '#1F2937',
  card: '#2B3443',
  input: '#2B3443',
  border: 'rgba(255,255,255,0.08)',
  accent: '#FDE64B',
  muted: '#94A3B8',
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
    <View className="flex-1" style={{ backgroundColor: palette.bg }}>
      <ScrollView className="px-5 pt-12" contentContainerStyle={{ paddingBottom: 140 }}>
        <View className="mb-6 flex-row items-center justify-between">
          <TouchableOpacity onPress={onBack} className="h-11 w-11 items-center justify-center rounded-2xl border" style={{ backgroundColor: palette.card, borderColor: palette.border }}>
            <Text className="text-xs font-black text-white">Back</Text>
          </TouchableOpacity>

          <View className="items-center">
            <BeePlanLogo size={42} iconOnly />
            <Text className="mt-1 text-xl font-black text-white">Edit Task</Text>
            <Text className="text-xs" style={{ color: palette.muted }}>Update existing task</Text>
          </View>

          <View className="h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: palette.accent }}>
            <Text className="font-black" style={{ color: palette.bg }}>AC</Text>
          </View>
        </View>

        <Card title="Task Information" code="INFO">
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

        <Card title="Task Settings" code="SET">
          <Label text="Priority" />
          <View className="mb-5 flex-row gap-2">
            <Segment label="Low" color="#86EFAC" />
            <Segment label="Medium" color="#FDBA74" />
            <Segment active label="High" color="#FCA5A5" />
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

        <Card title="Progress Overview" code="72">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-sm" style={{ color: palette.muted }}>13 of 18 subtasks completed</Text>
            <Text className="text-3xl font-black" style={{ color: palette.accent }}>72%</Text>
          </View>
          <View className="h-3 overflow-hidden rounded-full" style={{ backgroundColor: palette.input }}>
            <View className="h-full w-[72%] rounded-full" style={{ backgroundColor: palette.accent }} />
          </View>
        </Card>

        <Card title="Editable Subtasks" action="+ Add" onAction={() => setAddingSubtask(true)}>
          {subtasks.map((item, index) => (
            <View key={item.title} className="mb-3 flex-row items-center gap-3 rounded-2xl border p-3" style={{ backgroundColor: palette.input, borderColor: palette.border }}>
              <View className="h-6 w-6 items-center justify-center rounded-lg border" style={{ borderColor: item.done ? '#22C55E' : palette.border, backgroundColor: item.done ? '#22C55E' : 'transparent' }}>
                {item.done ? <Text className="text-[9px] font-black" style={{ color: palette.bg }}>OK</Text> : null}
              </View>
              <TextInput defaultValue={item.title} className="flex-1 rounded-xl px-3 py-2 text-white" style={{ backgroundColor: palette.card }} />
              <TouchableOpacity onPress={() => setEditingSubtaskIndex(index)}>
                <Text className="text-xs font-black text-slate-200">EDIT</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setDeletingSubtaskIndex(index)}>
                <Text className="text-xs font-black text-red-300">DEL</Text>
              </TouchableOpacity>
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
            <View key={item} className="mb-3 rounded-2xl border p-4" style={{ backgroundColor: palette.input, borderColor: palette.border }}>
              <Text className="font-bold text-white">{item}</Text>
              <Text className="mt-1 text-xs" style={{ color: palette.muted }}>Connected task dependency</Text>
            </View>
          ))}
        </Card>

        <Card title="Notes">
          <Input multiline heightClass="h-28" defaultValue="Confirm the final budget numbers before exporting. Keep the deck direct and executive-friendly." />
        </Card>

        <Card title="Attachments" action="Upload">
          {attachments.map((item) => (
            <View key={item} className="mb-3 flex-row items-center gap-3 rounded-2xl border p-4" style={{ backgroundColor: palette.input, borderColor: palette.border }}>
              <View className="h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: palette.accent }}>
                <Text className="text-[9px] font-black" style={{ color: palette.bg }}>FILE</Text>
              </View>
              <View className="flex-1">
                <Text className="font-bold text-white">{item}</Text>
                <Text className="text-xs" style={{ color: palette.muted }}>Uploaded today</Text>
              </View>
              <Text className="text-xs font-black text-red-300">DEL</Text>
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
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0 gap-3 border-t px-5 py-4" style={{ backgroundColor: palette.card, borderColor: palette.border }}>
        <View className="flex-row gap-3">
          <TouchableOpacity onPress={onDelete} className="flex-1 rounded-2xl border border-red-400/50 py-4">
            <Text className="text-center text-xs font-black text-red-300">Delete Task</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onCancel} className="flex-1 rounded-2xl border py-4" style={{ borderColor: palette.border }}>
            <Text className="text-center text-xs font-black text-white">Cancel Changes</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={onSave} className="rounded-2xl py-4" style={{ backgroundColor: palette.accent }}>
          <Text className="text-center font-black" style={{ color: palette.bg }}>Save Changes</Text>
        </TouchableOpacity>
      </View>

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
    </View>
  );
}

function Card({
  title,
  code,
  action,
  onAction,
  children,
}: {
  title: string;
  code?: string;
  action?: string;
  onAction?: () => void;
  children: ReactNode;
}) {
  return (
    <View className="mb-5 rounded-3xl border p-5 shadow-2xl" style={{ backgroundColor: palette.card, borderColor: palette.border }}>
      <View className="mb-5 flex-row items-center justify-between">
        <Text className="text-lg font-black text-white">
          {code ? <Text style={{ color: palette.accent }}>{code} </Text> : null}
          {title}
        </Text>
        {action ? (
          <TouchableOpacity onPress={onAction}>
            <Text className="text-sm font-black" style={{ color: palette.accent }}>{action}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function Label({ text }: { text: string }) {
  return <Text className="mb-2 text-xs font-black uppercase tracking-wide" style={{ color: palette.muted }}>{text}</Text>;
}

function Input({ defaultValue, multiline, heightClass = '' }: { defaultValue: string; multiline?: boolean; heightClass?: string }) {
  return (
    <TextInput
      defaultValue={defaultValue}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : undefined}
      className={`mb-5 rounded-2xl border px-4 py-4 text-white ${heightClass}`}
      style={{ backgroundColor: palette.input, borderColor: palette.border }}
    />
  );
}

function Select({ label }: { label: string }) {
  return (
    <TouchableOpacity className="mb-5 rounded-2xl border px-4 py-4" style={{ backgroundColor: palette.input, borderColor: palette.border }}>
      <Text className="font-bold text-white">{label}</Text>
    </TouchableOpacity>
  );
}

function Segment({ label, active, color }: { label: string; active?: boolean; color: string }) {
  return (
    <TouchableOpacity className="flex-1 rounded-2xl border px-3 py-3" style={{ backgroundColor: active ? `${palette.accent}1A` : palette.input, borderColor: active ? palette.accent : palette.border }}>
      <Text className="text-center text-xs font-black" style={{ color }}>{label}</Text>
    </TouchableOpacity>
  );
}

function Chip({ label, active }: { label: string; active?: boolean }) {
  return (
    <TouchableOpacity className="rounded-full border px-4 py-3" style={{ backgroundColor: active ? palette.accent : palette.input, borderColor: active ? palette.accent : palette.border }}>
      <Text className="text-xs font-black" style={{ color: active ? palette.bg : '#FFFFFF' }}>{label}</Text>
    </TouchableOpacity>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="mb-3 flex-row items-center justify-between rounded-2xl p-4" style={{ backgroundColor: palette.input }}>
      <Text className="text-xs font-black uppercase" style={{ color: palette.muted }}>{label}</Text>
      <Text className="font-black text-white">{value}</Text>
    </View>
  );
}
