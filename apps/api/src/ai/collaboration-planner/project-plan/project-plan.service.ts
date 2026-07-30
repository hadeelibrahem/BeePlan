import { Injectable } from '@nestjs/common';
import { and, eq, inArray, or } from 'drizzle-orm';
import { TaskAccessService } from '../../../collaboration/task-access.service';
import { DatabaseService } from '../../../db/database.service';
import {
  focusSessions,
  plannerPreferences,
  subtaskDependencies,
  subtasks,
  taskDependencies,
  taskMembers,
  tasks,
  users,
} from '../../../db/schema';
import { PlannerPreferencesService } from '../../planner/planner-preferences.service';
import { RecurringCommitmentsService } from '../../../context/recurring-commitments.service';
import {
  buildMemberAvailability,
  fallbackAvailability,
  type MemberAvailability,
} from './member-availability';
import {
  buildProjectPlan,
  type FocusSummary,
  type Priority,
  type ProjectPlan,
  type RawCrossDep,
  type RawSubtask,
  type RawSubtaskEdge,
} from './project-plan.logic';
import type { PlanSubtaskOverride } from '../recommendation-changes';

export type GetProjectPlanOptions = {
  /**
   * Hypothetical, in-memory edits applied to the loaded subtask rows BEFORE the
   * plan is built. Nothing is persisted — this is how the recommendation preview
   * produces an "after" forecast without touching the database. Overrides for
   * unknown subtask ids are ignored.
   */
  overrides?: PlanSubtaskOverride[];
};

/**
 * Apply hypothetical edits to loaded rows. Pure and exported so the
 * "what would change" path is unit-testable without a database. Only the fields
 * a recommendation can actually change (assignee, start, due) are overridable,
 * and `undefined` means "leave alone" while `null` means "clear".
 */
export function applySubtaskOverrides(
  items: RawSubtask[],
  overrides: PlanSubtaskOverride[] | undefined,
): RawSubtask[] {
  if (!overrides?.length) return items;
  const byId = new Map(overrides.map((override) => [override.subtaskId, override]));
  return items.map((item) => {
    const override = byId.get(item.id);
    if (!override) return item;
    return {
      ...item,
      assigneeUserId:
        override.assigneeUserId !== undefined ? override.assigneeUserId : item.assigneeUserId,
      startDate: override.startDate !== undefined ? override.startDate : item.startDate,
      dueDate: override.dueDate !== undefined ? override.dueDate : item.dueDate,
    };
  });
}

/**
 * Loads the persisted rows for one task's plan and hands them to the pure
 * `buildProjectPlan` normalizer. No graph math lives here — this class is only
 * IO + shaping. Access (viewer+) is enforced up front via TaskAccessService, so
 * viewers get the full read-only model exactly like every other collaboration
 * read.
 */
@Injectable()
export class ProjectPlanService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly access: TaskAccessService,
    private readonly plannerPreferences: PlannerPreferencesService,
    private readonly recurringCommitments: RecurringCommitmentsService,
  ) {}

  private get db() {
    return this.databaseService.db;
  }

  async getProjectPlan(
    userId: string,
    taskId: string,
    options: GetProjectPlanOptions = {},
  ): Promise<ProjectPlan> {
    const { task } = await this.access.require(userId, taskId, 'viewer');
    const now = new Date();

    const subtaskRows = (await this.db
      .select()
      .from(subtasks)
      .where(eq(subtasks.taskId, taskId))) as Array<typeof subtasks.$inferSelect>;

    // Overrides are applied here, before assignee ids / availability / names are
    // collected below, so a hypothetical reassignment pulls in the new member's
    // real availability exactly as a persisted one would.
    const subtaskItems: RawSubtask[] = applySubtaskOverrides(
      subtaskRows.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        isDone: row.isDone,
        assigneeUserId: row.assigneeUserId,
        startDate: row.startDate,
        dueDate: row.dueDate,
        estimatedDurationMinutes: row.estimatedDurationMinutes,
        actualDurationMinutes: row.actualDurationMinutes,
        priority: coercePriority(row.priority),
      })),
      options.overrides,
    );

    const subtaskIds = subtaskItems.map((item) => item.id);
    const subtaskEdges: RawSubtaskEdge[] = subtaskIds.length
      ? await this.db
          .select({
            subtaskId: subtaskDependencies.subtaskId,
            dependsOnSubtaskId: subtaskDependencies.dependsOnSubtaskId,
          })
          .from(subtaskDependencies)
          .where(inArray(subtaskDependencies.subtaskId, subtaskIds))
      : [];

    // Cross-task dependencies in BOTH directions (this task depends on X; Y
    // depends on this task) so cross-task meaning is preserved in the graph.
    const crossRows = await this.db
      .select({
        taskId: taskDependencies.taskId,
        dependencyTaskId: taskDependencies.dependencyTaskId,
      })
      .from(taskDependencies)
      .where(or(eq(taskDependencies.taskId, taskId), eq(taskDependencies.dependencyTaskId, taskId)));

    const otherTaskIds = [
      ...new Set(
        crossRows.flatMap((row) => [row.taskId, row.dependencyTaskId]).filter((id) => id !== taskId),
      ),
    ];
    const otherTasks = otherTaskIds.length
      ? await this.db
          .select({ id: tasks.id, title: tasks.title, status: tasks.status, ownerUserId: tasks.userId })
          .from(tasks)
          .where(inArray(tasks.id, otherTaskIds))
      : [];
    const otherById = new Map(otherTasks.map((row) => [row.id, row]));

    const crossDeps: RawCrossDep[] = crossRows.flatMap((row) => {
      const otherId = row.taskId === taskId ? row.dependencyTaskId : row.taskId;
      const other = otherById.get(otherId);
      if (!other) return [];
      // row.taskId depends on row.dependencyTaskId. If this task is the
      // dependent -> 'depends'; if this task is the prerequisite -> 'blocks'.
      const direction = row.taskId === taskId ? 'depends' : 'blocks';
      return [{ direction, other }];
    });

    // Assignee names for every referenced user.
    // Every accepted collaborator (not only assignees) so idle members still
    // appear in the resource lanes that power the Team capacity view.
    const acceptedMembers = await this.db
      .select({ userId: taskMembers.userId })
      .from(taskMembers)
      .where(and(eq(taskMembers.taskId, taskId), eq(taskMembers.status, 'accepted')));
    const acceptedMemberIds = acceptedMembers.map((member) => member.userId);

    const userIds = [
      ...new Set(
        [
          task.userId,
          ...subtaskItems.map((item) => item.assigneeUserId),
          ...otherTasks.map((row) => row.ownerUserId),
          ...acceptedMemberIds,
        ].filter((id): id is string => Boolean(id)),
      ),
    ];
    const people = userIds.length
      ? await this.db
          .select({ id: users.id, fullName: users.fullName })
          .from(users)
          .where(inArray(users.id, userIds))
      : [];
    const nameById = new Map(people.map((person) => [person.id, person.fullName]));

    // Completed focus-session rollup per subtask (and the task itself).
    const focusById = await this.loadFocusSummaries(taskId, subtaskIds);

    // Per-member availability for the Resource-Aware Forecast: the task owner,
    // every accepted collaborator, and every subtask assignee present in the plan.
    const memberIds = [
      ...new Set(
        [task.userId, ...acceptedMemberIds, ...subtaskItems.map((item) => item.assigneeUserId)].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    ];
    const availabilityByUser = await this.loadAvailability(memberIds, nameById, now);
    // BeePlan has no per-user timezone; use the server's local offset (local = UTC + offset).
    const timezoneOffsetMinutes = -now.getTimezoneOffset();

    return buildProjectPlan({
      task: {
        id: task.id,
        title: task.title,
        status: task.status,
        dueDate: task.dueDate,
        progress: task.progress,
        estimatedTimeMinutes: task.estimatedTimeMinutes,
        spentTimeMinutes: task.spentTimeMinutes,
        ownerUserId: task.userId,
        priority: coercePriority(task.priority),
      },
      subtasks: subtaskItems,
      subtaskEdges,
      crossDeps,
      nameById,
      focusById,
      now,
      availabilityByUser,
      timezoneOffsetMinutes,
    });
  }

  /**
   * Build each member's deterministic weekly availability from their EXISTING
   * planner preferences (working/focus hours, sleep, lunch, unavailable windows,
   * daily cap) and recurring commitments. Members with no saved preferences get
   * the documented default availability (hasData: false) so the forecast can
   * disclose its fallback policy. Never invents availability.
   */
  private async loadAvailability(
    memberIds: string[],
    nameById: Map<string, string>,
    now: Date,
  ): Promise<Map<string, MemberAvailability>> {
    const availability = new Map<string, MemberAvailability>();
    if (!memberIds.length) return availability;

    const offsetMinutes = -now.getTimezoneOffset();
    const savedRows = await this.db
      .select({ userId: plannerPreferences.userId })
      .from(plannerPreferences)
      .where(inArray(plannerPreferences.userId, memberIds));
    const savedIds = new Set(savedRows.map((row) => row.userId));

    for (const memberId of memberIds) {
      const displayName = nameById.get(memberId) ?? 'Member';
      const hasData = savedIds.has(memberId);
      if (!hasData) {
        availability.set(memberId, fallbackAvailability(memberId, displayName, offsetMinutes));
        continue;
      }
      const preferences = await this.plannerPreferences.getPreferences(memberId);
      const commitments = await this.recurringCommitments.getActiveCommitments(memberId);
      availability.set(
        memberId,
        buildMemberAvailability({
          userId: memberId,
          displayName,
          offsetMinutes,
          preferences: {
            focusStartTime: preferences.focusStartTime,
            focusEndTime: preferences.focusEndTime,
            maxDailyWorkMinutes: preferences.maxDailyWorkMinutes,
            sleep: preferences.sleep,
            lunch: preferences.lunch,
            unavailableHours: preferences.unavailableHours,
          },
          commitments: commitments.map((commitment) => ({
            isActive: commitment.isActive,
            daysOfWeek: commitment.daysOfWeek,
            startTime: commitment.startTime,
            endTime: commitment.endTime,
          })),
          hasData: true,
        }),
      );
    }
    return availability;
  }

  /** sessionCount + summed actual minutes of COMPLETED sessions, keyed by subtask id and task id. */
  private async loadFocusSummaries(
    taskId: string,
    subtaskIds: string[],
  ): Promise<Map<string, FocusSummary>> {
    const rows = await this.db
      .select({
        subtaskId: focusSessions.subtaskId,
        taskId: focusSessions.taskId,
        actualMinutes: focusSessions.actualMinutes,
      })
      .from(focusSessions)
      .where(and(eq(focusSessions.taskId, taskId), eq(focusSessions.status, 'completed')));

    const summary = new Map<string, FocusSummary>();
    const bump = (id: string, minutes: number) => {
      const current = summary.get(id) ?? { sessionCount: 0, spentMinutes: 0 };
      current.sessionCount += 1;
      current.spentMinutes += minutes;
      summary.set(id, current);
    };
    for (const row of rows) {
      const minutes = row.actualMinutes ?? 0;
      // Attribute to the subtask when present, otherwise to the task node.
      if (row.subtaskId && subtaskIds.includes(row.subtaskId)) bump(row.subtaskId, minutes);
      else if (row.taskId) bump(row.taskId, minutes);
    }
    return summary;
  }
}

const PRIORITIES: ReadonlySet<Priority> = new Set(['low', 'medium', 'high', 'urgent']);

/** Coerce a stored priority string into the typed union (default 'medium'). */
function coercePriority(value: string | null | undefined): Priority {
  return value && PRIORITIES.has(value as Priority) ? (value as Priority) : 'medium';
}
