import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { TaskAccessService } from '../../collaboration/task-access.service';
import { DatabaseService } from '../../db/database.service';
import { focusSessions } from '../../db/schema';
import type { ProjectPlan } from './project-plan/project-plan.logic';
import { ProjectPlanService } from './project-plan/project-plan.service';
import { TeamInsightsService } from './team-insights.service';
import {
  buildProjectHealth,
  type FocusAggregate,
  type HealthInputs,
  type ProjectHealth,
} from './project-health.logic';

export type ProjectHealthResponse = ProjectHealth & { viewerRole: 'owner' | 'editor' | 'viewer' };

/**
 * The read-only Project Health dashboard behind GET /tasks/:taskId/ai/
 * collaboration/health. It is a thin IO + assembly layer: it loads the shared
 * project plan (Critical Path + Resource Forecast + Resource Lanes), the Team
 * Intelligence roll-up, and this task's focus-session history, normalises them
 * into `HealthInputs`, and hands them to the pure deterministic scorer
 * (project-health.logic.ts). No scores are computed here and none use AI.
 */
@Injectable()
export class ProjectHealthService {
  constructor(
    private readonly dbs: DatabaseService,
    private readonly access: TaskAccessService,
    private readonly projectPlan: ProjectPlanService,
    private readonly team: TeamInsightsService,
  ) {}

  /**
   * `options.plan` / `options.team` let a caller reuse work it already did — the
   * recommendation preview builds one hypothetical plan and scores health from
   * it, instead of recomputing the forecast three times. Access is re-checked
   * here either way.
   */
  async get(
    userId: string,
    taskId: string,
    options: {
      plan?: ProjectPlan;
      team?: Awaited<ReturnType<TeamInsightsService['get']>>;
    } = {},
  ): Promise<ProjectHealthResponse> {
    const { role: viewerRole } = await this.access.require(userId, taskId, 'viewer');
    const plan = options.plan ?? (await this.projectPlan.getProjectPlan(userId, taskId));
    const [team, focus] = await Promise.all([
      options.team ?? this.team.get(userId, taskId, plan),
      this.loadFocusAggregate(taskId),
    ]);

    const inputs = this.toHealthInputs(plan, team, focus);
    const health = buildProjectHealth(inputs);
    return { ...health, viewerRole };
  }

  private toHealthInputs(
    plan: ProjectPlan,
    team: Awaited<ReturnType<TeamInsightsService['get']>>,
    focus: FocusAggregate | null,
  ): HealthInputs {
    const now = new Date(plan.generatedAt);
    const nowMs = now.getTime();
    const deadlineMs = plan.forecast.deadline ? Date.parse(plan.forecast.deadline) : null;
    const items = plan.nodes.filter((node) => !node.isExternal && !node.isGroup);

    let completedItems = 0;
    let blockedItems = 0;
    let readyItems = 0;
    let startedItems = 0;
    let scheduledItems = 0;
    let unscheduledItems = 0;
    let criticalBlockedItems = 0;
    let criticalItemCount = 0;
    let lateCriticalCount = 0;
    let remainingMinutes = 0;
    let assignedItems = 0;
    let unassignedItems = 0;
    let unassignedMinutes = 0;
    let maxLayer = 0;

    for (const node of items) {
      maxLayer = Math.max(maxLayer, node.layer);
      const schedule = plan.scheduling[node.id];
      const isCritical = Boolean(schedule?.isCritical);
      if (isCritical) criticalItemCount += 1;

      if (node.progressPercent >= 100) {
        completedItems += 1;
        continue;
      }

      // Incomplete item.
      const remaining = node.remainingMinutes ?? 0;
      remainingMinutes += remaining;
      if (node.assignee) assignedItems += 1;
      else {
        unassignedItems += 1;
        unassignedMinutes += remaining;
      }
      if (node.status === 'in_progress' || node.progressPercent > 0) startedItems += 1;

      const forecastStatus = schedule?.forecastStatus;
      const isUnscheduled = forecastStatus === 'unscheduled' || forecastStatus === 'in_cycle';
      if (node.isBlocked) {
        blockedItems += 1;
        if (isCritical) criticalBlockedItems += 1;
      }
      if (isUnscheduled) unscheduledItems += 1;
      else if (forecastStatus === 'scheduled') {
        scheduledItems += 1;
        const start = schedule?.forecastStart ? Date.parse(schedule.forecastStart) : nowMs;
        if (!node.isBlocked && start <= nowMs) readyItems += 1;
      }

      // Late critical work: a critical item that can't be scheduled, or finishes past the deadline.
      if (isCritical) {
        if (isUnscheduled) lateCriticalCount += 1;
        else if (deadlineMs != null && schedule?.forecastEnd && Date.parse(schedule.forecastEnd) > deadlineMs) lateCriticalCount += 1;
      }
    }

    const cyclePresent = plan.warnings.some((warning) => warning.code === 'cycle') || items.some((node) => node.inCycle);

    const editors = team.members.filter((member) => member.role === 'editor');
    const membersWithWork = team.members.filter((member) => member.assignedItemCount > 0).length;
    const ownerMember = team.members.find((member) => member.role === 'owner');

    return {
      now,
      forecastStatus: plan.forecast.status,
      delayMinutes: plan.forecast.delayMinutes,
      delayDays: plan.forecast.delayDays,
      projectedCompletionMs: plan.forecast.projectedCompletion ? Date.parse(plan.forecast.projectedCompletion) : null,
      deadlineMs,
      criticalPathAvailable: plan.criticalPath.status === 'available',
      criticalItemCount,
      lateCriticalCount,
      totalItems: items.length,
      completedItems,
      blockedItems,
      readyItems,
      startedItems,
      scheduledItems,
      unscheduledItems,
      criticalBlockedItems,
      remainingMinutes,
      maxLayer,
      cyclePresent,
      capacityShortfallMinutes: plan.forecast.capacityShortfallMinutes,
      overloadedCount: team.summary.overloadedCount,
      availableCount: team.summary.availableCount,
      memberCount: team.summary.memberCount,
      balancePercent: team.summary.balancePercent,
      membersWithWork,
      totalAvailableMinutes: team.summary.availableMinutes,
      assignedItems,
      unassignedItems,
      unassignedMinutes,
      ownerHasWork: (ownerMember?.assignedItemCount ?? 0) > 0,
      editorCount: editors.length,
      editorsWithWork: editors.filter((member) => member.assignedItemCount > 0).length,
      focus,
    };
  }

  /** Deterministic focus-session roll-up for the task (across every contributor). */
  private async loadFocusAggregate(taskId: string): Promise<FocusAggregate | null> {
    const rows = await this.dbs.db
      .select({ status: focusSessions.status, plannedMinutes: focusSessions.plannedMinutes, actualMinutes: focusSessions.actualMinutes })
      .from(focusSessions)
      .where(eq(focusSessions.taskId, taskId));
    if (!rows.length) return null;

    let completedSessions = 0;
    let cancelledSessions = 0;
    let focusMinutes = 0;
    let actualMinutesCompleted = 0;
    let plannedMinutesCompleted = 0;
    for (const row of rows) {
      const actual = row.actualMinutes ?? 0;
      focusMinutes += actual;
      if (row.status === 'completed') {
        completedSessions += 1;
        actualMinutesCompleted += actual;
        plannedMinutesCompleted += row.plannedMinutes ?? 0;
      } else if (row.status === 'cancelled') {
        cancelledSessions += 1;
      }
    }
    const avgSessionMinutes = completedSessions > 0 ? Math.round(actualMinutesCompleted / completedSessions) : 0;
    return {
      totalSessions: rows.length,
      completedSessions,
      cancelledSessions,
      focusMinutes,
      actualMinutesCompleted,
      plannedMinutesCompleted,
      avgSessionMinutes,
    };
  }
}
