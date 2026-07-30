import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { TaskAccessService } from '../../collaboration/task-access.service';
import { DatabaseService } from '../../db/database.service';
import { taskMembers, users } from '../../db/schema';
import type { ProjectPlan, ProjectPlanNode } from './project-plan/project-plan.logic';
import { ProjectPlanService } from './project-plan/project-plan.service';

export type WorkloadStatus = 'available' | 'balanced' | 'heavy' | 'over_capacity';
export type TeamHealth = 'healthy' | 'balanced' | 'strained' | 'at_risk';
export type TeamRole = 'owner' | 'editor' | 'viewer';

export type TeamMemberInsight = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: TeamRole;
  status: WorkloadStatus;
  utilisationPercent: number;
  remainingMinutes: number;
  availableMinutes: number;
  overloadMinutes: number;
  actualMinutes: number;
  completedMinutes: number;
  assignedItemCount: number;
  completedItemCount: number;
  readyItemCount: number;
  blockedItemCount: number;
  criticalItemCount: number;
  futureItemCount: number;
  unscheduledItemCount: number;
  forecastDelayMinutes: number;
  isBottleneck: boolean;
};

export type TeamInsightsSummary = {
  health: TeamHealth;
  balancePercent: number;
  remainingMinutes: number;
  availableMinutes: number;
  capacityShortfallMinutes: number;
  forecastCompletion: string | null;
  forecastDelay: { minutes: number; days: number };
  overloadedCount: number;
  availableCount: number;
  blockedCriticalCount: number;
  memberCount: number;
  bottleneckUserId: string | null;
  unassigned: { itemCount: number; remainingMinutes: number };
};

export type TeamInsights = {
  generatedAt: string;
  viewerRole: TeamRole;
  summary: TeamInsightsSummary;
  members: TeamMemberInsight[];
  warnings: string[];
  formulaVersion: string;
};

/**
 * The read-only Team Intelligence dashboard behind GET /tasks/:taskId/ai/
 * collaboration/team. The backend is the sole source of truth: every workload,
 * capacity, forecast and criticality figure is REUSED from the shared
 * project-plan model — the deterministic Critical Path, the Resource-Aware
 * Forecast, and the per-assignee Resource Lanes. Nothing here re-implements
 * scheduling, forecasting, or dependency traversal (node.isBlocked,
 * scheduling[id].isCritical / forecastStatus, and resourceLanes are consumed
 * as-is). The only figures computed here are trivial roll-ups over those values:
 * utilisation = remaining ÷ available capacity, and team balance. Missing
 * estimates stay visible as warnings and never become guessed workload.
 */
@Injectable()
export class TeamInsightsService {
  constructor(
    private readonly dbs: DatabaseService,
    private readonly access: TaskAccessService,
    private readonly projectPlan: ProjectPlanService,
  ) {}

  /**
   * `planOverride` lets a caller that has ALREADY built a plan reuse it rather
   * than recomputing the whole forecast — used by Project Health and by the
   * recommendation preview, which needs these roll-ups over a hypothetical plan.
   * Access is still enforced here regardless, so it can never widen visibility.
   */
  async get(userId: string, taskId: string, planOverride?: ProjectPlan): Promise<TeamInsights> {
    const { task, role: viewerRole } = await this.access.require(userId, taskId, 'viewer');
    const [memberRows, plan] = await Promise.all([
      this.dbs.db
        .select({ userId: taskMembers.userId, role: taskMembers.role, name: users.fullName, avatarUrl: users.avatarUrl })
        .from(taskMembers)
        .innerJoin(users, eq(taskMembers.userId, users.id))
        .where(and(eq(taskMembers.taskId, taskId), eq(taskMembers.status, 'accepted'))),
      planOverride ?? this.projectPlan.getProjectPlan(userId, taskId),
    ]);

    const memberMap = new Map(
      memberRows.map((member) => [member.userId, { ...member, role: member.role as TeamRole }]),
    );
    if (!memberMap.has(task.userId)) {
      const [owner] = await this.dbs.db
        .select({ id: users.id, name: users.fullName, avatarUrl: users.avatarUrl })
        .from(users)
        .where(eq(users.id, task.userId));
      if (owner) memberMap.set(owner.id, { userId: owner.id, name: owner.name, avatarUrl: owner.avatarUrl, role: 'owner' });
    }

    const nowMs = Date.parse(plan.generatedAt);
    const items = plan.nodes.filter((node) => !node.isExternal && !node.isGroup);
    const laneByUser = new Map(plan.resourceLanes.map((lane) => [lane.assigneeId, lane]));
    const bottleneckUserId = plan.forecast.bottleneckAssignee?.assigneeId ?? null;
    const deadlineMs = plan.forecast.deadline ? Date.parse(plan.forecast.deadline) : null;
    const warnings: string[] = [];

    const members: TeamMemberInsight[] = [...memberMap.values()].map((member) => {
      const assigned = items.filter((node) => node.assignee?.userId === member.userId);
      const incomplete = assigned.filter((node) => node.progressPercent < 100);

      const missing = assigned.filter((node) => node.remainingMinutes == null && node.progressPercent < 100);
      if (missing.length) warnings.push(`${member.name} has ${missing.length} assignment(s) without an estimate.`);

      const remainingMinutes = incomplete.reduce((sum, node) => sum + (node.remainingMinutes ?? 0), 0);
      // Available capacity + focus time come straight from the Resource Lane / plan.
      const lane = laneByUser.get(member.userId);
      const availableMinutes = lane?.availableMinutes ?? 0;
      const actualMinutes = assigned.reduce((sum, node) => sum + (node.focusSummary?.spentMinutes ?? 0), 0);
      const completedMinutes = assigned
        .filter((node) => node.progressPercent >= 100)
        .reduce((sum, node) => sum + (node.actualMinutes ?? node.estimatedMinutes ?? 0), 0);

      const utilisationPercent = utilisationFor(remainingMinutes, availableMinutes);
      const overloadMinutes = Math.max(0, remainingMinutes - availableMinutes);
      const status = statusFor(utilisationPercent);
      if (status === 'over_capacity') warnings.push(`${member.name} is over capacity by ${overloadMinutes} min.`);

      let ready = 0;
      let blocked = 0;
      let future = 0;
      let unscheduled = 0;
      let critical = 0;
      for (const node of incomplete) {
        const schedule = plan.scheduling[node.id];
        if (schedule?.isCritical) critical += 1;
        switch (classifyItem(node, schedule, nowMs)) {
          case 'blocked':
            blocked += 1;
            break;
          case 'unscheduled':
            unscheduled += 1;
            break;
          case 'future':
            future += 1;
            break;
          default:
            ready += 1;
        }
      }

      const forecastDelayMinutes = memberForecastDelay(assigned, plan, deadlineMs);

      return {
        userId: member.userId,
        name: member.name,
        avatarUrl: member.avatarUrl,
        role: member.role,
        status,
        utilisationPercent,
        remainingMinutes,
        availableMinutes,
        overloadMinutes,
        actualMinutes,
        completedMinutes,
        assignedItemCount: assigned.length,
        completedItemCount: assigned.length - incomplete.length,
        readyItemCount: ready,
        blockedItemCount: blocked,
        criticalItemCount: critical,
        futureItemCount: future,
        unscheduledItemCount: unscheduled,
        forecastDelayMinutes,
        isBottleneck: member.userId === bottleneckUserId,
      };
    });

    // Deterministic order: most overloaded first, then busiest, then a stable name/id tie-break.
    members.sort(
      (a, b) =>
        b.overloadMinutes - a.overloadMinutes ||
        b.utilisationPercent - a.utilisationPercent ||
        a.name.localeCompare(b.name) ||
        (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0),
    );

    const unassignedItems = items.filter((node) => !node.assignee);
    const unassignedMinutes = unassignedItems.reduce(
      (sum, node) => sum + (node.progressPercent >= 100 ? 0 : node.remainingMinutes ?? 0),
      0,
    );
    if (unassignedMinutes > 0) warnings.push(`${unassignedItems.length} unassigned item(s) totalling ${unassignedMinutes} min have no owner.`);

    const totalMemberRemaining = members.reduce((sum, member) => sum + member.remainingMinutes, 0);
    const totalAvailable = members.reduce((sum, member) => sum + member.availableMinutes, 0);
    const teamUtilisation = totalAvailable > 0 ? (totalMemberRemaining / totalAvailable) * 100 : 0;
    const balancePercent = workloadBalancePercent(members.map((member) => member.utilisationPercent), teamUtilisation);

    const blockedCriticalCount = items.filter(
      (node) => node.progressPercent < 100 && node.isBlocked && plan.scheduling[node.id]?.isCritical,
    ).length;
    const overloadedCount = members.filter((member) => member.status === 'over_capacity').length;
    const availableCount = members.filter((member) => member.status === 'available').length;

    const summary: TeamInsightsSummary = {
      health: teamHealthStatus({
        balancePercent,
        capacityShortfallMinutes: plan.forecast.capacityShortfallMinutes,
        delayMinutes: plan.forecast.delayMinutes,
        overloadedCount,
      }),
      balancePercent,
      remainingMinutes: totalMemberRemaining + unassignedMinutes,
      availableMinutes: totalAvailable,
      capacityShortfallMinutes: plan.forecast.capacityShortfallMinutes,
      forecastCompletion: plan.forecast.projectedCompletion,
      forecastDelay: { minutes: plan.forecast.delayMinutes, days: plan.forecast.delayDays },
      overloadedCount,
      availableCount,
      blockedCriticalCount,
      memberCount: members.length,
      bottleneckUserId,
      unassigned: { itemCount: unassignedItems.length, remainingMinutes: unassignedMinutes },
    };

    return { generatedAt: plan.generatedAt, viewerRole, summary, members, warnings, formulaVersion: 'team-intelligence-v2' };
  }
}

// --- Pure, exported primitives (directly unit-tested) -----------------------

export type ItemClass = 'ready' | 'blocked' | 'future' | 'unscheduled';

/** Classify one incomplete item using ONLY pre-computed plan/forecast state. */
export function classifyItem(
  node: Pick<ProjectPlanNode, 'isBlocked'>,
  schedule: { forecastStatus?: string; forecastStart?: string | null } | undefined,
  nowMs: number,
): ItemClass {
  if (node.isBlocked) return 'blocked';
  if (schedule?.forecastStatus === 'unscheduled' || schedule?.forecastStatus === 'in_cycle') return 'unscheduled';
  if (schedule?.forecastStart) {
    const start = Date.parse(schedule.forecastStart);
    if (!Number.isNaN(start) && start > nowMs) return 'future';
  }
  return 'ready';
}

/** Utilisation = remaining workload ÷ available capacity, clamped and safe at zero capacity. */
export function utilisationFor(remainingMinutes: number, availableMinutes: number): number {
  if (availableMinutes > 0) return Math.round((remainingMinutes / availableMinutes) * 100);
  return remainingMinutes > 0 ? 999 : 0;
}

/** Balance = 100 − mean absolute deviation of member utilisation from the team mean. */
export function workloadBalancePercent(utilisations: number[], teamUtilisation: number): number {
  if (!utilisations.length) return 100;
  return Math.max(
    0,
    Math.round(100 - utilisations.reduce((sum, value) => sum + Math.abs(value - teamUtilisation), 0) / utilisations.length),
  );
}

/** Member status thresholds (backend-owned): <40 available, 40–80 balanced, 81–100 heavy, >100 over. */
export function statusFor(utilisation: number): WorkloadStatus {
  if (utilisation > 100) return 'over_capacity';
  if (utilisation > 80) return 'heavy';
  if (utilisation >= 40) return 'balanced';
  return 'available';
}

/** Overall team health from the balance, capacity shortfall, forecast delay, and overload count. */
export function teamHealthStatus(input: {
  balancePercent: number;
  capacityShortfallMinutes: number;
  delayMinutes: number;
  overloadedCount: number;
}): TeamHealth {
  if (input.delayMinutes > 0 || input.capacityShortfallMinutes > 0) return 'at_risk';
  if (input.overloadedCount > 0 || input.balancePercent < 60) return 'strained';
  if (input.balancePercent < 85) return 'balanced';
  return 'healthy';
}

/** How much a member's own scheduled work overruns the deadline (minutes), else 0. */
function memberForecastDelay(assigned: ProjectPlanNode[], plan: ProjectPlan, deadlineMs: number | null): number {
  if (deadlineMs == null) return 0;
  let latest = 0;
  for (const node of assigned) {
    const end = plan.scheduling[node.id]?.forecastEnd;
    if (!end) continue;
    const endMs = Date.parse(end);
    if (!Number.isNaN(endMs)) latest = Math.max(latest, endMs);
  }
  return latest > deadlineMs ? Math.round((latest - deadlineMs) / 60_000) : 0;
}
