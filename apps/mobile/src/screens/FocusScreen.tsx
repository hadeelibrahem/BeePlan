import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AppState,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  BottomNavBar,
  OutlineButton,
  PageHeader,
  PrimaryButton,
  ScreenLayout,
  SecondaryButton,
} from "../components/layout";
import { useStrictFocus } from "../features/focus/StrictFocusContext";
import { StrictModeSection } from "../features/focus/StrictModeSection";
import { StrictModeSetupSheet } from "../features/focus/StrictModeSetupSheet";
import {
  decideStrictStartGate,
  getStrictModeLayerVisibility,
} from "../features/focus/strictModeRules";
import {
  toUiPriority,
  toUiStatus,
  updateTask,
  type ApiTask,
} from "../lib/tasksApi";
import {
  SESSION_TYPE_PRESETS,
  formatFocusMinutes,
  getFocusRecommendation,
  getFocusQueue,
  getFocusStats,
  getTodayFocusSessions,
  labelForFocusType,
  type FocusRecommendation,
  type FocusQueueItem,
  type FocusSession,
  type FocusSessionType,
  type FocusStats,
} from "../lib/focusApi";
import { formatFocusClock } from "../lib/focusApi";
import { focusParentLabel, focusPrimaryTitle } from "../lib/focusDisplay";
import type { UseFocusSession } from "../lib/useFocusSession";
import type { AppTheme } from "../theme/colors";
import { useTheme } from "../theme/useTheme";

type StartTarget = {
  id: string; // taskId
  title: string; // display title (subtask title when focusing a subtask)
  taskTitle: string; // parent task title (for "Part of:")
  priority: string;
  category: string;
  subtaskId: string | null;
  subtaskTitle: string | null;
};

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
  accessToken = "",
  onTaskUpdated,
  focus,
  onOpenWorkspace,
}: Props) {
  const { theme } = useTheme();
  const { colors } = theme;

  const [stats, setStats] = useState<FocusStats | null>(null);
  const [recommendation, setRecommendation] =
    useState<FocusRecommendation | null>(null);
  const [todaySessions, setTodaySessions] = useState<FocusSession[]>([]);
  const [focusQueue, setFocusQueue] = useState<FocusQueueItem[]>([]);
  const [startModalTask, setStartModalTask] = useState<StartTarget | null>(
    null,
  );
  const removingRef = useRef<Set<string>>(new Set());

  // --- Strict Mode -----------------------------------------------------------
  const strict = useStrictFocus();
  const [setupOpen, setSetupOpen] = useState(false);
  // A strict start deferred until the user grants Usage Access in Settings.
  const [pendingStart, setPendingStart] = useState<{
    type: FocusSessionType;
    minutes: number;
  } | null>(null);
  const [permissionMsg, setPermissionMsg] = useState<string | null>(null);

  useEffect(() => {
    if (__DEV__) {
      console.log("[StrictMode] platform", Platform.OS);
      console.log(
        "[StrictMode] native module available",
        strict.blocker.available,
      );
    }
  }, [strict.blocker.available]);

  useEffect(() => {
    if (__DEV__) console.log("[StrictMode] setup sheet visible", setupOpen);
  }, [setupOpen]);


  const refreshFocusData = useCallback(async () => {
    if (!accessToken) return;
    try {
      const [statsData, sessions, rec, queue] = await Promise.all([
        getFocusStats(accessToken),
        getTodayFocusSessions(accessToken),
        getFocusRecommendation(accessToken).catch(() => null),
        getFocusQueue(accessToken),
      ]);
      setStats(statsData);
      setTodaySessions(sessions);
      setRecommendation(rec);
      setFocusQueue(queue);
    } catch {
      // Keep the last-known data on transient failures.
    }
  }, [accessToken]);

  useEffect(() => {
    void refreshFocusData();
  }, [refreshFocusData]);

  // Starts the real focus session (unchanged behaviour). Native blocking is
  // armed automatically afterwards by useStrictFocusSync once `focus.active`
  // flips on — never here — so the normal flow is identical when strict is off.
  const beginSession = useCallback(
    async (type: FocusSessionType, minutes: number) => {
      if (!startModalTask) return;
      const ok = await focus.start(
        {
          id: startModalTask.id,
          title: startModalTask.taskTitle,
          priority: startModalTask.priority,
          category: startModalTask.category,
          subtaskId: startModalTask.subtaskId,
          subtaskTitle: startModalTask.subtaskTitle,
        },
        type,
        minutes,
      );
      if (ok) {
        setStartModalTask(null);
        setPermissionMsg(null);
        onOpenWorkspace();
      }
    },
    [startModalTask, focus, onOpenWorkspace],
  );

  const handleStart = useCallback(
    async (type: FocusSessionType, minutes: number) => {
      const strictGate = decideStrictStartGate({
        supported: strict.blocker.supported,
        available: strict.blocker.available,
        enabled: strict.prefs.enabled,
        blockedCount: strict.prefs.blockedPackages.length,
        usageAccess: strict.blocker.usageAccess,
      });

      if (strictGate.type !== "start-normal") {
        if (strictGate.type === "choose-apps") {
          setPendingStart(null);
          setPermissionMsg(null);
          setSetupOpen(true);
          return;
        }

        setPendingStart(null);
        setPermissionMsg(strictGate.message);

        if (strictGate.type === "request-usage-access") {
          setPendingStart({ type, minutes });
          strict.blocker.openUsageAccessSettings();
        }
        return;
      }

      await beginSession(type, minutes);
    },
    [strict, beginSession],
  );

  // When the user returns from Settings, recheck permission and either continue
  // the deferred start or tell them it still isn't granted.
  useEffect(() => {
    if (!pendingStart) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      const granted = strict.blocker.refreshUsageAccess();
      if (granted) {
        const { type, minutes } = pendingStart;
        setPendingStart(null);
        void beginSession(type, minutes);
      } else {
        setPermissionMsg(
          "Usage Access still not granted. Strict Mode needs it to block apps.",
        );
      }
    });
    return () => sub.remove();
  }, [pendingStart, strict.blocker, beginSession]);

  const openStartModal = useCallback((task: ApiTask) => {
    setStartModalTask({
      id: task.id,
      title: task.title,
      taskTitle: task.title,
      priority: toUiPriority(task.priority),
      category: task.category || "General",
      subtaskId: null,
      subtaskTitle: null,
    });
  }, []);

  // Start from the recommendation: focuses the recommended subtask when present,
  // otherwise the task itself (falls back to today's behaviour).
  const startRecommendation = useCallback(
    (rec: FocusRecommendation) => {
      const task = tasks.find((item) => item.id === rec.taskId);
      setStartModalTask({
        id: rec.taskId,
        title: focusPrimaryTitle(rec),
        taskTitle: rec.taskTitle,
        priority: task ? toUiPriority(task.priority) : "Medium",
        category: task?.category || "General",
        subtaskId: rec.subtaskId ?? null,
        subtaskTitle: rec.subtaskTitle ?? null,
      });
    },
    [tasks],
  );

  const handleRemoveFocus = useCallback(
    async (taskId: string) => {
      if (!accessToken || removingRef.current.has(taskId)) return;
      removingRef.current.add(taskId);
      try {
        const updated = await updateTask(accessToken, taskId, {
          isFocusTask: false,
        });
        onTaskUpdated?.(updated);
        void refreshFocusData();
      } finally {
        removingRef.current.delete(taskId);
      }
    },
    [accessToken, onTaskUpdated, refreshFocusData],
  );

  const layerVisibility = getStrictModeLayerVisibility(
    Boolean(startModalTask),
    setupOpen,
  );

  return (
    <ScreenLayout
      footer={
        <BottomNavBar
          active="focus"
          onNavigateDashboard={onBackDashboard}
          onNavigateReminders={onViewReminders}
        />
      }
    >
      <PageHeader title="Focus Mode" subtitle="Your deep-work control center" />

      <StatsRow stats={stats} theme={theme} />

      {focus.active ? (
        <InProgressCard
          theme={theme}
          title={focusPrimaryTitle(focus.active)}
          subtitle={focusParentLabel(focus.active)}
          remaining={formatFocusClock(focus.remainingMs)}
          complete={focus.sessionComplete}
          onResume={onOpenWorkspace}
        />
      ) : (
        <RecommendationCard
          theme={theme}
          recommendation={recommendation}
          onStart={startRecommendation}
        />
      )}

      <Text
        className="mb-2 mt-2 text-sm font-black"
        style={{ color: colors.text }}
      >
        Focus Queue · {focusQueue.length} items
      </Text>

      {focusQueue.length ? (
        focusQueue.map((item) => (
          <QueueFocusCard
            key={item.subtaskId ?? item.taskId}
            item={item}
            theme={theme}
            disabled={Boolean(focus.active)}
            onView={() => { const task = tasks.find((entry) => entry.id === item.taskId); if (task) onViewTaskDetails(task); }}
            onStart={() => setStartModalTask({ id: item.taskId, title: focusPrimaryTitle(item), taskTitle: item.taskTitle, priority: item.priority, category: 'General', subtaskId: item.subtaskId, subtaskTitle: item.subtaskTitle })}
            onRemove={item.subtaskId ? undefined : () => void handleRemoveFocus(item.taskId)}
          />
        ))
      ) : (
        <View
          className="rounded-2xl border p-4"
          style={{ borderColor: colors.border, backgroundColor: colors.card }}
        >
          <Text
            className="text-center text-sm font-black"
            style={{ color: colors.text }}
          >
            No focus tasks yet
          </Text>
          <Text
            className="mt-1 text-center text-xs"
            style={{ color: colors.secondaryText }}
          >
            Turn on Focus Task from Task Details to add it here.
          </Text>
        </View>
      )}

      <Text
        className="mb-2 mt-4 text-sm font-black"
        style={{ color: colors.text }}
      >
        Today's Sessions
      </Text>
      <TodaySessions sessions={todaySessions} theme={theme} />

      <StartSessionModal
        visible={layerVisibility.startModalVisible}
        taskTitle={startModalTask?.title ?? ""}
        busy={focus.busy}
        theme={theme}
        permissionMsg={permissionMsg}
        strictSection={
          <StrictModeSection onEditApps={() => setSetupOpen(true)} />
        }
        onClose={() => {
          setStartModalTask(null);
          setPendingStart(null);
          setPermissionMsg(null);
        }}
        onStart={handleStart}
      />

      <StrictModeSetupSheet
        visible={layerVisibility.setupSheetVisible}
        blocker={strict.blocker}
        initialPrefs={strict.prefs}
        onClose={() => setSetupOpen(false)}
        onSaved={strict.setPrefs}
      />
    </ScreenLayout>
  );
}

// --- In-progress resume card ----------------------------------------------

function InProgressCard({
  theme,
  title,
  subtitle,
  remaining,
  complete,
  onResume,
}: {
  theme: AppTheme;
  title: string;
  subtitle?: string | null;
  remaining: string;
  complete: boolean;
  onResume: () => void;
}) {
  const { colors } = theme;
  return (
    <View
      className="mb-3 rounded-2xl border p-4"
      style={{ borderColor: colors.accent, backgroundColor: colors.accentSoft }}
    >
      <Text
        className="text-[10px] font-black uppercase"
        style={{ color: colors.accent }}
      >
        Focus session in progress
      </Text>
      <Text
        numberOfLines={1}
        className="mt-1 text-lg font-black"
        style={{ color: colors.text }}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          numberOfLines={1}
          className="mt-0.5 text-xs font-semibold"
          style={{ color: colors.secondaryText }}
        >
          {subtitle}
        </Text>
      ) : null}
      <Text
        className="mt-0.5 text-sm font-semibold"
        style={{ color: colors.secondaryText }}
      >
        {complete ? "Session complete" : `${remaining} remaining`}
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

function StatsRow({
  stats,
  theme,
}: {
  stats: FocusStats | null;
  theme: AppTheme;
}) {
  const tiles = [
    {
      label: "Focus today",
      value: stats ? formatFocusMinutes(stats.focusMinutesToday) : "—",
    },
    { label: "Sessions", value: stats ? String(stats.sessionsToday) : "—" },
    {
      label: "Completed",
      value: stats ? String(stats.completedSessionsToday) : "—",
    },
    { label: "Streak", value: stats ? `${stats.currentStreak}d` : "—" },
    {
      label: "This week",
      value: stats ? formatFocusMinutes(stats.totalFocusMinutesThisWeek) : "—",
    },
    { label: "Top task", value: stats?.topFocusTask?.title ?? "None" },
  ];

  return (
    <View className="mb-3 flex-row flex-wrap gap-2">
      {tiles.map((tile) => (
        <View
          key={tile.label}
          className="rounded-2xl border p-3"
          style={{
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.card,
            width: "31%",
          }}
        >
          <Text
            className="text-[10px] font-black uppercase"
            style={{ color: theme.colors.secondaryText }}
          >
            {tile.label}
          </Text>
          <Text
            numberOfLines={1}
            className="mt-1 text-base font-black"
            style={{ color: theme.colors.text }}
          >
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
  onStart,
}: {
  recommendation: FocusRecommendation | null;
  theme: AppTheme;
  onStart: (rec: FocusRecommendation) => void;
}) {
  const { colors } = theme;
  if (!recommendation) {
    return (
      <View
        className="mb-3 rounded-2xl border p-4"
        style={{ borderColor: colors.border, backgroundColor: colors.card }}
      >
        <Text
          className="text-[10px] font-black uppercase"
          style={{ color: colors.secondaryText }}
        >
          Recommended now
        </Text>
        <Text className="mt-1 text-sm" style={{ color: colors.secondaryText }}>
          No suggestion yet — mark a task as a focus task to get a
          recommendation.
        </Text>
      </View>
    );
  }

  const isSubtask = Boolean(recommendation.subtaskId);
  const primary = focusPrimaryTitle(recommendation);
  const parent = focusParentLabel(recommendation);

  return (
    <View
      className="mb-3 rounded-2xl border p-4"
      style={{ borderColor: colors.accent, backgroundColor: colors.accentSoft }}
    >
      <Text
        className="text-[10px] font-black uppercase"
        style={{ color: colors.accent }}
      >
        {isSubtask ? "Do this now" : "Recommended now"}
      </Text>
      <Text className="mt-1 text-lg font-black" style={{ color: colors.text }}>
        {primary}
      </Text>
      {parent ? (
        <Text
          className="mt-0.5 text-xs font-semibold"
          style={{ color: colors.secondaryText }}
        >
          {parent}
        </Text>
      ) : null}
      {recommendation.estimatedMinutes ? (
        <Text className="mt-1 text-xs" style={{ color: colors.secondaryText }}>
          Estimated: {formatFocusMinutes(recommendation.estimatedMinutes)}
        </Text>
      ) : null}
      <Text className="mt-1 text-sm" style={{ color: colors.secondaryText }}>
        Reason: {recommendation.reason}
      </Text>
      <View className="mt-3">
        <PrimaryButton size="sm" onPress={() => onStart(recommendation)}>
          Start Focus
        </PrimaryButton>
      </View>
    </View>
  );
}

// --- Focus card ------------------------------------------------------------

function QueueFocusCard({ item, theme, disabled, onView, onStart, onRemove }: { item: FocusQueueItem; theme: AppTheme; disabled: boolean; onView: () => void; onStart: () => void; onRemove?: () => void }) {
  const { colors } = theme;
  const parent = focusParentLabel(item);
  return <View className="mb-2 rounded-2xl border p-3" style={{ borderColor: colors.border, backgroundColor: colors.card }}><Pressable onPress={onView}><View className="flex-row flex-wrap gap-2"><PriorityBadge label={toUiPriority(item.priority as ApiTask['priority'])} theme={theme} /><StatusBadge label={toUiStatus(item.status as ApiTask['status'])} theme={theme} /></View><Text numberOfLines={1} className="mt-2 text-sm font-black" style={{ color: colors.text }}>{focusPrimaryTitle(item)}</Text>{parent ? <Text className="mt-0.5 text-xs font-semibold" style={{ color: colors.secondaryText }}>{parent}</Text> : null}</Pressable><View className="mt-2 flex-row flex-wrap gap-x-4 gap-y-1"><Meta label="Due" value={formatDue(item.dueDate ?? undefined, '')} theme={theme} /><Meta label="Est." value={item.estimatedMinutes ? formatFocusMinutes(item.estimatedMinutes) : '—'} theme={theme} /><Meta label="Ready" value={item.hasOpenDependencies ? 'Waiting' : 'Ready'} theme={theme} /></View><View className="mt-3 flex-row gap-2"><View className="flex-1"><PrimaryButton size="sm" fullWidth disabled={disabled} onPress={onStart}>Start Focus</PrimaryButton></View>{onRemove ? <OutlineButton size="sm" onPress={onRemove}>Remove</OutlineButton> : null}</View></View>;
}

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
    <View
      className="mb-2 rounded-2xl border p-3"
      style={{ borderColor: colors.border, backgroundColor: colors.card }}
    >
      <Pressable onPress={onView} accessibilityRole="button">
        <View className="flex-row flex-wrap items-center gap-2">
          <PriorityBadge label={priority} theme={theme} />
          <StatusBadge label={status} theme={theme} />
          <View
            className="rounded-full px-2 py-0.5"
            style={{ backgroundColor: colors.surfaceElevated }}
          >
            <Text className="text-xs" style={{ color: colors.secondaryText }}>
              {task.category || "General"}
            </Text>
          </View>
        </View>
        <Text
          numberOfLines={1}
          className="mt-2 text-sm font-black"
          style={{ color: colors.text }}
        >
          {task.title}
        </Text>
      </Pressable>

      <View className="mt-2 flex-row flex-wrap gap-x-4 gap-y-1">
        <Meta
          label="Due"
          value={formatDue(task.dueDate, task.dueTime)}
          theme={theme}
        />
        <Meta
          label="Est."
          value={
            task.estimatedTimeMinutes
              ? formatFocusMinutes(task.estimatedTimeMinutes)
              : "—"
          }
          theme={theme}
        />
        <Meta
          label="Subtasks"
          value={
            task.subtasks.length
              ? `${completed}/${task.subtasks.length}`
              : "None"
          }
          theme={theme}
        />
        <Meta label="Progress" value={`${task.progress}%`} theme={theme} />
      </View>

      <View
        className="mt-2 h-1.5 rounded-full"
        style={{ backgroundColor: colors.progressTrack }}
      >
        <View
          className="h-1.5 rounded-full"
          style={{
            width: `${task.progress}%`,
            backgroundColor:
              task.progress === 100
                ? colors.success
                : task.progress === 0
                  ? colors.border
                  : colors.accent,
          }}
        />
      </View>

      <View className="mt-3 flex-row gap-2">
        <View className="flex-1">
          <PrimaryButton
            size="sm"
            fullWidth
            disabled={disabled}
            onPress={onStart}
          >
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

function Meta({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: AppTheme;
}) {
  return (
    <View>
      <Text
        className="text-[10px] font-black uppercase"
        style={{ color: theme.colors.secondaryText }}
      >
        {label}
      </Text>
      <Text
        className="text-xs font-semibold"
        style={{ color: theme.colors.text }}
      >
        {value}
      </Text>
    </View>
  );
}

// --- Today's sessions ------------------------------------------------------

function TodaySessions({
  sessions,
  theme,
}: {
  sessions: FocusSession[];
  theme: AppTheme;
}) {
  const { colors } = theme;
  if (!sessions.length) {
    return (
      <View
        className="rounded-2xl border p-4"
        style={{ borderColor: colors.border, backgroundColor: colors.card }}
      >
        <Text className="text-sm" style={{ color: colors.secondaryText }}>
          No sessions yet today. Start one from the queue above.
        </Text>
      </View>
    );
  }

  return (
    <View
      className="rounded-2xl border p-2"
      style={{ borderColor: colors.border, backgroundColor: colors.card }}
    >
      {sessions.map((session) => (
        <View
          key={session.id}
          className="flex-row items-center justify-between px-2 py-2.5"
        >
          <View className="flex-1 pr-2">
            <Text
              numberOfLines={1}
              className="text-sm font-bold"
              style={{ color: colors.text }}
            >
              {focusPrimaryTitle(session)}
            </Text>
            {focusParentLabel(session) ? <Text className="text-xs" style={{ color: colors.secondaryText }}>{focusParentLabel(session)}</Text> : null}
            <Text className="text-xs" style={{ color: colors.secondaryText }}>
              {labelForFocusType(session.sessionType)} ·{" "}
              {formatTime(session.startedAt)}
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Text
              className="text-xs font-semibold"
              style={{ color: colors.secondaryText }}
            >
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
  permissionMsg,
  strictSection,
  onClose,
  onStart,
}: {
  visible: boolean;
  taskTitle: string;
  busy: boolean;
  theme: AppTheme;
  permissionMsg?: string | null;
  strictSection?: ReactNode;
  onClose: () => void;
  onStart: (type: FocusSessionType, minutes: number) => void;
}) {
  const { colors } = theme;
  const [selected, setSelected] = useState<FocusSessionType>("pomodoro");
  const [customMinutes, setCustomMinutes] = useState("30");

  const preset = SESSION_TYPE_PRESETS.find((item) => item.type === selected);
  const minutes =
    selected === "custom"
      ? clampMinutes(Number(customMinutes))
      : (preset?.minutes ?? 25);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View
        className="flex-1 justify-end"
        style={{ backgroundColor: "#00000088" }}
      >
        <View
          className="rounded-t-3xl border p-5"
          style={{
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
          }}
        >
          <Text
            className="text-center text-xl font-black"
            style={{ color: colors.text }}
          >
            Start Focus Session
          </Text>
          <Text
            numberOfLines={1}
            className="mb-4 mt-1 text-center text-sm"
            style={{ color: colors.secondaryText }}
          >
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
                    backgroundColor: isSelected
                      ? colors.accentSoft
                      : colors.card,
                  }}
                >
                  <Text
                    className="text-sm font-black"
                    style={{ color: colors.text }}
                  >
                    {item.label}
                    {item.type !== "custom" ? ` · ${item.minutes}m` : ""}
                  </Text>
                  <Text
                    className="mt-0.5 text-xs"
                    style={{ color: colors.secondaryText }}
                  >
                    {item.description}
                  </Text>
                </Pressable>
              );
            })}

            {selected === "custom" ? (
              <View className="mb-2">
                <Text
                  className="mb-1 text-[10px] font-black uppercase"
                  style={{ color: colors.secondaryText }}
                >
                  Minutes
                </Text>
                <TextInput
                  keyboardType="number-pad"
                  value={customMinutes}
                  onChangeText={setCustomMinutes}
                  className="rounded-2xl border px-4 py-3 text-sm font-semibold"
                  style={{
                    borderColor: colors.border,
                    backgroundColor: colors.input,
                    color: colors.text,
                  }}
                  placeholderTextColor={colors.placeholder}
                />
              </View>
            ) : null}

            {strictSection}

            {permissionMsg ? (
              <View
                className="mb-2 rounded-2xl border p-3"
                style={{
                  borderColor: colors.warning,
                  backgroundColor: `${colors.warning}22`,
                }}
              >
                <Text
                  className="text-xs font-semibold"
                  style={{ color: colors.text }}
                >
                  {permissionMsg}
                </Text>
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
              <PrimaryButton
                fullWidth
                disabled={busy}
                onPress={() => onStart(selected, minutes)}
              >
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
  const color =
    label === "High" || label === "Urgent"
      ? colors.error
      : label === "Medium"
        ? colors.warning
        : colors.success;
  return (
    <View
      className="rounded-full px-2 py-0.5"
      style={{ backgroundColor: `${color}33` }}
    >
      <Text className="text-xs font-bold" style={{ color }}>
        {label}
      </Text>
    </View>
  );
}

function StatusBadge({ label, theme }: { label: string; theme: AppTheme }) {
  const { colors } = theme;
  const color =
    label === "Done"
      ? colors.success
      : label === "In Progress"
        ? colors.primary
        : label === "Missed"
          ? colors.error
          : colors.secondaryText;
  return (
    <View
      className="rounded-full px-2 py-0.5"
      style={{ backgroundColor: `${color}33` }}
    >
      <Text className="text-xs font-bold" style={{ color }}>
        {label}
      </Text>
    </View>
  );
}

function SessionStatusBadge({
  status,
  theme,
}: {
  status: string;
  theme: AppTheme;
}) {
  const { colors } = theme;
  const color =
    status === "completed"
      ? colors.success
      : status === "cancelled"
        ? colors.error
        : colors.primary;
  return (
    <View
      className="rounded-full px-2 py-0.5"
      style={{ backgroundColor: `${color}33` }}
    >
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
  if (!value) return "No due date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const datePart = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(date);
  return dueTime ? `${datePart} · ${dueTime}` : datePart;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
