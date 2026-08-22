import {
  Activity,
  CalendarDays,
  Clock3,
  Sparkles,
  Target,
  TriangleAlert,
} from "lucide-react";
import {
  AppLayout,
  DirectionalChevron,
  PageHeader,
  SectionCard,
  TopActionBar,
  type SidebarNavHandlers,
} from "../components/layout";
import { useLanguage } from "../i18n/LanguageContext";
import { useTheme } from "../theme/ThemeContext";
import type { DashboardRecommendation, TodayDashboard } from "../lib/tasksApi";
import { focusParentLabel, focusPrimaryTitle } from "../lib/focusDisplay";
import { RandomStartCard } from "../components/RandomStartCard";
import { useQuery } from '@tanstack/react-query';
import { challengesApi, type Challenge } from '../features/challenges/challengesApi';

type Props = SidebarNavHandlers & {
  dashboard: TodayDashboard | null;
  summaryLoading: boolean;
  summaryError: string;
  onRetrySummary?: () => void;
  onViewReminders: () => void;
  onViewTasks: () => void;
  onCreateTask?: () => void;
  onCreateTaskAi?: () => void;
  onCreateReminder?: () => void;
  onViewTaskDetails?: (taskId: string) => void;
  onOpenRandomStart?: () => void;
  onSignOut?: () => void;
  onStartFocus: (recommendation: DashboardRecommendation) => Promise<void>;
  onContinueFocus: () => void;
  accessToken?: string;
};

export default function TasksDashboardScreen({
  dashboard,
  summaryLoading,
  summaryError,
  onRetrySummary,
  onViewTasks,
  onSignOut,
  onStartFocus,
  onContinueFocus,
  accessToken,
  onCreateTask,
  onViewTaskDetails,
  onOpenRandomStart,
  ...nav
}: Props) {
  const { t, toggleLanguage } = useLanguage();
  const { mode, toggleTheme } = useTheme();
  const loading = summaryLoading && !dashboard;
  return (
    <AppLayout
      active="dashboard"
      {...nav}
      onNavigateTasks={onViewTasks}
      panelTitle={t("dashboardUi.today")}
      panelCaption={t("dashboardUi.nextBestAction")}
      panelPercent={dashboard?.progress.percent ?? 0}
    >
      <div className="mx-auto w-[min(94vw,1840px)] max-w-full">
        <PageHeader
          title={t("taskUi.dashboard.title")}
          subtitle=""
          toolbar={
            <TopActionBar
              pageOnly
              themeMode={mode}
              onToggleTheme={toggleTheme}
              languageLabel={t("common.languageToggle")}
              onToggleLanguage={toggleLanguage}
              onOpenNotifications={nav.onNavigateNotifications}
              onSignOut={onSignOut}
            />
          }
        />
        {summaryError ? (
          <SectionCard className="mb-4 border-red-500/40 shadow-lg shadow-red-950/10">
            <p className="text-sm text-red-300">{t("dashboardUi.loadFailed")}</p>
            <button
              className="mt-2 text-sm font-bold text-[var(--bp-accent-ink)] hover:underline"
              onClick={onRetrySummary}
            >
              {t("dashboardUi.retry")}
            </button>
          </SectionCard>
        ) : null}
        {loading ? (
          <Skeleton />
        ) : dashboard ? (
          <main className="space-y-4 pb-6 xl:space-y-5 2xl:space-y-6">
            <Greeting dashboard={dashboard} />
            {accessToken ? <DashboardChallenge token={accessToken} /> : null}
            {accessToken && onOpenRandomStart ? <RandomStartCard onOpen={onOpenRandomStart} /> : null}
            <KpiRow dashboard={dashboard} />
            <Hero
              dashboard={dashboard}
              onStart={onStartFocus}
              onContinue={onContinueFocus}
            />
            <Timeline
              dashboard={dashboard}
              onOpenPlanner={nav.onNavigatePlanner}
            />
            {dashboard.suggestions.length ? (
              <Suggestions dashboard={dashboard} />
            ) : null}
            <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[1.2fr_.8fr] xl:gap-5">
              <Progress dashboard={dashboard} />
              <Tomorrow dashboard={dashboard} />
            </div>
            {dashboard.locationContext ? (
              <SectionCard>
                <h2 className="text-sm font-bold">
                  {dashboard.locationContext.label}
                </h2>
              </SectionCard>
            ) : null}
          </main>
        ) : (
          <Empty onViewTasks={onViewTasks} />
        )}
      </div>
    </AppLayout>
  );
}

function DashboardChallenge({ token }: { token: string }) { const { t } = useLanguage(); const q=useQuery({queryKey:['challenges'],queryFn:()=>challengesApi.list(token)}); const c=q.data?.filter((item:Challenge)=>item.status==='active').sort((a,b)=>new Date(a.endAt).getTime()-new Date(b.endAt).getTime())[0]; if(!c)return null; const value=Math.min(c.progressValue,c.targetValue), pct=Math.min(100,value/c.targetValue*100), unit=c.type==='focus_minutes'?t('challenges.minutes'):c.type==='focus_sessions'?t('challenges.sessions'):t('challenges.tasks'); return <SectionCard className="border-[var(--bp-accent)]"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase text-[var(--bp-accent-ink)]">{t('challenges.community')}</p><p className="mt-1 font-bold">{c.title}</p></div><a className="text-sm font-bold text-[var(--bp-accent-ink)]" href={`/challenges/${c.id}`}>{t('challenges.view')}</a></div><p className="mt-3 text-sm">{value} / {c.targetValue} {unit}</p><div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--bp-border)]"><div className="h-full bg-[var(--bp-accent)]" style={{width:`${pct}%`}} /></div><p className="mt-2 text-xs text-[var(--bp-muted)]">{t('challenges.ends')} {new Date(c.endAt).toLocaleString()}</p></SectionCard> }

function Greeting({ dashboard }: { dashboard: TodayDashboard }) {
  const tone: Record<string, string> = {
    success: "text-emerald-400",
    positive: "text-emerald-400",
    warning: "text-amber-400",
    danger: "text-orange-400",
  };
  return (
    <section className="px-1 py-1">
      <div className="flex items-center gap-2">
        <Sparkles
          aria-hidden="true"
          size={18}
          strokeWidth={1.75}
          className="text-[var(--bp-accent-ink)]"
        />
        <h1 className="text-xl font-black tracking-tight sm:text-2xl">
          {dashboard.greeting}
        </h1>
      </div>
      <p
        className={`mt-1 text-sm font-bold ${tone[dashboard.dailyStatus.statusTone]}`}
      >
        {dashboard.dailyStatus.status}
      </p>
      <div className="mt-2 space-y-0.5 text-sm leading-relaxed text-[var(--bp-muted)]">
        {dashboard.dailyStatus.summaryLines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </section>
  );
}

function KpiRow({ dashboard }: { dashboard: TodayDashboard }) {
  const { t } = useLanguage();
  const p = dashboard.progress;
  const priority = dashboard.whyNow.find(
    (reason) => reason.code === "high_priority",
  );
  const tomorrow = dashboard.tomorrowPreview;
  return (
    <section
      aria-label={t('dashboardUi.atAGlance')}
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:gap-4"
    >
      <SectionCard className="group overflow-hidden bg-gradient-to-br from-[var(--bp-surface)] to-[var(--bp-accent)]/10 p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="grid h-14 w-14 place-items-center rounded-full border-2 border-[var(--bp-accent)]/40 bg-[var(--bp-accent)]/10 text-[var(--bp-accent-ink)]"
          >
            <Target size={20} strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[.13em] text-[var(--bp-accent-ink)]">
              {t('dashboardUi.focusToday')}
            </p>
            <p
              aria-label={t("dashboardUi.focusedDuration", {
                value: formatMinutes(p.focusMinutes, t),
              })}
              className="mt-0.5 text-3xl font-black leading-none tracking-tight text-[var(--bp-text)]"
            >
              {formatMinutes(p.focusMinutes, t)}
            </p>
            <p className="mt-1 text-xs text-[var(--bp-muted)]">{t('dashboardUi.focusedToday')}</p>
          </div>
        </div>
      </SectionCard>
      <SectionCard className="bg-gradient-to-br from-[var(--bp-surface)] to-amber-400/10 p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="grid h-10 w-10 place-items-center rounded-full bg-amber-400/10 text-amber-300"
          >
            <TriangleAlert size={20} strokeWidth={1.75} />
          </span>
          <p className="text-xs font-bold uppercase tracking-[.13em] text-amber-300">
            {t('dashboardUi.priority')}
          </p>
        </div>
        <p className="mt-2 text-lg font-black">
          {priority ? t('dashboardUi.attentionNeeded') : dashboard.dailyStatus.status}
        </p>
        <p className="mt-1 text-xs text-[var(--bp-muted)]">
          {priority
            ? t("dashboardUi.highPriorityReady")
            : t("dashboardUi.attentionSignal")}
        </p>
      </SectionCard>
      <SectionCard className="bg-gradient-to-br from-[var(--bp-surface)] to-sky-400/10 p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="grid h-10 w-10 place-items-center rounded-full bg-sky-400/10 text-sky-300"
              >
                <CalendarDays size={20} strokeWidth={1.75} />
              </span>
              <p className="text-xs font-bold uppercase tracking-[.13em] text-sky-300">
                {t('dashboardUi.tomorrow')}
              </p>
            </div>
            <p className="mt-2 text-lg font-black">
              {t("dashboardUi.planned", {
                value: formatMinutes(tomorrow.estimatedWorkMinutes, t),
              })}
            </p>
            <p className="mt-1 text-xs text-[var(--bp-muted)]">
              {t("dashboardUi.dueItems", { count: tomorrow.dueWorkUnits })}
            </p>
          </div>
          {tomorrow.overloadStatus === "overloaded" ? (
            <span className="rounded-full bg-amber-400/15 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-amber-300">
              {t('dashboardUi.busy')}
            </span>
          ) : null}
        </div>
      </SectionCard>
    </section>
  );
}

function Hero({
  dashboard,
  onStart,
  onContinue,
}: {
  dashboard: TodayDashboard;
  onStart: (item: DashboardRecommendation) => Promise<void>;
  onContinue: () => void;
}) {
  const { t } = useLanguage();
  const active = dashboard.activeFocus;
  const item = active ?? dashboard.recommendation;
  if (!item)
    return (
      <SectionCard className="bg-gradient-to-br from-[var(--bp-surface)] to-[var(--bp-accent)]/5 py-7">
        <Target
          aria-hidden="true"
          size={18}
          strokeWidth={1.75}
          className="text-[var(--bp-accent-ink)]"
        />
        <h2 className="mt-2 text-xl font-black">{t('dashboardUi.dayClear')}</h2>
        <p className="text-sm text-[var(--bp-muted)]">
          {t('dashboardUi.noFocusRecommendation')}
        </p>
      </SectionCard>
    );
  const title = focusPrimaryTitle(item);
  const parent = focusParentLabel(item);
  const minutes =
    "plannedMinutes" in item ? item.plannedMinutes : item.estimatedMinutes;
  return (
    <SectionCard className="overflow-hidden border-[var(--bp-accent)]/55 bg-gradient-to-br from-[var(--bp-accent)]/[0.18] via-[var(--bp-surface)] to-[var(--bp-surface)] p-5 shadow-xl shadow-[var(--bp-accent)]/15">
      <div className="flex items-center gap-2 text-[var(--bp-accent-ink)]">
        <Target aria-hidden="true" size={18} strokeWidth={1.75} />
        <p className="text-xs font-bold uppercase tracking-[.2em]">
          {t('dashboardUi.doThisNow')}
        </p>
      </div>
      <h2 className="mt-3 text-2xl font-black leading-tight tracking-tight sm:text-3xl">
        {title}
      </h2>
      {parent ? (
        <p className="mt-2 text-sm text-[var(--bp-muted)]">{parent}</p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-[var(--bp-subtle)]">
        {minutes ? (
          <span className="rounded-full bg-white/5 px-3 py-1.5">
            {t("dashboardUi.minutesFocus", { count: minutes })}
          </span>
        ) : null}
        {"status" in item ? (
          <span className="rounded-full bg-white/5 px-3 py-1.5 capitalize">
            {item.status}
          </span>
        ) : null}
      </div>
      {dashboard.whyNow.length ? (
        <div className="mt-5">
          <p className="text-xs font-bold uppercase tracking-[.15em] text-[var(--bp-muted)]">
            {t('dashboardUi.whyThis')}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {dashboard.whyNow.map((reason) => (
              <span
                key={reason.code}
                className="rounded-full bg-[var(--bp-accent)]/15 px-3 py-1.5 text-xs font-semibold text-[var(--bp-accent-ink)]"
              >
                {reason.label}
                {reason.value ? ` · ${reason.value}` : ""}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => {
          if (active) onContinue();
          else void onStart(item as DashboardRecommendation);
        }}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-[#fff47a] bg-gradient-to-br from-[#fff47a] via-[var(--bp-accent)] to-[#f6dc32] px-5 py-3.5 text-base font-black text-[var(--bp-brand-dark)] shadow-lg shadow-[var(--bp-accent)]/32 transition duration-200 hover:-translate-y-0.5 hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bp-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bp-surface)] active:translate-y-0"
      >
        <Target aria-hidden="true" size={16} strokeWidth={1.75} />
        {active ? t('dashboardUi.continueFocus') : t('dashboardUi.startFocus')}
      </button>
    </SectionCard>
  );
}

function Timeline({
  dashboard,
  onOpenPlanner,
}: {
  dashboard: TodayDashboard;
  onOpenPlanner?: () => void;
}) {
  const { t, language } = useLanguage();
  if (!dashboard.timeline.length)
    return (
      <SectionCard>
        <div className="flex items-center gap-2">
          <Clock3
            aria-hidden="true"
            size={18}
            strokeWidth={1.75}
            className="text-[var(--bp-muted)]"
          />
          <h2 className="text-base font-black">{t('dashboardUi.todayTimeline')}</h2>
        </div>
        <p className="mt-2 text-sm text-[var(--bp-muted)]">
          {t('dashboardUi.noPlanToday')}
        </p>
        {onOpenPlanner ? (
          <button
            className="mt-3 text-sm font-bold text-[var(--bp-accent-ink)] hover:underline"
            onClick={onOpenPlanner}
          >
            {t('dashboardUi.openPlanner')}
          </button>
        ) : null}
      </SectionCard>
    );
  const now = Date.now();
  const nextIndex = dashboard.timeline.findIndex(
    (block) => new Date(block.startTime).getTime() > now,
  );
  return (
    <SectionCard className="shadow-sm">
      <div className="flex items-center gap-2">
        <Clock3
          aria-hidden="true"
          size={18}
          strokeWidth={1.75}
          className="text-[var(--bp-muted)]"
        />
        <h2 className="text-base font-black">{t('dashboardUi.todayTimeline')}</h2>
      </div>
      <div className="mt-4">
        {dashboard.timeline.map((block, index) => {
          const start = new Date(block.startTime).getTime();
          const end = block.endTime
            ? new Date(block.endTime).getTime()
            : Infinity;
          const marker =
            start <= now && now < end
              ? t("dashboardUi.now")
              : index === nextIndex
                ? t("dashboardUi.next")
                : t("dashboardUi.later");
          const current =
            marker === t("dashboardUi.now") ||
            (dashboard.timeline.length === 1 && index === 0);
          return (
            <div
              key={block.id}
              className={`group relative flex gap-4 pb-5 last:pb-0 ${current ? "rounded-xl bg-[var(--bp-accent)]/7 p-3" : "px-1"} transition hover:bg-white/[.025]`}
            >
              <div className="flex w-4 flex-col items-center">
                <span
                  className={`mt-1 h-3 w-3 rounded-full ring-4 ${current ? "bg-[var(--bp-accent)] ring-[var(--bp-accent)]/15" : "bg-slate-500 ring-slate-500/10"}`}
                />
                {index < dashboard.timeline.length - 1 ? (
                  <span className="mt-2 w-px flex-1 bg-[var(--bp-border)]" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-black tracking-[.18em] text-[var(--bp-accent-ink)]">
                    {current && dashboard.timeline.length === 1
                      ? t("dashboardUi.current")
                      : marker}
                  </span>
                  <span className="text-xs text-[var(--bp-muted)]">
                    {formatRange(
                      block.startTime,
                      block.endTime,
                      dashboard.timezone,
                      language,
                    )}
                  </span>
                </div>
                <p className="mt-1 text-sm font-bold">{block.title}</p>
                <p className="text-xs capitalize text-[var(--bp-muted)]">
                  {block.type} · {block.status}
                </p>
                {current && dashboard.timeline.length === 1 ? (
                  <p className="mt-2 text-xs text-[var(--bp-muted)]">
                    {t("dashboardUi.waitingNext")}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function Progress({ dashboard }: { dashboard: TodayDashboard }) {
  const { t } = useLanguage();
  const p = dashboard.progress;
  if (!p.totalWorkUnits)
    return (
      <SectionCard>
        <div className="flex items-center gap-2">
          <Activity
            aria-hidden="true"
            size={18}
            strokeWidth={1.75}
            className="text-[var(--bp-muted)]"
          />
          <h2 className="text-base font-black">{t("dashboardUi.todayActivity")}</h2>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <strong className="text-2xl text-[var(--bp-accent-ink)]">
            {formatMinutes(p.focusMinutes, t)}
          </strong>
          <span className="text-sm text-[var(--bp-muted)]">{t("dashboardUi.focus")}</span>
        </div>
        <p className="mt-1 text-sm text-[var(--bp-muted)]">
          {t("dashboardUi.noScheduledWork")}
        </p>
      </SectionCard>
    );
  return (
    <SectionCard>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity
              aria-hidden="true"
              size={18}
              strokeWidth={1.75}
              className="text-[var(--bp-muted)]"
            />
            <h2 className="text-base font-black">{t("dashboardUi.todayProgress")}</h2>
          </div>
          <p className="mt-1 text-xs text-[var(--bp-muted)]">
            {t("dashboardUi.unitsComplete", {
              completed: p.completedWorkUnits,
              total: p.totalWorkUnits,
            })}
          </p>
        </div>
        <strong className="text-2xl text-[var(--bp-accent-ink)]">
          {p.percent}%
        </strong>
      </div>
      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[var(--bp-bg)]">
        <div
          className="h-full rounded-full bg-[var(--bp-accent)] transition-all duration-700"
          style={{ width: `${p.percent}%` }}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--bp-muted)]">
        <span>{t("dashboardUi.focusValue", { value: formatMinutes(p.focusMinutes, t) })}</span>
        <span>{t("dashboardUi.remaining", { value: formatMinutes(p.remainingEstimatedMinutes, t) })}</span>
      </div>
    </SectionCard>
  );
}

function Tomorrow({ dashboard }: { dashboard: TodayDashboard }) {
  const { t: translate } = useLanguage();
  const t = dashboard.tomorrowPreview;
  const overloaded = t.overloadStatus === "overloaded";
  return (
    <SectionCard
      className={
        overloaded
          ? "border-red-500/30 bg-gradient-to-r from-red-500/10 to-orange-500/5"
          : ""
      }
    >
      <div className="flex items-center gap-2">
        <CalendarDays
          aria-hidden="true"
          size={18}
          strokeWidth={1.75}
          className="text-sky-300"
        />
        <h2 className="text-base font-black">{translate("dashboardUi.tomorrow")}</h2>
      </div>
      {overloaded ? (
        <>
          <p className="mt-2 text-sm font-bold text-orange-300">
            {translate("dashboardUi.heavyWorkload")}
          </p>
          <span className="sr-only">{translate("dashboardUi.overloaded")}</span>
        </>
      ) : null}
      <p className="mt-2 text-sm text-[var(--bp-subtle)]">
        {translate("dashboardUi.tomorrowSummary", {
          estimate: formatMinutes(t.estimatedWorkMinutes, translate),
          due: t.dueWorkUnits,
          priority: t.highPriorityItems,
        })}
      </p>
      {t.capacityMinutes !== null ? (
        <p className="mt-1 text-xs text-[var(--bp-muted)]">
          {translate("dashboardUi.plannedCapacity", { value: formatMinutes(t.capacityMinutes, translate) })}
        </p>
      ) : null}
      {overloaded ? (
        <p className="mt-2 text-xs text-[var(--bp-muted)]">
          {translate("dashboardUi.reviewPlan")}
        </p>
      ) : null}
    </SectionCard>
  );
}

function Suggestions({ dashboard }: { dashboard: TodayDashboard }) {
  const { t } = useLanguage();
  return (
    <SectionCard>
      <h2 className="text-base font-black">{t("dashboardUi.suggestions")}</h2>
      {dashboard.suggestions.map((suggestion) => (
        <div key={suggestion.id} className="mt-3">
          <p className="font-semibold">{suggestion.title}</p>
          <p className="text-sm text-[var(--bp-muted)]">
            {suggestion.explanation}
          </p>
        </div>
      ))}
    </SectionCard>
  );
}
function Empty({ onViewTasks }: { onViewTasks: () => void }) {
  const { t } = useLanguage();
  return (
    <SectionCard className="py-8 text-center">
      <h2 className="text-lg font-black">{t("dashboardUi.nothingPlanned")}</h2>
      <p className="mt-2 text-sm text-[var(--bp-muted)]">
        {t("dashboardUi.emptyDescription")}
      </p>
      <button
        className="mt-4 text-sm font-bold text-[var(--bp-accent-ink)] hover:underline"
        onClick={onViewTasks}
      >
        {t("dashboardUi.viewTasks")}{" "}
        <DirectionalChevron direction="forward" className="inline h-4 w-4" />
      </button>
    </SectionCard>
  );
}
function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse xl:space-y-5 2xl:space-y-6">
      <div className="h-24 rounded-2xl bg-[var(--bp-surface)]" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:gap-4">
        <div className="h-32 rounded-2xl bg-[var(--bp-surface)]" />
        <div className="h-32 rounded-2xl bg-[var(--bp-surface)]" />
        <div className="h-32 rounded-2xl bg-[var(--bp-surface)]" />
      </div>
      <div className="h-52 rounded-2xl bg-[var(--bp-surface)]" />
      <div className="h-40 rounded-2xl bg-[var(--bp-surface)]" />
      <div className="h-32 rounded-2xl bg-[var(--bp-surface)]" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[1.2fr_.8fr] xl:gap-5">
        <div className="h-36 rounded-2xl bg-[var(--bp-surface)]" />
        <div className="h-36 rounded-2xl bg-[var(--bp-surface)]" />
      </div>
    </div>
  );
}
function formatMinutes(
  minutes: number,
  t: ReturnType<typeof useLanguage>["t"],
) {
  const hours = Math.floor(Math.max(0, minutes) / 60);
  const rest = Math.max(0, minutes) % 60;
  if (!hours) return t("dashboardUi.minutes", { count: rest });
  if (!rest) return t("dashboardUi.hours", { count: hours });
  return t("dashboardUi.hoursMinutes", { hours, minutes: rest });
}
function formatRange(start: string, end: string | null, timezone: string, language: "en" | "ar") {
  const options: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  };
  const format = (value: string) =>
    new Intl.DateTimeFormat(language === "ar" ? "ar" : "en-US", options).format(new Date(value));
  return end ? `${format(start)}–${format(end)}` : format(start);
}
