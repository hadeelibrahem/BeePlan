import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import type { TaskDetailsTask } from './TaskDetailsScreen';

type Props = {
  onBackDashboard: () => void;
  onViewReminders: () => void;
  onCreateTask: () => void;
  onViewTaskDetails: (task: TaskDetailsTask) => void;
};

const tasks: TaskDetailsTask[] = [
  { title: 'Design new landing page hero section', category: 'Design', due: 'Today', priority: 'High', status: 'In Progress', progress: 65 },
  { title: 'Review mobile app design mockups', category: 'Design', due: 'Today', priority: 'Medium', status: 'To Do', progress: 0 },
  { title: 'Team sync - weekly standup notes', category: 'Meeting', due: 'Today', priority: 'Low', status: 'Done', progress: 100 },
  { title: 'Code review for payment module PR', category: 'Development', due: 'Tomorrow', priority: 'High', status: 'To Do', progress: 0 },
  { title: 'Finalize Q3 marketing strategy deck', category: 'Marketing', due: 'Jun 7', priority: 'High', status: 'In Progress', progress: 72 },
];

export default function AllTasksScreen({
  onBackDashboard,
  onViewReminders,
  onCreateTask,
  onViewTaskDetails,
}: Props) {
  return (
    <View className="flex-1 bg-[#1f2937]">
      <ScrollView className="px-5 pt-12" contentContainerStyle={{ paddingBottom: 120 }}>
        <View className="mb-5 flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-2xl bg-[#fde64b]">
              <Text className="text-base font-black text-[#1f2937]">BP</Text>
            </View>
            <Text className="text-2xl font-black text-white">All Tasks</Text>
          </View>

          <View className="flex-row gap-2">
            <TopButton label="S" />
            <TopButton label="G" />
            <TopButton label="F" active />
          </View>
        </View>

        <View className="mb-4 rounded-2xl bg-white/10 px-5 py-4">
          <Text className="text-slate-400">Search tasks...</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-5">
          <Chip active label="All" count="24" />
          <Chip label="To Do" count="8" />
          <Chip label="In Progress" count="5" />
          <Chip label="Done" count="7" />
          <Chip label="Missed" count="4" />
        </ScrollView>

        <View className="mb-5 flex-row justify-between">
          <MiniStat icon="ALL" label="All Tasks" />
          <MiniStat icon="TO" label="To Do" />
          <MiniStat icon="UP" label="Progress" />
          <MiniStat icon="OK" label="Done" />
          <MiniStat icon="LATE" label="Missed" />
        </View>

        <TaskSection title="Today" tasks={tasks.slice(0, 3)} onViewTaskDetails={onViewTaskDetails} />
        <TaskSection title="Tomorrow" tasks={tasks.slice(3, 4)} onViewTaskDetails={onViewTaskDetails} />
        <TaskSection title="This Week" tasks={tasks.slice(4)} onViewTaskDetails={onViewTaskDetails} />
      </ScrollView>

      <TouchableOpacity
        onPress={onCreateTask}
        className="absolute bottom-24 right-6 h-16 w-16 items-center justify-center rounded-3xl bg-[#fde64b] shadow-xl"
      >
        <Text className="text-3xl font-black text-black">+</Text>
      </TouchableOpacity>

      <View className="absolute bottom-4 left-4 right-4 flex-row items-center justify-around rounded-3xl bg-[#111827] py-4">
        <NavItem icon="D" label="Dashboard" onPress={onBackDashboard} />
        <NavItem active icon="T" label="Tasks" />
        <NavItem icon="R" label="Reminders" onPress={onViewReminders} />
        <NavItem icon="C" label="Calendar" />
        <NavItem icon="P" label="Profile" />
      </View>
    </View>
  );
}

function TopButton({ label, active }: { label: string; active?: boolean }) {
  return (
    <TouchableOpacity className={`h-11 w-11 items-center justify-center rounded-2xl ${active ? 'bg-[#fde64b]' : 'bg-white/10'}`}>
      <Text className={active ? 'font-black text-black' : 'font-black text-white'}>{label}</Text>
    </TouchableOpacity>
  );
}

function Chip({ label, count, active }: { label: string; count: string; active?: boolean }) {
  return (
    <TouchableOpacity className={`mr-2 rounded-full px-4 py-3 ${active ? 'bg-[#fde64b]' : 'bg-white/10'}`}>
      <Text className={`text-xs font-bold ${active ? 'text-black' : 'text-white'}`}>
        {label} <Text className="opacity-60">{count}</Text>
      </Text>
    </TouchableOpacity>
  );
}

function MiniStat({ icon, label }: { icon: string; label: string }) {
  return (
    <View className="w-[18%] items-center rounded-2xl bg-white/10 py-4">
      <Text className="text-[10px] font-black text-[#fde64b]">{icon}</Text>
      <Text className="mt-2 text-center text-[10px] font-bold text-white">{label}</Text>
    </View>
  );
}

function TaskSection({
  title,
  tasks,
  onViewTaskDetails,
}: {
  title: string;
  tasks: TaskDetailsTask[];
  onViewTaskDetails: (task: TaskDetailsTask) => void;
}) {
  return (
    <View className="mb-5">
      <Text className="mb-3 font-bold text-white">{title}</Text>
      {tasks.map((task) => (
        <TaskCard key={task.title} task={task} onPress={() => onViewTaskDetails(task)} />
      ))}
    </View>
  );
}

function TaskCard({ task, onPress }: { task: TaskDetailsTask; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} className="mb-4 rounded-3xl bg-white/10 p-5">
      <View className="flex-row items-start gap-4">
        <View className={`mt-1 h-6 w-6 rounded-lg border ${task.status === 'Done' ? 'border-green-400 bg-green-400' : 'border-slate-500'}`} />

        <View className="flex-1">
          <Text className={`font-bold ${task.status === 'Done' ? 'text-slate-500 line-through' : 'text-white'}`}>
            {task.title}
          </Text>

          <View className="mt-2 flex-row gap-2">
            <SmallBadge label={task.category} />
            <Text className="text-xs text-slate-400">{task.due}</Text>
          </View>

          <View className="mt-4 h-2 rounded-full bg-slate-700">
            <View
              className={`${task.progress === 100 ? 'bg-green-400' : task.progress === 0 ? 'bg-slate-600' : 'bg-[#fde64b]'} h-2 rounded-full`}
              style={{ width: `${task.progress}%` }}
            />
          </View>

          <View className="mt-3 flex-row items-center gap-2">
            <PriorityBadge label={task.priority} />
            <StatusBadge label={task.status} />
            <Text className="ml-auto text-xs text-slate-400">{task.progress}%</Text>
          </View>
        </View>

        <Text className="text-xl text-slate-400">&gt;</Text>
      </View>
    </TouchableOpacity>
  );
}

function SmallBadge({ label }: { label: string }) {
  return (
    <View className="rounded-full bg-white/10 px-3 py-1">
      <Text className="text-xs text-slate-300">{label}</Text>
    </View>
  );
}

function PriorityBadge({ label }: { label: string }) {
  const color =
    label === 'High'
      ? 'bg-red-500/20 text-red-300'
      : label === 'Medium'
        ? 'bg-orange-500/20 text-orange-300'
        : 'bg-green-500/20 text-green-300';

  return (
    <View className={['rounded-full px-3 py-1', color.split(' ')[0]].join(' ')}>
      <Text className={['text-xs font-bold', color.split(' ')[1]].join(' ')}>{label}</Text>
    </View>
  );
}

function StatusBadge({ label }: { label: string }) {
  const color =
    label === 'Done'
      ? 'bg-green-500/20 text-green-300'
      : label === 'In Progress'
        ? 'bg-blue-500/20 text-blue-300'
        : label === 'Missed'
          ? 'bg-red-500/20 text-red-300'
          : 'bg-slate-500/20 text-slate-300';

  return (
    <View className={['rounded-full px-3 py-1', color.split(' ')[0]].join(' ')}>
      <Text className={['text-xs font-bold', color.split(' ')[1]].join(' ')}>{label}</Text>
    </View>
  );
}

function NavItem({
  icon,
  label,
  active,
  onPress,
}: {
  icon: string;
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} className="items-center">
      <Text className={`text-sm font-black ${active ? 'text-[#fde64b]' : 'text-slate-400'}`}>{icon}</Text>
      <Text className={`text-xs font-bold ${active ? 'text-[#fde64b]' : 'text-slate-400'}`}>{label}</Text>
    </TouchableOpacity>
  );
}
