import type { ReactNode } from 'react';
import { ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native';

export type TaskDetailsTask = {
  title: string;
  category: string;
  due: string;
  priority: string;
  status: string;
  progress: number;
};

type Props = {
  task?: TaskDetailsTask | null;
  onBack: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onMarkDone?: () => void;
};

const fallbackTask: TaskDetailsTask = {
  title: 'Finalize Q3 Marketing Strategy Deck',
  category: 'Marketing',
  due: 'Jun 7',
  priority: 'High',
  status: 'In Progress',
  progress: 72,
};

const subtasks = [
  { title: 'Finalize executive summary', assignee: 'FA', due: 'Today', status: 'Done', done: true },
  { title: 'Add market sizing slide', assignee: 'SA', due: 'Today', status: 'In Review', done: true },
  { title: 'Review campaign budget', assignee: 'OM', due: 'Tomorrow', status: 'In Progress', done: false },
  { title: 'Attach design references', assignee: 'HB', due: 'Jun 7', status: 'To Do', done: false },
];

const dependencies = [
  { title: 'Finish Report', status: 'Done' },
  { title: 'Approve Design', status: 'In Progress' },
  { title: 'Finalize Presentation', status: 'Blocked' },
];

const attachments = [
  { name: 'Q3 strategy outline.pdf', size: '2.4 MB', type: 'PDF' },
  { name: 'Campaign references.zip', size: '8.1 MB', type: 'ZIP' },
  { name: 'Brand notes.docx', size: '640 KB', type: 'DOC' },
];

const timeline = [
  { title: 'Attachment Uploaded', detail: 'Q3 strategy outline.pdf', time: '12 min ago', color: '#3B82F6' },
  { title: 'Progress Updated', detail: 'Moved from 64% to 72%', time: '38 min ago', color: '#FDE64B' },
  { title: 'Status Changed', detail: 'Task moved to In Progress', time: 'Yesterday', color: '#22C55E' },
  { title: 'Reminder Added', detail: '30 minutes before due time', time: 'Yesterday', color: '#F97316' },
  { title: 'Task Created', detail: 'Created by Fatima', time: 'Jun 2', color: '#94A3B8' },
];

const labels = ['Design', 'Marketing', 'University', 'Work'];

export default function TaskDetailsScreen({
  task,
  onBack,
  onEdit,
  onDelete,
  onMarkDone,
}: Props) {
  const currentTask = task ?? fallbackTask;
  const completedSubtasks = subtasks.filter((item) => item.done).length;

  return (
    <View className="flex-1 bg-[#1F2937]">
      <ScrollView className="px-5 pt-12" contentContainerStyle={{ paddingBottom: 120 }}>
        <View className="mb-6 flex-row items-center justify-between">
          <TouchableOpacity
            accessibilityLabel="Go back"
            onPress={onBack}
            className="h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-[#2B3443]"
          >
            <Text className="text-xl font-black text-white">‹</Text>
          </TouchableOpacity>

          <View className="items-center">
            <View className="mb-1 h-9 w-9 items-center justify-center rounded-2xl bg-[#FDE64B]">
              <Text className="font-black text-[#1F2937]">BP</Text>
            </View>
            <Text className="text-lg font-black text-white">Task Details</Text>
          </View>

          <TouchableOpacity
            accessibilityLabel="Open task menu"
            className="h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-[#2B3443]"
          >
            <Text className="text-xl font-black text-white">...</Text>
          </TouchableOpacity>
        </View>

        <Card>
          <View className="mb-5 flex-row items-start justify-between gap-4">
            <View className="flex-1">
              <Text className="text-2xl font-black leading-8 text-white">{currentTask.title}</Text>
              <Text className="mt-3 text-sm leading-6 text-[#94A3B8]">
                Build the final presentation story, confirm campaign numbers, and prepare the deck for team review.
              </Text>
            </View>

            <TouchableOpacity className="h-12 w-12 items-center justify-center rounded-2xl bg-black/20">
              <Text className="text-xl text-[#FDE64B]">★</Text>
            </TouchableOpacity>
          </View>

          <View className="mb-5 flex-row flex-wrap gap-2">
            <Badge label={currentTask.status} tone="blue" />
            <Badge label={`${currentTask.priority} Priority`} tone="red" />
            <Badge label={currentTask.category} tone="yellow" />
          </View>

          <View className="gap-3">
            <InfoRow label="Created" value="Jun 2, 2026" />
            <InfoRow label="Updated" value="Today, 10:42 AM" />
            <InfoRow label="Due Date" value={currentTask.due} />
            <InfoRow label="Due Time" value="4:30 PM" />
          </View>
        </Card>

        <Card title="Progress" icon="72">
          <View className="mb-5 flex-row items-center justify-between">
            <View>
              <Text className="text-4xl font-black text-white">{currentTask.progress}%</Text>
              <Text className="mt-1 text-sm text-[#94A3B8]">
                {completedSubtasks} of {subtasks.length} subtasks completed
              </Text>
            </View>
            <IconTile label="UP" color="#3B82F6" />
          </View>

          <ProgressBar value={currentTask.progress} />

          <View className="mt-5 flex-row gap-3">
            <TimePill title="Estimated" value="6h" />
            <TimePill title="Spent" value="4h 20m" />
            <TimePill title="Remaining" value="1h 40m" />
          </View>
        </Card>

        <Card title="Subtasks" action="+ Add Subtask">
          {subtasks.map((item) => (
            <SubtaskRow key={item.title} item={item} />
          ))}
        </Card>

        <Card title="Dependencies">
          {dependencies.map((item, index) => (
            <DependencyRow key={item.title} item={item} isLast={index === dependencies.length - 1} />
          ))}
        </Card>

        <Card>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-3">
              <IconTile label="BL" color="#FDE64B" compact />
              <View>
                <Text className="font-black text-white">Reminder</Text>
                <Text className="mt-1 text-sm text-[#94A3B8]">30 minutes before at 4:00 PM</Text>
              </View>
            </View>
            <Switch
              value
              trackColor={{ false: '#374151', true: '#FDE64B' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </Card>

        <Card>
          <View className="flex-row items-center gap-3">
            <IconTile label="RE" color="#3B82F6" compact />
            <View>
              <Text className="font-black text-white">Recurring</Text>
              <Text className="mt-1 text-sm text-[#94A3B8]">Every Monday</Text>
            </View>
          </View>
        </Card>

        <Card title="Notes" action="Edit">
          <Text className="rounded-3xl bg-black/20 p-4 text-sm leading-6 text-slate-300">
            Keep the deck direct and executive-friendly. Confirm the final budget numbers before exporting.
          </Text>
        </Card>

        <Card title="Attachments" action="Upload">
          {attachments.map((file) => (
            <AttachmentRow key={file.name} file={file} />
          ))}
        </Card>

        <Card title="Activity Timeline">
          {timeline.map((item, index) => (
            <TimelineRow key={item.title} item={item} isLast={index === timeline.length - 1} />
          ))}
        </Card>

        <Card title="Labels">
          <View className="flex-row flex-wrap gap-2">
            {labels.map((label, index) => (
              <View
                key={label}
                className="rounded-full px-4 py-3"
                style={{ backgroundColor: ['#FDE64B', '#3B82F6', '#22C55E', '#F97316'][index] + '22' }}
              >
                <Text
                  className="text-xs font-black"
                  style={{ color: ['#FDE64B', '#93C5FD', '#86EFAC', '#FDBA74'][index] }}
                >
                  {label}
                </Text>
              </View>
            ))}
          </View>
        </Card>

        <Card title="Time Estimation">
          <View className="gap-4">
            <ChartRow label="Estimated" value="6h" percent={100} color="#94A3B8" />
            <ChartRow label="Spent" value="4h 20m" percent={72} color="#3B82F6" />
            <ChartRow label="Remaining" value="1h 40m" percent={28} color="#FDE64B" />
          </View>
        </Card>
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0 flex-row gap-3 border-t border-white/10 bg-[#111827] px-5 py-4">
        <TouchableOpacity
          onPress={onDelete}
          className="flex-1 rounded-2xl border border-red-400/50 py-4"
        >
          <Text className="text-center text-xs font-black text-red-300">Delete</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onEdit} className="flex-1 rounded-2xl bg-[#2B3443] py-4">
          <Text className="text-center text-xs font-black text-white">Edit Task</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onMarkDone} className="flex-1 rounded-2xl bg-[#FDE64B] py-4">
          <Text className="text-center text-xs font-black text-[#1F2937]">Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Card({
  title,
  icon,
  action,
  children,
}: {
  title?: string;
  icon?: string;
  action?: string;
  children: ReactNode;
}) {
  return (
    <View className="mb-5 rounded-[24px] border border-white/10 bg-[#2B3443] p-5 shadow-xl">
      {(title || action) && (
        <View className="mb-5 flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            {icon ? <IconTile label={icon} color="#FDE64B" compact /> : null}
            {title ? <Text className="text-lg font-black text-white">{title}</Text> : null}
          </View>
          {action ? (
            <TouchableOpacity className="rounded-full bg-black/20 px-3 py-2">
              <Text className="text-xs font-black text-[#FDE64B]">{action}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
      {children}
    </View>
  );
}

function Badge({ label, tone }: { label: string; tone: 'blue' | 'red' | 'yellow' | 'green' | 'slate' }) {
  const colors = {
    blue: ['#3B82F633', '#93C5FD'],
    red: ['#EF444433', '#FCA5A5'],
    yellow: ['#FDE64B33', '#FDE64B'],
    green: ['#22C55E33', '#86EFAC'],
    slate: ['#94A3B833', '#CBD5E1'],
  }[tone];

  return (
    <View className="rounded-full px-3 py-2" style={{ backgroundColor: colors[0] }}>
      <Text className="text-xs font-black" style={{ color: colors[1] }}>
        {label}
      </Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between rounded-2xl bg-black/20 px-4 py-3">
      <Text className="text-xs font-bold uppercase tracking-wide text-[#94A3B8]">{label}</Text>
      <Text className="font-bold text-white">{value}</Text>
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

function ProgressBar({ value }: { value: number }) {
  return (
    <View className="h-3 overflow-hidden rounded-full bg-black/30">
      <View className="h-full rounded-full bg-[#3B82F6]" style={{ width: `${value}%` }} />
    </View>
  );
}

function TimePill({ title, value }: { title: string; value: string }) {
  return (
    <View className="flex-1 rounded-2xl bg-black/20 p-3">
      <Text className="text-[10px] font-bold uppercase text-[#94A3B8]">{title}</Text>
      <Text className="mt-1 text-sm font-black text-white">{value}</Text>
    </View>
  );
}

function SubtaskRow({
  item,
}: {
  item: { title: string; assignee: string; due: string; status: string; done: boolean };
}) {
  return (
    <View className="mb-3 flex-row items-center gap-3 rounded-2xl bg-black/20 p-4">
      <View
        className={`h-6 w-6 items-center justify-center rounded-lg border ${
          item.done ? 'border-green-400 bg-green-400' : 'border-slate-500'
        }`}
      >
        {item.done ? <Text className="text-xs font-black text-[#1F2937]">✓</Text> : null}
      </View>

      <View className="flex-1">
        <Text className={`font-bold ${item.done ? 'text-slate-500 line-through' : 'text-white'}`}>
          {item.title}
        </Text>
        <Text className="mt-1 text-xs text-[#94A3B8]">{item.due}</Text>
      </View>

      <View className="h-9 w-9 items-center justify-center rounded-full bg-[#FDE64B]">
        <Text className="text-[10px] font-black text-[#1F2937]">{item.assignee}</Text>
      </View>
      <Badge label={item.status} tone={item.done ? 'green' : 'blue'} />
    </View>
  );
}

function DependencyRow({
  item,
  isLast,
}: {
  item: { title: string; status: string };
  isLast: boolean;
}) {
  const tone = item.status === 'Done' ? 'green' : item.status === 'Blocked' ? 'red' : 'yellow';

  return (
    <View>
      <View className="flex-row items-center gap-4">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-black/20">
          <View className="h-3 w-3 rounded-full bg-[#FDE64B]" />
        </View>
        <View className="flex-1 flex-row items-center justify-between rounded-2xl bg-black/20 p-4">
          <Text className="font-bold text-white">{item.title}</Text>
          <Badge label={item.status} tone={tone} />
        </View>
      </View>
      {!isLast ? <Text className="ml-4 py-2 text-xl font-black text-[#94A3B8]">↓</Text> : null}
    </View>
  );
}

function AttachmentRow({ file }: { file: { name: string; size: string; type: string } }) {
  return (
    <View className="mb-3 flex-row items-center gap-3 rounded-2xl bg-black/20 p-4">
      <IconTile label={file.type} color="#FDE64B" compact />
      <View className="flex-1">
        <Text className="font-bold text-white">{file.name}</Text>
        <Text className="mt-1 text-xs text-[#94A3B8]">{file.size}</Text>
      </View>
      <TouchableOpacity className="h-9 w-9 items-center justify-center rounded-xl bg-white/10">
        <Text className="font-black text-white">↓</Text>
      </TouchableOpacity>
      <TouchableOpacity className="h-9 w-9 items-center justify-center rounded-xl bg-red-500/20">
        <Text className="font-black text-red-300">×</Text>
      </TouchableOpacity>
    </View>
  );
}

function TimelineRow({
  item,
  isLast,
}: {
  item: { title: string; detail: string; time: string; color: string };
  isLast: boolean;
}) {
  return (
    <View className="flex-row gap-4">
      <View className="items-center">
        <View className="h-4 w-4 rounded-full" style={{ backgroundColor: item.color }} />
        {!isLast ? <View className="w-px flex-1 bg-white/10" /> : null}
      </View>
      <View className="mb-5 flex-1">
        <Text className="font-black text-white">{item.title}</Text>
        <Text className="mt-1 text-sm text-[#94A3B8]">{item.detail}</Text>
        <Text className="mt-2 text-xs font-bold text-[#FDE64B]">{item.time}</Text>
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
  return (
    <View>
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="font-bold text-white">{label}</Text>
        <Text className="text-sm font-black" style={{ color }}>
          {value}
        </Text>
      </View>
      <View className="h-3 overflow-hidden rounded-full bg-black/30">
        <View className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: color }} />
      </View>
    </View>
  );
}
