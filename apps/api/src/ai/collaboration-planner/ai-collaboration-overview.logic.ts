// Pure, IO-free derivations behind the AI Collaboration **Overview** tab. The
// service loads rows and delegates every decision here so the same rules are
// trivially unit-testable and can never drift between web and mobile (both
// consume this endpoint's output verbatim). No fabricated health scores: every
// value is a categorical status or a count derived from real subtask rows,
// dependencies, capacity bands, and pending AI recommendations.

import { rankFocusTasks, type FocusCandidate } from '../../focus/focus.logic';
import { isSubtaskOwnedByUser } from '../../tasks/subtask-ownership';
import type { MemberCapacity } from './workload-capacity.service';
import type { AiRecommendationEntity } from './ai-recommendations.service';

const DONE_STATUSES = new Set(['done', 'missed']);

export type OverviewSubtask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  isFocusTask: boolean;
  isDone: boolean;
  isShared: boolean;
  assigneeUserId: string | null;
  dueDate: Date | null;
  estimatedDurationMinutes: number | null;
  actualDurationMinutes: number | null;
};

export type SubtaskDependencyEdge = {
  subtaskId: string;
  dependsOnSubtaskId: string;
};

export type OverviewTaskInfo = {
  id: string;
  title: string;
  status: string;
  dueDate: Date | null;
  isShared: boolean;
};

export type TaskRole = 'owner' | 'editor' | 'viewer';

export type HealthStatus = 'complete' | 'on_track' | 'at_risk' | 'needs_attention';
export type HealthTone = 'success' | 'positive' | 'warning' | 'danger';
export type ProjectHealth = { status: HealthStatus; tone: HealthTone };

export type DoThisNow = {
  kind: 'subtask' | 'task';
  taskId: string;
  subtaskId: string | null;
  title: string;
  parentTaskTitle: string;
  assignee: { userId: string } | null;
  estimatedRemainingMinutes: number | null;
  dueDate: string | null;
  blocksCount: number;
  status: string;
  isBlocked: boolean;
  isOverdue: boolean;
  canStartFocus: boolean;
};

export type OverviewAlertLink = 'health' | 'plan' | 'team';
export type OverviewAlert = {
  id: string;
  kind: string;
  severity: 'critical' | 'warning';
  title: string;
  reason: string;
  impact: string;
  link: OverviewAlertLink;
  /**
   * Filters the linked tab should apply so the user lands on the work the alert
   * is about, not just the right tab. Backend-owned so web and mobile deep-link
   * identically.
   */
  focus?: { blockedOnly?: boolean; memberId?: string; itemIds?: string[]; status?: string };
};

export type PlanSnapshot = {
  remainingEstimatedMinutes: number | null;
  blockedCount: number;
  criticalPathSummary: string | null;
  forecastDate: string | null;
  deadline: string | null;
  availableCapacityMemberCount: number;
};

export type TeamSnapshot = {
  contributorCount: number;
  balance: 'balanced' | 'uneven' | null;
  mostOverloaded: { userId: string; displayName: string; loadPercent: number } | null;
  mostAvailable: { userId: string; displayName: string; loadPercent: number } | null;
};

// --- Small shared predicates ------------------------------------------------

export function isOpenSubtask(subtask: OverviewSubtask): boolean {
  return !subtask.isDone && !DONE_STATUSES.has(subtask.status);
}

function isCompleted(subtask: OverviewSubtask): boolean {
  return subtask.isDone || subtask.status === 'done';
}

function remainingMinutes(subtask: OverviewSubtask): number | null {
  if (subtask.estimatedDurationMinutes == null) return null;
  const spent = subtask.actualDurationMinutes ?? 0;
  return Math.max(0, subtask.estimatedDurationMinutes - spent);
}

/** Downstream items that depend on `subtaskId` — i.e. what finishing it unblocks. */
export function countBlocks(subtaskId: string, edges: SubtaskDependencyEdge[]): number {
  return edges.filter((edge) => edge.dependsOnSubtaskId === subtaskId).length;
}

/** True when `subtaskId` has at least one upstream dependency that is not yet complete. */
export function isBlockedByIncomplete(
  subtaskId: string,
  edges: SubtaskDependencyEdge[],
  byId: Map<string, OverviewSubtask>,
): boolean {
  return edges
    .filter((edge) => edge.subtaskId === subtaskId)
    .some((edge) => {
      const upstream = byId.get(edge.dependsOnSubtaskId);
      return !upstream || !isCompleted(upstream);
    });
}

// --- "Do This Now" ----------------------------------------------------------

/**
 * The single recommended executable unit for `userId` on this task, honoring the
 * canonical BeePlan rule: prefer a focus-eligible **subtask assigned to this
 * user** (personal execution filtering) over the parent task; fall back to the
 * parent task only when it is itself executable for this user (personal task, or
 * an owner whose task has no incomplete subtasks). Returns null when there is
 * nothing this user can act on now.
 */
export function chooseDoThisNow(input: {
  task: OverviewTaskInfo;
  subtasks: OverviewSubtask[];
  edges: SubtaskDependencyEdge[];
  userId: string;
  role: TaskRole;
  now: Date;
}): DoThisNow | null {
  const { task, subtasks, edges, userId, role, now } = input;
  const byId = new Map(subtasks.map((subtask) => [subtask.id, subtask]));

  const ownedOpen = subtasks.filter(
    (subtask) =>
      isOpenSubtask(subtask) && isSubtaskOwnedByUser(subtask, userId, task.isShared),
  );

  if (ownedOpen.length > 0) {
    // Prefer subtasks that can start now (no incomplete upstream); otherwise
    // still surface the best owned item so the user isn't shown an empty card.
    const unblocked = ownedOpen.filter(
      (subtask) => !isBlockedByIncomplete(subtask.id, edges, byId),
    );
    const pool = unblocked.length ? unblocked : ownedOpen;

    const candidates: FocusCandidate[] = pool.map((subtask) => ({
      id: subtask.id,
      title: subtask.title,
      priority: subtask.priority,
      status: subtask.status,
      dueDate: subtask.dueDate,
      estimatedMinutes: remainingMinutes(subtask) ?? 0,
      progress: 0,
      isFocusTask: subtask.isFocusTask,
      totalSubtasks: 0,
      incompleteSubtasks: 0,
      parentFocusEligible: true,
    }));
    const best = rankFocusTasks(candidates, now)[0];
    const chosen = best ? byId.get(best.taskId)! : pool[0];
    const blocked = isBlockedByIncomplete(chosen.id, edges, byId);
    const overdue = Boolean(chosen.dueDate && chosen.dueDate.getTime() < now.getTime());

    return {
      kind: 'subtask',
      taskId: task.id,
      subtaskId: chosen.id,
      title: chosen.title,
      parentTaskTitle: task.title,
      assignee: chosen.assigneeUserId ? { userId: chosen.assigneeUserId } : null,
      estimatedRemainingMinutes: remainingMinutes(chosen),
      dueDate: chosen.dueDate ? chosen.dueDate.toISOString() : null,
      blocksCount: countBlocks(chosen.id, edges),
      status: chosen.status,
      isBlocked: blocked,
      isOverdue: overdue,
      canStartFocus: role !== 'viewer' && !blocked,
    };
  }

  // No owned open subtask. The parent task is a valid personal unit only when it
  // is executable for this user: a personal task (owner, not shared), or an
  // owner of a shared task with no remaining incomplete subtasks.
  const hasIncompleteSubtasks = subtasks.some(isOpenSubtask);
  const parentExecutable =
    isOpenSubtask({
      id: task.id,
      title: task.title,
      status: task.status,
      priority: 'medium',
      isFocusTask: false,
      isDone: false,
      isShared: task.isShared,
      assigneeUserId: null,
      dueDate: task.dueDate,
      estimatedDurationMinutes: null,
      actualDurationMinutes: null,
    }) &&
    role === 'owner' &&
    !hasIncompleteSubtasks;

  if (!parentExecutable) return null;

  const overdue = Boolean(task.dueDate && task.dueDate.getTime() < now.getTime());
  return {
    kind: 'task',
    taskId: task.id,
    subtaskId: null,
    title: task.title,
    parentTaskTitle: task.title,
    assignee: null,
    estimatedRemainingMinutes: null,
    dueDate: task.dueDate ? task.dueDate.toISOString() : null,
    blocksCount: 0,
    status: task.status,
    isBlocked: false,
    isOverdue: overdue,
    // parentExecutable already guarantees role === 'owner' here.
    canStartFocus: true,
  };
}

// --- Health -----------------------------------------------------------------

/**
 * Categorical project health from real signals only (mirrors the personal
 * dashboard's `dailyStatusFor`). Returns null when there is no work to assess,
 * so the client can hide the card rather than show a hollow "0%".
 */
export function deriveHealth(input: {
  totalCount: number;
  completedCount: number;
  overdueOpenCount: number;
  deadlineExceeded: boolean;
}): ProjectHealth | null {
  const { totalCount, completedCount, overdueOpenCount, deadlineExceeded } = input;
  if (totalCount === 0) return null;
  if (completedCount === totalCount) return { status: 'complete', tone: 'success' };
  if (overdueOpenCount > 0 || deadlineExceeded) return { status: 'at_risk', tone: 'danger' };
  if (completedCount > 0) return { status: 'on_track', tone: 'positive' };
  return { status: 'needs_attention', tone: 'warning' };
}

// --- Alerts -----------------------------------------------------------------

/**
 * Advisory alerts only: derived deadline, blocked-work, and capacity-shortage
 * findings computed from real counts. Each explains its reason and its impact,
 * and links (with filters) to the tab that owns the underlying work.
 *
 * Pending AI recommendations are deliberately NOT rendered as alerts. They are
 * decisions, not observations, and they now have their own first-class section
 * with Review / Approve / Dismiss — duplicating them here would show the same
 * finding twice, once actionable and once not. They are still passed in so a
 * recommendation that already covers the deadline suppresses the derived
 * deadline alert.
 */
export function buildAlerts(input: {
  pendingRecommendations: AiRecommendationEntity[];
  overdueOpenCount: number;
  blockedCount: number;
  deadlineExceeded: boolean;
  capacityMembers: MemberCapacity[];
  hasOpenWork: boolean;
}): OverviewAlert[] {
  const {
    pendingRecommendations,
    overdueOpenCount,
    blockedCount,
    deadlineExceeded,
    capacityMembers,
    hasOpenWork,
  } = input;
  const alerts: OverviewAlert[] = [];
  const sawDeadlineRecommendation = pendingRecommendations.some(
    (rec) => rec.kind === 'deadline_risk',
  );

  if (!sawDeadlineRecommendation && (deadlineExceeded || overdueOpenCount > 0)) {
    alerts.push({
      id: 'derived:deadline-risk',
      kind: 'deadline_risk',
      severity: 'critical',
      title: deadlineExceeded ? 'Deadline has passed with work remaining' : 'Overdue work is slipping',
      reason: deadlineExceeded
        ? 'The project deadline is in the past and not all work is done.'
        : `${overdueOpenCount} open item${overdueOpenCount === 1 ? '' : 's'} ${overdueOpenCount === 1 ? 'is' : 'are'} past due.`,
      impact: 'The finish date is at risk unless the remaining work is rescheduled or picked up.',
      link: 'plan',
    });
  }

  if (blockedCount > 0) {
    alerts.push({
      id: 'derived:blocked-work',
      kind: 'blocked_work',
      severity: 'warning',
      title: `${blockedCount} item${blockedCount === 1 ? '' : 's'} blocked`,
      reason: `${blockedCount} open item${blockedCount === 1 ? '' : 's'} ${blockedCount === 1 ? 'is' : 'are'} waiting on unfinished dependencies.`,
      impact: "Blocked work can't start until its upstream items are complete.",
      link: 'plan',
      // Land the user on exactly the blocked items, not just the Plan tab.
      focus: { blockedOnly: true },
    });
  }

  const capacityShortage =
    hasOpenWork && capacityMembers.length > 0 && capacityMembers.every((m) => m.band === 'busy');
  if (capacityShortage) {
    alerts.push({
      id: 'derived:capacity-shortage',
      kind: 'capacity_shortage',
      severity: 'warning',
      title: 'Everyone is at capacity',
      reason: 'Every contributor is already carrying a busy workload this week.',
      impact: 'There is little slack to absorb new or slipping work — consider rebalancing.',
      link: 'team',
    });
  }

  return alerts;
}

// --- Snapshots --------------------------------------------------------------

export function summarizePlan(input: {
  subtasks: OverviewSubtask[];
  edges: SubtaskDependencyEdge[];
  deadline: Date | null;
  capacityMembers: MemberCapacity[];
}): PlanSnapshot {
  const { subtasks, edges, deadline, capacityMembers } = input;
  const byId = new Map(subtasks.map((subtask) => [subtask.id, subtask]));
  const open = subtasks.filter(isOpenSubtask);

  const estimates = open
    .map(remainingMinutes)
    .filter((value): value is number => value != null);
  const remainingEstimatedMinutes = estimates.length
    ? estimates.reduce((total, value) => total + value, 0)
    : null;

  const blockedCount = open.filter((subtask) =>
    isBlockedByIncomplete(subtask.id, edges, byId),
  ).length;

  return {
    remainingEstimatedMinutes,
    blockedCount,
    // Critical path + forecast are proposal-time scheduling artifacts and are
    // not persisted per subtask, so they are intentionally unavailable here.
    criticalPathSummary: null,
    forecastDate: null,
    deadline: deadline ? deadline.toISOString() : null,
    availableCapacityMemberCount: capacityMembers.filter((m) => m.band === 'light').length,
  };
}

export function summarizeTeam(capacityMembers: MemberCapacity[]): TeamSnapshot {
  if (capacityMembers.length === 0) {
    return { contributorCount: 0, balance: null, mostOverloaded: null, mostAvailable: null };
  }
  const sorted = [...capacityMembers].sort((a, b) => b.loadPercent - a.loadPercent);
  const mostOverloaded = sorted[0];
  const mostAvailable = sorted[sorted.length - 1];
  const spread = mostOverloaded.loadPercent - mostAvailable.loadPercent;

  return {
    contributorCount: capacityMembers.length,
    balance: capacityMembers.length < 2 ? null : spread <= 25 ? 'balanced' : 'uneven',
    mostOverloaded: {
      userId: mostOverloaded.userId,
      displayName: mostOverloaded.displayName,
      loadPercent: mostOverloaded.loadPercent,
    },
    mostAvailable: {
      userId: mostAvailable.userId,
      displayName: mostAvailable.displayName,
      loadPercent: mostAvailable.loadPercent,
    },
  };
}

/** Overdue = open and past due at `now`. */
export function countOverdueOpen(subtasks: OverviewSubtask[], now: Date): number {
  return subtasks.filter(
    (subtask) =>
      isOpenSubtask(subtask) &&
      subtask.dueDate != null &&
      subtask.dueDate.getTime() < now.getTime(),
  ).length;
}
