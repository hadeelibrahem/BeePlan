import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import {
  BottomNavBar,
  OutlineButton,
  PageHeader,
  PrimaryButton,
  ScreenLayout,
  SecondaryButton,
} from '../components/layout';
import { toUiPriority, toUiStatus, updateTask, type ApiTask } from '../lib/tasksApi';
import {
  SESSION_TYPE_PRESETS,
  formatFocusMinutes,
  getFocusRecommendation,
  getFocusStats,
  getTodayFocusSessions,
  labelForFocusType,
  type FocusRecommendation,
  type FocusSession,
  type FocusSessionType,
  type FocusStats,
} from '../lib/focusApi';
import { formatFocusClock } from '../lib/focusApi';
import type { UseFocusSession } from '../lib/useFocusSession';
import type { AppTheme } from '../theme/colors';
import { useTheme } from '../theme/useTheme';

type StartTarget = { id: string; title: string; priority: string; category: string };

type Props = {
  onBackDashboard: () => void;
  onViewReminders: () => void;
  onViewTaskDetails: (task: ApiTask) => void;
  tasks?: ApiTask[];
  accessToken?: string;
  onTaskUpdated?: (task: ApiTask) => void;
  focus: UseFocusSession;
  onOpenWorkspace: () => void;
};

export default function FocusScreen({
  onBackDashboard,
  onViewReminders,
  onViewTaskDetails,
  tasks = [],
  accessToken = '',
  onTaskUpdated,
  focus,
  onOpenWorkspace,
}: Props) {
  const { theme } = useTheme();
  const { colors } = theme;

  const [stats, setStats] = useState<FocusStats | null>(null);
  const [recommendation, setRecommendation] = useState<FocusRecommendation | null>(null);
  const [todaySessions, setTodaySessions] = useState<FocusSession[]>([]);
  const [startModalTask, setStartModalTask] = useState<StartTarget | null>(null);
  const removingRef = useRef<Set<string>>(new Set());

  const focusTasks = useMemo(() => tasks.filter((task) => task.isFocusTask), [tasks]);

  const refreshFocusData = useCallback(async () => {
    if (!accessToken) return;
    try {
      const [statsData, sessions, rec] = await Promise.all([
        getFocusStats(accessToken),
        getTodayFocusSessions(accessToken),
        getFocusRecommendation(accessToken).catch(() => null),
      ]);
      setStats(statsData);
      setTodaySessions(sessions);
      setRecommendation(rec);
    } catch {
      // Keep the last-known data on transient failures.
    }
  }, [accessToken]);

  useEffect(() => {
    void refreshFocusData();
  }, [refreshFocusData]);

  const handleStart = useCallback(
    async (type: FocusSessionType, minutes: number) => {
      if (!startModalTask) return;
      const ok = await focus.start(
        { id: startModalTask.id, title: startModalTask.title, priority: startModalTask.priority, category: startModalTask.category },
        type,
        minutes,
      );
      if (ok) {
        setStartModalTask(null);
        onOpenWorkspace();
      }
    },
    [startModalTask, focus, onOpenWorkspace],
  );

  const openStartModal = useCallback((task: ApiTask) => {
    setStartModalTask({
      id: task.id,
      title: task.title,
      priority: toUiPriority(task.priority),
      category: task.category || 'General',
    });
  }, []);

  const handleRemoveFocus = useCallback(
    async (taskId: string) => {
      if (!accessToken || removingRef.current.has(taskId)) return;
      removingRef.current.add(taskId);
      try {
        const updated = await updateTask(accessToken, taskId, { isFocusTask: false });
        onTaskUpdated?.(updated);
        void refreshFocusData();
      } finally {
        removingRef.current.delete(taskId);
      }
    },
    [accessToken, onTaskUpdated, refreshFocusData],
  );

  return (
    <ScreenLayout
      footer={<BottomNavBar active="focus" onNavigateDashboard={onBackDashboard} onNavigateReminders={onViewReminders} />}
    >
      <PageHeader title="Focus Mode" subtitle="Your deep-work control center" />

      <StatsRow stats={stats} theme={theme} />

      {focus.active ? (
        <InProgressCard
          theme={theme}
          title={focus.active.taskTitle ?? 'Focus session'}
          remaining={formatFocusClock(focus.remainingMs)}
          complete={focus.sessionComplete}
          onResume={onOpenWorkspace}
        />
      ) : (
        <RecommendationCard theme={theme} recommendation={recommendation} tasks={tasks} onFocus={openStartModal} />
      )}

      <Text className="mb-2 mt-2 text-sm font-black" style={{ color: colors.text }}>
        Focus Queue · {focusTasks.length} tasks
      </Text>

      {focusTasks.length ? (
        focusTasks.map((task) => (
          <FocusCard
            key={task.id}
            task={task}
            theme={theme}
            disabled={Boolean(focus.active)}
            onView={() => onViewTaskDetails(task)}
            onStart={() => openStartModal(task)}
            onRemove={() => void handleRemoveFocus(task.id)}
          />
        ))
      ) : (
        <View className="rounded-2xl border p-4" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
          <Text className="text-center text-sm font-black" style={{ color: colors.text }}>
            No focus tasks yet
          </Text>
          <Text className="mt-1 text-center text-xs" style={{ color: colors.secondaryText }}>
            Turn on Focus Task from Task Details to add it here.
          </Text>
        </View>
      )}

      <Text className="mb-2 mt-4 text-sm font-black" style={{ color: colors.text }}>
        Today's Sessions
      </Text>
      <TodaySessions sessions={todaySessions} theme={theme} />

      <StartSessionModal
        visible={Boolean(startModalTask)}
        taskTitle={startModalTask?.title ?? ''}
        busy={focus.busy}
        theme={theme}
        onClose={() => setStartModalTask(null)}
        onStart={handleStart}
      />
    </ScreenLayout>
  );
}

// --- In-progress resume card ----------------------------------------------

function InProgressCard({
  theme,
  title,
  remaining,
  complete,
  onResume,
}: {
  theme: AppTheme;
  title: string;
  remaining: string;
  complete: boolean;
  onResume: () => void;
}) {
  const { colors } = theme;
  return (
    <View className="mb-3 rounded-2xl border p-4" style={{ borderColor: colors.accent, backgroundColor: colors.accentSoft }}>
      <Text className="text-[10px] font-black uppercase" style={{ color: colors.accent }}>
        Focus session in progress
      </Text>
      <Text numberOfLines={1} className="mt-1 text-lg font-black" style={{ color: colors.text }}>
        {title}
      </Text>
      <Text className="mt-0.5 text-sm font-semibold" style={{ color: colors.secondaryText }}>
        {complete ? 'Session complete' : `${remaining} remaining`}
      </Text>
      <View className="mt-3">
        <PrimaryButton fullWidth onPress={onResume}>
          Resume Session
        </PrimaryButton>
      </View>
    </View>
  );
}

// --- Stats -----------------------------------------------------------------

function StatsRow({ stats, theme }: { stats: FocusStats | null; theme: AppTheme }) {
  const tiles = [
    { label: 'Focus today', value: stats ? formatFocusMinutes(stats.focusMinutesToday) : '—' },
    { label: 'Sessions', value: stats ? String(stats.sessionsToday) : '—' },
    { label: 'Completed', value: stats ? String(stats.completedSessionsToday) : '—' },
    { label: 'Streak', value: stats ? `${stats.currentStreak}d` : '—' },
    { label: 'This week', value: stats ? formatFocusMinutes(stats.totalFocusMinutesThisWeek) : '—' },
    { label: 'Top task', value: stats?.topFocusTask?.title ?? 'None' },
  ];

  return (
    <View className="mb-3 flex-row flex-wrap gap-2">
      {tiles.map((tile) => (
        <View
          key={tile.label}
          className="rounded-2xl border p-3"
          style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.card, width: '31%' }}
        >
          <Text className="text-[10px] font-black uppercase" style={{ color: theme.colors.secondaryText }}>
            {tile.label}
          </Text>
          <Text numberOfLines={1} className="mt-1 text-base font-black" style={{ color: theme.colors.text }}>
            {tile.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

// --- Recommendation --------------------------------------------------------

function RecommendationCard({
  recommendation,
  theme,
  tasks,
  onFocus,
}: {
  recommendation: FocusRecommendation | null;
  theme: AppTheme;
  tasks: ApiTask[];
  onFocus: (task: ApiTask) => void;
}) {
  const { colors } = theme;
  if (!recommendation) {
    return (
      <View className="mb-3 rounded-2xl border p-4" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
        <Text className="text-[10px] font-black uppercase" style={{ color: colors.secondaryText }}>
          Recommended now
        </Text>
        <Text className="mt-1 text-sm" style={{ color: colors.secondaryText }}>
          No suggestion yet — mark a task as a focus task to get a recommendation.
        </Text>
      </View>
    );
  }

  const task = tasks.find((item) => item.id === recommendation.taskId);

  return (
    <View className="mb-3 rounded-2xl border p-4" style={{ borderColor: colors.accent, backgroundColor: colors.accentSoft }}>
      <Text className="text-[10px] font-black uppercase" style={{ color: colors.accent }}>
        Recommended now
      </Text>
      <Text className="mt-1 text-lg font-black" style={{ color: colors.text }}>
        {recommendation.taskTitle}
      </Text>
      <Text className="mt-1 text-sm" style={{ color: colors.secondaryText }}>
        Reason: {recommendation.reason}
      </Text>
      {task ? (
        <View className="mt-3">
          <PrimaryButton size="sm" onPress={() => onFocus(task)}>
            Start Focus
          </PrimaryButton>
        </View>
      ) : null}
    </View>
  );
}

// --- Focus card ------------------------------------------------------------

function FocusCard({
  task,
  theme,
  disabled,
  onView,
  onStart,
  onRemove,
}: {
  task: ApiTask;
  theme: AppTheme;
  disabled: boolean;
  onView: () => void;
  onStart: () => void;
  onRemove: () => void;
}) {
  const { colors } = theme;
  const completed = task.subtasks.filter((subtask) => subtask.isDone).length;
  const priority = toUiPriority(task.priority);
  const status = toUiStatus(task.status);

  return (
    <View className="mb-2 rounded-2xl border p-3" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
      <Pressable onPress={onView} accessibilityRole="button">
        <View className="flex-row flex-wrap items-center gap-2">
          <PriorityBadge label={priority} theme={theme} />
          <StatusBadge label={status} theme={theme} />
          <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: colors.surfaceElevated }}>
            <Text className="text-xs" style={{ color: colors.secondaryText }}>
              {task.category || 'General'}
            </Text>
          </View>
        </View>
        <Text numberOfLines={1} className="mt-2 text-sm font-black" style={{ color: colors.text }}>
          {task.title}
        </Text>
      </Pressable>

      <View className="mt-2 flex-row flex-wrap gap-x-4 gap-y-1">
        <Meta label="Due" value={formatDue(task.dueDate, task.dueTime)} theme={theme} />
        <Meta label="Est." value={task.estimatedTimeMinutes ? formatFocusMinutes(task.estimatedTimeMinutes) : '—'} theme={theme} />
        <Meta label="Subtasks" value={task.subtasks.length ? `${completed}/${task.subtasks.length}` : 'None'} theme={theme} />
        <Meta label="Progress" value={`${task.progress}%`} theme={theme} />
      </View>

      <View className="mt-2 h-1.5 rounded-full" style={{ backgroundColor: colors.progressTrack }}>
        <View
          className="h-1.5 rounded-full"
          style={{
            width: `${task.progress}%`,
            backgroundColor: task.progress === 100 ? colors.success : task.progress === 0 ? colors.border : colors.accent,
          }}
        />
      </View>

      <View className="mt-3 flex-row gap-2">
        <View className="flex-1">
          <PrimaryButton size="sm" fullWidth disabled={disabled} onPress={onStart}>
            Start Focus
          </PrimaryButton>
        </View>
        <OutlineButton size="sm" onPress={onRemove}>
          Remove
        </OutlineButton>
      </View>
    </View>
  );
}

function Meta({ label, value, theme }: { label: string; value: string; theme: AppTheme }) {
  return (
    <View>
      <Text className="text-[10px] font-black uppercase" style={{ color: theme.colors.secondaryText }}>
        {label}
      </Text>
      <Text className="text-xs font-semibold" style={{ color: theme.colors.text }}>
        {value}
      </Text>
    </View>
  );
}

// --- Today's sessions ------------------------------------------------------

function TodaySessions({ sessions, theme }: { sessions: FocusSession[]; theme: AppTheme }) {
  const { colors } = theme;
  if (!sessions.length) {
    return (
      <View className="rounded-2xl border p-4" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
        <Text className="text-sm" style={{ color: colors.secondaryText }}>
          No sessions yet today. Start one from the queue above.
        </Text>
      </View>
    );
  }

  return (
    <View className="rounded-2xl border p-2" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
      {sessions.map((session) => (
        <View key={session.id} className="flex-row items-center justify-between px-2 py-2.5">
          <View className="flex-1 pr-2">
            <Text numberOfLines={1} className="text-sm font-bold" style={{ color: colors.text }}>
              {session.taskTitle ?? 'Focus session'}
            </Text>
            <Text className="text-xs" style={{ color: colors.secondaryText }}>
              {labelForFocusType(session.sessionType)} · {formatTime(session.startedAt)}
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Text className="text-xs font-semibold" style={{ color: colors.secondaryText }}>
              {formatFocusMinutes(session.actualMinutes ?? 0)}
            </Text>
            <SessionStatusBadge status={session.status} theme={theme} />
          </View>
        </View>
      ))}
    </View>
  );
}

// --- Start session modal ---------------------------------------------------

function StartSessionModal({
  visible,
  taskTitle,
  busy,
  theme,
  onClose,
  onStart,
}: {
  visible: boolean;
  taskTitle: string;
  busy: boolean;
  theme: AppTheme;
  onClose: () => void;
  onStart: (type: FocusSessionType, minutes: number) => void;
}) {
  const { colors } = theme;
  const [selected, setSelected] = useState<FocusSessionType>('pomodoro');
  const [customMinutes, setCustomMinutes] = useState('30');

  const preset = SESSION_TYPE_PRESETS.find((item) => item.type === selected);
  const minutes = selected === 'custom' ? clampMinutes(Number(customMinutes)) : (preset?.minutes ?? 25);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end" style={{ backgroundColor: '#00000088' }}>
        <View className="rounded-t-3xl border p-5" style={{ backgroundColor: colors.surfaceElevated, borderColor: colors.border }}>
          <Text className="text-center text-xl font-black" style={{ color: colors.text }}>
            Start Focus Session
          </Text>
          <Text numberOfLines={1} className="mb-4 mt-1 text-center text-sm" style={{ color: colors.secondaryText }}>
            {taskTitle}
          </Text>

          <ScrollView style={{ maxHeight: 320 }}>
            {SESSION_TYPE_PRESETS.map((item) => {
              const isSelected = selected === item.type;
              return (
                <Pressable
                  key={item.type}
                  onPress={() => setSelected(item.type)}
                  accessibilityRole="button"
                  className="mb-2 rounded-2xl border p-3"
                  style={{
                    borderColor: isSelected ? colors.accent : colors.border,
                    backgroundColor: isSelected ? colors.accentSoft : colors.card,
                  }}
                >
                  <Text className="text-sm font-black" style={{ color: colors.text }}>
                    {item.label}
                    {item.type !== 'custom' ? ` · ${item.minutes}m` : ''}
                  </Text>
                  <Text className="mt-0.5 text-xs" style={{ color: colors.secondaryText }}>
                    {item.description}
                  </Text>
                </Pressable>
              );
            })}

            {selected === 'custom' ? (
              <View className="mb-2">
                <Text className="mb-1 text-[10px] font-black uppercase" style={{ color: colors.secondaryText }}>
                  Minutes
                </Text>
                <TextInput
                  keyboardType="number-pad"
                  value={customMinutes}
                  onChangeText={setCustomMinutes}
                  className="rounded-2xl border px-4 py-3 text-sm font-semibold"
                  style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }}
                  placeholderTextColor={colors.placeholder}
                />
              </View>
            ) : null}
          </ScrollView>

          <View className="mt-3 flex-row gap-2">
            <View className="flex-1">
              <SecondaryButton fullWidth onPress={onClose}>
                Cancel
              </SecondaryButton>
            </View>
            <View className="flex-1">
              <PrimaryButton fullWidth disabled={busy} onPress={() => onStart(selected, minutes)}>
                Start {minutes} min
              </PrimaryButton>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// --- Badges & helpers ------------------------------------------------------

function PriorityBadge({ label, theme }: { label: string; theme: AppTheme }) {
  const { colors } = theme;
  const color = label === 'High' || label === 'Urgent' ? colors.error : label === 'Medium' ? colors.warning : colors.success;
  return (
    <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: `${color}33` }}>
      <Text className="text-xs font-bold" style={{ color }}>
        {label}
      </Text>
    </View>
  );
}

function StatusBadge({ label, theme }: { label: string; theme: AppTheme }) {
  const { colors } = theme;
  const color =
    label === 'Done' ? colors.success : label === 'In Progress' ? colors.primary : label === 'Missed' ? colors.error : colors.secondaryText;
  return (
    <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: `${color}33` }}>
      <Text className="text-xs font-bold" style={{ color }}>
        {label}
      </Text>
    </View>
  );
}

function SessionStatusBadge({ status, theme }: { status: string; theme: AppTheme }) {
  const { colors } = theme;
  const color = status === 'completed' ? colors.success : status === 'cancelled' ? colors.error : colors.primary;
  return (
    <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: `${color}33` }}>
      <Text className="text-[11px] font-bold" style={{ color }}>
        {status}
      </Text>
    </View>
  );
}

function clampMinutes(value: number): number {
  if (Number.isNaN(value)) return 1;
  return Math.min(Math.max(Math.round(value), 1), 600);
}

function formatDue(value?: string, dueTime?: string): string {
  if (!value) return 'No due date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const datePart = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date);
  return dueTime ? `${datePart} · ${dueTime}` : datePart;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(date);
}
