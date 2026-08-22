import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pressable, Text, TextInput, View } from "react-native";
import {
  AppScreen,
  FilterTabs,
  PageHeader,
  PrimaryButton,
  SectionCard,
  SecondaryButton,
  StatsCard,
} from "../components/layout";
import { ScheduleConflictModal } from "../components/ScheduleConflictModal";
import { ExistingScheduleConflict } from "../components/ExistingScheduleConflict";
import {
  acceptDailyPlan,
  generateDailyPlan,
  getDailyPlanAcceptance,
  getDailyPlannerCandidates,
  getPlannerPreferences,
  resolveScheduleConflict,
  saveDailyPlannerSelection,
  skipCommitmentOccurrence,
  updatePlannerPreferences,
  type DailyPlan,
  type PlannerCandidates,
  type PlannerPreferences,
  type ScheduleConflict,
} from "../lib/plannerApi";
import { useTheme } from "../theme/useTheme";
import { useLanguage } from "../i18n/LanguageContext";
import {
  BUFFER_MINUTES_RANGE,
  ENERGY_LEVELS,
  formatUnavailableHours,
  parseBufferMinutes,
  parseUnavailableHours,
  savePlannerPreferencesOptimistically,
  setEnergyPreference,
  validatePlannerPreferences,
  type EnergyPeriod,
} from "./plannerPreferences";

type Tab = "today" | "progress" | "timeline" | "suggestions";
const tabs: { value: Tab; label: string }[] = [
  { value: "today", label: "" },
  { value: "progress", label: "" },
  { value: "timeline", label: "" },
  { value: "suggestions", label: "" },
];

export default function AiDailyPlannerScreen({
  accessToken,
  onBack,
  onPlanAccepted,
}: {
  accessToken: string;
  onBack: () => void;
  onPlanAccepted?: () => void;
}) {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const { colors } = theme;
  const localizedTabs = tabs.map((tabItem) => ({ ...tabItem, label: t(`aiPlanner.${tabItem.value}`) }));
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("today");
  const [pendingConflict, setPendingConflict] = useState<{
    conflict: ScheduleConflict;
    plan: DailyPlan;
  } | null>(null);
  const [resolvingConflict, setResolvingConflict] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [candidates, setCandidates] = useState<PlannerCandidates | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState<
    "selectedOnly" | "selectedPlusAutoFill"
  >("selectedOnly");
  const date = new Date().toISOString().slice(0, 10);
  const acceptance = useQuery({
    queryKey: ["planner", "acceptance", date],
    queryFn: () => getDailyPlanAcceptance(accessToken, date),
    enabled: Boolean(accessToken),
    staleTime: 30_000,
  });
  const preferences = useQuery({
    queryKey: ["planner", "preferences"],
    queryFn: () => getPlannerPreferences(accessToken),
    enabled: Boolean(accessToken),
    staleTime: 30_000,
  });
  const generate = useMutation({
    mutationFn: (options?: {
      mode?: "selectedOnly" | "selectedPlusAutoFill";
      selectedItems?: { taskId: string; subtaskId?: string | null }[];
    }) => generateDailyPlan(accessToken, date, undefined, options),
    onSuccess: (next) => {
      const conflict = next.conflicts?.[0];
      if (conflict) setPendingConflict({ conflict, plan: next });
      else {
        queryClient.setQueryData(["planner", "draft", date], next);
        void queryClient.invalidateQueries({
          queryKey: ["planner", "acceptance", date],
        });
        void queryClient.invalidateQueries({
          queryKey: ["planner", "candidates", date],
        });
      }
    },
  });
  const openPicker = async () => {
    setPickerOpen(true);
    const next = await getDailyPlannerCandidates(accessToken, date);
    setCandidates(next);
    setSelectedKeys(
      new Set(
        next.selectedItems.map(
          (item) => `${item.taskId}:${item.subtaskId ?? ""}`,
        ),
      ),
    );
  };
  const generateSelected = async () => {
    if (!candidates) return;
    const selectedItems = candidates.items
      .filter((item) =>
        selectedKeys.has(`${item.taskId}:${item.subtaskId ?? ""}`),
      )
      .map((item) => ({ taskId: item.taskId, subtaskId: item.subtaskId }));
    await saveDailyPlannerSelection(accessToken, { date, selectedItems });
    setPickerOpen(false);
    generate.mutate({ mode: selectionMode, selectedItems });
  };
  const accept = useMutation({
    mutationFn: (next: DailyPlan) => acceptDailyPlan(accessToken, next),
    onSuccess: (saved) => {
      queryClient.setQueryData(["planner", "acceptance", date], saved);
      queryClient.removeQueries({ queryKey: ["planner", "draft", date] });
      onPlanAccepted?.();
    },
  });
  const draftQuery = useQuery<DailyPlan | null>({
    queryKey: ["planner", "draft", date],
    queryFn: async () => null,
    enabled: false,
    initialData: null,
  });
  const draft = draftQuery.data;
  const plan = draft ? null : acceptance.data?.plan;
  const activePlan = draft ?? plan;
  const isAccepted = !draft && Boolean(plan);
  if (acceptance.isLoading || preferences.isLoading)
    return (
      <AppScreen>
        <PageHeader title={t("aiPlanner.title")} onBack={onBack} />
        <Text style={{ color: colors.secondaryText }}>
          {t("aiPlanner.loading")}
        </Text>
      </AppScreen>
    );
  if (acceptance.isError || preferences.isError)
    return (
      <AppScreen>
        <PageHeader title={t("aiPlanner.title")} onBack={onBack} />
        <SectionCard>
          <Text style={{ color: colors.error }}>
            {t("aiPlanner.loadFailed")}
          </Text>
          <SecondaryButton
            onPress={() => {
              void acceptance.refetch();
              void preferences.refetch();
            }}
          >
            {t("aiPlanner.retry")}
          </SecondaryButton>
        </SectionCard>
      </AppScreen>
    );
  const keepCommitment = async () => {
    if (!pendingConflict) return;
    const original = pendingConflict;
    setPendingConflict(null);
    await generateDailyPlan(accessToken, date).then(async (next) => {
      if (next.conflicts?.length)
        setPendingConflict({ conflict: next.conflicts[0], plan: next });
      else {
        queryClient.setQueryData(["planner", "draft", date], next);
        await resolveScheduleConflict(accessToken, {
          conflictKey: original.conflict.id,
          date,
          taskId: original.conflict.task.taskId,
          commitmentId: original.conflict.commitment.id,
          resolution: "keep_commitment",
        });
      }
    });
  };
  const keepTask = async () => {
    if (!pendingConflict) return;
    setResolvingConflict(true);
    try {
      await skipCommitmentOccurrence(
        accessToken,
        pendingConflict.conflict.commitment.id,
        date,
      );
      await resolveScheduleConflict(accessToken, {
        conflictKey: pendingConflict.conflict.id,
        date,
        taskId: pendingConflict.conflict.task.taskId,
        commitmentId: pendingConflict.conflict.commitment.id,
        resolution: "keep_task",
      });
      queryClient.setQueryData(["planner", "draft", date], {
        ...pendingConflict.plan,
        conflicts: [],
      });
      setPendingConflict(null);
    } finally {
      setResolvingConflict(false);
    }
  };
  return (
    <AppScreen>
      <PageHeader
        title={t("aiPlanner.title")}
        subtitle={t("aiPlanner.subtitle")}
        onBack={onBack}
      />
      <FilterTabs tabs={localizedTabs} active={tab} onChange={setTab} />
      <ExistingScheduleConflict accessToken={accessToken} date={date} />
      <SecondaryButton onPress={() => void openPicker()}>
        {t("aiPlanner.choose")}
      </SecondaryButton>
      {pickerOpen ? (
        <SectionCard>
          <Text className="font-black" style={{ color: colors.text }}>
            {t("aiPlanner.choose")}
          </Text>
          {candidates ? (
            <>
              <Text className="mt-2" style={{ color: colors.secondaryText }}>
                {t("aiPlanner.selected", { count: candidates.items.filter((item) => selectedKeys.has(`${item.taskId}:${item.subtaskId ?? ""}`)).reduce((sum, item) => sum + item.estimatedMinutes, 0) })}
              </Text>
              {candidates.items.map((item) => {
                const key = `${item.taskId}:${item.subtaskId ?? ""}`;
                const checked = selectedKeys.has(key);
                return (
                  <Pressable
                    key={key}
                    onPress={() =>
                      setSelectedKeys((current) => {
                        const next = new Set(current);
                        if (next.has(key)) next.delete(key);
                        else next.add(key);
                        return next;
                      })
                    }
                    className="mt-2 flex-row items-center gap-2 rounded-lg p-2"
                    style={{ backgroundColor: colors.background }}
                  >
                    <Text style={{ color: colors.accentInk }}>
                      {checked ? "☑" : "☐"}
                    </Text>
                    <View className="flex-1">
                      <Text style={{ color: colors.text }}>{item.title}</Text>
                      <Text
                        className="text-xs"
                        style={{ color: colors.secondaryText }}
                      >
                        {item.priority} · {item.estimatedMinutes}m ·{" "}
                        {item.scheduleReason?.replaceAll("_", " ")}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
              <View className="mt-3 flex-row gap-2">
                <SecondaryButton
                  onPress={() =>
                    setSelectionMode(
                      selectionMode === "selectedOnly"
                        ? "selectedPlusAutoFill"
                        : "selectedOnly",
                    )
                  }
                >
                  {selectionMode === "selectedOnly"
                    ? t("aiPlanner.selectedOnly")
                    : t("aiPlanner.selectedPlusAutoFill")}
                </SecondaryButton>
                <PrimaryButton
                  loading={generate.isPending}
                  onPress={() => void generateSelected()}
                >
                  {t("aiPlanner.planSelected")}
                </PrimaryButton>
              </View>
            </>
          ) : (
            <Text style={{ color: colors.secondaryText }}>
              {t("aiPlanner.loadingEligible")}
            </Text>
          )}
        </SectionCard>
      ) : null}
      {preferences.data ? (
        <Preferences
          preferences={preferences.data}
          onSave={async (next) => {
            const error = validatePlannerPreferences(next);
            if (error) throw new Error(error);
            const previous = preferences.data;
            await savePlannerPreferencesOptimistically(
              next,
              previous,
              (value) => updatePlannerPreferences(accessToken, value),
              {
                optimistic: (value) =>
                  queryClient.setQueryData(["planner", "preferences"], value),
                persisted: (value) =>
                  queryClient.setQueryData(["planner", "preferences"], value),
                rollback: (value) =>
                  queryClient.setQueryData(["planner", "preferences"], value),
              },
            );
          }}
        />
      ) : null}
      {!activePlan ? (
        <SectionCard>
          <Text className="mb-3" style={{ color: colors.secondaryText }}>
            {t("aiPlanner.noPlan")}
          </Text>
          {generate.isError ? (
            <Text style={{ color: colors.error }}>
              {t("aiPlanner.generateFailed")}
            </Text>
          ) : null}
          <PrimaryButton
            disabled={!preferences.data}
            loading={generate.isPending}
            onPress={() => void generate.mutate(undefined)}
          >
            {t("aiPlanner.generate")}
          </PrimaryButton>
        </SectionCard>
      ) : (
        <>
          <View className="mb-3 flex-row flex-wrap justify-between gap-y-2">
            <StatsCard
              icon="tasks"
              value={String(activePlan.capacity.scheduledTaskCount)}
              title={t("aiPlanner.scheduled")}
            />
            <StatsCard
              icon="focus"
              value={`${activePlan.capacity.freeMinutes}m`}
              title={t("aiPlanner.freeTime")}
            />
          </View>
          {tab === "today" ? (
            <Today plan={activePlan} />
          ) : tab === "progress" ? (
            <Progress plan={activePlan} />
          ) : tab === "timeline" ? (
            <Timeline plan={activePlan} />
          ) : (
            <Suggestions plan={activePlan} />
          )}
          <View className="flex-row gap-2">
            <SecondaryButton
              className="flex-1"
              loading={generate.isPending}
              onPress={() => void generate.mutate(undefined)}
            >
              {t("aiPlanner.regenerate")}
            </SecondaryButton>
            <PrimaryButton
              className="flex-1"
              loading={accept.isPending}
              onPress={() => void accept.mutate(activePlan)}
            >
              {plan ? t("aiPlanner.accepted") : t("aiPlanner.accept")}
            </PrimaryButton>
          </View>
        </>
      )}
      <ScheduleConflictModal
        conflict={pendingConflict?.conflict ?? null}
        busy={resolvingConflict}
        onKeepCommitment={() => void keepCommitment()}
        onKeepTask={() => void keepTask()}
        onManual={() => setPendingConflict(null)}
        onCancel={() => setPendingConflict(null)}
      />
    </AppScreen>
  );
}

function Today({ plan }: { plan: DailyPlan }) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  return (
    <SectionCard>
      {Object.entries(plan.sections).map(([section, items]) => (
        <View key={section} className="mb-3">
          <Text
            className="text-xs font-black uppercase"
            style={{ color: theme.colors.accentInk }}
          >
            {section}
          </Text>
          {items.map((item) => (
            <View key={item.id} className="mt-1">
              <Text className="text-sm" style={{ color: theme.colors.text }}>
                {item.startTime} - {item.title}
              </Text>
              {item.selectionSource ? (
                <Text
                  className="text-xs"
                  style={{ color: theme.colors.secondaryText }}
                >
                  {item.selectionSource === "user"
                    ? t("aiPlanner.chosenByYou")
                    : item.selectionSource === "autoFill"
                      ? t("aiPlanner.autoFilled")
                      : t("aiPlanner.scheduledToday")}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ))}
    </SectionCard>
  );
}
function Progress({ plan }: { plan: DailyPlan }) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const value = Math.round(
    (plan.capacity.scheduledMinutes /
      Math.max(1, plan.capacity.requestedMinutes)) *
      100,
  );
  return (
    <SectionCard>
      <Text
        className="text-3xl font-black"
        style={{ color: theme.colors.text }}
      >
        {value}%
      </Text>
      <Text style={{ color: theme.colors.secondaryText }}>
        {t("aiPlanner.scheduledMinutes", { count: plan.capacity.scheduledMinutes })}
      </Text>
    </SectionCard>
  );
}
function Timeline({ plan }: { plan: DailyPlan }) {
  const { theme } = useTheme();
  return (
    <SectionCard>
      {Object.values(plan.sections)
        .flat()
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
        .map((item) => (
          <Text
            key={item.id}
            className="mb-2"
            style={{ color: theme.colors.text }}
          >
            {item.startTime}-{item.endTime} - {item.title}
          </Text>
        ))}
    </SectionCard>
  );
}
function Suggestions({ plan }: { plan: DailyPlan }) {
  const { theme } = useTheme();
  return (
    <SectionCard>
      {plan.unscheduled.map((item, i) => (
        <View key={`${item.title}-${i}`} className="mb-2">
          <Text style={{ color: theme.colors.text }}>{item.title}</Text>
          <Text style={{ color: theme.colors.secondaryText }}>
            {item.reason}
          </Text>
        </View>
      ))}
    </SectionCard>
  );
}

function Preferences({
  preferences,
  onSave,
}: {
  preferences: PlannerPreferences;
  onSave: (next: PlannerPreferences) => Promise<void>;
}) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { colors } = theme;
  const [draft, setDraft] = useState(preferences);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    setDraft(preferences);
  }, [preferences]);
  const field = (
    label: string,
    value: string,
    change: (value: string) => void,
  ) => (
    <View className="mb-2">
      <Text className="text-xs" style={{ color: colors.secondaryText }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={change}
        className="rounded-lg border px-2 py-2"
        style={{ borderColor: colors.border, color: colors.text }}
      />
    </View>
  );
  const numberField = (
    label: string,
    value: number,
    change: (value: string) => void,
  ) => (
    <View className="mb-2">
      <Text className="text-xs" style={{ color: colors.secondaryText }}>
        {label}
      </Text>
      <TextInput
        value={String(value)}
        onChangeText={change}
        keyboardType="number-pad"
        accessibilityLabel={label}
        className="rounded-lg border px-2 py-2"
        style={{ borderColor: colors.border, color: colors.text }}
      />
    </View>
  );
  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      await onSave(draft);
      setMessage(t("aiPlanner.saved"));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message.includes("Focus start")
            ? t("aiPlanner.validationFocus")
            : error.message.includes("Lunch start")
              ? t("aiPlanner.validationLunch")
              : error.message.includes("Energy")
                ? t("aiPlanner.validationEnergy")
                : error.message.includes("Personal note")
                  ? t("aiPlanner.validationNote")
                  : t("aiPlanner.errorSave")
          : t("aiPlanner.errorSave"),
      );
    } finally {
      setSaving(false);
    }
  };
  const toggle = (
    key:
      | "scheduleHardTasksInFocus"
      | "finishStartedFirst"
      | "groupSimilarTasks"
      | "bufferBeforeMeetings",
    label: string,
  ) => (
    <Pressable
      key={key}
      onPress={() => setDraft({ ...draft, [key]: !draft[key] })}
      accessibilityRole="switch"
      accessibilityState={{ checked: draft[key] }}
      className="mb-1 flex-row justify-between rounded-lg p-2"
      style={{ backgroundColor: colors.background }}
    >
      <Text style={{ color: colors.text }}>{label}</Text>
      <Text style={{ color: colors.accentInk }}>
        {draft[key] ? t("aiPlanner.on") : t("aiPlanner.off")}
      </Text>
    </Pressable>
  );
  const energy = (period: EnergyPeriod, label: string) => (
    <View key={period} className="mb-2">
      <Text className="mb-1 text-xs" style={{ color: colors.secondaryText }}>
        {label}
      </Text>
      <View className="flex-row gap-1">
        {ENERGY_LEVELS.map((level) => (
          <Pressable
            key={level}
            onPress={() => setDraft(setEnergyPreference(draft, period, level))}
            accessibilityRole="button"
            accessibilityLabel={`${label} energy: ${level}`}
            accessibilityState={{ selected: draft.energy[period] === level }}
            className="rounded-lg px-2 py-1"
            style={{
              backgroundColor:
                draft.energy[period] === level
                  ? colors.accent
                  : colors.background,
            }}
          >
            <Text
              className="text-xs"
              style={{
                color:
                  draft.energy[period] === level
                    ? colors.background
                    : colors.text,
              }}
            >
              {level[0].toUpperCase() + level.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
  return (
    <SectionCard className="mb-3">
      <Text className="mb-2 font-black" style={{ color: colors.text }}>
        {t("aiPlanner.preferences")}
      </Text>
      {field(t("aiPlanner.focusStart"), draft.focusStartTime, (value) =>
        setDraft({ ...draft, focusStartTime: value }),
      )}
      {field(t("aiPlanner.focusEnd"), draft.focusEndTime, (value) =>
        setDraft({ ...draft, focusEndTime: value }),
      )}
      {field(
        t("aiPlanner.workBreak"),
        `${draft.workBlockMinutes}/${draft.breakMinutes}`,
        (value) => {
          const [work, rest] = value.split("/").map(Number);
          setDraft({
            ...draft,
            workBlockMinutes: work || 0,
            breakMinutes: rest || 0,
          });
        },
      )}
      <Text
        className="mb-1 mt-1 text-xs font-black"
        style={{ color: colors.text }}
      >
        {t("aiPlanner.energyPattern")}
      </Text>
      {energy("morning", t("aiPlanner.morning"))}
      {energy("afternoon", t("aiPlanner.afternoon"))}
      {energy("evening", t("aiPlanner.evening"))}
      {energy("night", t("aiPlanner.night"))}
      {toggle(
        "scheduleHardTasksInFocus",
        t("aiPlanner.difficultTasks"),
      )}
      {toggle("finishStartedFirst", t("aiPlanner.finishStarted"))}
      {toggle("groupSimilarTasks", t("aiPlanner.groupSimilar"))}
      {toggle("bufferBeforeMeetings", t("aiPlanner.bufferMeetings"))}
      {draft.bufferBeforeMeetings
        ? numberField(
            t("aiPlanner.bufferBefore", { min: BUFFER_MINUTES_RANGE.min, max: BUFFER_MINUTES_RANGE.max }),
            draft.bufferMinutes,
            (value) =>
              setDraft({ ...draft, bufferMinutes: parseBufferMinutes(value) }),
          )
        : null}
      {field(
        t("aiPlanner.capacity"),
        `${draft.maxDailyWorkMinutes}/${draft.emergencyBufferMinutes}`,
        (value) => {
          const [max, emergency] = value.split("/").map(Number);
          setDraft({
            ...draft,
            maxDailyWorkMinutes: max || 0,
            emergencyBufferMinutes: emergency || 0,
          });
        },
      )}
      {field(
        t("aiPlanner.sleep"),
        `${draft.sleep.start}/${draft.sleep.end}`,
        (value) => {
          const [start, end] = value.split("/");
          setDraft({ ...draft, sleep: { start: start || "", end: end || "" } });
        },
      )}
      {field(
        t("aiPlanner.lunch"),
        `${draft.lunch.start}/${draft.lunch.end}`,
        (value) => {
          const [start, end] = value.split("/");
          setDraft({ ...draft, lunch: { start: start || "", end: end || "" } });
        },
      )}
      {field(
        t("aiPlanner.unavailable"),
        formatUnavailableHours(draft.unavailableHours),
        (value) =>
          setDraft({
            ...draft,
            unavailableHours: parseUnavailableHours(value),
          }),
      )}
      <TextInput
        value={draft.note}
        onChangeText={(note) => setDraft({ ...draft, note })}
        multiline
        maxLength={1000}
        placeholder={t("aiPlanner.notePlaceholder")}
        placeholderTextColor={colors.placeholder}
        className="mb-2 rounded-lg border px-2 py-2"
        style={{ borderColor: colors.border, color: colors.text }}
      />
      {message ? (
        <Text
          className="mb-2"
          style={{
            color: message === t("aiPlanner.saved") ? colors.success : colors.error,
          }}
        >
          {message}
        </Text>
      ) : null}
      <PrimaryButton size="sm" loading={saving} onPress={() => void save()}>
        {t("aiPlanner.save")}
      </PrimaryButton>
    </SectionCard>
  );
}
