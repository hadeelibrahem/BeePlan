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
import { useLanguage } from '../i18n/LanguageContext';

type Translate = (key: string, params?: Record<string, string | number>) => string;

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
  onOpenRooms?: () => void;
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
  onOpenRooms,
}: Props) {
  const { t, language } = useLanguage();
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
          t("focusUi.usageAccessRequired"),
        );
      }
    });
    return () => sub.remove();
  }, [pendingStart, strict.blocker, beginSession, t]);

  const openStartModal = useCallback((task: ApiTask) => {
    setStartModalTask({
      id: task.id,
      title: task.title,
      taskTitle: task.title,
      priority: toUiPriority(task.priority),
      category: task.category || t("focusHome.general"),
      subtaskId: null,
      subtaskTitle: null,
    });
  }, [t]);

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
        category: task?.category || t("focusHome.general"),
        subtaskId: rec.subtaskId ?? null,
        subtaskTitle: rec.subtaskTitle ?? null,
      });
    },
    [tasks, t],
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
      <PageHeader title={t("focusUi.brand")} subtitle={t("focusHome.deepWork")} />
      {onOpenRooms ? <View className="mb-4 rounded-2xl border p-4" style={{ borderColor: colors.border, backgroundColor: colors.card }}><Text className="font-black" style={{ color: colors.text }}>{t("focusHome.sharedSessions")}</Text><Text className="mb-3 mt-1" style={{ color: colors.secondaryText }}>{t("focusHome.sharedDescription")}</Text><PrimaryButton fullWidth onPress={onOpenRooms}>{t("focusHome.exploreSessions")}</PrimaryButton></View> : null}

      <StatsRow stats={stats} theme={theme} t={t} />

      {focus.active ? (
        <InProgressCard
          theme={theme}
          title={focusPrimaryTitle(focus.active)}
          subtitle={focusParentLabel(focus.active)}
          remaining={formatFocusClock(focus.remainingMs)}
          complete={focus.sessionComplete}
          onResume={onOpenWorkspace}
          t={t}
        />
      ) : (
        <RecommendationCard
          theme={theme}
          recommendation={recommendation}
          onStart={startRecommendation}
          t={t}
        />
      )}

      <Text
        className="mb-2 mt-2 text-sm font-black"
        style={{ color: colors.text }}
      >
        {t("focusHome.queue")} · {t("focusHome.items", { count: focusQueue.length })}
      </Text>

      {focusQueue.length ? (
        focusQueue.map((item) => (
          <QueueFocusCard
            key={item.subtaskId ?? item.taskId}
            item={item}
            theme={theme}
            disabled={Boolean(focus.active)}
            onView={() => { const task = tasks.find((entry) => entry.id === item.taskId); if (task) onViewTaskDetails(task); }}
            onStart={() => setStartModalTask({ id: item.taskId, title: focusPrimaryTitle(item), taskTitle: item.taskTitle, priority: item.priority, category: t("focusHome.general"), subtaskId: item.subtaskId, subtaskTitle: item.subtaskTitle })}
            onRemove={item.subtaskId ? undefined : () => void handleRemoveFocus(item.taskId)}
            t={t}
            language={language}
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
            {t("focusHome.noFocusTasks")}
          </Text>
          <Text
            className="mt-1 text-center text-xs"
            style={{ color: colors.secondaryText }}
          >
            {t("focusHome.focusTaskHint")}
          </Text>
        </View>
      )}

      <Text
        className="mb-2 mt-4 text-sm font-black"
        style={{ color: colors.text }}
      >
        {t("focusHome.todaySessions")}
      </Text>
      <TodaySessions sessions={todaySessions} theme={theme} t={t} language={language} />

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
        t={t}
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
  t,
}: {
  theme: AppTheme;
  title: string;
  subtitle?: string | null;
  remaining: string;
  complete: boolean;
  onResume: () => void;
  t: Translate;
}) {
  const { colors } = theme;
  return (
    <View
      className="mb-3 rounded-2xl border p-4"
      style={{ borderColor: colors.accent, backgroundColor: colors.accentSoft }}
    >
      <Text
        className="text-[10px] font-black uppercase"
        style={{ color: colors.accentInk }}
      >
        {t("focusHome.sessionInProgressLabel")}
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
        {complete ? t("focusHome.sessionComplete") : t("focusHome.remaining", { time: remaining })}
      </Text>
      <View className="mt-3">
        <PrimaryButton fullWidth onPress={onResume}>
          {t("focusHome.resumeSession")}
        </PrimaryButton>
      </View>
    </View>
  );
}

// --- Stats -----------------------------------------------------------------

function StatsRow({
  stats,
  theme,
  t,
}: {
  stats: FocusStats | null;
  theme: AppTheme;
  t: Translate;
}) {
  const tiles = [
    {
      label: t("focusHome.focusToday"),
      value: stats ? t("focusUi.minutes", { count: stats.focusMinutesToday }) : "—",
    },
    { label: t("focusHome.sessionsToday"), value: stats ? String(stats.sessionsToday) : "—" },
    {
      label: t("focusHome.completed"),
      value: stats ? String(stats.completedSessionsToday) : "—",
    },
    { label: t("focusHome.currentStreak"), value: stats ? t("focusSession.days", { count: stats.currentStreak }) : "—" },
    {
      label: t("focusHome.thisWeek"),
      value: stats ? t("focusUi.minutes", { count: stats.totalFocusMinutesThisWeek }) : "—",
    },
    { label: t("focusHome.topTask"), value: stats?.topFocusTask?.title ?? t("focusHome.noneYet") },
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
  t,
}: {
  recommendation: FocusRecommendation | null;
  theme: AppTheme;
  onStart: (rec: FocusRecommendation) => void;
  t: Translate;
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
          {t("focusHome.recommendedNow")}
        </Text>
        <Text className="mt-1 text-sm" style={{ color: colors.secondaryText }}>
          {t("focusHome.noSuggestion")}
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
        style={{ color: colors.accentInk }}
      >
        {isSubtask ? t("focusHome.doThisNow") : t("focusHome.recommendedNow")}
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
          {t("focusHome.estimated", { duration: t("focusUi.minutes", { count: recommendation.estimatedMinutes }) })}
        </Text>
      ) : null}
      <Text className="mt-1 text-sm" style={{ color: colors.secondaryText }}>
        {t("focusHome.reason", { reason: recommendation.reason })}
      </Text>
      <View className="mt-3">
        <PrimaryButton size="sm" onPress={() => onStart(recommendation)}>
          {t("focusHome.startFocus")}
        </PrimaryButton>
      </View>
    </View>
  );
}

// --- Focus card ------------------------------------------------------------

function QueueFocusCard({ item, theme, disabled, onView, onStart, onRemove, t, language }: { item: FocusQueueItem; theme: AppTheme; disabled: boolean; onView: () => void; onStart: () => void; onRemove?: () => void; t: Translate; language: string }) {
  const { colors } = theme;
  const parent = focusParentLabel(item);
  return <View className="mb-2 rounded-2xl border p-3" style={{ borderColor: colors.border, backgroundColor: colors.card }}><Pressable onPress={onView}><View className="flex-row flex-wrap gap-2"><PriorityBadge label={localizedPriority(item.priority, t)} theme={theme} /><StatusBadge label={localizedStatus(item.status, t)} theme={theme} /></View><Text numberOfLines={1} className="mt-2 text-sm font-black" style={{ color: colors.text }}>{focusPrimaryTitle(item)}</Text>{parent ? <Text className="mt-0.5 text-xs font-semibold" style={{ color: colors.secondaryText }}>{parent}</Text> : null}</Pressable><View className="mt-2 flex-row flex-wrap gap-x-4 gap-y-1"><Meta label={t("focusHome.due")} value={formatDue(item.dueDate ?? undefined, '', language, t)} theme={theme} /><Meta label={t("focusHome.estimatedShort")} value={item.estimatedMinutes ? t("focusUi.minutes", { count: item.estimatedMinutes }) : "—"} theme={theme} /><Meta label={t("focusHome.ready")} value={item.hasOpenDependencies ? t("focusHome.waiting") : t("focusHome.ready")} theme={theme} /></View><View className="mt-3 flex-row gap-2"><View className="flex-1"><PrimaryButton size="sm" fullWidth disabled={disabled} onPress={onStart}>{t("focusHome.startFocus")}</PrimaryButton></View>{onRemove ? <OutlineButton size="sm" onPress={onRemove}>{t("focusHome.remove")}</OutlineButton> : null}</View></View>;
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
  const { t, language } = useLanguage();
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
          label={t("focusHome.due")}
          value={formatDue(task.dueDate, task.dueTime, language, t)}
          theme={theme}
        />
        <Meta
          label={t("focusHome.estimatedShort")}
          value={
            task.estimatedTimeMinutes
              ? formatFocusMinutes(task.estimatedTimeMinutes)
              : "—"
          }
          theme={theme}
        />
        <Meta
          label={t("focusHome.subtasks")}
          value={
            task.subtasks.length
              ? `${completed}/${task.subtasks.length}`
              : t("focusHome.none")
          }
          theme={theme}
        />
        <Meta label={t("focusHome.progress")} value={`${task.progress}%`} theme={theme} />
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
            {t("focusHome.startFocus")}
          </PrimaryButton>
        </View>
        <OutlineButton size="sm" onPress={onRemove}>
          {t("focusHome.remove")}
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
  t,
  language,
}: {
  sessions: FocusSession[];
  theme: AppTheme;
  t: Translate;
  language: string;
}) {
  const { colors } = theme;
  if (!sessions.length) {
    return (
      <View
        className="rounded-2xl border p-4"
        style={{ borderColor: colors.border, backgroundColor: colors.card }}
      >
        <Text className="text-sm" style={{ color: colors.secondaryText }}>
          {t("focusHome.noSessions")}
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
              {focusTypeLabel(session.sessionType, t)} ·{" "}
              {formatTime(session.startedAt, language)}
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Text
              className="text-xs font-semibold"
              style={{ color: colors.secondaryText }}
            >
              {t("focusUi.minutes", { count: session.actualMinutes ?? 0 })}
            </Text>
            <SessionStatusBadge status={session.status} theme={theme} t={t} />
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
  t,
}: {
  visible: boolean;
  taskTitle: string;
  busy: boolean;
  theme: AppTheme;
  permissionMsg?: string | null;
  strictSection?: ReactNode;
  onClose: () => void;
  onStart: (type: FocusSessionType, minutes: number) => void;
  t: Translate;
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
            {t("focusHome.startSession")}
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
                    {focusTypeLabel(item.type, t)}
                    {item.type !== "custom" ? ` · ${t("focusUi.minutes", { count: item.minutes })}` : ""}
                  </Text>
                  <Text
                    className="mt-0.5 text-xs"
                    style={{ color: colors.secondaryText }}
                  >
                    {focusTypeDescription(item.type, t)}
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
                  {t("focusHome.minutes")}
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
                {t("common.cancel")}
              </SecondaryButton>
            </View>
            <View className="flex-1">
              <PrimaryButton
                fullWidth
                disabled={busy}
                onPress={() => onStart(selected, minutes)}
              >
                {t("focusHome.startWithDuration", { duration: t("focusUi.minutes", { count: minutes }) })}
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
  t,
}: {
  status: string;
  theme: AppTheme;
  t: Translate;
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
        {status === "completed" ? t("focusHome.statusCompleted") : status === "cancelled" ? t("focusHome.statusCancelled") : t("focusHome.statusActive")}
      </Text>
    </View>
  );
}

function clampMinutes(value: number): number {
  if (Number.isNaN(value)) return 1;
  return Math.min(Math.max(Math.round(value), 1), 600);
}

function focusTypeLabel(type: FocusSessionType, t: Translate): string {
  return t(`focusHome.${type === "pomodoro" ? "pomodoro" : type === "deep" ? "deep" : type === "long" ? "long" : "custom"}`);
}

function localizedPriority(priority: string, t: Translate): string {
  const key = priority.toLowerCase();
  return t(`taskLabels.priority.${key === "medium" ? "medium" : key === "high" ? "high" : key === "urgent" ? "urgent" : "low"}`);
}

function localizedStatus(status: string, t: Translate): string {
  const key = status === "in_progress" ? "inProgress" : status;
  return t(`taskLabels.status.${key === "todo" ? "todo" : key === "inProgress" ? "inProgress" : key === "done" ? "done" : key === "blocked" ? "blocked" : "missed"}`);
}

function focusTypeDescription(type: FocusSessionType, t: Translate): string {
  return t(`focusHome.${type === "pomodoro" ? "pomodoroDescription" : type === "deep" ? "deepDescription" : type === "long" ? "longDescription" : "customDescription"}`);
}

function formatDue(value: string | undefined, dueTime: string | undefined, language: string, t: Translate): string {
  if (!value) return t("focusHome.noDueDate");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const datePart = new Intl.DateTimeFormat(language === "ar" ? "ar" : "en", {
    month: "short",
    day: "numeric",
  }).format(date);
  return dueTime ? `${datePart} · ${dueTime}` : datePart;
}

function formatTime(value: string, language: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(language === "ar" ? "ar" : "en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
