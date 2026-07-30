import { Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { TaskAccessService } from '../../collaboration/task-access.service';
import { DatabaseService } from '../../db/database.service';
import { subtaskDependencies, subtasks, users } from '../../db/schema';
import { AiCollaborationViewsService } from './ai-collaboration-views.service';
import { AiRecommendationsService } from './ai-recommendations.service';
import { WorkloadCapacityService } from './workload-capacity.service';
import {
  buildAlerts,
  chooseDoThisNow,
  countOverdueOpen,
  deriveHealth,
  isOpenSubtask,
  summarizePlan,
  summarizeTeam,
  type DoThisNow,
  type OverviewAlert,
  type OverviewSubtask,
  type PlanSnapshot,
  type ProjectHealth,
  type SubtaskDependencyEdge,
  type TaskRole,
  type TeamSnapshot,
} from './ai-collaboration-overview.logic';

export type CollaborationOverview = {
  viewerRole: TaskRole;
  status: {
    overallPercent: number;
    completedCount: number;
    totalCount: number;
    pendingActionCount: number;
    health: ProjectHealth | null;
    deadline: string | null;
    isDeadlineAtRisk: boolean;
    teamMemberCount: number;
  };
  doThisNow: (DoThisNow & { assignee: { userId: string; displayName: string } | null }) | null;
  alerts: OverviewAlert[];
  plan: PlanSnapshot;
  team: TeamSnapshot;
};

/**
 * Read-only aggregation behind the AI Collaboration **Overview** tab. It is a
 * command centre, not a full report: it stitches together values other
 * services already derive (progress, capacity, pending recommendations) plus a
 * task-scoped "Do This Now" recommendation, and returns them as one payload so
 * web and mobile render identical behaviour without re-deriving anything. All
 * decisions live in ai-collaboration-overview.logic.ts (pure + unit-tested).
 */
@Injectable()
export class AiCollaborationOverviewService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly access: TaskAccessService,
    private readonly capacity: WorkloadCapacityService,
    private readonly views: AiCollaborationViewsService,
    private readonly recommendations: AiRecommendationsService,
  ) {}

  private get db() {
    return this.databaseService.db;
  }

  async getOverview(userId: string, taskId: string): Promise<CollaborationOverview> {
    // Throws 404/403 for no-access — mirrors every other collaboration read.
    const { task, role, isShared } = await this.access.require(userId, taskId, 'viewer');
    const now = new Date();

    const subtaskRows = (await this.db
      .select()
      .from(subtasks)
      .where(eq(subtasks.taskId, taskId))) as Array<typeof subtasks.$inferSelect>;

    const overviewSubtasks: OverviewSubtask[] = subtaskRows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      priority: row.priority,
      isFocusTask: row.isFocusTask,
      isDone: row.isDone,
      isShared: row.isShared,
      assigneeUserId: row.assigneeUserId,
      dueDate: row.dueDate,
      estimatedDurationMinutes: row.estimatedDurationMinutes,
      actualDurationMinutes: row.actualDurationMinutes,
    }));

    const subtaskIds = overviewSubtasks.map((subtask) => subtask.id);
    const edgeRows = subtaskIds.length
      ? await this.db
          .select({
            subtaskId: subtaskDependencies.subtaskId,
            dependsOnSubtaskId: subtaskDependencies.dependsOnSubtaskId,
          })
          .from(subtaskDependencies)
          .where(inArray(subtaskDependencies.subtaskId, subtaskIds))
      : [];
    const edges: SubtaskDependencyEdge[] = edgeRows;

    const [progress, capacityMembers, recommendationList] = await Promise.all([
      this.views.getProgress(taskId),
      this.capacity.getCapacityBands(taskId),
      this.recommendations.list(taskId),
    ]);

    const pendingRecommendations = recommendationList.filter((rec) => rec.status === 'pending');
    const overdueOpenCount = countOverdueOpen(overviewSubtasks, now);
    const deadlineExceeded = Boolean(
      task.dueDate && task.dueDate.getTime() < now.getTime() && progress.completedCount < progress.totalCount,
    );
    const hasOpenWork = overviewSubtasks.some(isOpenSubtask);

    const doThisNowBase = chooseDoThisNow({
      task: {
        id: task.id,
        title: task.title,
        status: task.status,
        dueDate: task.dueDate,
        isShared,
      },
      subtasks: overviewSubtasks,
      edges,
      userId,
      role,
      now,
    });

    // Resolve the assignee display name only for the one recommended unit — no
    // teammate's private schedule content is ever exposed here.
    let doThisNow: CollaborationOverview['doThisNow'] = null;
    if (doThisNowBase) {
      let assignee: { userId: string; displayName: string } | null = null;
      if (doThisNowBase.assignee) {
        const [person] = await this.db
          .select({ id: users.id, fullName: users.fullName })
          .from(users)
          .where(eq(users.id, doThisNowBase.assignee.userId));
        assignee = { userId: doThisNowBase.assignee.userId, displayName: person?.fullName ?? 'Member' };
      }
      doThisNow = { ...doThisNowBase, assignee };
    }

    const health = deriveHealth({
      totalCount: progress.totalCount,
      completedCount: progress.completedCount,
      overdueOpenCount,
      deadlineExceeded,
    });

    const plan = summarizePlan({
      subtasks: overviewSubtasks,
      edges,
      deadline: task.dueDate,
      capacityMembers,
    });

    const alerts = buildAlerts({
      pendingRecommendations,
      overdueOpenCount,
      blockedCount: plan.blockedCount,
      deadlineExceeded,
      capacityMembers,
      hasOpenWork,
    });

    const team = summarizeTeam(capacityMembers);

    return {
      viewerRole: role,
      status: {
        overallPercent: progress.overallPercent,
        completedCount: progress.completedCount,
        totalCount: progress.totalCount,
        pendingActionCount: pendingRecommendations.length,
        health,
        deadline: task.dueDate ? task.dueDate.toISOString() : null,
        isDeadlineAtRisk: deadlineExceeded || overdueOpenCount > 0,
        teamMemberCount: capacityMembers.length,
      },
      doThisNow,
      alerts,
      plan,
      team,
    };
  }
}
