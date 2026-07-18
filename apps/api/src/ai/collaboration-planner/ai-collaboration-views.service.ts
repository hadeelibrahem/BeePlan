import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNotNull, lt } from 'drizzle-orm';
import { getUtcDayBoundaries } from '../../dashboard/dashboard-date.util';
import { TaskAccessService } from '../../collaboration/task-access.service';
import { DatabaseService } from '../../db/database.service';
import { subtasks, tasks, users } from '../../db/schema';

const OPEN_STATUSES = ['todo', 'in_progress'] as const;
const MAX_TIMELINE_MILESTONES = 12;
const BUFFER_LOOKBACK_DAYS = 3;

type SubtaskRow = typeof subtasks.$inferSelect;

export type TodayItem = { id: string; title: string; status: string; dueDate: string | null };
export type TodayMember = { userId: string; displayName: string; items: TodayItem[] };
export type TodayPlan = {
  goal: string;
  members: TodayMember[];
  sharedItems: TodayItem[];
};

export type ProgressMember = {
  userId: string;
  displayName: string;
  completedCount: number;
  totalCount: number;
  percent: number;
};
export type TeamProgress = {
  overallPercent: number;
  completedCount: number;
  totalCount: number;
  members: ProgressMember[];
};

export type TimelineMilestone = { id: string; title: string; date: string };
export type Timeline = {
  today: string;
  deadline: string | null;
  milestones: TimelineMilestone[];
  bufferDay: string | null;
};

/**
 * Read-only views over data the AI Collaboration Planner already writes to
 * `subtasks` (assignee, startDate/dueDate — see AiCollaborationPlannerService
 * .apply()). No new tables: "today", "progress" and "timeline" are all
 * derived slices of the same subtask rows the Distribution tab's generate/
 * apply already produced, kept small and un-cached on purpose (single-task
 * scope, indexed columns) rather than introducing a background job.
 */
@Injectable()
export class AiCollaborationViewsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly access: TaskAccessService,
  ) {}

  private get db() {
    return this.databaseService.db;
  }

  async getToday(taskId: string): Promise<TodayPlan> {
    const { startOfTomorrow } = getUtcDayBoundaries();
    const memberIds = await this.access.getRecipientIds(taskId);
    const people = memberIds.length
      ? await this.db
          .select({ id: users.id, fullName: users.fullName })
          .from(users)
          .where(inArray(users.id, memberIds))
      : [];
    const nameById = new Map(people.map((person) => [person.id, person.fullName]));

    // "Today's work" = anything still open that has started (or should have)
    // by end of today — this deliberately surfaces overdue items too, so
    // slipping work stays visible instead of quietly vanishing off Today.
    const openItems = await this.db
      .select()
      .from(subtasks)
      .where(
        and(
          eq(subtasks.taskId, taskId),
          inArray(subtasks.status, [...OPEN_STATUSES]),
          lt(subtasks.startDate, startOfTomorrow),
        ),
      );

    const byMember = new Map<string, TodayItem[]>();
    const sharedItems: TodayItem[] = [];
    let earliestDue: SubtaskRow | null = null;

    for (const item of openItems) {
      const entry: TodayItem = {
        id: item.id,
        title: item.title,
        status: item.status,
        dueDate: item.dueDate ? item.dueDate.toISOString() : null,
      };
      if (item.isShared) {
        sharedItems.push(entry);
      } else if (item.assigneeUserId) {
        const list = byMember.get(item.assigneeUserId) ?? [];
        list.push(entry);
        byMember.set(item.assigneeUserId, list);
      }
      if (
        item.dueDate &&
        (!earliestDue || (earliestDue.dueDate && item.dueDate < earliestDue.dueDate))
      ) {
        earliestDue = item;
      }
    }

    const [task] = await this.db
      .select({ title: tasks.title })
      .from(tasks)
      .where(eq(tasks.id, taskId));

    const members: TodayMember[] = memberIds.map((userId) => ({
      userId,
      displayName: nameById.get(userId) ?? 'Member',
      items: byMember.get(userId) ?? [],
    }));

    return {
      goal: earliestDue ? earliestDue.title : task?.title ?? 'Today',
      members,
      sharedItems,
    };
  }

  async getProgress(taskId: string): Promise<TeamProgress> {
    const rows = await this.db
      .select({
        assigneeUserId: subtasks.assigneeUserId,
        isShared: subtasks.isShared,
        status: subtasks.status,
      })
      .from(subtasks)
      .where(eq(subtasks.taskId, taskId));

    const totalCount = rows.length;
    const completedCount = rows.filter((row) => row.status === 'done').length;

    const perMember = new Map<string, { completed: number; total: number }>();
    for (const row of rows) {
      if (!row.assigneeUserId || row.isShared) continue;
      const bucket = perMember.get(row.assigneeUserId) ?? { completed: 0, total: 0 };
      bucket.total += 1;
      if (row.status === 'done') bucket.completed += 1;
      perMember.set(row.assigneeUserId, bucket);
    }

    const memberIds = [...perMember.keys()];
    const people = memberIds.length
      ? await this.db
          .select({ id: users.id, fullName: users.fullName })
          .from(users)
          .where(inArray(users.id, memberIds))
      : [];
    const nameById = new Map(people.map((person) => [person.id, person.fullName]));

    const members: ProgressMember[] = memberIds.map((userId) => {
      const bucket = perMember.get(userId)!;
      return {
        userId,
        displayName: nameById.get(userId) ?? 'Member',
        completedCount: bucket.completed,
        totalCount: bucket.total,
        percent: bucket.total ? Math.round((bucket.completed / bucket.total) * 100) : 0,
      };
    });

    return {
      overallPercent: totalCount ? Math.round((completedCount / totalCount) * 100) : 0,
      completedCount,
      totalCount,
      members,
    };
  }

  async getTimeline(taskId: string): Promise<Timeline> {
    const { startOfToday } = getUtcDayBoundaries();
    const [task] = await this.db
      .select({ dueDate: tasks.dueDate })
      .from(tasks)
      .where(eq(tasks.id, taskId));

    const dated = await this.db
      .select({ id: subtasks.id, title: subtasks.title, dueDate: subtasks.dueDate })
      .from(subtasks)
      .where(and(eq(subtasks.taskId, taskId), isNotNull(subtasks.dueDate)));

    dated.sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime());

    const seenDays = new Set<string>();
    const milestones: TimelineMilestone[] = [];
    for (const item of dated) {
      const dayKey = item.dueDate!.toISOString().slice(0, 10);
      if (seenDays.has(dayKey)) continue;
      seenDays.add(dayKey);
      milestones.push({ id: item.id, title: item.title, date: item.dueDate!.toISOString() });
      if (milestones.length >= MAX_TIMELINE_MILESTONES) break;
    }

    return {
      today: startOfToday.toISOString(),
      deadline: task?.dueDate ? task.dueDate.toISOString() : null,
      milestones,
      bufferDay: task?.dueDate ? findBufferDay(task.dueDate, seenDays) : null,
    };
  }
}

/** Latest free day (no subtask due) in the few days before the deadline. */
function findBufferDay(deadline: Date, busyDayKeys: Set<string>): string | null {
  for (let offset = 1; offset <= BUFFER_LOOKBACK_DAYS; offset += 1) {
    const candidate = new Date(deadline.getTime() - offset * 24 * 60 * 60 * 1000);
    const dayKey = candidate.toISOString().slice(0, 10);
    if (!busyDayKeys.has(dayKey)) return candidate.toISOString();
  }
  return null;
}
