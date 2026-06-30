import { useState } from 'react';
import { Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

export type SubtaskFormValues = {
  title: string;
  description: string;
  dueDate: string;
  dueTime: string;
  priority: 'Low' | 'Medium' | 'High';
  estimatedTime: string;
  assignee: string;
  notes: string;
};

const emptyValues: SubtaskFormValues = {
  title: '',
  description: '',
  dueDate: '',
  dueTime: '',
  priority: 'Medium',
  estimatedTime: '',
  assignee: '',
  notes: '',
};

const palette = {
  bg: '#1F2937',
  card: '#2B3443',
  input: '#2B3443',
  border: 'rgba(255,255,255,0.08)',
  accent: '#FDE64B',
  muted: '#94A3B8',
};

type Props = {
  visible: boolean;
  mode: 'add' | 'edit';
  initialValues?: Partial<SubtaskFormValues>;
  onCancel: () => void;
  onDelete?: () => void;
  onSubmit: (values: SubtaskFormValues) => void;
};

export default function SubtaskFormModal({ visible, mode, initialValues, onCancel, onDelete, onSubmit }: Props) {
  const [values, setValues] = useState<SubtaskFormValues>({ ...emptyValues, ...initialValues });
  const isEdit = mode === 'edit';
  const update = <K extends keyof SubtaskFormValues>(key: K, value: SubtaskFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
        <View className="max-h-[92%] rounded-t-[28px] border-t p-5" style={{ backgroundColor: palette.bg, borderColor: palette.border }}>
          <View className="mb-5 flex-row items-start justify-between">
            <View className="flex-1">
              <TouchableOpacity onPress={onCancel} className="mb-3 flex-row items-center gap-2">
                <Text className="text-sm" style={{ color: palette.muted }}>← Back</Text>
              </TouchableOpacity>
              <Text className="text-xl font-black text-white">{isEdit ? 'Edit Subtask' : 'Add Subtask'}</Text>
              <Text className="mt-1 text-xs" style={{ color: palette.muted }}>
                {isEdit ? 'Update the details for this subtask' : 'Create a new subtask'}
              </Text>
            </View>

            {isEdit ? (
              <TouchableOpacity
                onPress={onDelete}
                className="rounded-xl border border-red-400/50 px-3 py-2"
              >
                <Text className="text-xs font-black text-red-300">Delete</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
            <Label text="Subtask Title *" />
            <TextInput
              placeholder="Enter subtask title..."
              placeholderTextColor="#64748b"
              value={values.title}
              onChangeText={(text) => update('title', text)}
              className="mb-5 rounded-2xl border px-4 py-4 text-white"
              style={{ backgroundColor: palette.input, borderColor: palette.border }}
            />

            <Label text="Description" />
            <TextInput
              multiline
              textAlignVertical="top"
              placeholder="Describe this subtask..."
              placeholderTextColor="#64748b"
              value={values.description}
              onChangeText={(text) => update('description', text)}
              className="mb-5 h-28 rounded-2xl border px-4 py-4 text-white"
              style={{ backgroundColor: palette.input, borderColor: palette.border }}
            />

            <View className="mb-5 flex-row gap-3">
              <View className="flex-1">
                <Label text="Due Date" />
                <TextInput
                  placeholder="dd/mm/yyyy"
                  placeholderTextColor="#64748b"
                  value={values.dueDate}
                  onChangeText={(text) => update('dueDate', text)}
                  className="rounded-2xl border px-4 py-4 text-white"
                  style={{ backgroundColor: palette.input, borderColor: palette.border }}
                />
              </View>
              <View className="flex-1">
                <Label text="Due Time" />
                <TextInput
                  placeholder="--:--"
                  placeholderTextColor="#64748b"
                  value={values.dueTime}
                  onChangeText={(text) => update('dueTime', text)}
                  className="rounded-2xl border px-4 py-4 text-white"
                  style={{ backgroundColor: palette.input, borderColor: palette.border }}
                />
              </View>
            </View>

            <Label text="Priority" />
            <View className="mb-5 flex-row gap-2">
              <Segment label="Low" color="#86EFAC" active={values.priority === 'Low'} onPress={() => update('priority', 'Low')} />
              <Segment label="Medium" color="#FDBA74" active={values.priority === 'Medium'} onPress={() => update('priority', 'Medium')} />
              <Segment label="High" color="#FCA5A5" active={values.priority === 'High'} onPress={() => update('priority', 'High')} />
            </View>

            <View className="mb-5 flex-row gap-3">
              <View className="flex-1">
                <Label text="Estimated Time" />
                <TextInput
                  placeholder="e.g. 2h"
                  placeholderTextColor="#64748b"
                  value={values.estimatedTime}
                  onChangeText={(text) => update('estimatedTime', text)}
                  className="rounded-2xl border px-4 py-4 text-white"
                  style={{ backgroundColor: palette.input, borderColor: palette.border }}
                />
              </View>
              <View className="flex-1">
                <Label text="Assignee" />
                <TextInput
                  placeholder="Optional"
                  placeholderTextColor="#64748b"
                  value={values.assignee}
                  onChangeText={(text) => update('assignee', text)}
                  className="rounded-2xl border px-4 py-4 text-white"
                  style={{ backgroundColor: palette.input, borderColor: palette.border }}
                />
              </View>
            </View>

            <Label text="Notes" />
            <TextInput
              multiline
              textAlignVertical="top"
              placeholder="Additional notes (optional)..."
              placeholderTextColor="#64748b"
              value={values.notes}
              onChangeText={(text) => update('notes', text)}
              className="h-24 rounded-2xl border px-4 py-4 text-white"
              style={{ backgroundColor: palette.input, borderColor: palette.border }}
            />
          </ScrollView>

          <View className="mt-4 flex-row gap-3 border-t pt-4" style={{ borderColor: palette.border }}>
            <TouchableOpacity onPress={onCancel} className="flex-1 rounded-2xl border py-4" style={{ borderColor: palette.border }}>
              <Text className="text-center font-black text-white">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onSubmit(values)} className="flex-1 rounded-2xl py-4" style={{ backgroundColor: palette.accent }}>
              <Text className="text-center font-black" style={{ color: palette.bg }}>
                {isEdit ? 'Save Changes' : 'Add Subtask'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Label({ text }: { text: string }) {
  return (
    <Text className="mb-2 text-xs font-black uppercase tracking-wide" style={{ color: palette.muted }}>
      {text}
    </Text>
  );
}

function Segment({ label, active, color, onPress }: { label: string; active?: boolean; color: string; onPress?: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="flex-1 rounded-2xl border px-3 py-3"
      style={{ backgroundColor: active ? `${palette.accent}1A` : palette.input, borderColor: active ? palette.accent : palette.border }}
    >
      <Text className="text-center text-xs font-black" style={{ color }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
