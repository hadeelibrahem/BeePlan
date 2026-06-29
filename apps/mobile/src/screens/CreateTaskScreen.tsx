import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native'

type Props = {
  onCancel: () => void
  onSave: () => void
}

export default function CreateTaskScreen({ onCancel, onSave }: Props) {
  return (
    <View className="flex-1 bg-[#1f2937]">
      <ScrollView className="px-5 pt-12" contentContainerStyle={{ paddingBottom: 120 }}>
        <View className="mb-6 flex-row items-center justify-between">
          <TouchableOpacity onPress={onCancel} className="h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
            <Text className="text-xl text-white">←</Text>
          </TouchableOpacity>

          <View className="items-center">
            <Text className="text-xl font-black text-white">Create Task</Text>
            <Text className="text-xs text-slate-400">Organize your work</Text>
          </View>

          <View className="h-11 w-11 items-center justify-center rounded-2xl bg-[#fde64b]">
            <Text className="font-black text-black">A</Text>
          </View>
        </View>

        <Card title="Task Information" icon="📋">
          <Label text="Task Title *" />
          <TextInput
            placeholder="Enter task title..."
            placeholderTextColor="#64748b"
            className="mb-5 rounded-2xl bg-black/30 px-4 py-4 text-white"
          />

          <Label text="Description" />
          <TextInput
            multiline
            placeholder="Describe your task..."
            placeholderTextColor="#64748b"
            textAlignVertical="top"
            className="mb-5 h-32 rounded-2xl bg-black/30 px-4 py-4 text-white"
          />

          <Label text="Subtasks" />
          <TouchableOpacity className="mb-5 rounded-2xl border border-dashed border-white/20 bg-black/20 py-4">
            <Text className="text-center font-bold text-[#fde64b]">+ Add Subtask</Text>
          </TouchableOpacity>

          <Label text="Notes" />
          <TextInput
            multiline
            placeholder="Additional notes..."
            placeholderTextColor="#64748b"
            textAlignVertical="top"
            className="h-24 rounded-2xl bg-black/30 px-4 py-4 text-white"
          />
        </Card>

        <Card title="Task Settings" icon="⚙️">
          <Label text="Priority" />
          <View className="mb-5 flex-row gap-2">
            <Segment label="Low" color="text-green-400" />
            <Segment active label="Medium" color="text-[#fde64b]" />
            <Segment label="High" color="text-red-400" />
          </View>

          <Label text="Status" />
          <View className="mb-5 flex-row flex-wrap gap-2">
            <Chip active label="To Do" />
            <Chip label="In Progress" />
            <Chip label="Done" />
            <Chip label="Missed" />
          </View>

          <Label text="Category" />
          <Select label="Select category..." />

          <View className="mt-5 flex-row gap-3">
            <View className="flex-1">
              <Label text="Due Date" />
              <Select label="dd/mm/yyyy" />
            </View>
            <View className="flex-1">
              <Label text="Due Time" />
              <Select label="--:--" />
            </View>
          </View>
        </Card>

        <Card title="Reminder" icon="🔔">
          <View className="mb-4 flex-row items-center justify-between">
            <View>
              <Text className="font-bold text-white">Enable Reminder</Text>
              <Text className="text-xs text-slate-400">Remind before due date</Text>
            </View>

            <View className="h-8 w-14 items-end justify-center rounded-full bg-[#fde64b] px-1">
              <View className="h-6 w-6 rounded-full bg-white" />
            </View>
          </View>

          <Label text="Reminder Time" />
          <Select label="30 minutes before" />
        </Card>

        <Card title="Recurring & Dependencies" icon="🔁">
          <Label text="Recurring Task" />
          <Select label="None" />

          <View className="mt-5">
            <Label text="Dependencies" />
            <TouchableOpacity className="rounded-2xl border border-dashed border-white/20 bg-black/20 py-4">
              <Text className="text-center font-bold text-[#fde64b]">+ Add Dependency</Text>
            </TouchableOpacity>
          </View>
        </Card>

        <Card title="Attachments" icon="📎">
          <TouchableOpacity className="h-28 items-center justify-center rounded-2xl border border-dashed border-white/20 bg-black/20">
            <Text className="text-2xl">☁️</Text>
            <Text className="mt-2 text-sm text-slate-300">Upload files</Text>
            <Text className="text-xs text-slate-500">Images, PDF, Documents</Text>
          </TouchableOpacity>
        </Card>
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0 flex-row gap-3 border-t border-white/10 bg-[#111827] px-5 py-4">
        <TouchableOpacity onPress={onCancel} className="flex-1 rounded-2xl bg-white/10 py-4">
          <Text className="text-center font-bold text-white">Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onSave} className="flex-1 rounded-2xl bg-[#fde64b] py-4">
          <Text className="text-center font-black text-black">Save Task</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

function Card({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <View className="mb-5 rounded-3xl border border-white/10 bg-[#111827]/70 p-5">
      <Text className="mb-5 text-lg font-black text-white">
        <Text className="text-[#fde64b]">{icon} </Text>
        {title}
      </Text>
      {children}
    </View>
  )
}

function Label({ text }: { text: string }) {
  return <Text className="mb-2 text-xs font-black uppercase tracking-wide text-slate-300">{text}</Text>
}

function Segment({ label, active, color }: { label: string; active?: boolean; color: string }) {
  return (
    <TouchableOpacity className={`flex-1 rounded-2xl border px-3 py-3 ${active ? 'border-[#fde64b] bg-[#fde64b]/10' : 'border-white/10 bg-white/5'}`}>
      <Text className={`text-center text-xs font-bold ${color}`}>{label}</Text>
    </TouchableOpacity>
  )
}

function Chip({ label, active }: { label: string; active?: boolean }) {
  return (
    <TouchableOpacity className={`rounded-full px-4 py-3 ${active ? 'bg-[#fde64b]' : 'bg-white/10'}`}>
      <Text className={`text-xs font-bold ${active ? 'text-black' : 'text-white'}`}>{label}</Text>
    </TouchableOpacity>
  )
}

function Select({ label }: { label: string }) {
  return (
    <TouchableOpacity className="rounded-2xl bg-black/30 px-4 py-4">
      <Text className="text-slate-400">{label}</Text>
    </TouchableOpacity>
  )
}