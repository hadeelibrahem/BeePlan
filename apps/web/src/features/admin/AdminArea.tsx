import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu,
  MoreHorizontal,
  Search,
  Send,
  ShieldCheck,
  TriangleAlert,
  UserCheck,
  UserPlus,
  Bug,
  Clock3,
  UserX,
  UsersRound,
  X,
  Flag,
  ArrowRight,
  Lightbulb,
  Moon,
  Sun,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useLanguage } from "../../i18n/LanguageContext";
import { Modal } from "../../components/layout/Modal";
import { BeePlanLogo } from "../../components/BeePlanLogo";
import { useTheme } from "../../theme/ThemeContext";
import {
  adminApi,
  type AdminMe,
  feedbackClustersApi,
  type AdminActionItem,
  type AdminErrorDetail,
  type AdminErrorGroup,
  type AdminUser,
  type AuditEntry,
  type AdminReport,
  type AdminFeedbackCluster,
  type ReportCategory,
  type ReportStatus,
  challengesApi,
  type AdminChallenge,
} from "./api/admin.api";

type AdminPage =
  | "dashboard"
  | "users"
  | "audit"
  | "errors"
  | "systemHealth"
  | "errorDetail"
  | "reports"
  | "reportDetail"
  | "feedback"
  | "feedbackDetail"
  | "feedbackClusters"
  | "feedbackClusterDetail"
  | "challenges"
  | "challengeDetail"
  | "profile"
  | "adminManagement";
export const pageFor = (path: string): AdminPage =>
  path === "/admin/admins"
    ? "adminManagement"
    : path === "/admin/profile"
      ? "profile"
      : path.startsWith("/admin/challenges/")
        ? "challengeDetail"
        : path === "/admin/challenges"
          ? "challenges"
          : path === "/admin/feedback/clusters"
            ? "feedbackClusters"
            : path.startsWith("/admin/feedback/clusters/")
              ? "feedbackClusterDetail"
              : path.startsWith("/admin/feedback/")
                ? "feedbackDetail"
                : path.startsWith("/admin/errors/")
                  ? "errorDetail"
                  : path.startsWith("/admin/reports/")
                    ? "reportDetail"
                    : path === "/admin/system-health"
                      ? "systemHealth"
                      : path === "/admin/errors"
                        ? "errors"
                        : path === "/admin/reports"
                          ? "reports"
                          : path === "/admin/feedback"
                            ? "feedback"
                            : path === "/admin/users"
                              ? "users"
                              : path === "/admin/audit-log"
                                ? "audit"
                                : "dashboard";

export function AdminRouteGate() {
  const { t } = useLanguage();
  const { mode, toggleTheme } = useTheme();
  const { accessToken, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const page = pageFor(location.pathname);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const me = useQuery({
    queryKey: ["admin", "me"],
    queryFn: () => adminApi.me(accessToken!),
    enabled: Boolean(accessToken),
    retry: false,
  });

  if (me.isLoading) return <AdminShellSkeleton />;
  if (me.isError)
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--bp-bg)] px-5 text-[var(--bp-text)]">
        <div className="max-w-md text-center">
          <ShieldCheck className="mx-auto h-9 w-9 text-[var(--bp-muted)]" />
          <h1 className="mt-4 text-xl font-bold">
            {t("admin.accessRequired")}
          </h1>
          <p className="mt-2 text-sm text-[var(--bp-muted)]">
            {t("admin.accessDescription")}
          </p>
          <button
            className="mt-5 rounded-lg bg-[var(--bp-accent)] px-4 py-2 text-sm font-bold text-[var(--bp-accent-text)]"
            onClick={() => navigate("/dashboard")}
          >
            {t("admin.returnToBeePlan")}
          </button>
        </div>
      </main>
    );

  const go = (path: string) => {
    setDrawerOpen(false);
    navigate(path);
  };
  const adminProfile = me.data!;
  const initials = adminProfile.fullName
    .split(/\s+/)
    .map((part: string) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="min-h-screen bg-[var(--bp-bg)] text-[var(--bp-text)]">
      <AdminSidebar
        page={page}
        onNavigate={go}
        superAdmin={adminProfile.role === "super_admin"}
      />
      <AdminSidebar
        page={page}
        onNavigate={go}
        superAdmin={adminProfile.role === "super_admin"}
        mobile
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[var(--bp-border)] bg-[color-mix(in_srgb,var(--bp-bg)_92%,transparent)] px-4 backdrop-blur lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              aria-label={t("admin.openNavigation")}
              className="rounded-lg p-2 text-[var(--bp-muted)] hover:bg-[var(--bp-surface)] hover:text-[var(--bp-text)] lg:hidden"
              onClick={() => setDrawerOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="hidden truncate text-sm font-semibold text-[var(--bp-muted)] sm:block">
              {t("admin.productOperations")}
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              aria-label={
                mode === "dark" ? "Switch to light mode" : "Switch to dark mode"
              }
              title={mode === "dark" ? "Light mode" : "Dark mode"}
              onClick={toggleTheme}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--bp-border)] text-[var(--bp-muted)] transition hover:bg-[var(--bp-surface)] hover:text-[var(--bp-text)] focus:outline-none focus:ring-2 focus:ring-[var(--bp-accent)]"
            >
              {mode === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
            <span
              className="hidden h-6 w-px bg-[var(--bp-border)] sm:block"
              aria-hidden="true"
            />
            <div className="relative">
              <button
                className="flex items-center gap-2 rounded-lg p-1.5 text-left hover:bg-[var(--bp-surface)]"
                onClick={() => setAccountOpen((open) => !open)}
                aria-expanded={accountOpen}
                aria-haspopup="menu"
                title="Account menu"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bp-accent)] text-xs font-extrabold text-[var(--bp-accent-text)]">
                  {initials}
                </span>
                <span className="hidden sm:block">
                  <span className="block max-w-36 truncate text-sm font-semibold">
                    {adminProfile.fullName}
                  </span>
                  <span className="inline-flex rounded-full bg-[var(--bp-accent-soft)] px-1.5 py-px text-[10px] font-bold text-[var(--bp-accent-ink)]">
                    {adminProfile.role === "super_admin"
                      ? "Super Admin"
                      : t("admin.admin")}
                  </span>
                </span>
                <ChevronDown className="h-4 w-4 text-[var(--bp-muted)]" />
              </button>
              {accountOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-12 w-48 rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface-elevated)] p-1.5 shadow-xl"
                >
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-[var(--bp-accent-soft)]"
                    onClick={() => navigate("/dashboard")}
                  >
                    <ExternalLink className="h-4 w-4" />
                    {t("admin.backToBeePlan")}
                  </button>
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-[var(--bp-accent-soft)]"
                    onClick={() => {
                      setAccountOpen(false);
                      navigate("/admin/profile");
                    }}
                  >
                    <UserCheck className="h-4 w-4" />
                    Profile
                  </button>
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-[var(--bp-accent-soft)]"
                    onClick={() => void signOut()}
                  >
                    <LogOut className="h-4 w-4" />
                    {t("actions.signOut")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 lg:px-8">
          {page === "challenges" ? (
            <Challenges
              token={accessToken!}
              onOpen={(id) => navigate(`/admin/challenges/${id}`)}
            />
          ) : page === "challengeDetail" ? (
            <ChallengeAnalytics
              token={accessToken!}
              id={location.pathname.split("/").pop() ?? ""}
              onBack={() => navigate("/admin/challenges")}
            />
          ) : page === "profile" ? (
            <AdminProfile token={accessToken!} initialProfile={adminProfile} />
          ) : page === "adminManagement" ? (
            adminProfile.role === "super_admin" ? (
              <AdminManagement token={accessToken!} />
            ) : (
              <AdminError message="Super Admin access is required." />
            )
          ) : page === "systemHealth" ? (
            <SystemHealth token={accessToken!} />
          ) : page === "users" ? (
            <Users token={accessToken!} />
          ) : page === "audit" ? (
            <Audit token={accessToken!} />
          ) : page === "errors" ? (
            <Errors
              token={accessToken!}
              onOpen={(id) => navigate(`/admin/errors/${id}`)}
            />
          ) : page === "errorDetail" ? (
            <ErrorDetail
              token={accessToken!}
              id={location.pathname.split("/").pop() ?? ""}
              onBack={() => navigate("/admin/errors")}
            />
          ) : page === "reports" ? (
            <Reports
              token={accessToken!}
              onOpen={(id) => navigate(`/admin/reports/${id}`)}
            />
          ) : page === "reportDetail" ? (
            <ReportDetail
              token={accessToken!}
              id={location.pathname.split("/").pop() ?? ""}
              onBack={() => navigate("/admin/reports")}
            />
          ) : page === "feedbackClusters" ? (
            <AdminFeedbackThemes token={accessToken!} />
          ) : page === "feedbackClusterDetail" ? (
            <AdminFeedbackThemeDetail
              token={accessToken!}
              id={location.pathname.split("/").pop() ?? ""}
              onBack={() => navigate("/admin/feedback/clusters")}
              onOpenFeedback={(id) => navigate(`/admin/feedback/${id}`)}
            />
          ) : page === "feedback" ? (
            <AdminFeedbackInbox
              token={accessToken!}
              onOpen={(id) => navigate(`/admin/feedback/${id}`)}
            />
          ) : page === "feedbackDetail" ? (
            <AdminFeedbackDetail
              token={accessToken!}
              id={location.pathname.split("/").pop() ?? ""}
              onBack={() => navigate("/admin/feedback")}
            />
          ) : (
            <Dashboard token={accessToken!} />
          )}
        </main>
      </div>
    </div>
  );
}

function AdminSidebar({
  page,
  onNavigate,
  superAdmin = false,
  mobile = false,
  open = false,
  onClose,
}: {
  page: AdminPage;
  onNavigate: (path: string) => void;
  superAdmin?: boolean;
  mobile?: boolean;
  open?: boolean;
  onClose?: () => void;
}) {
  const { t } = useLanguage();
  const nav = (
    <aside className="flex h-full w-64 flex-col border-r border-[var(--bp-border)] bg-[var(--bp-surface)] px-3 py-5">
      <button
        className="mb-8 flex items-center gap-3 px-3 text-left"
        onClick={() => onNavigate("/admin")}
      >
        <BeePlanLogo iconOnly size={36} className="shrink-0" />
        <span className="hidden h-9 w-9 items-center justify-center rounded-xl bg-[var(--bp-accent)] text-lg text-[var(--bp-accent-text)]">
          ⌬
        </span>
        <span>
          <span className="block text-sm font-extrabold tracking-tight">
            {t("admin.brand")}
          </span>
          <span className="block text-xs text-[var(--bp-muted)]">
            {t("admin.productOperations")}
          </span>
        </span>
      </button>
      <NavGroup label={t("admin.overview")}>
        <AdminNavItem
          active={page === "dashboard"}
          icon={<LayoutDashboard />}
          onClick={() => onNavigate("/admin")}
        >
          {t("admin.dashboard")}
        </AdminNavItem>
      </NavGroup>
      <NavGroup label={t("admin.productHealth")}>
        <AdminNavItem
          active={page === "errors" || page === "errorDetail"}
          icon={<Bug />}
          onClick={() => onNavigate("/admin/errors")}
        >
          {t("admin.errors")}
        </AdminNavItem>
        <AdminNavItem
          active={page === "systemHealth"}
          icon={<Activity />}
          onClick={() => onNavigate("/admin/system-health")}
        >
          System Health
        </AdminNavItem>
      </NavGroup>
      <NavGroup label={t("admin.management")}>
        <AdminNavItem
          active={page === "users"}
          icon={<UsersRound />}
          onClick={() => onNavigate("/admin/users")}
        >
          {t("admin.users")}
        </AdminNavItem>
      </NavGroup>
      <NavGroup label={t("admin.engagement")}>
        <AdminNavItem
          active={page === "challenges"}
          icon={<Flag />}
          onClick={() => onNavigate("/admin/challenges")}
        >
          {t("admin.challenges")}
        </AdminNavItem>
      </NavGroup>
      <NavGroup label={t("admin.system")}>
        <AdminNavItem
          active={page === "audit"}
          icon={<Activity />}
          onClick={() => onNavigate("/admin/audit-log")}
        >
          {t("admin.auditLog")}
        </AdminNavItem>
        {superAdmin && (
          <AdminNavItem
            active={page === "adminManagement"}
            icon={<ShieldCheck />}
            onClick={() => onNavigate("/admin/admins")}
          >
            Admin Management
          </AdminNavItem>
        )}
      </NavGroup>
      <p className="mt-auto px-3 text-xs leading-5 text-[var(--bp-muted)]">
        {t("admin.operationsCenter")}
        <br />
        {t("admin.internalTooling")}
      </p>
    </aside>
  );
  if (!mobile)
    return (
      <div className="fixed inset-y-0 left-0 z-30 hidden lg:block">{nav}</div>
    );
  return (
    <div
      className={`fixed inset-0 z-40 lg:hidden ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      <button
        aria-label={t("admin.closeNavigation")}
        className={`absolute inset-0 bg-black/40 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <div
        className={`relative h-full transition-transform ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        {nav}
        <button
          aria-label={t("admin.closeNavigation")}
          className="absolute right-3 top-5 rounded-lg p-2 text-[var(--bp-muted)] hover:bg-[var(--bp-accent-soft)]"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
function NavGroup({ label, children }: { label: string; children: ReactNode }) {
  const { t } = useLanguage();
  const isCommunity = label === t("admin.management");
  const navigate = useNavigate();
  return (
    <section className="mb-5">
      <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--bp-muted)]">
        {isCommunity ? t("admin.community") : label}
      </p>
      {children}
      {isCommunity ? (
        <>
          <AdminNavItem
            active={false}
            icon={<Flag />}
            onClick={() => undefined}
            destination="/admin/reports"
          >
            {t("admin.reports")}
          </AdminNavItem>
          <AdminNavItem
            active={false}
            icon={<Lightbulb />}
            onClick={() => navigate("/admin/feedback")}
            destination="/admin/feedback"
          >
            {t("admin.feedbackIdeas")}
          </AdminNavItem>
        </>
      ) : null}
    </section>
  );
}
function AdminNavItem({
  active,
  icon,
  onClick,
  children,
  destination,
}: {
  active: boolean;
  icon: ReactNode;
  onClick: () => void;
  children: string;
  destination?: string;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const selected = destination
    ? location.pathname === destination ||
      location.pathname.startsWith(`${destination}/`)
    : active;
  return (
    <button
      aria-current={selected ? "page" : undefined}
      onClick={destination ? () => navigate(destination) : onClick}
      className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${selected ? "bg-[var(--bp-accent-soft)] font-semibold text-[var(--bp-text)] before:absolute before:left-0 before:h-5 before:w-0.5 before:rounded-full before:bg-[var(--bp-accent)]" : "text-[var(--bp-muted)] hover:bg-[var(--bp-bg)] hover:text-[var(--bp-text)]"}`}
    >
      <span className={selected ? "text-[var(--bp-accent-ink)]" : ""}>
        {icon}
      </span>
      {children}
    </button>
  );
}
function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h1>
        <p className="mt-1.5 text-sm text-[var(--bp-muted)]">{description}</p>
      </div>
      {children}
    </div>
  );
}
function AdminSection({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "success" | "warning";
}) {
  const tones = {
    neutral: "bg-[var(--bp-bg)] text-[var(--bp-muted)]",
    accent: "bg-[var(--bp-accent-soft)] text-[var(--bp-accent-ink)]",
    success: "bg-emerald-500/12 text-[var(--bp-success)]",
    warning: "bg-orange-500/12 text-[var(--bp-warning)]",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
const adminDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const adminTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});
function formatAdminDate(value: string) {
  return adminDateFormatter.format(new Date(value));
}
function formatAdminTime(value: string) {
  return adminTimeFormatter.format(new Date(value));
}
function formatAdminDateTime(value: string) {
  return `${formatAdminDate(value)} · ${formatAdminTime(value)}`;
}
export function formatAdminProfileDate(
  value: string | null | undefined,
  language: "en" | "ar",
) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(language === "ar" ? "ar" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function Dashboard({ token }: { token: string }) {
  const { t } = useLanguage();
  const query = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: () => adminApi.dashboard(token),
  });
  const actionCenter = useQuery({
    queryKey: ["admin", "action-center"],
    queryFn: () => adminApi.actionCenter(token),
    retry: false,
  });
  const navigate = useNavigate();
  if (query.isLoading) return <DashboardSkeleton />;
  if (query.isError)
    return <AdminError message={t("admin.dashboardLoadFailed")} />;
  const data = query.data!;
  return (
    <>
      <PageHeader
        title={t("admin.dashboard")}
        description={t("admin.dashboardDescription")}
      />
      <AdminSection title={t("admin.productOverview")}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric
            icon={<UsersRound />}
            label={t("admin.totalUsers")}
            value={data.totalUsers}
            support={t("admin.totalRegisteredAccounts")}
          />
          <Metric
            icon={<UserPlus />}
            label={t("admin.newUsers")}
            value={data.newUsersRecently}
            support={t("admin.joinedLastSevenDays")}
          />
          <Metric
            icon={<UserCheck />}
            label={t("admin.activeAccounts")}
            value={data.activeAccounts}
            support={t("admin.canSignIn")}
          />
          <Metric
            icon={<UserX />}
            label={t("admin.suspended")}
            value={data.suspendedAccounts}
            support={t("admin.accountAccessPaused")}
          />
          <Metric
            icon={<ShieldCheck />}
            label={t("admin.admins")}
            value={data.admins}
            support={t("admin.productOperationsAccess")}
          />
        </div>
      </AdminSection>
      <AdminSection title={t("admin.operations")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Metric
            icon={<Send />}
            label={t("admin.pendingPushJobs")}
            value={data.pendingPushJobs}
            support={t("admin.queuedForDelivery")}
          />
          <Metric
            icon={<TriangleAlert />}
            label={t("admin.failedPushJobs")}
            value={data.failedPushJobs}
            support={
              data.failedPushJobs
                ? t("admin.deliveryFailuresNeedReview")
                : t("admin.noDeliveryFailures")
            }
            tone={data.failedPushJobs ? "warning" : "neutral"}
          />
        </div>
      </AdminSection>
      <AdminSection title={t("admin.needsAttention")}>
        <AttentionCenter
          items={actionCenter.data?.items}
          isLoading={actionCenter.isLoading}
          isError={actionCenter.isError}
          onRetry={() => void actionCenter.refetch()}
          onNavigate={navigate}
        />
      </AdminSection>
      <AdminSection title={t("admin.productHealth")}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            icon={<Bug />}
            label={t("admin.newErrorGroups")}
            value={data.newErrorGroups}
            support={t("admin.awaitingTriage")}
          />
          <Metric
            icon={<TriangleAlert />}
            label={t("admin.criticalHigh")}
            value={data.criticalHighIssues}
            support={t("admin.openIssuesNeedReview")}
            tone={data.criticalHighIssues ? "warning" : "neutral"}
          />
          <Metric
            icon={<UsersRound />}
            label={t("admin.usersAffected")}
            value={data.errorAffectedUsers24h}
            support={t("admin.authenticatedUsers24h")}
          />
          <Metric
            icon={<Activity />}
            label={t("admin.occurrences")}
            value={data.errorOccurrences24h}
            support={t("admin.capturedLast24h")}
          />
        </div>
      </AdminSection>
    </>
  );
}
function AttentionCenter({
  items,
  isLoading,
  isError,
  onRetry,
  onNavigate,
}: {
  items?: AdminActionItem[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onNavigate: (destination: string) => void;
}) {
  items = items ?? [];
  if (isLoading)
    return (
      <div className="h-24 animate-pulse rounded-xl bg-[var(--bp-surface)]" />
    );
  if (isError)
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-orange-500/20 bg-[var(--bp-surface)] p-4 text-sm">
        <span className="text-[var(--bp-muted)]">
          Unable to load Action Center.
        </span>
        <button
          onClick={onRetry}
          className="font-semibold text-[var(--bp-accent-ink)] underline"
        >
          Retry
        </button>
      </div>
    );
  if (!items.length)
    return (
      <div className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-[var(--bp-surface)] p-4">
        <span className="rounded-lg bg-emerald-500/12 p-2 text-[var(--bp-success)]">
          <CheckCircle2 className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold">You're all caught up</p>
          <p className="mt-1 text-sm text-[var(--bp-muted)]">
            Nothing needs your attention right now.
          </p>
        </div>
      </div>
    );
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <AttentionItem key={item.id} item={item} onNavigate={onNavigate} />
      ))}
    </div>
  );
}
function AttentionItem({
  item,
  onNavigate,
}: {
  item: AdminActionItem;
  onNavigate: (destination: string) => void;
}) {
  const { formatNumber } = useLanguage();
  const presentation =
    item.severity === "critical"
      ? {
          icon: <TriangleAlert className="h-5 w-5" />,
          accent: "border-red-500/25",
          iconClass: "bg-red-500/12 text-red-600",
          badge: "bg-red-500/12 text-red-600",
          label: "Critical",
        }
      : item.severity === "high"
        ? {
            icon: <TriangleAlert className="h-5 w-5" />,
            accent: "border-orange-500/25",
            iconClass: "bg-orange-500/12 text-[var(--bp-warning)]",
            badge: "bg-orange-500/12 text-[var(--bp-warning)]",
            label: "High",
          }
        : item.severity === "medium"
          ? {
              icon: <Flag className="h-5 w-5" />,
              accent: "border-amber-500/25",
              iconClass: "bg-amber-500/12 text-amber-700",
              badge: "bg-amber-500/12 text-amber-700",
              label: "Medium",
            }
          : {
              icon: <Lightbulb className="h-5 w-5" />,
              accent: "border-sky-500/25",
              iconClass: "bg-sky-500/12 text-sky-700",
              badge: "bg-sky-500/12 text-sky-700",
              label: "Low",
            };
  return (
    <article
      className={`flex flex-wrap items-center gap-3 rounded-xl border bg-[var(--bp-surface)] p-4 ${presentation.accent}`}
    >
      <span className={`shrink-0 rounded-lg p-2 ${presentation.iconClass}`}>
        {presentation.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">{item.title}</p>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${presentation.badge}`}
          >
            {presentation.label} · {formatNumber(item.count ?? 0)}
          </span>
        </div>
        <p className="mt-1 text-sm text-[var(--bp-muted)]">
          {item.description}
        </p>
      </div>
      {item.targetUrl && item.actionLabel ? (
        <button
          onClick={() => onNavigate(item.targetUrl!)}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-semibold text-[var(--bp-accent-ink)] underline-offset-4 hover:bg-[var(--bp-accent-soft)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bp-accent)]"
        >
          {item.actionLabel}
          <ArrowRight className="h-4 w-4" />
        </button>
      ) : null}
    </article>
  );
}
function Metric({
  icon,
  label,
  value,
  support,
  tone = "neutral",
}: {
  icon: ReactNode;
  label: string;
  value: number;
  support: string;
  tone?: "neutral" | "warning";
}) {
  const { formatNumber } = useLanguage();
  return (
    <article className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4">
      <div className="flex items-center justify-between">
        <span
          className={`rounded-lg p-2 ${tone === "warning" ? "bg-orange-500/12 text-[var(--bp-warning)]" : "bg-[var(--bp-accent-soft)] text-[var(--bp-accent-ink)]"}`}
        >
          {icon}
        </span>
        <span className="text-xs text-[var(--bp-muted)]">{label}</span>
      </div>
      <p className="mt-4 text-2xl font-bold tracking-tight">
        {formatNumber(value)}
      </p>
      <p className="mt-1 text-xs leading-5 text-[var(--bp-muted)]">{support}</p>
    </article>
  );
}

function Challenges({
  token,
  onOpen,
}: {
  token: string;
  onOpen: (id: string) => void;
}) {
  const [status, setStatus] = useState<string>("active");
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["admin", "challenges", status],
    queryFn: () => challengesApi.list(token, status),
  });
  const create = useMutation({
    mutationFn: (body: unknown) => challengesApi.create(token, body),
    onSuccess: () => {
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["admin", "challenges"] });
    },
  });
  const publish = useMutation({
    mutationFn: (id: string) => challengesApi.publish(token, id),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["admin", "challenges"] }),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => challengesApi.cancel(token, id),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["admin", "challenges"] }),
  });
  return (
    <>
      <PageHeader
        title="Challenges"
        description="Create and manage community challenges for BeePlan users."
      >
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg bg-[var(--bp-accent)] px-4 py-2 text-sm font-bold text-[var(--bp-accent-text)]"
        >
          Create Challenge
        </button>
      </PageHeader>
      <div className="mb-5 flex flex-wrap gap-2">
        {["active", "scheduled", "draft", "completed", "cancelled"].map(
          (item) => (
            <button
              key={item}
              onClick={() => setStatus(item)}
              className={`rounded-full px-3 py-1.5 text-sm ${status === item ? "bg-[var(--bp-accent)] text-[var(--bp-accent-text)]" : "bg-[var(--bp-surface)] text-[var(--bp-muted)]"}`}
            >
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ),
        )}
      </div>
      <AdminSection title="Community challenges">
        {query.isLoading ? (
          <p>Loading challenges…</p>
        ) : query.isError ? (
          <AdminError message="Unable to load challenges." />
        ) : (
          <div className="space-y-3">
            {query.data?.items.map((challenge: AdminChallenge) => (
              <div
                key={challenge.id}
                className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <button
                      onClick={() => onOpen(challenge.id)}
                      className="font-bold text-left hover:underline"
                    >
                      {challenge.title}
                    </button>
                    <p className="text-sm text-[var(--bp-muted)]">
                      {challenge.type.replace("_", " ")} ·{" "}
                      {challenge.targetValue}
                      {challenge.type === "focus_minutes" ? " min" : ""}
                    </p>
                    <p className="mt-1 text-xs text-[var(--bp-muted)]">
                      {formatAdminDate(challenge.startAt)} →{" "}
                      {formatAdminDate(challenge.endAt)}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <span className="rounded-full bg-[var(--bp-accent-soft)] px-2 py-1 font-semibold">
                      {challenge.status}
                    </span>
                    <p className="mt-2">
                      Participants: {challenge.metrics.participants} ·
                      Completed: {challenge.metrics.completed} ·{" "}
                      {Math.round(challenge.metrics.completionRate * 100)}%
                    </p>
                    {challenge.status === "draft" && (
                      <button
                        onClick={() => publish.mutate(challenge.id)}
                        className="mt-2 mr-2 rounded px-2 py-1 text-xs font-bold bg-[var(--bp-accent)] text-[var(--bp-accent-text)]"
                      >
                        Publish
                      </button>
                    )}
                    {["active", "scheduled"].includes(challenge.status) && (
                      <button
                        onClick={() => cancel.mutate(challenge.id)}
                        className="mt-2 rounded px-2 py-1 text-xs font-bold border border-red-300 text-red-700"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminSection>
      {open && (
        <ChallengeModal
          onClose={() => setOpen(false)}
          onSave={(body) => create.mutate(body)}
          busy={create.isPending}
        />
      )}
    </>
  );
}
function ChallengeModal({
  onClose,
  onSave,
  busy,
}: {
  onClose: () => void;
  onSave: (body: unknown) => void;
  busy: boolean;
}) {
  const { t } = useLanguage();
  const [type, setType] = useState<
    "focus_minutes" | "focus_sessions" | "tasks_completed"
  >("focus_minutes");
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState(60);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const updateStartAt = (value: string) => {
    setStartAt(value);
    if (value && endAt && endAt < value) setEndAt("");
  };
  const updateEndAt = (value: string) => {
    if (!value || !startAt || value >= startAt) setEndAt(value);
  };
  const label =
    type === "focus_minutes"
      ? "Target minutes"
      : type === "focus_sessions"
        ? "Target sessions"
        : "Target tasks";
  return (
    <Modal open title="Create Challenge" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            title,
            type,
            targetValue: target,
            startAt: new Date(startAt).toISOString(),
            endAt: new Date(endAt).toISOString(),
          });
        }}
      >
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="w-full rounded border p-2"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
          className="w-full rounded border p-2"
        >
          <option value="focus_minutes">Focus Minutes</option>
          <option value="focus_sessions">Focus Sessions</option>
          <option value="tasks_completed">Tasks Completed</option>
        </select>
        <label className="block text-sm">
          {label}
          <input
            min="1"
            required
            type="number"
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
            className="mt-1 w-full rounded border p-2"
          />
        </label>
        <EnglishChallengeDateTimeField label={t("admin.challengeStartDate")} value={startAt} onChange={updateStartAt} />
        <EnglishChallengeDateTimeField label={t("admin.challengeEndDate")} value={endAt} onChange={updateEndAt} minValue={startAt} />
        <p className="text-xs text-[var(--bp-muted)]">
          Rewards are not enabled yet.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            disabled={busy}
            className="rounded bg-[var(--bp-accent)] px-3 py-2 text-sm font-bold text-[var(--bp-accent-text)]"
          >
            Save Draft
          </button>
        </div>
      </form>
    </Modal>
  );
}

const ENGLISH_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const ENGLISH_TIME = /^(\d{1,2}):([0-5]\d)\s*([AaPp][Mm])$/;

export function splitChallengeDateTime(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return { date: "", time: "" };
  const [, year, month, day, hour, minute] = match;
  const hour24 = Number(hour);
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return { date: `${month}/${day}/${year}`, time: `${String(hour12).padStart(2, "0")}:${minute} ${period}` };
}

export function serializeChallengeDateTime(date: string, time: string) {
  const dateMatch = ENGLISH_DATE.exec(date.trim());
  const timeMatch = ENGLISH_TIME.exec(time.trim());
  if (!dateMatch || !timeMatch) return "";
  const [, monthText, dayText, year] = dateMatch;
  const [, hourText, minute, periodText] = timeMatch;
  const month = Number(monthText), day = Number(dayText), hour12 = Number(hourText);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour12 < 1 || hour12 > 12) return "";
  const candidate = new Date(Number(year), month - 1, day);
  if (candidate.getFullYear() !== Number(year) || candidate.getMonth() !== month - 1 || candidate.getDate() !== day) return "";
  const hour24 = (hour12 % 12) + (periodText.toUpperCase() === "PM" ? 12 : 0);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour24).padStart(2, "0")}:${minute}`;
}

function openNativePicker(input: HTMLInputElement | null) {
  if (!input) return;
  if (typeof input.showPicker === "function") input.showPicker();
  else input.click();
}

export function EnglishChallengeDateTimeField({ label, value, onChange, minValue = "" }: { label: string; value: string; onChange: (value: string) => void; minValue?: string }) {
  const initial = splitChallengeDateTime(value);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const datePickerRef = useRef<HTMLInputElement>(null);
  const timePickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const next = splitChallengeDateTime(value);
    setDate(next.date);
    setTime(next.time);
  }, [value]);

  const update = (nextDate: string, nextTime: string) => {
    setDate(nextDate);
    setTime(nextTime);
    const serialized = serializeChallengeDateTime(nextDate, nextTime);
    if (serialized && minValue && serialized < minValue) {
      setDate("");
      setTime("");
      onChange("");
      return;
    }
    if (serialized) onChange(serialized);
  };

  const nativeDate = date ? serializeChallengeDateTime(date, "12:00 AM").slice(0, 10) : "";
  const nativeTime = time ? serializeChallengeDateTime("01/01/2000", time).slice(11) : "";
  const min = splitChallengeDateTime(minValue);
  const minNativeDate = min.date ? serializeChallengeDateTime(min.date, "12:00 AM").slice(0, 10) : "";
  const minNativeTime = nativeDate && nativeDate === minNativeDate && min.time ? serializeChallengeDateTime("01/01/2000", min.time).slice(11) : undefined;

  return <div className="block text-sm"><span>{label}</span><div dir="ltr" lang="en" className="mt-1 grid gap-2 sm:grid-cols-2"><label className="relative block"><CalendarDays aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--bp-muted)]" /><input data-testid={`${label}-date`} required readOnly aria-label={`${label} date`} placeholder="MM/DD/YYYY" value={date} onClick={() => openNativePicker(datePickerRef.current)} onKeyDown={(event) => event.preventDefault()} onChange={(event) => update(event.target.value, time)} className="w-full cursor-pointer rounded border py-2 pl-9 pr-3 text-left [font-variant-numeric:tabular-nums]" /><input ref={datePickerRef} data-testid={`${label}-date-picker`} aria-hidden tabIndex={-1} required type="date" min={minNativeDate || undefined} value={nativeDate} onChange={(event) => update(splitChallengeDateTime(`${event.target.value}T00:00`).date, time)} className="pointer-events-none absolute h-px w-px opacity-0" /></label><label className="relative block"><Clock3 aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--bp-muted)]" /><input data-testid={`${label}-time`} required readOnly aria-label={`${label} time`} placeholder="hh:mm AM" value={time} onClick={() => openNativePicker(timePickerRef.current)} onKeyDown={(event) => event.preventDefault()} onChange={(event) => update(date, event.target.value)} className="w-full cursor-pointer rounded border py-2 pl-9 pr-3 text-left [font-variant-numeric:tabular-nums]" /><input ref={timePickerRef} data-testid={`${label}-time-picker`} aria-hidden tabIndex={-1} required type="time" min={minNativeTime} value={nativeTime} onChange={(event) => { const [hours, minutes] = event.target.value.split(":").map(Number); if (Number.isFinite(hours) && Number.isFinite(minutes)) update(date, `${String(hours % 12 || 12).padStart(2, "0")}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`); }} className="pointer-events-none absolute h-px w-px opacity-0" /></label></div></div>;
}

function Users({ token }: { token: string }) {
  const { formatNumber, t } = useLanguage();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [reason, setReason] = useState("");
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["admin", "users", search, role, status, page, limit],
    queryFn: () =>
      adminApi.users(
        token,
        new URLSearchParams({
          ...(search ? { search } : {}),
          ...(role ? { role } : {}),
          ...(status ? { accountStatus: status } : {}),
          page: String(page),
          limit: String(limit),
        }),
      ),
  });
  const mutation = useMutation({
    mutationFn: ({
      user,
      kind,
    }: {
      user: AdminUser;
      kind: "status" | "role";
    }) =>
      kind === "status"
        ? adminApi.status(
            token,
            user.id,
            user.accountStatus === "active" ? "suspended" : "active",
            reason,
          )
        : adminApi.role(
            token,
            user.id,
            user.role === "admin" ? "user" : "admin",
          ),
    onSuccess: () => {
      setSelected(null);
      setReason("");
      void client.invalidateQueries({ queryKey: ["admin"] });
    },
  });
  const resetPage = () => setPage(1);
  return (
    <>
      <PageHeader
        title={t("admin.users")}
        description={t("admin.usersDescription")}
      />
      <div className="flex flex-wrap gap-2 rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-3">
        <label className="flex min-w-52 flex-1 items-center gap-2 rounded-lg border border-[var(--bp-border)] bg-[var(--bp-bg)] px-3 text-[var(--bp-muted)]">
          <Search className="h-4 w-4" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            placeholder={t("admin.searchNameOrEmail")}
            className="w-full bg-transparent py-2 text-sm text-[var(--bp-text)] placeholder:text-[var(--bp-muted)]"
          />
        </label>
        <select
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            resetPage();
          }}
          className="rounded-lg border border-[var(--bp-border)] bg-[var(--bp-bg)] px-3 py-2 text-sm"
        >
          <option value="">{t("admin.allRoles")}</option>
          <option value="user">{t("admin.users")}</option>
          <option value="admin">{t("admin.admins")}</option>
        </select>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            resetPage();
          }}
          className="rounded-lg border border-[var(--bp-border)] bg-[var(--bp-bg)] px-3 py-2 text-sm"
        >
          <option value="">{t("admin.allStatuses")}</option>
          <option value="active">{t("admin.active")}</option>
          <option value="suspended">{t("admin.suspended")}</option>
        </select>
        <select
          aria-label={t("admin.usersPerPage")}
          value={limit}
          onChange={(e) => {
            setLimit(Number(e.target.value));
            resetPage();
          }}
          className="rounded-lg border border-[var(--bp-border)] bg-[var(--bp-bg)] px-3 py-2 text-sm"
        >
          <option value="10">{t("admin.perPage", { count: 10 })}</option>
          <option value="25">{t("admin.perPage", { count: 25 })}</option>
          <option value="50">{t("admin.perPage", { count: 50 })}</option>
        </select>
      </div>
      <AdminSection
        title={t("admin.accounts")}
        action={
          query.data ? (
            <span className="text-xs text-[var(--bp-muted)]">
              {t("admin.total", { count: formatNumber(query.data.total) })}
            </span>
          ) : undefined
        }
      >
        {query.isLoading ? (
          <TableSkeleton />
        ) : query.isError ? (
          <AdminError message={t("admin.usersLoadFailed")} />
        ) : query.data?.items.length ? (
          <>
            <div className="overflow-x-auto rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)]">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-[var(--bp-border)] text-xs font-medium text-[var(--bp-muted)]">
                  <tr>
                    <th className="p-4">{t("admin.user")}</th>
                    <th className="p-4">{t("admin.email")}</th>
                    <th className="p-4">{t("admin.role")}</th>
                    <th className="p-4">{t("admin.status")}</th>
                    <th className="p-4">{t("admin.joined")}</th>
                    <th className="p-4">
                      <span className="sr-only">{t("admin.actions")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((user) => (
                    <UserRow
                      key={user.id}
                      user={user}
                      onManage={() => setSelected(user)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              limit={limit}
              total={query.data.total}
              onPage={setPage}
            />
          </>
        ) : (
          <EmptyState
            title={t("admin.noUsersFound")}
            description={t("admin.changeFilters")}
          />
        )}
      </AdminSection>
      <Modal
        open={Boolean(selected)}
        title={t("admin.confirmAccountChange")}
        onClose={() => setSelected(null)}
        footer={
          <>
            <button
              className="px-3 py-2 text-sm"
              onClick={() => setSelected(null)}
            >
              {t("common.cancel")}
            </button>
            <button
              className="rounded-lg bg-[var(--bp-accent)] px-3 py-2 text-sm font-bold text-[var(--bp-accent-text)]"
              onClick={() =>
                selected && mutation.mutate({ user: selected, kind: "status" })
              }
            >
              {selected?.accountStatus === "active"
                ? t("admin.suspend")
                : t("admin.restore")}
            </button>
            <button
              className="rounded-lg border border-[var(--bp-border)] px-3 py-2 text-sm"
              onClick={() =>
                selected && mutation.mutate({ user: selected, kind: "role" })
              }
            >
              {t("admin.makeRole", {
                role:
                  selected?.role === "admin"
                    ? t("admin.user")
                    : t("admin.admin"),
              })}
            </button>
          </>
        }
      >
        <p className="mt-4 text-sm text-[var(--bp-muted)]">
          {t("admin.revokeSessions")}
        </p>
        {selected?.accountStatus === "active" && (
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder={t("admin.suspensionReason")}
            className="mt-3 w-full rounded-lg border border-[var(--bp-border)] bg-[var(--bp-bg)] p-2 text-sm"
          />
        )}
        {mutation.isError && (
          <p className="mt-2 text-sm text-[var(--bp-danger)]">
            {t("admin.userUpdateFailed")}
          </p>
        )}
      </Modal>
    </>
  );
}
function Pagination({
  page,
  limit,
  total,
  onPage,
}: {
  page: number;
  limit: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const { formatNumber, t } = useLanguage();
  const pages = Math.max(1, Math.ceil(total / limit));
  const start = total ? (page - 1) * limit + 1 : 0;
  const end = Math.min(page * limit, total);
  const visible = Array.from(
    new Set([
      1,
      ...Array.from({ length: 3 }, (_, i) =>
        Math.min(Math.max(page + i - 1, 1), pages),
      ),
      pages,
    ]),
  ).sort((a, b) => a - b);
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-[var(--bp-muted)]">
        {t("admin.showingUsers", {
          start: formatNumber(start),
          end: formatNumber(end),
          total: formatNumber(total),
        })}
      </p>
      <nav
        aria-label={t("admin.usersPagination")}
        className="flex items-center gap-1"
      >
        <button
          disabled={page === 1}
          onClick={() => onPage(page - 1)}
          className="rounded-lg border border-[var(--bp-border)] px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {t("admin.previous")}
        </button>
        {visible.map((item, index) => (
          <span key={item} className="contents">
            {index > 0 && item - visible[index - 1] > 1 && (
              <span className="px-1 text-[var(--bp-muted)]">…</span>
            )}
            <button
              aria-current={item === page ? "page" : undefined}
              onClick={() => onPage(item)}
              className={`h-8 min-w-8 rounded-lg px-2 ${item === page ? "bg-[var(--bp-accent)] font-bold text-[var(--bp-accent-text)]" : "hover:bg-[var(--bp-accent-soft)]"}`}
            >
              {item}
            </button>
          </span>
        ))}
        <button
          disabled={page === pages}
          onClick={() => onPage(page + 1)}
          className="rounded-lg border border-[var(--bp-border)] px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {t("admin.next")}
        </button>
      </nav>
    </div>
  );
}
function UserRow({
  user,
  onManage,
}: {
  user: AdminUser;
  onManage: () => void;
}) {
  const { language, t } = useLanguage();
  const initials = user.fullName
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <tr
      className={`border-b border-[var(--bp-border)] last:border-0 ${user.accountStatus === "suspended" ? "opacity-65" : ""}`}
    >
      <td className="p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bp-accent-soft)] text-xs font-bold text-[var(--bp-accent-ink)]">
            {initials}
          </span>
          <span className="font-semibold">{user.fullName}</span>
        </div>
      </td>
      <td className="p-4 text-[var(--bp-muted)]">{user.email}</td>
      <td className="p-4">
        <Badge tone={user.role === "admin" ? "accent" : "neutral"}>
          {user.role === "admin" ? t("admin.admin") : t("admin.user")}
        </Badge>
      </td>
      <td className="p-4">
        <Badge tone={user.accountStatus === "active" ? "success" : "warning"}>
          {user.accountStatus === "active"
            ? t("admin.active")
            : t("admin.suspended")}
        </Badge>
      </td>
      <td className="p-4 text-[var(--bp-muted)]">
        {new Date(user.createdAt).toLocaleDateString(language)}
      </td>
      <td className="p-4 text-right">
        <button
          aria-label={t("admin.manageUser", { name: user.fullName })}
          onClick={onManage}
          className="rounded-lg p-2 text-[var(--bp-muted)] hover:bg-[var(--bp-accent-soft)] hover:text-[var(--bp-text)]"
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </td>
    </tr>
  );
}

function Audit({ token }: { token: string }) {
  const query = useQuery({
    queryKey: ["admin", "audit"],
    queryFn: () => adminApi.audit(token),
  });
  return (
    <>
      <PageHeader
        title="Audit Log"
        description="Review security-sensitive Admin activity."
      />
      <AdminSection
        title="Activity"
        action={
          query.data ? (
            <span className="text-xs text-[var(--bp-muted)]">
              {query.data.total} entries
            </span>
          ) : undefined
        }
      >
        {query.isLoading ? (
          <AuditSkeleton />
        ) : query.isError ? (
          <AdminError message="Unable to load audit activity." />
        ) : query.data?.items.length ? (
          <div className="space-y-3">
            {query.data.items.map((item) => (
              <AuditItem key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No audit activity yet"
            description="Admin actions will appear here."
          />
        )}
      </AdminSection>
    </>
  );
}
function AuditItem({ item }: { item: AuditEntry }) {
  const action = item.action
    .replace(/^user\./, "")
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ");
  return (
    <details className="group rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)]">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
        <span className="rounded-lg bg-[var(--bp-accent-soft)] p-2 text-[var(--bp-accent-ink)]">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span className="font-semibold">{item.actor.fullName}</span>
            <span className="text-[var(--bp-muted)]"> · {action}</span>
          </p>
          <p className="mt-1 truncate text-xs text-[var(--bp-muted)]">
            {item.targetType} · {item.targetId}
          </p>
        </div>
        <span className="hidden text-xs text-[var(--bp-muted)] sm:block">
          {new Date(item.createdAt).toLocaleString()}
        </span>
        <ChevronDown className="h-4 w-4 text-[var(--bp-muted)] transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-[var(--bp-border)] px-4 py-4 sm:pl-14">
        <p className="mb-3 text-xs text-[var(--bp-muted)] sm:hidden">
          {new Date(item.createdAt).toLocaleString()}
        </p>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <AuditState label="Before" value={item.beforeState} />
          <AuditState label="After" value={item.afterState} />
        </div>
      </div>
    </details>
  );
}
function AuditState({
  label,
  value,
}: {
  label: string;
  value: Record<string, unknown> | null;
}) {
  return (
    <div className="rounded-lg bg-[var(--bp-bg)] p-3">
      <p className="text-xs font-semibold text-[var(--bp-muted)]">{label}</p>
      <p className="mt-1 break-words text-sm">
        {value
          ? Object.entries(value)
              .map(([key, entry]) => `${key}: ${String(entry)}`)
              .join(", ")
          : "—"}
      </p>
    </div>
  );
}
function Errors({
  token,
  onOpen,
}: {
  token: string;
  onOpen: (id: string) => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const status = searchParams.get("status") ?? "";
  const severity = searchParams.get("severity") ?? "";
  const setFilter = (key: "status" | "severity", value: string) => {
    const next = new URLSearchParams(searchParams);
    value ? next.set(key, value) : next.delete(key);
    setSearchParams(next);
  };
  const setStatus = (value: string) => setFilter("status", value);
  const setSeverity = (value: string) => setFilter("severity", value);
  const query = useQuery({
    queryKey: ["admin", "errors", search, status, severity],
    queryFn: () =>
      adminApi.errors(
        token,
        new URLSearchParams({
          ...(search ? { search } : {}),
          ...(status ? { status } : {}),
          ...(severity ? { severity } : {}),
        }),
      ),
  });
  return (
    <>
      <PageHeader
        title="Errors"
        description="Monitor and investigate BeePlan failures."
      />
      <div className="flex flex-wrap gap-2 rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-3">
        <label className="flex min-w-52 flex-1 items-center gap-2 rounded-lg border border-[var(--bp-border)] bg-[var(--bp-bg)] px-3 text-[var(--bp-muted)]">
          <Search className="h-4 w-4" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search errors"
            className="w-full bg-transparent py-2 text-sm text-[var(--bp-text)]"
          />
        </label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-[var(--bp-border)] bg-[var(--bp-bg)] px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="new">New</option>
          <option value="investigating">Investigating</option>
          <option value="resolved">Resolved</option>
          <option value="ignored">Ignored</option>
        </select>
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className="rounded-lg border border-[var(--bp-border)] bg-[var(--bp-bg)] px-3 py-2 text-sm"
        >
          <option value="">All severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
      <AdminSection
        title="Error inbox"
        action={
          query.data ? (
            <span className="text-xs text-[var(--bp-muted)]">
              {query.data.total} groups
            </span>
          ) : undefined
        }
      >
        {query.isLoading ? (
          <TableSkeleton />
        ) : query.data?.items.length ? (
          <div className="overflow-x-auto rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)]">
            <table className="w-full min-w-[790px] text-left text-sm">
              <thead className="border-b border-[var(--bp-border)] text-xs text-[var(--bp-muted)]">
                <tr>
                  <th className="p-4">Error</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Service / Route</th>
                  <th>Occurrences</th>
                  <th>Affected</th>
                  <th>Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((error) => (
                  <tr
                    key={error.id}
                    className="cursor-pointer border-b border-[var(--bp-border)] last:border-0 hover:bg-[var(--bp-accent-soft)]"
                    onClick={() => onOpen(error.id)}
                  >
                    <td className="p-4">
                      <p className="font-semibold">{error.title}</p>
                      <p className="mt-1 max-w-xs truncate text-xs text-[var(--bp-muted)]">
                        {error.normalizedMessage}
                      </p>
                    </td>
                    <td>
                      <SeverityBadge severity={error.severity} />
                    </td>
                    <td>
                      <Badge
                        tone={
                          error.status === "new"
                            ? "accent"
                            : error.status === "resolved"
                              ? "success"
                              : "neutral"
                        }
                      >
                        {error.status}
                      </Badge>
                    </td>
                    <td className="max-w-52 truncate text-[var(--bp-muted)]">
                      {error.service}
                      {error.route ? ` · ${error.route}` : ""}
                    </td>
                    <td>{error.occurrenceCount}</td>
                    <td>{error.affectedUsers}</td>
                    <td className="text-[var(--bp-muted)]">
                      {new Date(error.lastSeenAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No errors found"
            description="No captured errors match these filters."
          />
        )}
      </AdminSection>
    </>
  );
}
function SeverityBadge({
  severity,
}: {
  severity: AdminErrorGroup["severity"];
}) {
  return (
    <Badge
      tone={
        severity === "critical" || severity === "high"
          ? "warning"
          : severity === "medium"
            ? "accent"
            : "neutral"
      }
    >
      {severity}
    </Badge>
  );
}
const reportCategories: ReportCategory[] = [
  "harassment",
  "spam",
  "inappropriate_content",
  "impersonation",
  "abuse",
  "other",
];
const reportLabel = (value: string) => value.replace(/_/g, " ");
const reportTone = (status: ReportStatus) =>
  status === "action_taken"
    ? "success"
    : status === "pending"
      ? "warning"
      : status === "under_review"
        ? "accent"
        : "neutral";
const reportStatusLabel = (status: ReportStatus) =>
  ({
    pending: "Pending",
    under_review: "Under Review",
    action_taken: "Action Taken",
    dismissed: "Dismissed",
  })[status];
const accountStatusLabel = (
  status: AdminReport["reported"]["accountStatus"],
) => (status === "suspended" ? "Suspended" : "Active");
const accountStatusTone = (status: AdminReport["reported"]["accountStatus"]) =>
  status === "suspended" ? "warning" : "success";
const moderationActionLabel = (action: string) =>
  action === "suspend"
    ? "Suspended"
    : action === "restore"
      ? "Restored"
      : "Warning Issued";

function Reports({
  token,
  onOpen,
}: {
  token: string;
  onOpen: (id: string) => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = (searchParams.get("status") ?? "") as ReportStatus | "";
  const category = (searchParams.get("category") ?? "") as ReportCategory | "";
  const [page, setPage] = useState(1);
  const queryParams = new URLSearchParams({ page: String(page), limit: "25" });
  if (status) queryParams.set("status", status);
  if (category) queryParams.set("category", category);
  const query = useQuery({
    queryKey: ["admin", "reports", page, status, category],
    queryFn: () => adminApi.reports(token, queryParams),
  });
  const updateFilter = (
    nextStatus: ReportStatus | "",
    nextCategory: ReportCategory | "",
  ) => {
    const next = new URLSearchParams(searchParams);
    nextStatus ? next.set("status", nextStatus) : next.delete("status");
    nextCategory ? next.set("category", nextCategory) : next.delete("category");
    setSearchParams(next);
    setPage(1);
  };
  const data = query.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  return (
    <>
      <PageHeader
        title="Reports"
        description="Review and manage user safety reports."
      />
      <div className="flex flex-wrap gap-3">
        <select
          aria-label="Filter reports by status"
          value={status}
          onChange={(event) =>
            updateFilter(event.target.value as ReportStatus | "", category)
          }
          className="rounded-lg border border-[var(--bp-border)] bg-[var(--bp-surface)] px-3 py-2 text-sm"
        >
          <option value="">All report statuses</option>
          <option value="pending">Pending</option>
          <option value="under_review">Under Review</option>
          <option value="action_taken">Action Taken</option>
          <option value="dismissed">Dismissed</option>
        </select>
        <select
          aria-label="Filter reports by category"
          value={category}
          onChange={(event) =>
            updateFilter(status, event.target.value as ReportCategory | "")
          }
          className="rounded-lg border border-[var(--bp-border)] bg-[var(--bp-surface)] px-3 py-2 text-sm"
        >
          <option value="">All categories</option>
          {reportCategories.map((item) => (
            <option key={item} value={item}>
              {reportLabel(item)}
            </option>
          ))}
        </select>
      </div>
      <AdminSection
        title="Safety reports"
        action={
          data ? (
            <span className="text-xs text-[var(--bp-muted)]">
              {data.total} total
            </span>
          ) : undefined
        }
      >
        {query.isLoading ? (
          <TableSkeleton />
        ) : query.isError ? (
          <AdminError message="Unable to load reports." />
        ) : data?.items.length ? (
          <>
            <div className="overflow-x-auto rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)]">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="border-b border-[var(--bp-border)] text-xs text-[var(--bp-muted)]">
                  <tr>
                    <th className="p-4">Report</th>
                    <th>Reported User</th>
                    <th>Category</th>
                    <th>Report Status</th>
                    <th>Account Status</th>
                    <th>Submitted</th>
                    <th className="p-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((report) => (
                    <tr
                      key={report.id}
                      className="border-b border-[var(--bp-border)] last:border-0 hover:bg-[var(--bp-accent-soft)]"
                    >
                      <td className="p-4 font-mono text-xs">
                        #{report.id.slice(0, 8)}
                      </td>
                      <td>
                        <p className="font-semibold">
                          {report.reported.fullName}
                        </p>
                        <p className="max-w-48 truncate text-xs text-[var(--bp-muted)]">
                          {report.reported.email}
                        </p>
                      </td>
                      <td>
                        <Badge>{reportLabel(report.category)}</Badge>
                      </td>
                      <td>
                        <Badge tone={reportTone(report.status)}>
                          {reportStatusLabel(report.status)}
                        </Badge>
                      </td>
                      <td>
                        <Badge
                          tone={accountStatusTone(
                            report.reported.accountStatus,
                          )}
                        >
                          {accountStatusLabel(report.reported.accountStatus)}
                        </Badge>
                      </td>
                      <td className="text-xs text-[var(--bp-muted)]" dir="ltr">
                        {formatAdminDateTime(report.createdAt)}
                      </td>
                      <td className="p-4">
                        <button
                          className="rounded-lg border border-[var(--bp-border)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--bp-accent-soft)]"
                          onClick={() => onOpen(report.id)}
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 text-sm">
              <span className="text-[var(--bp-muted)]">
                Showing {(page - 1) * data.limit + 1}–
                {Math.min(page * data.limit, data.total)} of {data.total}{" "}
                reports
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((current) => current - 1)}
                  className="rounded-lg border border-[var(--bp-border)] px-3 py-1.5 disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="rounded-lg bg-[var(--bp-accent-soft)] px-3 py-1.5 font-semibold">
                  {page} / {pages}
                </span>
                <button
                  disabled={page === pages}
                  onClick={() => setPage((current) => current + 1)}
                  className="rounded-lg border border-[var(--bp-border)] px-3 py-1.5 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            title="No reports found"
            description="No user safety reports match these filters."
          />
        )}
      </AdminSection>
    </>
  );
}

function StatusSummary({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "accent" | "success" | "warning";
}) {
  return (
    <div className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4">
      <p className="text-xs font-semibold text-[var(--bp-muted)]">{label}</p>
      <div className="mt-2">
        <Badge tone={tone}>{value}</Badge>
      </div>
    </div>
  );
}
function AdminFeedbackInbox({
  token,
  onOpen,
}: {
  token: string;
  onOpen: (id: string) => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get("status") ?? "";
  const category = searchParams.get("category") ?? "";
  const sort = searchParams.get("sort") ?? "newest";
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    value ? next.set(key, value) : next.delete(key);
    setSearchParams(next);
  };
  const query = useQuery({
    queryKey: ["admin", "feedback", status, category, sort],
    queryFn: () =>
      adminApi.feedback(
        token,
        new URLSearchParams({
          ...(status ? { status } : {}),
          ...(category ? { category } : {}),
          sort,
        }),
      ),
  });
  const data = query.data;
  return (
    <>
      <PageHeader
        title="Feedback & Ideas"
        description="Understand what BeePlan users want next."
      />
      <FeedbackViewNav active="feedback" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          "submitted",
          "reviewing",
          "planned",
          "in_development",
          "released",
        ].map((item) => (
          <Metric
            key={item}
            icon={<Lightbulb />}
            label={item.replace("_", " ")}
            value={data?.summary?.[item] ?? 0}
            support="Feedback items"
          />
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <select
          aria-label="Feedback status"
          value={status}
          onChange={(e) => setFilter("status", e.target.value)}
          className="rounded-lg border border-[var(--bp-border)] bg-[var(--bp-surface)] px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          {[
            "submitted",
            "reviewing",
            "planned",
            "in_development",
            "released",
            "declined",
          ].map((item) => (
            <option key={item} value={item}>
              {item.replace("_", " ")}
            </option>
          ))}
        </select>
        <select
          aria-label="Feedback category"
          value={category}
          onChange={(e) => setFilter("category", e.target.value)}
          className="rounded-lg border border-[var(--bp-border)] bg-[var(--bp-surface)] px-3 py-2 text-sm"
        >
          <option value="">All categories</option>
          {["idea", "improvement", "problem", "other"].map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          aria-label="Feedback sort"
          value={sort}
          onChange={(e) => setFilter("sort", e.target.value)}
          className="rounded-lg border border-[var(--bp-border)] bg-[var(--bp-surface)] px-3 py-2 text-sm"
        >
          <option value="newest">Newest</option>
          <option value="most_voted">Most voted</option>
          <option value="recently_updated">Recently updated</option>
        </select>
      </div>
      <AdminSection title="Feedback inbox">
        {query.isLoading ? (
          <TableSkeleton />
        ) : data?.items.length ? (
          <div className="space-y-2">
            {data.items.map((item) => (
              <article
                key={item.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{item.title}</p>
                  <p className="mt-1 text-xs text-[var(--bp-muted)]">
                    {item.category} · {item.author.fullName} · {item.voteCount}{" "}
                    votes
                  </p>
                </div>
                <Badge
                  tone={
                    item.status === "released"
                      ? "success"
                      : item.status === "submitted"
                        ? "warning"
                        : "accent"
                  }
                >
                  {item.status.replace("_", " ")}
                </Badge>
                <button
                  onClick={() => onOpen(item.id)}
                  className="rounded-lg border border-[var(--bp-border)] px-3 py-1.5 text-sm font-semibold hover:bg-[var(--bp-accent-soft)]"
                >
                  Review
                </button>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No feedback found"
            description="No feedback matches these filters."
          />
        )}
      </AdminSection>
    </>
  );
}

function FeedbackViewNav({ active }: { active: "feedback" | "themes" }) {
  const navigate = useNavigate();
  const tabClass = (isActive: boolean) =>
    `rounded-md px-3 py-1.5 ${isActive ? "bg-[var(--bp-accent-soft)] text-[var(--bp-accent-ink)]" : "text-[var(--bp-muted)] hover:text-[var(--bp-text)]"}`;

  return (
    <nav
      aria-label="Feedback views"
      className="-mt-4 mb-6 flex w-fit rounded-lg border border-[var(--bp-border)] bg-[var(--bp-surface)] p-1 text-sm font-semibold"
    >
      <button
        type="button"
        onClick={() => navigate("/admin/feedback")}
        aria-current={active === "feedback" ? "page" : undefined}
        className={tabClass(active === "feedback")}
      >
        Feedback
      </button>
      <button
        type="button"
        onClick={() => navigate("/admin/feedback/clusters")}
        aria-current={active === "themes" ? "page" : undefined}
        className={tabClass(active === "themes")}
      >
        AI Themes
      </button>
    </nav>
  );
}

function AdminFeedbackThemes({ token }: { token: string }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [notice, setNotice] = useState("");
  const query = useQuery({
    queryKey: ["admin", "feedback", "clusters"],
    queryFn: () => feedbackClustersApi.list(token),
  });
  const analyze = useMutation({
    mutationFn: () => feedbackClustersApi.analyze(token),
    onSuccess: (result) => {
      setNotice(
        result.reused
          ? "No feedback changes since the last analysis. Existing AI themes were reused."
          : result.notEnoughFeedback
            ? "Not enough feedback to identify repeated themes yet. At least two eligible feedback items are needed for AI clustering."
            : "AI themes refreshed.",
      );
      void client.invalidateQueries({
        queryKey: ["admin", "feedback", "clusters"],
      });
    },
  });
  const clusters = query.data ?? [];
  return (
    <>
      <PageHeader
        title="AI Feedback Themes"
        description="AI groups similar user requests to help identify repeated demand."
      >
        <button
          disabled={analyze.isPending}
          onClick={() => analyze.mutate()}
          className="rounded-lg bg-[var(--bp-accent)] px-4 py-2 text-sm font-bold text-[var(--bp-accent-text)] disabled:opacity-50"
        >
          {analyze.isPending
            ? "Analyzing…"
            : clusters.length
              ? "Refresh AI Themes"
              : "Analyze Feedback"}
        </button>
      </PageHeader>
      <FeedbackViewNav active="themes" />
      <p className="-mt-4 mb-6 text-sm text-[var(--bp-muted)]">
        AI-generated themes are analytical only. Product decisions remain with
        the Admin.
      </p>
      {notice ? (
        <p className="mb-4 rounded-lg bg-[var(--bp-accent-soft)] px-3 py-2 text-sm">
          {notice}
        </p>
      ) : null}
      {analyze.isError ? (
        <p className="mb-4 rounded-lg border border-orange-500/20 px-3 py-2 text-sm text-[var(--bp-muted)]">
          AI feedback analysis is temporarily unavailable. Existing feedback and
          themes were not changed.
        </p>
      ) : null}
      {query.isLoading ? (
        <TableSkeleton />
      ) : clusters.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {clusters.map((cluster: AdminFeedbackCluster) => (
            <article
              key={cluster.id}
              className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-5"
            >
              <p className="text-xs font-semibold text-[var(--bp-accent-ink)]">
                AI-generated theme
              </p>
              <h2 className="mt-2 font-bold">{cluster.title}</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--bp-muted)]">
                {cluster.summary}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge tone="accent">
                  {cluster.confidence[0].toUpperCase() +
                    cluster.confidence.slice(1)}{" "}
                  confidence
                </Badge>
                <Badge>{cluster.memberCount} Related Ideas</Badge>
                <Badge>{cluster.totalVotes} Total Votes</Badge>
              </div>
              <p className="mt-4 text-xs text-[var(--bp-muted)]" dir="ltr">
                Last analyzed {formatAdminDateTime(cluster.lastAnalyzedAt)}
              </p>
              <button
                type="button"
                onClick={() =>
                  navigate(`/admin/feedback/clusters/${cluster.id}`)
                }
                className="mt-4 rounded-lg border border-[var(--bp-border)] px-3 py-1.5 text-sm font-semibold hover:bg-[var(--bp-accent-soft)]"
              >
                View theme
              </button>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No AI themes yet"
          description="Analyze feedback to identify repeated user requests."
        />
      )}
    </>
  );
}

export function AdminFeedbackThemeDetail({
  token,
  id,
  onBack,
  onOpenFeedback,
}: {
  token: string;
  id: string;
  onBack: () => void;
  onOpenFeedback: (id: string) => void;
}) {
  const query = useQuery({
    queryKey: ["admin", "feedback", "clusters", id],
    queryFn: () => feedbackClustersApi.getById(token, id),
    retry: false,
  });

  if (query.isLoading) return <DashboardSkeleton />;

  if (query.isError || !query.data) {
    const isNotFound =
      query.error instanceof Error &&
      query.error.message === "Cluster not found.";
    return (
      <>
        <button
          type="button"
          className="mb-4 text-sm text-[var(--bp-muted)] hover:text-[var(--bp-text)]"
          onClick={onBack}
        >
          Back to AI Themes
        </button>
        <EmptyState
          title={
            isNotFound
              ? "AI theme not found."
              : "Unable to load this AI theme right now."
          }
          description={
            isNotFound
              ? "This theme may have been archived or is no longer available."
              : "Please try again shortly."
          }
        />
        {!isNotFound ? (
          <button
            type="button"
            className="mt-4 rounded-lg border border-[var(--bp-border)] px-3 py-2 text-sm font-semibold hover:bg-[var(--bp-accent-soft)]"
            onClick={() => void query.refetch()}
          >
            Retry
          </button>
        ) : null}
      </>
    );
  }

  const cluster = query.data;
  return (
    <>
      <button
        type="button"
        className="mb-4 text-sm text-[var(--bp-muted)] hover:text-[var(--bp-text)]"
        onClick={onBack}
      >
        Back to AI Themes
      </button>
      <PageHeader title={cluster.title} description="AI-generated theme">
        {cluster.status === "archived" ? (
          <Badge tone="warning">Archived</Badge>
        ) : null}
      </PageHeader>
      <article className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-5">
        <p className="whitespace-pre-wrap text-sm leading-6">
          {cluster.summary}
        </p>
        <p className="mt-4 text-sm text-[var(--bp-muted)]">
          AI groups similar feedback for analysis. Product decisions remain with
          the Admin.
        </p>
      </article>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={<Lightbulb />}
          label="Related Ideas"
          value={cluster.memberCount}
          support="Feedback in this theme"
        />
        <Metric
          icon={<ArrowRight />}
          label="Total Votes"
          value={cluster.totalVotes}
          support="Votes across related feedback"
        />
        <StatusSummary
          label="Confidence"
          value={`${cluster.confidence[0].toUpperCase() + cluster.confidence.slice(1)} confidence`}
          tone="accent"
        />
        <StatusSummary
          label="Last Analyzed"
          value={formatAdminDateTime(cluster.lastAnalyzedAt)}
          tone="neutral"
        />
      </div>
      <AdminSection title="Related Feedback">
        {cluster.members.length ? (
          <div className="space-y-2">
            {cluster.members.map((member) => (
              <article
                key={member.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold">{member.title}</h3>
                  <p className="mt-1 text-xs text-[var(--bp-muted)]">
                    {member.category} · {member.voteCount} votes · Submitted{" "}
                    {formatAdminDate(member.createdAt)}
                  </p>
                </div>
                <Badge
                  tone={
                    member.status === "released"
                      ? "success"
                      : member.status === "submitted"
                        ? "warning"
                        : "accent"
                  }
                >
                  {feedbackLifecycleLabel(member.status)}
                </Badge>
                <button
                  type="button"
                  onClick={() => onOpenFeedback(member.id)}
                  className="rounded-lg border border-[var(--bp-border)] px-3 py-1.5 text-sm font-semibold hover:bg-[var(--bp-accent-soft)]"
                >
                  View feedback
                </button>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No related feedback"
            description="This theme does not currently contain feedback items."
          />
        )}
      </AdminSection>
    </>
  );
}

export function feedbackLifecycleLabel(
  status:
    | "submitted"
    | "reviewing"
    | "planned"
    | "in_development"
    | "released"
    | "declined",
) {
  return {
    submitted: "Submitted",
    reviewing: "Reviewing",
    planned: "Planned",
    in_development: "In Development",
    released: "Released",
    declined: "Declined",
  }[status];
}

function AdminFeedbackDetail({
  token,
  id,
  onBack,
}: {
  token: string;
  id: string;
  onBack: () => void;
}) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["admin", "feedback", id],
    queryFn: () => adminApi.feedbackDetail(token, id),
  });
  const mutation = useMutation({
    mutationFn: (status: string) => adminApi.feedbackStatus(token, id, status),
    onSuccess: () =>
      void client.invalidateQueries({ queryKey: ["admin", "feedback"] }),
  });
  if (query.isLoading) return <DashboardSkeleton />;
  if (query.isError || !query.data)
    return <AdminError message="Unable to load this feedback item." />;
  const item = query.data;
  return (
    <>
      <button className="mb-4 text-sm text-[var(--bp-muted)]" onClick={onBack}>
        ← Back to Feedback & Ideas
      </button>
      <PageHeader
        title={item.title}
        description="Review demand and manage the lifecycle."
      >
        <Badge
          tone={
            item.status === "released"
              ? "success"
              : item.status === "submitted"
                ? "warning"
                : "accent"
          }
        >
          {item.status.replace("_", " ")}
        </Badge>
      </PageHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <Metric
          icon={<ArrowRight />}
          label="Votes"
          value={item.voteCount}
          support="Unique supporters"
        />
        <StatusSummary
          label="Visibility"
          value={item.visibility}
          tone="neutral"
        />
      </div>
      <AdminSection title="Feedback summary">
        <article className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-5">
          <p className="whitespace-pre-wrap text-sm leading-6">
            {item.description}
          </p>
          <p className="mt-4 text-xs text-[var(--bp-muted)]">
            {item.category} · {item.author.fullName} · {item.author.email}
          </p>
        </article>
      </AdminSection>
      <AdminSection title="Lifecycle">
        <div className="flex flex-wrap gap-2">
          {item.validNextStatuses?.map((status) => (
            <button
              key={status}
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(status)}
              className="rounded-lg border border-[var(--bp-border)] px-3 py-2 text-sm font-semibold hover:bg-[var(--bp-accent-soft)]"
            >
              Mark {status.replace("_", " ")}
            </button>
          ))}
        </div>
        {mutation.isError ? (
          <p className="mt-3 text-sm text-red-600">
            Unable to update feedback status.
          </p>
        ) : null}
      </AdminSection>
    </>
  );
}
function ReportDetail({
  token,
  id,
  onBack,
}: {
  token: string;
  id: string;
  onBack: () => void;
}) {
  const client = useQueryClient();
  const [modal, setModal] = useState<"warning" | "suspend" | "restore" | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const query = useQuery({
    queryKey: ["admin", "report", id],
    queryFn: () => adminApi.report(token, id),
  });
  const refresh = () => void client.invalidateQueries({ queryKey: ["admin"] });
  const status = useMutation({
    mutationFn: (next: Extract<ReportStatus, "under_review" | "dismissed">) =>
      adminApi.reportStatus(token, id, next),
    onSuccess: refresh,
  });
  const moderate = useMutation({
    mutationFn: ({
      action,
      reason,
    }: {
      action: "warning" | "suspend" | "restore";
      reason: string;
    }) => adminApi.moderateReport(token, id, action, reason),
    onSuccess: () => {
      setModal(null);
      setReason("");
      refresh();
    },
  });
  if (query.isLoading) return <DashboardSkeleton />;
  if (query.isError || !query.data)
    return <AdminError message="Unable to load this report." />;
  const report = query.data;
  const actionable =
    report.status === "pending" || report.status === "under_review";
  const submitModeration = () => {
    if (modal && reason.trim().length >= 3)
      moderate.mutate({ action: modal, reason: reason.trim() });
  };
  return (
    <>
      <button
        className="mb-4 text-sm text-[var(--bp-muted)] hover:text-[var(--bp-text)]"
        onClick={onBack}
      >
        ← Back to Reports
      </button>
      <PageHeader
        title={`Report #${report.id.slice(0, 8)}`}
        description="Review the report and take a documented moderation action."
      >
        <div className="flex flex-wrap gap-2">
          <Badge>{reportLabel(report.category)}</Badge>
          <Badge tone={reportTone(report.status)}>
            {reportStatusLabel(report.status)}
          </Badge>
        </div>
      </PageHeader>
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <StatusSummary
          label="Report Status"
          value={reportStatusLabel(report.status)}
          tone={reportTone(report.status)}
        />
        <StatusSummary
          label="Account Status"
          value={accountStatusLabel(report.reported.accountStatus)}
          tone={accountStatusTone(report.reported.accountStatus)}
        />
      </div>
      {actionable ? (
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            disabled={status.isPending}
            className="rounded-lg border border-[var(--bp-border)] px-3 py-2 text-sm hover:bg-[var(--bp-accent-soft)]"
            onClick={() => status.mutate("under_review")}
          >
            Mark Under Review
          </button>
          <button
            disabled={status.isPending}
            className="rounded-lg border border-[var(--bp-border)] px-3 py-2 text-sm hover:bg-[var(--bp-accent-soft)]"
            onClick={() => status.mutate("dismissed")}
          >
            Dismiss
          </button>
          <button
            className="rounded-lg border border-[var(--bp-border)] px-3 py-2 text-sm hover:bg-[var(--bp-accent-soft)]"
            onClick={() => setModal("warning")}
          >
            Issue Warning
          </button>
          {report.reported.accountStatus === "suspended" ? (
            <button
              className="rounded-lg border border-[var(--bp-border)] px-3 py-2 text-sm font-semibold text-[var(--bp-text)] hover:bg-[var(--bp-accent-soft)]"
              onClick={() => setModal("restore")}
            >
              Restore User
            </button>
          ) : (
            <button
              className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
              onClick={() => setModal("suspend")}
            >
              Suspend User
            </button>
          )}
        </div>
      ) : null}
      {!actionable && report.reported.accountStatus === "suspended" ? (
        <div className="mb-6">
          <button
            className="rounded-lg border border-[var(--bp-border)] px-3 py-2 text-sm font-semibold text-[var(--bp-text)] hover:bg-[var(--bp-accent-soft)]"
            onClick={() => setModal("restore")}
          >
            Restore User
          </button>
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-5">
          <h2 className="font-bold">Reported User</h2>
          <p className="mt-3 font-semibold">{report.reported.fullName}</p>
          <p className="text-sm text-[var(--bp-muted)]">
            {report.reported.email}
          </p>
          <div className="mt-3">
            <Badge tone={accountStatusTone(report.reported.accountStatus)}>
              {accountStatusLabel(report.reported.accountStatus)}
            </Badge>
          </div>
        </section>
        <section className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-5">
          <h2 className="font-bold">
            Reporter{" "}
            <span className="text-xs font-normal text-[var(--bp-muted)]">
              (Admin-only)
            </span>
          </h2>
          {report.reporter ? (
            <>
              <p className="mt-3 font-semibold">{report.reporter.fullName}</p>
              <p className="text-sm text-[var(--bp-muted)]">
                {report.reporter.email}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-[var(--bp-muted)]">
              Reporter reference is not available in this response.
            </p>
          )}
        </section>
      </div>
      <AdminSection title="Report Details">
        <div className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-5">
          <p className="whitespace-pre-wrap text-sm leading-6">
            {report.reason}
          </p>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <Evidence label="Category" value={reportLabel(report.category)} />
            <Evidence
              label="Submitted"
              value={formatAdminDateTime(report.createdAt)}
            />
            <Evidence
              label="Context"
              value={
                report.contextType
                  ? `${report.contextType}${report.contextId ? ` · ${report.contextId}` : ""}`
                  : "None"
              }
            />
          </div>
        </div>
      </AdminSection>
      <AdminSection title="Moderation History">
        {report.moderationActions?.length ? (
          <div className="space-y-2">
            {report.moderationActions.map((action) => (
              <article
                key={action.id}
                className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <Badge
                    tone={action.action === "suspend" ? "warning" : "accent"}
                  >
                    {moderationActionLabel(action.action)}
                  </Badge>
                  <span className="text-xs text-[var(--bp-muted)]" dir="ltr">
                    {formatAdminDateTime(action.createdAt)}
                  </span>
                </div>
                <p className="mt-3 text-sm">{action.reason}</p>
                {action.actor ? (
                  <p className="mt-2 text-xs text-[var(--bp-muted)]">
                    By {action.actor.fullName} · {action.actor.email}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No moderation actions"
            description="Actions taken for this reported user will appear here."
          />
        )}
      </AdminSection>
      <Modal
        open={modal !== null}
        title={
          modal === "suspend"
            ? "Suspend User"
            : modal === "restore"
              ? "Restore User"
              : "Issue Warning"
        }
        onClose={() => !moderate.isPending && setModal(null)}
        footer={
          <>
            <button
              disabled={moderate.isPending}
              className="rounded-lg border border-[var(--bp-border)] px-3 py-2 text-sm"
              onClick={() => setModal(null)}
            >
              Cancel
            </button>
            <button
              disabled={moderate.isPending || reason.trim().length < 3}
              className={`rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 ${modal === "suspend" ? "bg-red-600" : "bg-[var(--bp-accent)]"}`}
              onClick={submitModeration}
            >
              {moderate.isPending
                ? "Saving…"
                : modal === "suspend"
                  ? "Suspend User"
                  : modal === "restore"
                    ? "Restore User"
                    : "Issue Warning"}
            </button>
          </>
        }
      >
        <p className="mt-4 text-sm text-[var(--bp-muted)]">
          {modal === "suspend"
            ? "This action suspends the BeePlan account and revokes the user's active sessions. Submitting or reviewing a report alone does not suspend an account. "
            : modal === "restore"
              ? "This will reactivate the BeePlan account. The user will be able to sign in again. "
              : "This sends an account warning. The user will still be able to access BeePlan. "}
          Target: <strong>{report.reported.fullName}</strong> · Report #
          {report.id.slice(0, 8)}
        </p>
        <label className="mt-4 block text-sm font-semibold">
          Moderation reason
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-2 min-h-28 w-full rounded-lg border border-[var(--bp-border)] bg-[var(--bp-bg)] p-3 text-sm"
          />
        </label>
        {moderate.isError ? (
          <p className="mt-2 text-sm text-red-500">
            Unable to save this moderation action.
          </p>
        ) : null}
      </Modal>
    </>
  );
}

function ErrorDetail({
  token,
  id,
  onBack,
}: {
  token: string;
  id: string;
  onBack: () => void;
}) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["admin", "error", id],
    queryFn: () => adminApi.error(token, id),
  });
  const analyses = useQuery({
    queryKey: ["admin", "error-analyses", id],
    queryFn: () => adminApi.analyses(token, id),
  });
  const analyze = useMutation({
    mutationFn: () => adminApi.analyzeError(token, id),
    onSuccess: () =>
      void client.invalidateQueries({
        queryKey: ["admin", "error-analyses", id],
      }),
  });
  const mutate = useMutation({
    mutationFn: (next: {
      status?: AdminErrorGroup["status"];
      severity?: AdminErrorGroup["severity"];
    }) =>
      next.status
        ? adminApi.errorStatus(token, id, next.status)
        : adminApi.errorSeverity(token, id, next.severity!),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["admin"] }),
  });
  void analyses;
  void analyze;
  void ErrorDetailView;
  if (query.isLoading) return <DashboardSkeleton />;
  if (query.isError || !query.data)
    return <AdminError message="Unable to load this error group." />;
  const error: AdminErrorDetail = query.data;
  return (
    <PolishedErrorDetail
      error={error}
      onBack={onBack}
      onStatus={(status) => mutate.mutate({ status })}
      onSeverity={(severity) => mutate.mutate({ severity })}
      onAnalyze={() => analyze.mutate()}
      analyzing={analyze.isPending}
      analysisError={
        analyze.error instanceof Error ? analyze.error.message : ""
      }
      analyses={analyses.data ?? []}
    />
  );
  return (
    <>
      <div className="mb-7">
        <button
          className="mb-3 text-sm text-[var(--bp-muted)] hover:text-[var(--bp-text)]"
          onClick={onBack}
        >
          ← Back to Errors
        </button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{error.title}</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <SeverityBadge severity={error.severity} />
              <Badge
                tone={
                  error.status === "new"
                    ? "accent"
                    : error.status === "resolved"
                      ? "success"
                      : "neutral"
                }
              >
                {error.status}
              </Badge>
              {error.recurringAfterResolution && (
                <Badge tone="warning">Recurring after resolution</Badge>
              )}
            </div>
            <p className="mt-3 text-sm text-[var(--bp-muted)]">
              {error.service}
              {error.route
                ? ` · ${error.httpMethod ?? ""} ${error.route}`
                : ""}{" "}
              · Last seen {new Date(error.lastSeenAt).toLocaleString()}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-lg border border-[var(--bp-border)] px-3 py-2 text-sm"
              onClick={() => mutate.mutate({ status: "investigating" })}
            >
              Mark investigating
            </button>
            <button
              className="rounded-lg border border-[var(--bp-border)] px-3 py-2 text-sm"
              onClick={() => mutate.mutate({ status: "resolved" })}
            >
              Resolve
            </button>
            <select
              aria-label="Change severity"
              value={error.severity}
              onChange={(e) =>
                mutate.mutate({
                  severity: e.target.value as AdminErrorGroup["severity"],
                })
              }
              className="rounded-lg border border-[var(--bp-border)] bg-[var(--bp-surface)] px-3 py-2 text-sm"
            >
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={<Activity />}
          label="Occurrences"
          value={error.occurrenceCount}
          support="Captured server failures"
        />
        <Metric
          icon={<UsersRound />}
          label="Affected Users"
          value={error.affectedUsers}
          support="Authenticated unique users"
        />
        <Metric
          icon={<Clock3 />}
          label="First Seen"
          value={0}
          support={new Date(error.firstSeenAt).toLocaleString()}
        />
        <Metric
          icon={<Clock3 />}
          label="Last Seen"
          value={0}
          support={new Date(error.lastSeenAt).toLocaleString()}
        />
      </div>
      <AdminSection title="Technical Evidence">
        <div className="grid gap-3 md:grid-cols-2">
          <Evidence label="Error class" value={error.errorClass} />
          <Evidence
            label="Normalized message"
            value={error.normalizedMessage}
          />
          <Evidence label="Environment" value={error.environment} />
          <Evidence
            label="HTTP status"
            value={String(error.httpStatus ?? "—")}
          />
        </div>
        {error.occurrences[0]?.sanitizedStack && (
          <pre className="mt-3 overflow-x-auto rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4 text-xs leading-5 text-[var(--bp-muted)]">
            {error.occurrences[0].sanitizedStack}
          </pre>
        )}
      </AdminSection>
      <AdminSection title="Recent Occurrences">
        <div className="space-y-2">
          {error.occurrences.map((occurrence) => (
            <details
              key={occurrence.id}
              className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-3"
            >
              <summary className="cursor-pointer text-sm">
                <span className="font-semibold">
                  {new Date(occurrence.occurredAt).toLocaleString()}
                </span>
                <span className="ml-2 text-[var(--bp-muted)]">
                  {occurrence.requestId ?? "No request ID"} ·{" "}
                  {occurrence.statusCode ?? "—"}
                </span>
              </summary>
              {occurrence.sanitizedContext && (
                <pre className="mt-3 overflow-x-auto text-xs text-[var(--bp-muted)]">
                  {JSON.stringify(occurrence.sanitizedContext, null, 2)}
                </pre>
              )}
            </details>
          ))}
        </div>
      </AdminSection>
    </>
  );
}
function ErrorDetailView({
  error,
  onBack,
  onStatus,
  onSeverity,
  onAnalyze,
  analyzing,
  analysisError,
  analyses,
}: {
  error: AdminErrorDetail;
  onBack: () => void;
  onStatus: (status: AdminErrorGroup["status"]) => void;
  onSeverity: (severity: AdminErrorGroup["severity"]) => void;
  onAnalyze: () => void;
  analyzing: boolean;
  analysisError: string;
  analyses: import("./api/admin.api").AdminErrorAnalysis[];
}) {
  const latest = analyses[0];
  return (
    <>
      <div className="mb-7">
        <button
          className="mb-3 text-sm text-[var(--bp-muted)] hover:text-[var(--bp-text)]"
          onClick={onBack}
        >
          ← Back to Errors
        </button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{error.title}</h1>
            <div className="mt-2 flex gap-2">
              <SeverityBadge severity={error.severity} />
              <Badge tone={error.status === "new" ? "accent" : "neutral"}>
                {error.status}
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-lg border border-[var(--bp-border)] px-3 py-2 text-sm"
              onClick={() => onStatus("investigating")}
            >
              Mark investigating
            </button>
            <button
              className="rounded-lg border border-[var(--bp-border)] px-3 py-2 text-sm"
              onClick={() => onStatus("resolved")}
            >
              Resolve
            </button>
            <select
              aria-label="Change severity"
              value={error.severity}
              onChange={(e) =>
                onSeverity(e.target.value as AdminErrorGroup["severity"])
              }
              className="rounded-lg border border-[var(--bp-border)] bg-[var(--bp-surface)] px-3 py-2 text-sm"
            >
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <button
              disabled={analyzing}
              onClick={onAnalyze}
              className="rounded-lg border border-[var(--bp-border)] px-3 py-2 text-sm hover:bg-[var(--bp-accent-soft)] disabled:opacity-50"
            >
              {analyzing
                ? "Analyzing…"
                : latest
                  ? "Analyze with AI"
                  : "Analyze with AI"}
            </button>
          </div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={<Activity />}
          label="Occurrences"
          value={error.occurrenceCount}
          support="Captured server failures"
        />
        <Metric
          icon={<UsersRound />}
          label="Affected Users"
          value={error.affectedUsers}
          support="Authenticated unique users"
        />
        <Metric
          icon={<Clock3 />}
          label="First Seen"
          value={0}
          support={new Date(error.firstSeenAt).toLocaleString()}
        />
        <Metric
          icon={<Clock3 />}
          label="Last Seen"
          value={0}
          support={new Date(error.lastSeenAt).toLocaleString()}
        />
      </div>
      <AdminSection title="AI Analysis">
        {analysisError && <AdminError message={analysisError} />}
        {latest ? (
          <AnalysisCard analysis={latest} />
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--bp-border)] bg-[var(--bp-surface)] p-5">
            <p className="font-semibold">No AI analysis yet</p>
            <p className="mt-1 text-sm text-[var(--bp-muted)]">
              Analyze this error using the sanitized technical evidence
              currently available.
            </p>
          </div>
        )}
        <p className="mt-3 text-xs text-[var(--bp-muted)]">
          AI analysis is advisory and based only on the sanitized error evidence
          currently available.
        </p>
      </AdminSection>
      <AdminSection title="Technical Evidence">
        <div className="grid gap-3 md:grid-cols-2">
          <Evidence label="Error class" value={error.errorClass} />
          <Evidence
            label="Normalized message"
            value={error.normalizedMessage}
          />
          <Evidence label="Environment" value={error.environment} />
          <Evidence
            label="HTTP status"
            value={String(error.httpStatus ?? "—")}
          />
        </div>
        {error.occurrences[0]?.sanitizedStack && (
          <pre className="mt-3 overflow-x-auto rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4 text-xs text-[var(--bp-muted)]">
            {error.occurrences[0].sanitizedStack}
          </pre>
        )}
      </AdminSection>
      <AdminSection title="Recent Occurrences">
        <div className="space-y-2">
          {error.occurrences.map((occurrence) => (
            <div
              key={occurrence.id}
              className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-3 text-sm"
            >
              {new Date(occurrence.occurredAt).toLocaleString()}{" "}
              <span className="text-[var(--bp-muted)]">
                · {occurrence.requestId ?? "No request ID"} ·{" "}
                {occurrence.statusCode ?? "—"}
              </span>
            </div>
          ))}
        </div>
      </AdminSection>
      {analyses.length > 1 && (
        <AdminSection title="Analysis History">
          <div className="space-y-2">
            {analyses.slice(1).map((analysis) => (
              <details
                key={analysis.id}
                className="rounded-lg border border-[var(--bp-border)] bg-[var(--bp-surface)] p-3"
              >
                <summary className="cursor-pointer text-sm">
                  {new Date(analysis.createdAt).toLocaleString()} ·{" "}
                  {analysis.model} · {analysis.confidence} confidence
                </summary>
                <div className="mt-3">
                  <AnalysisCard analysis={analysis} compact />
                </div>
              </details>
            ))}
          </div>
        </AdminSection>
      )}
    </>
  );
}
function AnalysisCard({
  analysis,
  compact = false,
}: {
  analysis: import("./api/admin.api").AdminErrorAnalysis;
  compact?: boolean;
}) {
  return (
    <article className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">Likely Cause</h3>
        <Badge
          tone={
            analysis.confidence === "high"
              ? "success"
              : analysis.confidence === "medium"
                ? "accent"
                : "neutral"
          }
        >
          {analysis.confidence} confidence
        </Badge>
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--bp-muted)]">
        {analysis.likelyCause}
      </p>
      {!compact && (
        <>
          <AnalysisList title="Evidence" items={analysis.evidence} />
          <AnalysisList
            title="Suggested Investigation"
            items={analysis.investigationSteps}
            ordered
          />
          <h4 className="mt-4 text-sm font-semibold">Suggested Fix</h4>
          <p className="mt-1 text-sm leading-6 text-[var(--bp-muted)]">
            {analysis.suggestedFix}
          </p>
          <h4 className="mt-4 text-sm font-semibold">Likely Files / Modules</h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {analysis.likelyModules.map((module) => (
              <Badge key={module}>{module}</Badge>
            ))}
          </div>
          {analysis.limitations.length > 0 && (
            <AnalysisList title="Limitations" items={analysis.limitations} />
          )}
        </>
      )}
    </article>
  );
}
function AnalysisList({
  title,
  items,
  ordered = false,
}: {
  title: string;
  items: string[];
  ordered?: boolean;
}) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <div className="mt-4">
      <h4 className="text-sm font-semibold">{title}</h4>
      <Tag
        className={`mt-2 space-y-1 pl-5 text-sm text-[var(--bp-muted)] ${ordered ? "list-decimal" : "list-disc"}`}
      >
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </Tag>
    </div>
  );
}
function PolishedErrorDetail({
  error,
  onBack,
  onStatus,
  onSeverity,
  onAnalyze,
  analyzing,
  analysisError,
  analyses,
}: {
  error: AdminErrorDetail;
  onBack: () => void;
  onStatus: (status: AdminErrorGroup["status"]) => void;
  onSeverity: (severity: AdminErrorGroup["severity"]) => void;
  onAnalyze: () => void;
  analyzing: boolean;
  analysisError: string;
  analyses: import("./api/admin.api").AdminErrorAnalysis[];
}) {
  const latest = analyses[0];
  return (
    <>
      <div className="mb-7">
        <button
          className="mb-3 text-sm text-[var(--bp-muted)] hover:text-[var(--bp-text)]"
          onClick={onBack}
        >
          ← Back to Errors
        </button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{error.title}</h1>
            <p className="mt-2 text-sm text-[var(--bp-muted)]" dir="ltr">
              {error.service}
              {error.route ? ` · ${error.httpMethod ?? ""} ${error.route}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-lg border border-[var(--bp-border)] px-3 py-2 text-sm"
              onClick={() => onStatus("investigating")}
            >
              Mark investigating
            </button>
            <button
              className="rounded-lg border border-[var(--bp-border)] px-3 py-2 text-sm"
              onClick={() => onStatus("resolved")}
            >
              Resolve
            </button>
            <select
              aria-label="Change severity"
              value={error.severity}
              onChange={(e) =>
                onSeverity(e.target.value as AdminErrorGroup["severity"])
              }
              className="rounded-lg border border-[var(--bp-border)] bg-[var(--bp-surface)] px-3 py-2 text-sm"
            >
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <button
              disabled={analyzing}
              onClick={onAnalyze}
              className="rounded-lg border border-[var(--bp-border)] px-3 py-2 text-sm hover:bg-[var(--bp-accent-soft)] disabled:opacity-50"
            >
              {analyzing ? "Analyzing…" : "Analyze with AI"}
            </button>
          </div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={<Activity />}
          label="Occurrences"
          value={error.occurrenceCount}
          support="Captured failures"
        />
        <Metric
          icon={<UsersRound />}
          label="Affected Users"
          value={error.affectedUsers}
          support="Unique users"
        />
        <DateMetric label="First Seen" value={error.firstSeenAt} />
        <DateMetric label="Last Seen" value={error.lastSeenAt} />
      </div>
      <AdminSection title="AI Analysis">
        {analysisError && <AdminError message={analysisError} />}
        {latest ? (
          <AnalysisCard analysis={latest} />
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--bp-border)] bg-[var(--bp-surface)] p-5">
            <p className="font-semibold">No AI analysis yet</p>
            <p className="mt-1 text-sm text-[var(--bp-muted)]">
              Analyze this error using the sanitized technical evidence
              currently available.
            </p>
          </div>
        )}
        <p className="mt-3 text-xs text-[var(--bp-muted)]">
          AI analysis is advisory and based only on the sanitized error evidence
          currently available.
        </p>
      </AdminSection>
      <AdminSection title="Technical Evidence">
        <div className="grid gap-3 md:grid-cols-2">
          <Evidence label="Error class" value={error.errorClass} />
          <Evidence
            label="Normalized message"
            value={error.normalizedMessage}
          />
          <Evidence label="Environment" value={error.environment} />
          <Evidence
            label="HTTP status"
            value={String(error.httpStatus ?? "—")}
          />
        </div>
        {error.occurrences[0]?.sanitizedStack && (
          <pre
            dir="ltr"
            className="mt-3 overflow-x-auto rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4 text-xs text-[var(--bp-muted)]"
          >
            {error.occurrences[0].sanitizedStack}
          </pre>
        )}
      </AdminSection>
      <AdminSection title="Recent Occurrences">
        <div className="space-y-2">
          {error.occurrences.map((occurrence) => (
            <details
              key={occurrence.id}
              className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-3"
            >
              <summary className="cursor-pointer">
                <span dir="ltr" className="block text-sm font-semibold">
                  {formatAdminDateTime(occurrence.occurredAt)}
                </span>
                <span
                  dir="ltr"
                  className="mt-1 block text-xs text-[var(--bp-muted)]"
                >
                  Request {occurrence.requestId ?? "unavailable"} · HTTP{" "}
                  {occurrence.statusCode ?? "—"}
                </span>
              </summary>
              {occurrence.sanitizedContext && (
                <pre
                  dir="ltr"
                  className="mt-3 overflow-x-auto text-xs text-[var(--bp-muted)]"
                >
                  {JSON.stringify(occurrence.sanitizedContext, null, 2)}
                </pre>
              )}
            </details>
          ))}
        </div>
      </AdminSection>
      {analyses.length > 1 && (
        <AdminSection title="Analysis History">
          <div className="space-y-2">
            {analyses.slice(1).map((analysis) => (
              <details
                key={analysis.id}
                className="rounded-lg border border-[var(--bp-border)] bg-[var(--bp-surface)] p-3"
              >
                <summary dir="ltr" className="cursor-pointer text-sm">
                  {formatAdminDateTime(analysis.createdAt)} · {analysis.model} ·{" "}
                  {analysis.confidence} confidence
                </summary>
                <div className="mt-3">
                  <AnalysisCard analysis={analysis} compact />
                </div>
              </details>
            ))}
          </div>
        </AdminSection>
      )}
    </>
  );
}
function DateMetric({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4">
      <p className="text-xs text-[var(--bp-muted)]">{label}</p>
      <p dir="ltr" className="mt-4 text-base font-semibold tracking-tight">
        {formatAdminDate(value)}
      </p>
      <p dir="ltr" className="mt-1 text-xs leading-5 text-[var(--bp-muted)]">
        {formatAdminTime(value)}
      </p>
    </article>
  );
}
function Evidence({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4">
      <p className="text-xs font-semibold text-[var(--bp-muted)]">{label}</p>
      <p className="mt-2 break-words text-sm">{value}</p>
    </div>
  );
}
function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--bp-border)] bg-[var(--bp-surface)] px-5 py-10 text-center">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-[var(--bp-muted)]">{description}</p>
    </div>
  );
}
function AdminError({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-orange-500/20 bg-[var(--bp-surface)] p-5 text-sm text-[var(--bp-muted)]">
      {message}
    </div>
  );
}
function DashboardSkeleton() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Monitor BeePlan activity and product operations."
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div
            key={index}
            className="h-36 animate-pulse rounded-xl bg-[var(--bp-surface)]"
          />
        ))}
      </div>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-xl bg-[var(--bp-surface)]"
          />
        ))}
      </div>
    </>
  );
}
function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)]">
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          className="m-4 h-8 animate-pulse rounded bg-[var(--bp-bg)]"
        />
      ))}
    </div>
  );
}
function AuditSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="h-20 animate-pulse rounded-xl bg-[var(--bp-surface)]"
        />
      ))}
    </div>
  );
}
function AdminShellSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--bp-bg)] p-6 lg:pl-72">
      <div className="mx-auto h-10 max-w-6xl animate-pulse rounded-lg bg-[var(--bp-surface)]" />
      <div className="mx-auto mt-10 grid max-w-6xl gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div
            key={index}
            className="h-36 animate-pulse rounded-xl bg-[var(--bp-surface)]"
          />
        ))}
      </div>
    </div>
  );
}
function ChallengeAnalytics({
  token,
  id,
  onBack,
}: {
  token: string;
  id: string;
  onBack: () => void;
}) {
  const query = useQuery({
    queryKey: ["admin", "challenge-analytics", id],
    queryFn: () => challengesApi.analytics(token, id),
    retry: false,
  });
  if (query.isLoading)
    return (
      <div className="h-48 animate-pulse rounded-xl bg-[var(--bp-surface)]" />
    );
  if (query.isError || !query.data)
    return (
      <div className="rounded-xl border border-orange-500/20 bg-[var(--bp-surface)] p-5">
        <p>Unable to load challenge analytics.</p>
        <button onClick={() => void query.refetch()} className="mt-3 underline">
          Retry
        </button>
      </div>
    );
  const a = query.data;
  const percentOfParticipants = (value: number) =>
    a.participants > 0
      ? Math.min(100, Math.max(0, (value / a.participants) * 100))
      : 0;
  const insight =
    a.participants === 0
      ? {
          title: "No participation yet",
          text: "Analytics will appear as users begin making progress.",
          tone: "border-[var(--bp-border)]",
          icon: <Activity className="h-5 w-5" />,
        }
      : a.completionRate >= 75
        ? {
            title: "Strong completion",
            text: `${a.completionRate.toFixed(0)}% of participants completed this challenge.`,
            tone: "border-emerald-500/25",
            icon: <CheckCircle2 className="h-5 w-5" />,
          }
        : a.completionRate >= 40
          ? {
              title: "Moderate completion",
              text: `${a.completionRate.toFixed(0)}% of participants completed this challenge.`,
              tone: "border-amber-500/25",
              icon: <Activity className="h-5 w-5" />,
            }
          : {
              title: "Low completion",
              text: `${a.completionRate.toFixed(0)}% of participants completed this challenge.`,
              tone: "border-orange-500/25",
              icon: <TriangleAlert className="h-5 w-5" />,
            };
  return (
    <>
      <PageHeader
        title="Challenge Analytics"
        description="Aggregate participation and progress."
      >
        <button
          onClick={onBack}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          Back to challenges
        </button>
      </PageHeader>
      <AdminSection title="Analytics">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Participants", a.participants],
            ["Completed", a.completed],
            ["Completion Rate", `${a.completionRate.toFixed(0)}%`],
            ["Average Progress", `${a.averageProgressPercent.toFixed(0)}%`],
          ].map(([label, value]) => (
            <article
              key={String(label)}
              className="flex min-h-28 flex-col justify-between rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4"
            >
              <p className="text-xs text-[var(--bp-muted)]">{label}</p>
              <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
            </article>
          ))}
        </div>
        <div className="mt-5 rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4">
          <h3 className="font-semibold">Participation</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {[
              ["Participants", a.participants],
              ["Made progress", a.madeProgress],
              ["Completed", a.completed],
            ].map(([label, value], index) => (
              <div
                key={String(label)}
                className="relative rounded-lg bg-[var(--bp-bg)] p-3"
              >
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <p className="text-xs text-[var(--bp-muted)]">{label}</p>
                    <strong className="mt-1 block text-xl">{value}</strong>
                  </div>
                  <span className="text-xs font-semibold text-[var(--bp-muted)]">
                    {percentOfParticipants(Number(value)).toFixed(0)}%
                  </span>
                </div>
                <div
                  className="mt-3 h-2 rounded-full bg-[var(--bp-border)]"
                  role="progressbar"
                  aria-label={`${label} percentage`}
                  aria-valuenow={percentOfParticipants(Number(value))}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-2 rounded-full bg-[var(--bp-accent)]"
                    style={{
                      width: `${percentOfParticipants(Number(value))}%`,
                    }}
                  />
                </div>
                {index < 2 && (
                  <span
                    className="absolute -bottom-3 left-1/2 z-10 hidden -translate-x-1/2 text-[var(--bp-muted)] md:block"
                    aria-hidden="true"
                  >
                    →
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-5 rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4">
          <h3 className="font-semibold">Status breakdown</h3>
          <div
            className="mt-3 flex h-3 overflow-hidden rounded-full bg-[var(--bp-border)]"
            role="img"
            aria-label={`Status breakdown: ${a.notStarted} not started, ${a.inProgress} in progress, ${a.completed} completed`}
          >
            <div
              className="bg-slate-400"
              style={{ width: `${percentOfParticipants(a.notStarted)}%` }}
            />
            <div
              className="bg-amber-500"
              style={{ width: `${percentOfParticipants(a.inProgress)}%` }}
            />
            <div
              className="bg-emerald-500"
              style={{ width: `${percentOfParticipants(a.completed)}%` }}
            />
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {[
              ["Not started", a.notStarted],
              ["In progress", a.inProgress],
              ["Completed", a.completed],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="flex justify-between rounded-lg bg-[var(--bp-bg)] p-3 text-sm"
              >
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </div>
        <div
          className={`mt-5 flex items-start gap-3 rounded-xl border bg-[var(--bp-surface)] p-4 text-sm ${insight.tone}`}
        >
          <span className="rounded-lg bg-[var(--bp-accent-soft)] p-2 text-[var(--bp-accent-ink)]">
            {insight.icon}
          </span>
          <div>
            <p className="font-semibold">{insight.title}</p>
            <p className="mt-1 text-[var(--bp-muted)]">{insight.text}</p>
          </div>
        </div>
        <div className="mt-3 inline-flex items-center rounded-full border border-[var(--bp-border)] bg-[var(--bp-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--bp-muted)]">
          <span
            className={`mr-2 h-2 w-2 rounded-full ${a.status === "active" ? "bg-emerald-500" : "bg-slate-400"}`}
          />
          {a.status === "active"
            ? "Challenge is still active · Metrics may continue to change."
            : "Final challenge results."}
        </div>
      </AdminSection>
    </>
  );
}

function AdminProfile({
  token,
  initialProfile,
}: {
  token: string;
  initialProfile: AdminMe;
}) {
  const client = useQueryClient();
  const { language } = useLanguage();
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(initialProfile.fullName);
  const [username, setUsername] = useState(initialProfile.username);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const update = useMutation({
    mutationFn: () =>
      adminApi.profileUpdate(token, {
        fullName,
        username,
        email: initialProfile.email,
      }),
    onSuccess: () => {
      setEditing(false);
      setMessage({ ok: true, text: "Profile updated" });
      void client.invalidateQueries({ queryKey: ["admin", "me"] });
    },
    onError: () => setMessage({ ok: false, text: "Unable to update profile" }),
  });
  const initials = (fullName || initialProfile.fullName)
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <>
      <PageHeader
        title="Admin Profile"
        description="Manage your BeePlan account information."
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <AdminSection title="Profile summary">
          <div className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-5">
            <div className="flex items-center gap-4">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--bp-accent)] text-lg font-extrabold text-[var(--bp-accent-text)]">
                {initials}
              </span>
              <div>
                <p className="text-lg font-bold">{initialProfile.fullName}</p>
                <p className="text-sm text-[var(--bp-muted)]">
                  @{initialProfile.username}
                </p>
              </div>
            </div>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--bp-muted)]">Email</dt>
                <dd className="font-medium">{initialProfile.email}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--bp-muted)]">Role</dt>
                <dd>
                  <span className="rounded-full bg-[var(--bp-accent-soft)] px-2 py-1 text-xs font-bold text-[var(--bp-accent-ink)]">
                    Admin
                  </span>
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--bp-muted)]">Joined</dt>
                <dd className="font-medium">
                  {formatAdminProfileDate(initialProfile.createdAt, language)}
                </dd>
              </div>
            </dl>
          </div>
        </AdminSection>
        <AdminSection title="Account information">
          <div className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-5">
            {editing ? (
              <div className="space-y-4">
                <label className="block text-sm font-semibold">
                  Name
                  <input
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--bp-border)] bg-[var(--bp-bg)] px-3 py-2 font-normal"
                  />
                </label>
                <label className="block text-sm font-semibold">
                  Username
                  <input
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--bp-border)] bg-[var(--bp-bg)] px-3 py-2 font-normal"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    disabled={update.isPending}
                    onClick={() => update.mutate()}
                    className="rounded-lg bg-[var(--bp-accent)] px-3 py-2 text-sm font-bold text-[var(--bp-accent-text)]"
                  >
                    {update.isPending ? "Saving…" : "Save changes"}
                  </button>
                  <button
                    onClick={() => {
                      setEditing(false);
                      setFullName(initialProfile.fullName);
                      setUsername(initialProfile.username);
                    }}
                    className="rounded-lg border border-[var(--bp-border)] px-3 py-2 text-sm font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">Edit profile</p>
                  <p className="mt-1 text-sm text-[var(--bp-muted)]">
                    Update your name or username.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setMessage(null);
                    setEditing(true);
                  }}
                  className="rounded-lg bg-[var(--bp-accent)] px-3 py-2 text-sm font-bold text-[var(--bp-accent-text)]"
                >
                  Edit profile
                </button>
              </div>
            )}
            {message && (
              <p
                className={`mt-4 text-sm ${message.ok ? "text-[var(--bp-success)]" : "text-[var(--bp-danger)]"}`}
                role="status"
              >
                {message.text}
              </p>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4">
            <div>
              <p className="font-semibold">Change password</p>
              <p className="mt-1 text-sm text-[var(--bp-muted)]">
                Use BeePlan’s existing secure password flow.
              </p>
            </div>
            <button
              onClick={() => {
                window.location.href = "/settings";
              }}
              className="rounded-lg border border-[var(--bp-border)] px-3 py-2 text-sm font-semibold"
            >
              Change password
            </button>
          </div>
        </AdminSection>
      </div>
    </>
  );
}

function SystemHealth({ token }: { token: string }) {
  const query = useQuery({
    queryKey: ["admin", "system-health"],
    queryFn: () => adminApi.systemHealth(token),
    refetchInterval: 30_000,
  });
  if (query.isLoading)
    return (
      <AdminSection title="System Health">
        <p className="text-sm text-[var(--bp-muted)]">Checking services…</p>
      </AdminSection>
    );
  if (query.isError || !query.data)
    return (
      <AdminSection title="System Health">
        <p role="alert" className="text-sm text-[var(--bp-danger)]">
          Unable to load system health right now.
        </p>
        <button
          onClick={() => void query.refetch()}
          className="mt-3 rounded-lg border border-[var(--bp-border)] px-3 py-2 text-sm font-bold"
        >
          Retry
        </button>
      </AdminSection>
    );
  const health = query.data;
  const statusLabel =
    health.overallStatus === "major_outage"
      ? "Major outage"
      : health.overallStatus === "degraded"
        ? "Degraded"
        : health.overallStatus === "unknown"
          ? "Unknown"
          : "Operational";
  const statusClass =
    health.overallStatus === "operational"
      ? "text-emerald-600"
      : health.overallStatus === "degraded"
        ? "text-amber-600"
        : health.overallStatus === "unknown"
          ? "text-[var(--bp-muted)]"
          : "text-red-600";
  const grouped = health.services.reduce<
    Record<string, typeof health.services>
  >((groups, item) => {
    (groups[item.category] ??= []).push(item);
    return groups;
  }, {});
  const badge = (status: string) =>
    status === "healthy"
      ? "Operational"
      : status === "unconfigured"
        ? "Unconfigured"
        : status === "unknown"
          ? "Unknown"
          : status === "degraded"
            ? "Degraded"
            : "Unavailable";
  return (
    <div className="space-y-6">
      <PageHeader
        title="System Health"
        description="Monitor BeePlan services and background operations."
      >
        <button
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
          className="rounded-lg border border-[var(--bp-border)] px-3 py-2 text-sm font-bold"
        >
          {query.isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </PageHeader>
      <div className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-5">
        <p className="text-xs font-black uppercase tracking-wide text-[var(--bp-muted)]">
          Overall status
        </p>
        <p className={`mt-2 text-2xl font-black ${statusClass}`}>
          {statusLabel}
        </p>
        {health.overallStatus !== "operational" && (
          <p className="mt-1 text-sm text-[var(--bp-muted)]">
            {health.summary.unknown} service
            {health.summary.unknown === 1 ? "" : "s"} need verified runtime
            telemetry.
          </p>
        )}
        <p className="mt-1 text-sm text-[var(--bp-muted)]">
          Last checked{" "}
          {new Date(health.checkedAt).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Healthy", health.summary.healthy, "text-emerald-600"],
          ["Degraded", health.summary.degraded, "text-amber-600"],
          ["Unavailable", health.summary.unavailable, "text-red-600"],
          ["Unknown", health.summary.unknown, "text-[var(--bp-muted)]"],
          [
            "Last checked",
            new Date(health.checkedAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            }),
            "text-[var(--bp-text)]",
          ],
        ].map(([label, value, color]) => (
          <div
            key={String(label)}
            className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4"
          >
            <p className="text-xs font-bold text-[var(--bp-muted)]">{label}</p>
            <p className={`mt-2 text-xl font-black ${color}`}>{value}</p>
          </div>
        ))}
      </div>
      {Object.entries(grouped).map(([category, items]) => (
        <AdminSection key={category} title={category}>
          <div className="divide-y divide-[var(--bp-border)] overflow-hidden rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)]">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <p className="font-bold">{item.name}</p>
                  <p className="mt-1 text-sm text-[var(--bp-muted)]">
                    {item.message}
                  </p>
                  {item.lastSuccessAt && (
                    <p className="mt-1 text-xs text-[var(--bp-muted)]">
                      Last successful run{" "}
                      {new Date(item.lastSuccessAt).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 text-right">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-bold ${item.status === "healthy" ? "bg-emerald-500/15 text-emerald-700" : item.status === "degraded" ? "bg-amber-500/15 text-amber-700" : item.status === "unavailable" ? "bg-red-500/15 text-red-700" : "bg-[var(--bp-accent-soft)] text-[var(--bp-accent-ink)]"}`}
                  >
                    {badge(item.status)}
                  </span>
                  {item.latencyMs != null && (
                    <span className="text-xs text-[var(--bp-muted)]">
                      {item.latencyMs} ms
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </AdminSection>
      ))}
      <AdminSection title="Recent operational issues">
        {health.recentIssues.length ? (
          <div className="space-y-2">
            {health.recentIssues.map((issue) => (
              <div
                key={issue.title}
                className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3"
              >
                <p className="font-bold">{issue.title}</p>
                <p className="text-sm text-[var(--bp-muted)]">
                  {issue.message}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--bp-muted)]">
            No recent operational issues reported.
          </p>
        )}
      </AdminSection>
    </div>
  );
}

function AdminManagement({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [promotionMessage, setPromotionMessage] = useState<string | null>(null);
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    fullName: "",
    username: "",
    email: "",
    password: "",
  });
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["admin", "admins"],
    queryFn: () => adminApi.admins(token),
  });
  const create = useMutation({
    mutationFn: () => adminApi.createAdmin(token, form),
    onSuccess: () => {
      setOpen(false);
      setForm({ fullName: "", username: "", email: "", password: "" });
      void client.invalidateQueries({ queryKey: ["admin", "admins"] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "";
      setCreateMessage(
        message.includes("already") || message.includes("exists")
          ? "An account with this email or username already exists. Use Promote Existing User instead."
          : "Unable to create Admin right now.",
      );
    },
  });
  const candidates = useQuery({
    queryKey: ["admin", "promotion-candidates", search],
    enabled: promoteOpen,
    queryFn: () =>
      adminApi.users(
        token,
        new URLSearchParams({
          role: "user",
          page: "1",
          limit: "25",
          ...(search ? { search } : {}),
        }),
      ),
  });
  const promote = useMutation({
    mutationFn: () => adminApi.promoteUser(token, selected!.id),
    onSuccess: () => {
      setPromoteOpen(false);
      setSelected(null);
      setSearch("");
      void client.invalidateQueries({ queryKey: ["admin", "admins"] });
      void client.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "";
      setPromotionMessage(
        message.includes("SUSPENDED")
          ? "Restore this account before promoting it."
          : message.includes("ALREADY")
            ? "This user already has Admin access."
            : message.includes("not found")
              ? "User no longer exists."
              : "Unable to promote this user right now.",
      );
    },
  });
  return (
    <>
      <PageHeader
        title="Admin Management"
        description="Create and review administrative accounts."
      >
        <div className="flex gap-2">
          <button
            onClick={() => {
              setPromotionMessage(null);
              setPromoteOpen(true);
            }}
            className="rounded-lg border border-[var(--bp-border)] px-3 py-2 text-sm font-bold"
          >
            Promote Existing User
          </button>
          <button
            onClick={() => {
              setCreateMessage(null);
              setOpen(true);
            }}
            className="rounded-lg bg-[var(--bp-accent)] px-3 py-2 text-sm font-bold text-[var(--bp-accent-text)]"
          >
            Create Admin
          </button>
        </div>
      </PageHeader>
      <AdminSection title="Administrators">
        <div className="overflow-x-auto rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--bp-border)] text-xs text-[var(--bp-muted)]">
                <th className="p-3">Name</th>
                <th className="p-3">Username</th>
                <th className="p-3">Email</th>
                <th className="p-3">Role</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {query.data?.items.map((admin) => (
                <tr
                  key={admin.id}
                  className="border-b border-[var(--bp-border)] last:border-0"
                >
                  <td className="p-3 font-semibold">{admin.fullName}</td>
                  <td className="p-3">@{admin.username || "—"}</td>
                  <td className="p-3">{admin.email}</td>
                  <td className="p-3">
                    {admin.role === "super_admin" ? "Super Admin" : "Admin"}
                  </td>
                  <td className="p-3">{admin.accountStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminSection>
      {open && (
        <Modal open title="Create Admin" onClose={() => setOpen(false)}>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            {createMessage && (
              <p role="alert" className="text-sm text-[var(--bp-danger)]">
                {createMessage}
              </p>
            )}
            <input
              required
              placeholder="Name"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              className="w-full rounded border p-2"
            />
            <input
              required
              placeholder="Username"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="w-full rounded border p-2"
            />
            <input
              required
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded border p-2"
            />
            <input
              required
              type="password"
              placeholder="Temporary password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full rounded border p-2"
            />
            <p className="text-sm text-[var(--bp-muted)]">Role: Admin</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button
                disabled={create.isPending}
                className="rounded bg-[var(--bp-accent)] px-3 py-2 text-sm font-bold text-[var(--bp-accent-text)]"
              >
                {create.isPending ? "Creating…" : "Create Admin"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {promoteOpen && (
        <Modal
          open
          title="Promote Existing User"
          onClose={() => {
            if (!promote.isPending) {
              setPromoteOpen(false);
              setSelected(null);
            }
          }}
        >
          <div className="space-y-3">
            <p className="text-sm text-[var(--bp-muted)]">
              Give Admin access to an existing BeePlan user account.
            </p>
            {promotionMessage && (
              <p role="alert" className="text-sm text-[var(--bp-danger)]">
                {promotionMessage}
              </p>
            )}
            {selected ? (
              <>
                <div className="rounded border p-3">
                  <p className="font-semibold">{selected.fullName}</p>
                  <p>
                    @{selected.username} · {selected.email}
                  </p>
                  <p className="text-sm">
                    This user’s existing data remains unchanged. Current
                    sessions will be revoked.
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    disabled={promote.isPending}
                    onClick={() => setSelected(null)}
                  >
                    Back
                  </button>
                  <button
                    disabled={promote.isPending}
                    onClick={() => promote.mutate()}
                    className="rounded bg-[var(--bp-accent)] px-3 py-2 font-bold"
                  >
                    {promote.isPending ? "Promoting…" : "Promote to Admin"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, username, or email"
                  className="w-full rounded border p-2"
                />
                <div className="max-h-64 overflow-y-auto rounded border">
                  {candidates.data?.items.map((user) => (
                    <button
                      type="button"
                      key={user.id}
                      onClick={() => setSelected(user)}
                      className="block w-full border-b p-3 text-left last:border-0 hover:bg-[var(--bp-bg)]"
                    >
                      <p className="font-semibold">{user.fullName}</p>
                      <p className="text-sm">
                        @{user.username} · {user.email} · {user.accountStatus}
                      </p>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
