import { Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, lte, or } from 'drizzle-orm';
import { DatabaseService } from '../../db/database.service';
import { subtasks, taskMembers, tasks, users } from '../../db/schema';
import { PlannerPreferencesService } from '../planner/planner-preferences.service';

export type CapacityBand = 'light' | 'moderate' | 'busy';

export type MemberCapacity = {
  userId: string;
  displayName: string;
  band: CapacityBand;
  loadPercent: number;
};

const OPEN_STATUSES = ['todo', 'in_progress'] as const;
const LOOKAHEAD_DAYS = 7;
const DEFAULT_ESTIMATE_MINUTES = 30;
const LIGHT_MAX = 40;
const MODERATE_MAX = 75;

/**
 * The one cross-task "how busy is this person" signal in BeePlan. Nothing
 * else in the codebase tracks this (confirmed by grep) — it's computed fresh
 * on every read from each member's own open subtasks due in the coming week,
 * weighed against their personal daily capacity (`planner_preferences`,
 * defaulting to 480 min/day like the solo AI planner). Never surfaces task
 * titles or content, only a band + percentage, so a teammate's private
 * schedule stays private even from the people relying on this number.
 */
@Injectable()
export class WorkloadCapacityService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly plannerPreferences: PlannerPreferencesService,
  ) {}

  private get db() {
    return this.databaseService.db;
  }

  /** Capacity band for every accepted member of a shared task (owner incl.). */
  async getCapacityBands(taskId: string): Promise<MemberCapacity[]> {
    const memberIds = await this.getAcceptedMemberIds(taskId);
    if (!memberIds.length) return [];
    return this.getCapacityForUsers(memberIds);
  }

  /** Capacity for an arbitrary set of users — used by recommendation detection
   * to pick a reassignment target without recomputing the member list. */
  async getCapacityForUsers(userIds: string[]): Promise<MemberCapacity[]> {
    if (!userIds.length) return [];

    const people = await this.db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(inArray(users.id, userIds));

    const now = new Date();
    const horizon = new Date(now.getTime() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);

    const openSubtasks = await this.db
      .select({
        assigneeUserId: subtasks.assigneeUserId,
        estimatedDurationMinutes: subtasks.estimatedDurationMinutes,
      })
      .from(subtasks)
      .where(
        and(
          inArray(subtasks.assigneeUserId, userIds),
          inArray(subtasks.status, [...OPEN_STATUSES]),
          or(
            and(gte(subtasks.dueDate, now), lte(subtasks.dueDate, horizon)),
            // Overdue-but-still-open work still counts against capacity.
            lte(subtasks.dueDate, now),
          ),
        ),
      );

    const minutesByUser = new Map<string, number>();
    for (const row of openSubtasks) {
      if (!row.assigneeUserId) continue;
      const minutes = row.estimatedDurationMinutes ?? DEFAULT_ESTIMATE_MINUTES;
      minutesByUser.set(
        row.assigneeUserId,
        (minutesByUser.get(row.assigneeUserId) ?? 0) + minutes,
      );
    }

    const results: MemberCapacity[] = [];
    for (const person of people) {
      const preferences = await this.plannerPreferences.getPreferences(person.id);
      const weeklyCapacityMinutes = Math.max(
        preferences.maxDailyWorkMinutes * LOOKAHEAD_DAYS,
        60,
      );
      const loadMinutes = minutesByUser.get(person.id) ?? 0;
      const loadPercent = Math.min(
        999,
        Math.round((loadMinutes / weeklyCapacityMinutes) * 100),
      );
      results.push({
        userId: person.id,
        displayName: person.fullName,
        band: bandFor(loadPercent),
        loadPercent,
      });
    }
    return results;
  }

  private async getAcceptedMemberIds(taskId: string): Promise<string[]> {
    const [task] = await this.db
      .select({ userId: tasks.userId })
      .from(tasks)
      .where(eq(tasks.id, taskId));
    if (!task) return [];

    const members = await this.db
      .select({ userId: taskMembers.userId })
      .from(taskMembers)
      .where(
        and(eq(taskMembers.taskId, taskId), eq(taskMembers.status, 'accepted')),
      );

    return [...new Set([task.userId, ...members.map((member) => member.userId)])];
  }
}

function bandFor(loadPercent: number): CapacityBand {
  if (loadPercent < LIGHT_MAX) return 'light';
  if (loadPercent <= MODERATE_MAX) return 'moderate';
  return 'busy';
}
