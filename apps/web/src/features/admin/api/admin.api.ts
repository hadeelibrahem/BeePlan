import { apiRequest, getAuthHeaders } from "../../../lib/api";
export type AdminUser = {
  id: string;
  fullName: string;
  username: string;
  email: string;
  role: "user" | "admin" | "super_admin";
  accountStatus: "active" | "suspended";
  createdAt: string;
};
export type AdminMe = {
  id: string;
  fullName: string;
  username: string;
  email: string;
  role: "user" | "admin" | "super_admin";
  accountStatus: "active" | "suspended";
  createdAt: string;
};
export type AuditEntry = {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  createdAt: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  actor: { id: string; fullName: string; email: string };
};
export type AdminActionItem = {
  id: string;
  type:
    | "error"
    | "report"
    | "feedback"
    | "feedback_theme"
    | "challenge"
    | "push_job";
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  count?: number;
  targetUrl?: string;
  actionLabel?: string;
  detectedAt: string;
};
export type Dashboard = {
  totalUsers: number;
  newUsersRecently: number;
  activeAccounts: number;
  suspendedAccounts: number;
  admins: number;
  pendingPushJobs: number;
  failedPushJobs: number;
  newErrorGroups: number;
  criticalHighIssues: number;
  errorOccurrences24h: number;
  errorAffectedUsers24h: number;
  attentionItems: AdminActionItem[];
};
export type SystemHealth = {
  overallStatus: "operational" | "degraded" | "major_outage" | "unknown";
  checkedAt: string;
  summary: {
    healthy: number;
    degraded: number;
    unavailable: number;
    unknown: number;
    lastCheckedAt: string;
  };
  services: Array<{
    id: string;
    name: string;
    category: string;
    criticality: string;
    status: "healthy" | "degraded" | "unavailable" | "unknown" | "unconfigured";
    message: string;
    lastCheckedAt: string;
    lastSuccessAt?: string | null;
    latencyMs?: number | null;
    metadata?: Record<string, string | number | boolean | null>;
  }>;
  workers: Array<{
    id: string;
    name: string;
    status: string;
    message: string;
    lastCheckedAt: string;
  }>;
  recentIssues: Array<{
    title: string;
    message: string;
    status: string;
    targetUrl?: string;
  }>;
};
export type AdminErrorGroup = {
  id: string;
  title: string;
  errorClass: string;
  normalizedMessage: string;
  service: string;
  operation: string | null;
  route: string | null;
  httpMethod: string | null;
  httpStatus: number | null;
  environment: string;
  severity: "critical" | "high" | "medium" | "low";
  status: "new" | "investigating" | "resolved" | "ignored";
  occurrenceCount: number;
  affectedUsers: number;
  firstSeenAt: string;
  lastSeenAt: string;
};
export type AdminErrorDetail = AdminErrorGroup & {
  recurringAfterResolution: boolean;
  occurrences: Array<{
    id: string;
    occurredAt: string;
    requestId: string | null;
    userId: string | null;
    statusCode: number | null;
    clientPlatform: string | null;
    clientVersion: string | null;
    sanitizedMessage: string;
    sanitizedStack: string | null;
    sanitizedContext: Record<string, unknown> | null;
  }>;
  affectedUserReferences: Array<{
    id: string;
    displayName: string;
    email: string;
    lastSeenAt: string;
    occurrenceCount: number;
  }>;
};
export type AdminErrorAnalysis = {
  id: string;
  likelyCause: string;
  evidence: string[];
  investigationSteps: string[];
  suggestedFix: string;
  likelyModules: string[];
  confidence: "low" | "medium" | "high";
  limitations: string[];
  model: string;
  createdAt: string;
  reused?: boolean;
};
export type ReportCategory =
  | "harassment"
  | "spam"
  | "inappropriate_content"
  | "impersonation"
  | "abuse"
  | "other";
export type ReportStatus =
  "pending" | "under_review" | "action_taken" | "dismissed";
export type AdminFeedback = {
  id: string;
  category: string;
  title: string;
  description: string;
  status:
    | "submitted"
    | "reviewing"
    | "planned"
    | "in_development"
    | "released"
    | "declined";
  visibility: string;
  createdAt: string;
  updatedAt: string;
  releasedAt: string | null;
  voteCount: number;
  author: { id: string; fullName: string; email: string };
  validNextStatuses?: string[];
};
export type AdminFeedbackClusterMember = {
  id: string;
  title: string;
  category: string;
  status:
    | "submitted"
    | "reviewing"
    | "planned"
    | "in_development"
    | "released"
    | "declined";
  voteCount: number;
  createdAt: string;
};
export type AdminFeedbackCluster = {
  id: string;
  title: string;
  summary: string;
  confidence: "low" | "medium" | "high";
  status: "active" | "archived";
  memberCount: number;
  totalVotes: number;
  lastAnalyzedAt: string;
};
export type AdminFeedbackClusterDetail = AdminFeedbackCluster & {
  members: AdminFeedbackClusterMember[];
};
export type AdminChallenge = {
  id: string;
  title: string;
  description: string;
  type: "focus_minutes" | "focus_sessions" | "tasks_completed";
  targetValue: number;
  status: "draft" | "scheduled" | "active" | "completed" | "cancelled";
  startAt: string;
  endAt: string;
  publishedAt: string | null;
  metrics: {
    participants: number;
    completed: number;
    completionRate: number;
    totalProgress: number;
  };
};
export type AdminReportUser = {
  id: string;
  fullName: string;
  email: string;
  accountStatus: "active" | "suspended";
};
export type AdminReport = {
  id: string;
  category: ReportCategory;
  status: ReportStatus;
  reason: string;
  contextType?: string | null;
  contextId?: string | null;
  createdAt: string;
  updatedAt: string;
  reported: AdminReportUser;
  reporter?: AdminReportUser;
  moderationActions?: Array<{
    id: string;
    action: "warning" | "suspend" | "restore";
    reason: string;
    createdAt: string;
    actor?: { id: string; fullName: string; email: string };
  }>;
};
const options = (token: string, init: RequestInit = {}) => ({
  ...init,
  headers: { ...getAuthHeaders(token), ...init.headers },
});
export type AdminChallengeAnalytics = {
  challengeId: string;
  participants: number;
  madeProgress: number;
  completed: number;
  notStarted: number;
  inProgress: number;
  completionRate: number;
  engagementRate: number;
  averageProgressPercent: number;
  target: number;
  metricType: string;
  startsAt: string;
  endsAt: string;
  status: string;
};
export const challengesApi = {
  list: (t: string, status?: string) =>
    apiRequest(
      `/admin/challenges${status ? `?status=${status}` : ""}`,
      options(t),
    ) as Promise<{ items: AdminChallenge[] }>,
  analytics: (t: string, id: string) =>
    apiRequest(
      `/admin/challenges/${id}/analytics`,
      options(t),
    ) as Promise<AdminChallengeAnalytics>,
  create: (t: string, body: unknown) =>
    apiRequest(
      "/admin/challenges",
      options(t, { method: "POST", body: JSON.stringify(body) }),
    ),
  publish: (t: string, id: string) =>
    apiRequest(
      `/admin/challenges/${id}/publish`,
      options(t, { method: "POST" }),
    ),
  cancel: (t: string, id: string) =>
    apiRequest(
      `/admin/challenges/${id}/cancel`,
      options(t, { method: "POST" }),
    ),
};
export const feedbackClustersApi = {
  list: (token: string) =>
    apiRequest("/admin/feedback/clusters", options(token)) as Promise<
      AdminFeedbackCluster[]
    >,
  getById: (token: string, id: string) =>
    apiRequest(
      `/admin/feedback/clusters/${id}`,
      options(token),
    ) as Promise<AdminFeedbackClusterDetail>,
  analyze: (token: string) =>
    apiRequest(
      "/admin/feedback/clusters/analyze",
      options(token, { method: "POST" }),
    ) as Promise<{
      reused: boolean;
      notEnoughFeedback: boolean;
      clusters: AdminFeedbackCluster[];
    }>,
};
export const adminApi = {
  me: (t: string) => apiRequest("/admin/me", options(t)) as Promise<AdminMe>,
  admins: (t: string) =>
    apiRequest("/admin/admins", options(t)) as Promise<{
      items: AdminUser[];
      total: number;
    }>,
  createAdmin: (t: string, body: unknown) =>
    apiRequest(
      "/admin/admins",
      options(t, { method: "POST", body: JSON.stringify(body) }),
    ) as Promise<AdminUser>,
  promoteUser: (t: string, userId: string) =>
    apiRequest(
      "/admin/admins/promote",
      options(t, { method: "POST", body: JSON.stringify({ userId }) }),
    ) as Promise<AdminUser>,
  profileUpdate: (
    t: string,
    body: { fullName: string; username: string; email: string },
  ) =>
    apiRequest(
      "/auth/profile",
      options(t, { method: "PATCH", body: JSON.stringify(body) }),
    ),
  dashboard: (t: string) =>
    apiRequest("/admin/dashboard", options(t)) as Promise<Dashboard>,
  systemHealth: (t: string) =>
    apiRequest("/admin/system-health", options(t)) as Promise<SystemHealth>,
  actionCenter: (t: string) =>
    apiRequest("/admin/action-center", options(t)) as Promise<{
      items: AdminActionItem[];
    }>,
  users: (t: string, query: URLSearchParams) =>
    apiRequest(`/admin/users?${query}`, options(t)) as Promise<{
      items: AdminUser[];
      total: number;
      page: number;
      limit: number;
    }>,
  audit: (t: string) =>
    apiRequest("/admin/audit-log", options(t)) as Promise<{
      items: AuditEntry[];
      total: number;
    }>,
  errors: (t: string, query: URLSearchParams) =>
    apiRequest(`/admin/errors?${query}`, options(t)) as Promise<{
      items: AdminErrorGroup[];
      total: number;
      page: number;
      limit: number;
    }>,
  error: (t: string, id: string) =>
    apiRequest(`/admin/errors/${id}`, options(t)) as Promise<AdminErrorDetail>,
  analyses: (t: string, id: string) =>
    apiRequest(`/admin/errors/${id}/analyses`, options(t)) as Promise<
      AdminErrorAnalysis[]
    >,
  analyzeError: (t: string, id: string) =>
    apiRequest(
      `/admin/errors/${id}/analyze`,
      options(t, { method: "POST" }),
    ) as Promise<AdminErrorAnalysis>,
  errorStatus: (t: string, id: string, status: AdminErrorGroup["status"]) =>
    apiRequest(
      `/admin/errors/${id}/status`,
      options(t, { method: "PATCH", body: JSON.stringify({ status }) }),
    ),
  errorSeverity: (
    t: string,
    id: string,
    severity: AdminErrorGroup["severity"],
  ) =>
    apiRequest(
      `/admin/errors/${id}/severity`,
      options(t, { method: "PATCH", body: JSON.stringify({ severity }) }),
    ),
  reports: (t: string, query: URLSearchParams) =>
    apiRequest(`/admin/reports?${query}`, options(t)) as Promise<{
      items: AdminReport[];
      total: number;
      page: number;
      limit: number;
    }>,
  report: (t: string, id: string) =>
    apiRequest(`/admin/reports/${id}`, options(t)) as Promise<AdminReport>,
  reportStatus: (
    t: string,
    id: string,
    status: Extract<ReportStatus, "under_review" | "dismissed">,
  ) =>
    apiRequest(
      `/admin/reports/${id}/status`,
      options(t, { method: "PATCH", body: JSON.stringify({ status }) }),
    ),
  moderateReport: (
    t: string,
    id: string,
    action: "warning" | "suspend" | "restore",
    reason: string,
  ) =>
    apiRequest(
      `/admin/reports/${id}/moderate`,
      options(t, { method: "PATCH", body: JSON.stringify({ action, reason }) }),
    ),
  feedback: (t: string, query: URLSearchParams) =>
    apiRequest(`/admin/feedback?${query}`, options(t)) as Promise<{
      items: AdminFeedback[];
      total: number;
      summary: Record<string, number>;
    }>,
  feedbackDetail: (t: string, id: string) =>
    apiRequest(`/admin/feedback/${id}`, options(t)) as Promise<AdminFeedback>,
  feedbackStatus: (t: string, id: string, status: string) =>
    apiRequest(
      `/admin/feedback/${id}/status`,
      options(t, { method: "PATCH", body: JSON.stringify({ status }) }),
    ),
  status: (t: string, id: string, accountStatus: string, reason?: string) =>
    apiRequest(
      `/admin/users/${id}/status`,
      options(t, {
        method: "PATCH",
        body: JSON.stringify({ accountStatus, reason }),
      }),
    ),
  role: (t: string, id: string, role: string) =>
    apiRequest(
      `/admin/users/${id}/role`,
      options(t, { method: "PATCH", body: JSON.stringify({ role }) }),
    ),
};
