import type { ReactNode } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
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

type TimelineTone = 'primary' | 'accent' | 'success' | 'warning' | 'secondary';

const timeline: { title: string; detail: string; time: string; tone: TimelineTone }[] = [
  { title: 'Attachment Uploaded', detail: 'Q3 strategy outline.pdf', time: '12 min ago', tone: 'primary' },
  { title: 'Progress Updated', detail: 'Moved from 64% to 72%', time: '38 min ago', tone: 'accent' },
  { title: 'Status Changed', detail: 'Task moved to In Progress', time: 'Yesterday', tone: 'success' },
  { title: 'Reminder Added', detail: '30 minutes before due time', time: 'Yesterday', tone: 'warning' },
  { title: 'Task Created', detail: 'Created by Fatima', time: 'Jun 2', tone: 'secondary' },
];

const labels = ['Design', 'Marketing', 'University', 'Work'];

export default function TaskDetailsScreen({
  task,
  onBack,
  onEdit,
  onDelete,
  onMarkDone,
}: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const currentTask = task ?? fallbackTask;
  const completedSubtasks = subtasks.filter((item) => item.done).length;
  const toneColor = (tone: TimelineTone) =>
    tone === 'primary' ? colors.primary : tone === 'accent' ? colors.accent : tone === 'success' ? colors.success : tone === 'warning' ? colors.warning : colors.secondaryText;
  const labelTones: TimelineTone[] = ['accent', 'primary', 'success', 'warning'];

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

      <SectionCard className="mb-5">
        <View className="mb-5 flex-row items-start justify-between gap-4">
          <View className="flex-1">
            <Text className="text-2xl font-black leading-8" style={{ color: colors.text }}>{currentTask.title}</Text>
            <Text className="mt-3 text-sm leading-6" style={{ color: colors.secondaryText }}>
              Build the final presentation story, confirm campaign numbers, and prepare the deck for team review.
            </Text>
          </View>

          <Pressable accessibilityRole="button" accessibilityLabel="Favorite" className="h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: colors.background }}>
            <Text className="text-xl" style={{ color: colors.accent }}>★</Text>
          </Pressable>
        </View>

        <View className="mb-5 flex-row flex-wrap gap-2">
          <Badge label={currentTask.status} color={colors.primary} />
          <Badge label={`${currentTask.priority} Priority`} color={colors.error} />
          <Badge label={currentTask.category} color={colors.accent} />
        </View>

        <View className="gap-3">
          <InfoRow label="Created" value="Jun 2, 2026" />
          <InfoRow label="Updated" value="Today, 10:42 AM" />
          <InfoRow label="Due Date" value={currentTask.due} />
          <InfoRow label="Due Time" value="4:30 PM" />
        </View>
      </SectionCard>

      <Card title="Progress">
        <View className="mb-5 flex-row items-center justify-between">
          <View>
            <Text className="text-4xl font-black" style={{ color: colors.text }}>{currentTask.progress}%</Text>
            <Text className="mt-1 text-sm" style={{ color: colors.secondaryText }}>
              {completedSubtasks} of {subtasks.length} subtasks completed
            </Text>
          </View>
          <IconTile label="↑" color={colors.primary} />
        </View>

        <ProgressBar value={currentTask.progress} color={colors.primary} />

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

      <SectionCard className="mb-5">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <IconTile label="🔔" color={colors.accent} compact />
            <View>
              <Text className="font-black" style={{ color: colors.text }}>Reminder</Text>
              <Text className="mt-1 text-sm" style={{ color: colors.secondaryText }}>30 minutes before at 4:00 PM</Text>
            </View>
          </View>
          <Switch value trackColor={{ false: colors.border, true: colors.accent }} thumbColor="#FFFFFF" />
        </View>
      </SectionCard>

      <SectionCard className="mb-5">
        <View className="flex-row items-center gap-3">
          <IconTile label="🔁" color={colors.primary} compact />
          <View>
            <Text className="font-black" style={{ color: colors.text }}>Recurring</Text>
            <Text className="mt-1 text-sm" style={{ color: colors.secondaryText }}>Every Monday</Text>
          </View>
        </View>
      </SectionCard>

      <Card title="Notes" action="Edit">
        <Text className="rounded-3xl p-4 text-sm leading-6" style={{ backgroundColor: colors.background, color: colors.secondaryText }}>
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
          <TimelineRow key={item.title} item={item} color={toneColor(item.tone)} isLast={index === timeline.length - 1} />
        ))}
      </Card>

      <Card title="Labels">
        <View className="flex-row flex-wrap gap-2">
          {labels.map((label, index) => {
            const color = toneColor(labelTones[index]);
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

      <Card title="Time Estimation">
        <View className="gap-4">
          <ChartRow label="Estimated" value="6h" percent={100} color={colors.secondaryText} />
          <ChartRow label="Spent" value="4h 20m" percent={72} color={colors.primary} />
          <ChartRow label="Remaining" value="1h 40m" percent={28} color={colors.accent} />
        </View>
      </Card>
    </AppScreen>
  );
}

function Card({
  title,
  action,
  children,
}: {
  title?: string;
  action?: string;
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
            <Pressable accessibilityRole="button" accessibilityLabel={action} className="rounded-full px-3 py-2 active:opacity-70" style={{ backgroundColor: colors.background }}>
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
}: {
  item: { title: string; assignee: string; due: string; status: string; done: boolean };
}) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View className="mb-3 flex-row items-center gap-3 rounded-2xl p-4" style={{ backgroundColor: colors.background }}>
      <View
        className="h-6 w-6 items-center justify-center rounded-lg border"
        style={{ borderColor: item.done ? colors.success : colors.border, backgroundColor: item.done ? colors.success : 'transparent' }}
      >
        {item.done ? <Text className="text-xs font-black" style={{ color: colors.accentText }}>✓</Text> : null}
      </View>

      <View className="flex-1">
        <Text className={`font-bold ${item.done ? 'line-through' : ''}`} style={{ color: item.done ? colors.secondaryText : colors.text }}>
          {item.title}
        </Text>
        <Text className="mt-1 text-xs" style={{ color: colors.secondaryText }}>{item.due}</Text>
      </View>

      <View className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: colors.accent }}>
        <Text className="text-[10px] font-black" style={{ color: colors.accentText }}>{item.assignee}</Text>
      </View>
      <Badge label={item.status} color={item.done ? colors.success : colors.primary} />
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
  const { theme } = useTheme();
  const { colors } = theme;
  const color = item.status === 'Done' ? colors.success : item.status === 'Blocked' ? colors.error : colors.accent;

  return (
    <View>
      <View className="flex-row items-center gap-4">
        <View className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: colors.background }}>
          <View className="h-3 w-3 rounded-full" style={{ backgroundColor: colors.accent }} />
        </View>
        <View className="flex-1 flex-row items-center justify-between rounded-2xl p-4" style={{ backgroundColor: colors.background }}>
          <Text className="font-bold" style={{ color: colors.text }}>{item.title}</Text>
          <Badge label={item.status} color={color} />
        </View>
      </View>
      {!isLast ? <Text className="ml-4 py-2 text-xl font-black" style={{ color: colors.secondaryText }}>↓</Text> : null}
    </View>
  );
}

function AttachmentRow({ file }: { file: { name: string; size: string; type: string } }) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View className="mb-3 flex-row items-center gap-3 rounded-2xl p-4" style={{ backgroundColor: colors.background }}>
      <IconTile label={file.type} color={colors.accent} compact />
      <View className="flex-1">
        <Text className="font-bold" style={{ color: colors.text }}>{file.name}</Text>
        <Text className="mt-1 text-xs" style={{ color: colors.secondaryText }}>{file.size}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Download" className="h-9 w-9 items-center justify-center rounded-xl active:opacity-70" style={{ backgroundColor: colors.border }}>
        <Text className="font-black" style={{ color: colors.text }}>↓</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Remove" className="h-9 w-9 items-center justify-center rounded-xl active:opacity-70" style={{ backgroundColor: `${colors.error}33` }}>
        <Text className="font-black" style={{ color: colors.error }}>×</Text>
      </Pressable>
    </View>
  );
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
