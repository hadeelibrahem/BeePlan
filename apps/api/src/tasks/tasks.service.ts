import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lt,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import {
  TaskAccessService,
  type TaskRole,
} from '../collaboration/task-access.service';
import { DatabaseService } from '../db/database.service';
import {
  subtaskDependencies,
  subtasks,
  taskActivities,
  taskDependencies,
  taskMembers,
  taskRecurrenceRules,
  tasks,
  users,
} from '../db/schema';
import type { NotificationType } from '../notifications/notification-types';
import { NotificationsService } from '../notifications/notifications.service';
import type { CreateTaskDto } from './dto/create-task.dto';
import type { TaskQueryDto } from './dto/task-query.dto';
import {
  type DependencyTaskIdsDto,
  type ReplaceDependencyDto,
  type SubtaskDependencyDto,
  type SubtaskDto,
  type SubtaskReorderDto,
  type SubtaskStatus,
  type TaskLabelDto,
  type TaskProgressDto,
  type TaskRecurrenceDto,
  type TaskStatus,
  type TaskStatusDto,
  type TaskTimeEstimationDto,
} from './dto/task-shared.dto';
import type { UpdateTaskDto } from './dto/update-task.dto';
import {
  canModifySubtask,
  filterVisibleSubtasks,
  type SubtaskView,
  type ViewerRole,
} from './subtask-visibility';

// Who is reading a task and how the embedded subtask list should be filtered.
// Owner/viewer see all; an editor sees only own/shared/unassigned (enforced in
// subtask-visibility.ts). `view`/`assigneeId` are optional refinements.
type SubtaskViewer = {
  userId: string;
  role: ViewerRole;
  view?: SubtaskView;
  assigneeId?: string | null;
};

export type TaskFilterSummary = {
  counts: {
    today: number;
    upcoming: number;
    overdue: number;
    focus: number;
    completed: number;
    highPriority: number;
  };
  categories: { name: string; count: number }[];
};

type TaskRow = typeof tasks.$inferSelect;
type SubtaskRow = typeof subtasks.$inferSelect;
type RecurrenceRow = typeof taskRecurrenceRules.$inferSelect;
type ActivityRow = typeof taskActivities.$inferSelect;
type TaskLabel = { id: string; name: string };
type DependencyEntity = {
  id: string;
  title: string;
  category: string;
  status: string;
  dueDate?: string;
  priority: string;
  progress: number;
};
type TaskRelatedRows = {
  subtaskRows: SubtaskRow[];
  dependencies: DependencyEntity[];
  recurrence: RecurrenceRow | undefined;
  activities: ActivityRow[];
  // subtaskId -> ids of the sibling subtasks it depends on.
  subtaskDepsBySubtaskId?: Map<string, string[]>;
};

@Injectable()
export class TasksService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly access: TaskAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  private get db() {
    return this.databaseService.db;
  }

  async create(userId: string, dto: CreateTaskDto) {
    this.validateTaskPayload(dto);
    this.validateRecurrence(dto.recurrence ?? undefined);

    const status = dto.status ?? 'todo';
    const progress = status === 'done' ? 100 : (dto.progress ?? 0);
    const estimatedTimeMinutes = dto.estimatedTimeMinutes ?? 0;
    const spentTimeMinutes = dto.spentTimeMinutes ?? 0;
    const [task] = await this.db
      .insert(tasks)
      .values({
        userId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        priority: dto.priority ?? 'medium',
        status,
        progress,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        dueTime: dto.dueTime || null,
        category: dto.category?.trim() || null,
        notes: dto.notes?.trim() || null,
        estimatedTimeMinutes,
        spentTimeMinutes,
        remainingTimeMinutes:
          dto.remainingTimeMinutes ??
          this.calculateRemainingMinutes(
            estimatedTimeMinutes,
            spentTimeMinutes,
          ),
        reminderEnabled: dto.reminderEnabled ?? false,
        reminderBeforeMinutes: dto.reminderBeforeMinutes ?? null,
        labels: this.normalizeLabelNames(dto.labels),
        attachments: dto.attachments ?? null,
        isFavorite: dto.isFavorite ?? false,
        isFocusTask: dto.isFocusTask ?? false,
      })
      .returning();

    if (dto.subtasks?.length) {
      await this.db
        .insert(subtasks)
        .values(
          dto.subtasks.map((subtask, index) =>
            this.toSubtaskInsert(task.id, subtask, index),
          ),
        );
    }

    if (dto.recurrence && dto.recurrence.frequency !== 'Never') {
      await this.upsertRecurrence(task.id, dto.recurrence);
    }

    await this.recalculateProgress(userId, task.id);
    await this.addActivity(userId, task.id, 'created', 'Task created');

    return this.findOne(userId, task.id);
  }

  async findAll(userId: string, query?: TaskQueryDto) {
    // Shared visibility: the list spans tasks the user owns AND tasks they have
    // accepted an invitation to. Every other filter (status, due, search, …) is
    // ANDed on top, so shared tasks behave exactly like personal ones in every
    // view (All Tasks, Dashboard, Calendar, Upcoming, Search, filters).
    const memberRoleByTaskId = await this.getAcceptedMemberRoleMap(userId);
    const sharedTaskIds = [...memberRoleByTaskId.keys()];
    const ownershipCondition = sharedTaskIds.length
      ? or(eq(tasks.userId, userId), inArray(tasks.id, sharedTaskIds))!
      : eq(tasks.userId, userId);
    const conditions = [ownershipCondition];

    // "Shared only" quick filter.
    if (query?.shared && sharedTaskIds.length) {
      conditions.push(inArray(tasks.id, sharedTaskIds));
    } else if (query?.shared) {
      // User has no shared tasks — force an empty result set.
      conditions.push(eq(tasks.id, sql`'00000000-0000-0000-0000-000000000000'`));
    }

    if (query?.status) conditions.push(eq(tasks.status, query.status));
    if (query?.priority) conditions.push(eq(tasks.priority, query.priority));
    if (query?.category) conditions.push(eq(tasks.category, query.category));
    if (query?.focus) conditions.push(eq(tasks.isFocusTask, true));
    if (query?.completed) conditions.push(eq(tasks.status, 'done'));
    if (query?.hasReminder) conditions.push(eq(tasks.reminderEnabled, true));
    if (query?.search) {
      conditions.push(ilike(tasks.title, `%${query.search}%`));
    }

    if (query?.due) {
      const { startOfToday, startOfTomorrow, startOfNextWeek } =
        this.getDayBoundaries();

      if (query.due === 'today') {
        conditions.push(
          gte(tasks.dueDate, startOfToday),
          lt(tasks.dueDate, startOfTomorrow),
        );
      } else if (query.due === 'upcoming') {
        conditions.push(
          gte(tasks.dueDate, startOfTomorrow),
          lt(tasks.dueDate, startOfNextWeek),
        );
      } else if (query.due === 'overdue') {
        conditions.push(lt(tasks.dueDate, startOfToday), ne(tasks.status, 'done'));
      }
    }

    const rows = await this.db
      .select()
      .from(tasks)
      .where(and(...conditions))
      .orderBy(desc(tasks.updatedAt));

    if (!rows.length) return [];

    // Batch-fetch every related table once for the whole list instead of
    // once per task (the old per-task `toEntity` call here was a classic
    // N+1: 4-5 extra queries per task, so 50 tasks meant 200+ round trips).
    const taskIds = rows.map((row) => row.id);

    const [allSubtasks, dependencyLinks, allRecurrences, allActivities] =
      await Promise.all([
        this.db
          .select()
          .from(subtasks)
          .where(inArray(subtasks.taskId, taskIds))
          .orderBy(asc(subtasks.orderIndex), asc(subtasks.createdAt)),
        this.db
          .select()
          .from(taskDependencies)
          .where(inArray(taskDependencies.taskId, taskIds)),
        this.db
          .select()
          .from(taskRecurrenceRules)
          .where(inArray(taskRecurrenceRules.taskId, taskIds)),
        this.db
          .select()
          .from(taskActivities)
          .where(inArray(taskActivities.taskId, taskIds))
          .orderBy(desc(taskActivities.createdAt)),
      ]);

    const dependencyTaskIds = [
      ...new Set(dependencyLinks.map((link) => link.dependencyTaskId)),
    ];
    const dependencyTaskRows = dependencyTaskIds.length
      ? await this.db
          .select()
          .from(tasks)
          .where(
            and(eq(tasks.userId, userId), inArray(tasks.id, dependencyTaskIds)),
          )
      : [];
    const dependencyTaskById = new Map(
      dependencyTaskRows.map((row) => [row.id, row]),
    );

    const subtaskDepsBySubtaskId = await this.getSubtaskDepsMap(
      allSubtasks.map((row) => row.id),
    );

    const subtasksByTaskId = this.groupByTaskId(allSubtasks);
    const dependencyLinksByTaskId = this.groupByTaskId(dependencyLinks);
    const recurrenceByTaskId = new Map(
      allRecurrences.map((row) => [row.taskId, row]),
    );
    const activitiesByTaskId = this.groupByTaskId(allActivities);

    return Promise.all(
      rows.map((row) =>
        this.assembleEntity(
          row,
          {
            subtaskRows: subtasksByTaskId.get(row.id) ?? [],
            dependencies: (dependencyLinksByTaskId.get(row.id) ?? [])
              .map((link) => dependencyTaskById.get(link.dependencyTaskId))
              .filter((depTask): depTask is TaskRow => Boolean(depTask))
              .map((depTask) => this.toDependencyEntity(depTask)),
            recurrence: recurrenceByTaskId.get(row.id),
            activities: activitiesByTaskId.get(row.id) ?? [],
            subtaskDepsBySubtaskId,
          },
          {
            userId,
            role:
              row.userId === userId
                ? 'owner'
                : (memberRoleByTaskId.get(row.id) ?? 'viewer'),
          },
        ),
      ),
    );
  }

  async getFilterSummary(userId: string): Promise<TaskFilterSummary> {
    const { startOfToday, startOfTomorrow, startOfNextWeek } =
      this.getDayBoundaries();

    // Single aggregate query using FILTER (WHERE ...) so every quick-filter
    // count comes from one table scan instead of six separate ones.
    const [countsRow] = await this.db
      .select({
        today: sql<string>`count(*) filter (where ${tasks.dueDate} >= ${startOfToday} and ${tasks.dueDate} < ${startOfTomorrow})`,
        upcoming: sql<string>`count(*) filter (where ${tasks.dueDate} >= ${startOfTomorrow} and ${tasks.dueDate} < ${startOfNextWeek})`,
        overdue: sql<string>`count(*) filter (where ${tasks.dueDate} < ${startOfToday} and ${tasks.status} != 'done')`,
        focus: sql<string>`count(*) filter (where ${tasks.isFocusTask} = true)`,
        completed: sql<string>`count(*) filter (where ${tasks.status} = 'done')`,
        highPriority: sql<string>`count(*) filter (where ${tasks.priority} = 'high')`,
      })
      .from(tasks)
      .where(eq(tasks.userId, userId));

    const categoryRows = await this.db
      .select({
        name: tasks.category,
        count: sql<string>`count(*)`,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          isNotNull(tasks.category),
          ne(tasks.category, ''),
        ),
      )
      .groupBy(tasks.category)
      .orderBy(desc(sql`count(*)`));

    return {
      counts: {
        today: Number(countsRow?.today ?? 0),
        upcoming: Number(countsRow?.upcoming ?? 0),
        overdue: Number(countsRow?.overdue ?? 0),
        focus: Number(countsRow?.focus ?? 0),
        completed: Number(countsRow?.completed ?? 0),
        highPriority: Number(countsRow?.highPriority ?? 0),
      },
      categories: categoryRows.map((row) => ({
        name: row.name ?? '',
        count: Number(row.count),
      })),
    };
  }

  private getDayBoundaries() {
    // Compare in UTC rather than the server process's local time zone (same
    // approach as DashboardService.getSummary) — the `due_date` column is a
    // timezone-less `timestamp`, and local `setHours()` math would miscount
    // tasks whenever the server's UTC offset is positive.
    const now = new Date();
    const startOfToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const startOfTomorrow = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
    );
    const startOfNextWeek = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 8),
    );

    return { startOfToday, startOfTomorrow, startOfNextWeek };
  }

  private groupByTaskId<T extends { taskId: string }>(
    rows: T[],
  ): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const list = map.get(row.taskId);
      if (list) list.push(row);
      else map.set(row.taskId, [row]);
    }
    return map;
  }

  async findOne(
    userId: string,
    taskId: string,
    subtaskView?: { view?: SubtaskView; assigneeId?: string | null },
  ) {
    const access = await this.access.require(userId, taskId, 'viewer');
    const entity = await this.toEntity(access.task, {
      userId,
      role: access.role,
      view: subtaskView?.view,
      assigneeId: subtaskView?.assigneeId,
    });
    return {
      ...entity,
      // Collaboration context for the client: the caller's role, whether the
      // task is shared, and (for personal tasks) an unchanged shape.
      isShared: access.isShared,
      viewerRole: access.role,
      canEdit: access.role === 'owner' || access.role === 'editor',
      canManageMembers: access.role === 'owner',
    };
  }

  async update(userId: string, taskId: string, dto: UpdateTaskDto) {
    const existingTask = await this.getTaskForUser(userId, taskId);
    this.validateTaskPayload(dto, true);
    this.validateRecurrence(dto.recurrence ?? undefined);

    if (
      dto.status !== undefined &&
      (dto.status === 'in_progress' || dto.status === 'done') &&
      existingTask.status !== dto.status
    ) {
      await this.assertDependenciesComplete(userId, taskId);
    }

    if (dto.status === 'done') {
      await this.assertSubtasksComplete(taskId);
    }

    const updateData: Partial<typeof tasks.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (dto.title !== undefined) updateData.title = dto.title.trim();
    if (dto.description !== undefined) {
      updateData.description = dto.description?.trim() || null;
    }
    if (dto.priority !== undefined) updateData.priority = dto.priority;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.progress !== undefined) updateData.progress = dto.progress;
    if (dto.dueDate !== undefined) {
      updateData.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    }
    if (dto.dueTime !== undefined) updateData.dueTime = dto.dueTime || null;
    if (dto.category !== undefined) {
      updateData.category = dto.category?.trim() || null;
    }
    if (dto.notes !== undefined) updateData.notes = dto.notes?.trim() || null;
    if (dto.estimatedTimeMinutes !== undefined) {
      updateData.estimatedTimeMinutes = dto.estimatedTimeMinutes;
    }
    if (dto.spentTimeMinutes !== undefined) {
      updateData.spentTimeMinutes = dto.spentTimeMinutes;
    }
    if (dto.remainingTimeMinutes !== undefined) {
      updateData.remainingTimeMinutes = dto.remainingTimeMinutes;
    }
    if (dto.reminderEnabled !== undefined) {
      updateData.reminderEnabled = dto.reminderEnabled;
    }
    if (dto.reminderBeforeMinutes !== undefined) {
      updateData.reminderBeforeMinutes = dto.reminderBeforeMinutes;
    }
    if (
      dto.estimatedTimeMinutes !== undefined ||
      dto.spentTimeMinutes !== undefined
    ) {
      const estimatedTimeMinutes: number =
        dto.estimatedTimeMinutes ?? existingTask.estimatedTimeMinutes;
      const spentTimeMinutes: number =
        dto.spentTimeMinutes ?? existingTask.spentTimeMinutes;
      updateData.remainingTimeMinutes = this.calculateRemainingMinutes(
        estimatedTimeMinutes,
        spentTimeMinutes,
      );
    }
    if (dto.labels !== undefined) {
      updateData.labels = this.normalizeLabelNames(dto.labels);
    }
    if (dto.attachments !== undefined) updateData.attachments = dto.attachments;
    if (dto.isFavorite !== undefined) updateData.isFavorite = dto.isFavorite;
    if (dto.isFocusTask !== undefined) updateData.isFocusTask = dto.isFocusTask;

    await this.db
      .update(tasks)
      .set(updateData)
      .where(eq(tasks.id, taskId));

    if (dto.recurrence !== undefined) {
      if (!dto.recurrence || dto.recurrence.frequency === 'Never') {
        await this.removeRecurrence(userId, taskId);
      } else {
        await this.upsertRecurrence(taskId, dto.recurrence);
      }
    }

    await this.recalculateProgress(userId, taskId);
    await this.addActivity(userId, taskId, 'updated', 'Task updated');
    await this.notifyMembersOfChange(userId, existingTask, dto);

    return this.findOne(userId, taskId);
  }

  async remove(userId: string, taskId: string) {
    // Deleting a task is owner-only (spec: editors cannot delete).
    await this.getTaskForUser(userId, taskId, 'owner');
    await this.db.delete(tasks).where(eq(tasks.id, taskId));
  }

  async changeStatus(userId: string, taskId: string, dto: TaskStatusDto) {
    const task = await this.getTaskForUser(userId, taskId);

    if (
      (dto.status === 'in_progress' || dto.status === 'done') &&
      task.status !== dto.status
    ) {
      await this.assertDependenciesComplete(userId, taskId);
    }

    if (dto.status === 'done') {
      await this.assertSubtasksComplete(taskId);
    }

    await this.db
      .update(tasks)
      .set({
        status: dto.status,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));

    await this.recalculateProgress(userId, taskId);

    await this.addActivity(
      userId,
      taskId,
      'status_changed',
      `Status changed to ${dto.status}`,
      {
        missedReason: dto.missedReason,
        completionDate: dto.completionDate,
      },
    );
    await this.notifyMembersOfChange(userId, task, { status: dto.status });

    return this.findOne(userId, taskId);
  }

  async updateProgress(userId: string, taskId: string, dto: TaskProgressDto) {
    await this.getTaskForUser(userId, taskId);
    await this.db
      .update(tasks)
      .set({ progress: dto.progress, updatedAt: new Date() })
      .where(eq(tasks.id, taskId));
    await this.addActivity(
      userId,
      taskId,
      'progress_updated',
      `Progress updated to ${dto.progress}%`,
    );

    return this.findOne(userId, taskId);
  }

  async listLabels(userId: string, taskId: string) {
    const task = await this.getTaskForUser(userId, taskId, 'viewer');
    return this.toLabelEntities(task.labels);
  }

  async addLabel(userId: string, taskId: string, dto: TaskLabelDto) {
    const task = await this.getTaskForUser(userId, taskId);
    const labelName = this.normalizeLabelName(dto.name);

    if (!labelName) {
      throw new BadRequestException('Label name is required.');
    }

    const labels = this.toLabelEntities(task.labels);
    const exists = labels.some(
      (label) =>
        label.name.toLocaleLowerCase() === labelName.toLocaleLowerCase(),
    );

    if (exists) {
      throw new ConflictException('This label already exists on this task.');
    }

    const updatedLabels = [...labels, this.toLabelEntity(labelName)];

    await this.db
      .update(tasks)
      .set({
        labels: updatedLabels.map((label) => label.name),
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));

    await this.addActivity(
      userId,
      taskId,
      'label_added',
      `Label added: ${labelName}`,
    );

    return updatedLabels;
  }

  async removeLabel(userId: string, taskId: string, labelId: string) {
    const task = await this.getTaskForUser(userId, taskId);
    const decodedLabelId = decodeURIComponent(labelId);
    const labels = this.toLabelEntities(task.labels);
    const updatedLabels = labels.filter(
      (label) =>
        label.id !== decodedLabelId &&
        label.name.toLocaleLowerCase() !== decodedLabelId.toLocaleLowerCase(),
    );

    if (updatedLabels.length === labels.length) {
      throw new NotFoundException('Label not found.');
    }

    await this.db
      .update(tasks)
      .set({
        labels: updatedLabels.map((label) => label.name),
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));

    await this.addActivity(userId, taskId, 'label_removed', 'Label removed');

    return updatedLabels;
  }

  async updateTimeEstimation(
    userId: string,
    taskId: string,
    dto: TaskTimeEstimationDto,
  ) {
    await this.getTaskForUser(userId, taskId);

    const estimatedTimeMinutes = this.hoursToMinutes(dto.estimatedHours);
    const spentTimeMinutes = this.hoursToMinutes(dto.spentHours);
    const remainingTimeMinutes = this.calculateRemainingMinutes(
      estimatedTimeMinutes,
      spentTimeMinutes,
    );

    await this.db
      .update(tasks)
      .set({
        estimatedTimeMinutes,
        spentTimeMinutes,
        remainingTimeMinutes,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));

    await this.addActivity(
      userId,
      taskId,
      'time_estimation_updated',
      'Time estimation updated',
    );

    return this.toTimeEstimationEntity({
      estimatedTimeMinutes,
      spentTimeMinutes,
      remainingTimeMinutes,
    });
  }

  async listSubtasks(
    userId: string,
    taskId: string,
    query?: { view?: SubtaskView; assigneeId?: string | null },
  ) {
    // Visibility-aware, backend-enforced list. Any accepted collaborator may
    // call it (min role viewer); the role-based rule + optional refinement
    // (see subtask-visibility.ts) decide what actually comes back — this is
    // where the owner's server-side "by member" filter is enforced.
    const access = await this.access.require(userId, taskId, 'viewer');
    const rows = await this.db
      .select()
      .from(subtasks)
      .where(eq(subtasks.taskId, taskId))
      .orderBy(asc(subtasks.orderIndex), asc(subtasks.createdAt));

    const visible = filterVisibleSubtasks(rows, {
      userId,
      role: access.role,
      view: query?.view,
      assigneeId: query?.assigneeId,
    });
    return visible.map((row) => this.toSubtaskEntity(row));
  }

  async addSubtask(userId: string, taskId: string, dto: SubtaskDto) {
    await this.getTaskForUser(userId, taskId);
    const existing = await this.db
      .select()
      .from(subtasks)
      .where(eq(subtasks.taskId, taskId));

    const [created] = await this.db
      .insert(subtasks)
      .values(
        this.toSubtaskInsert(taskId, dto, dto.orderIndex ?? existing.length),
      )
      .returning();

    if (dto.dependencyIds?.length) {
      await this.replaceSubtaskDependencies(
        taskId,
        created.id,
        dto.dependencyIds,
      );
    }

    await this.recalculateProgress(userId, taskId);
    await this.addActivity(userId, taskId, 'subtask_added', 'Subtask added');

    return this.findOne(userId, taskId);
  }

  async updateSubtask(
    userId: string,
    taskId: string,
    subtaskId: string,
    dto: Partial<SubtaskDto>,
  ) {
    const access = await this.access.require(userId, taskId, 'editor');
    const current = await this.getSubtaskForTask(taskId, subtaskId);
    this.assertCanModifySubtask(access.role, userId, current);

    // Resolve the target status. `isDone` remains the legacy checkbox source
    // of truth, so keep the two in sync in both directions.
    let nextStatus: SubtaskStatus =
      (dto.status as SubtaskStatus | undefined) ??
      (dto.isDone === true
        ? 'done'
        : dto.isDone === false
          ? 'todo'
          : (current.status as SubtaskStatus));

    // Smart behavior: a subtask cannot be started or completed while any of
    // its dependencies are still open. It is forced/kept in "blocked" instead.
    if (nextStatus === 'in_progress' || nextStatus === 'done') {
      const blocked = await this.hasOpenDependencies(subtaskId);
      if (blocked) {
        throw new BadRequestException(
          'Complete this subtask’s dependencies before starting it.',
        );
      }
    }

    const nextIsDone = nextStatus === 'done';
    const wasDone = current.isDone;

    // Reminder lifecycle. Backend owns the status field; the mobile client
    // schedules/cancels the actual local notification off these values.
    let reminderStatus = current.reminderStatus;
    let reminderSentAt: Date | null | undefined = undefined;
    const reminderEnabled = dto.reminderEnabled ?? current.reminderEnabled;
    const dueChanged =
      dto.dueDate !== undefined &&
      new Date(dto.dueDate).getTime() !== (current.dueDate?.getTime() ?? NaN);
    const reminderConfigChanged =
      dto.reminderMinutesBeforeDue !== undefined ||
      dto.reminderTime !== undefined ||
      dto.reminderEnabled !== undefined ||
      dueChanged;

    if (nextIsDone && !wasDone && current.reminderStatus === 'scheduled') {
      // Completed before the reminder fired — cancel it.
      reminderStatus = 'cancelled';
    } else if (reminderEnabled && reminderConfigChanged && !nextIsDone) {
      // (Re)schedule whenever the due date or reminder config changes.
      reminderStatus = 'scheduled';
      reminderSentAt = null;
    } else if (!reminderEnabled) {
      reminderStatus = 'none';
    }

    await this.db
      .update(subtasks)
      .set({
        title: dto.title?.trim(),
        isDone: dto.isDone ?? nextIsDone,
        orderIndex: dto.orderIndex,
        assignee: dto.assignee,
        assigneeUserId: dto.assigneeUserId,
        isShared: dto.isShared,
        description: dto.description,
        priority: dto.priority,
        status: nextStatus,
        startDate:
          dto.startDate !== undefined
            ? dto.startDate
              ? new Date(dto.startDate)
              : null
            : undefined,
        dueDate:
          dto.dueDate !== undefined
            ? dto.dueDate
              ? new Date(dto.dueDate)
              : null
            : undefined,
        estimatedDurationMinutes: dto.estimatedDurationMinutes,
        actualDurationMinutes: dto.actualDurationMinutes,
        estimatedDurationSource: dto.estimatedDurationSource,
        reminderEnabled: dto.reminderEnabled,
        reminderMinutesBeforeDue: dto.reminderMinutesBeforeDue,
        reminderTime:
          dto.reminderTime !== undefined
            ? dto.reminderTime
              ? new Date(dto.reminderTime)
              : null
            : undefined,
        reminderStatus,
        reminderSentAt,
        notes: dto.notes,
        tags: dto.tags,
        // Stamp/clear completion time on the done<->not-done transition only.
        completedAt: nextIsDone
          ? wasDone
            ? undefined
            : new Date()
          : null,
        updatedAt: new Date(),
      })
      .where(and(eq(subtasks.id, subtaskId), eq(subtasks.taskId, taskId)));

    if (dto.dependencyIds !== undefined) {
      await this.replaceSubtaskDependencies(
        taskId,
        subtaskId,
        dto.dependencyIds,
      );
    }

    await this.recalculateProgress(userId, taskId);
    await this.addActivity(
      userId,
      taskId,
      nextIsDone && !wasDone ? 'subtask_completed' : 'subtask_updated',
      nextIsDone && !wasDone ? 'Subtask completed' : 'Subtask updated',
    );

    if (nextIsDone && !wasDone) {
      const recipients = await this.access.getRecipientIds(taskId);
      if (recipients.length > 1) {
        const name = await this.getActorName(userId);
        await this.notifications.createMany(
          recipients.map((recipientId) => ({
            userId: recipientId,
            type: 'subtask_completed' as const,
            actorId: userId,
            taskId,
            title: 'Subtask completed',
            body: `${name} completed the subtask "${current.title}".`,
          })),
          userId,
        );
      }
    }

    return this.findOne(userId, taskId);
  }

  async setSubtaskDependencies(
    userId: string,
    taskId: string,
    subtaskId: string,
    dto: SubtaskDependencyDto,
  ) {
    const access = await this.access.require(userId, taskId, 'editor');
    const current = await this.getSubtaskForTask(taskId, subtaskId);
    this.assertCanModifySubtask(access.role, userId, current);
    await this.replaceSubtaskDependencies(
      taskId,
      subtaskId,
      dto.dependsOnSubtaskIds,
    );
    await this.addActivity(
      userId,
      taskId,
      'subtask_updated',
      'Subtask dependencies updated',
    );

    return this.findOne(userId, taskId);
  }

  /**
   * Replaces the dependency set for one subtask. Validates that every
   * dependency is a sibling subtask of the same parent task and rejects
   * self-references and direct cycles.
   */
  private async replaceSubtaskDependencies(
    taskId: string,
    subtaskId: string,
    dependsOnIds: string[],
  ) {
    const unique = [...new Set(dependsOnIds)].filter((id) => id !== subtaskId);

    if (unique.length) {
      const siblings = await this.db
        .select({ id: subtasks.id })
        .from(subtasks)
        .where(and(eq(subtasks.taskId, taskId), inArray(subtasks.id, unique)));

      if (siblings.length !== unique.length) {
        throw new BadRequestException(
          'Dependencies must be subtasks of the same task.',
        );
      }

      // Reject a direct cycle: A depends on B while B already depends on A.
      const reverse = await this.db
        .select()
        .from(subtaskDependencies)
        .where(
          and(
            eq(subtaskDependencies.dependsOnSubtaskId, subtaskId),
            inArray(subtaskDependencies.subtaskId, unique),
          ),
        );
      if (reverse.length) {
        throw new BadRequestException(
          'Circular subtask dependencies are not allowed.',
        );
      }
    }

    await this.db
      .delete(subtaskDependencies)
      .where(eq(subtaskDependencies.subtaskId, subtaskId));

    if (unique.length) {
      await this.db.insert(subtaskDependencies).values(
        unique.map((dependsOnSubtaskId) => ({
          subtaskId,
          dependsOnSubtaskId,
        })),
      );
    }
  }

  /** True when the subtask has at least one dependency that isn't done yet. */
  private async hasOpenDependencies(subtaskId: string): Promise<boolean> {
    const deps = await this.db
      .select({ status: subtasks.status })
      .from(subtaskDependencies)
      .innerJoin(
        subtasks,
        eq(subtasks.id, subtaskDependencies.dependsOnSubtaskId),
      )
      .where(eq(subtaskDependencies.subtaskId, subtaskId));

    return deps.some((dep) => dep.status !== 'done');
  }

  async reorderSubtasks(
    userId: string,
    taskId: string,
    dto: SubtaskReorderDto,
  ) {
    await this.getTaskForUser(userId, taskId);
    const rows = await this.db
      .select()
      .from(subtasks)
      .where(eq(subtasks.taskId, taskId));

    const existingIds = new Set(rows.map((row) => row.id));
    const uniqueIds = [...new Set(dto.subtaskIds)];

    if (
      uniqueIds.length !== rows.length ||
      uniqueIds.some((id) => !existingIds.has(id))
    ) {
      throw new BadRequestException(
        'Subtask order must include every subtask of this task exactly once.',
      );
    }

    await Promise.all(
      uniqueIds.map((subtaskId, index) =>
        this.db
          .update(subtasks)
          .set({ orderIndex: index, updatedAt: new Date() })
          .where(and(eq(subtasks.id, subtaskId), eq(subtasks.taskId, taskId))),
      ),
    );

    await this.addActivity(
      userId,
      taskId,
      'subtasks_reordered',
      'Subtasks reordered',
    );

    return this.findOne(userId, taskId);
  }

  async deleteSubtask(userId: string, taskId: string, subtaskId: string) {
    const access = await this.access.require(userId, taskId, 'editor');
    const current = await this.getSubtaskForTask(taskId, subtaskId);
    this.assertCanModifySubtask(access.role, userId, current);
    await this.db
      .delete(subtasks)
      .where(and(eq(subtasks.id, subtaskId), eq(subtasks.taskId, taskId)));
    await this.recalculateProgress(userId, taskId);
    await this.addActivity(
      userId,
      taskId,
      'subtask_deleted',
      'Subtask deleted',
    );

    return this.findOne(userId, taskId);
  }

  async addDependencies(
    userId: string,
    taskId: string,
    dto: DependencyTaskIdsDto,
  ) {
    await this.getTaskForUser(userId, taskId);
    const uniqueIds = [...new Set(dto.dependencyTaskIds)];

    if (!uniqueIds.length) {
      throw new BadRequestException('Select at least one dependency task.');
    }

    for (const dependencyTaskId of uniqueIds) {
      await this.assertCanAddDependency(userId, taskId, dependencyTaskId);
    }

    await this.db
      .insert(taskDependencies)
      .values(
        uniqueIds.map((dependencyTaskId) => ({
          taskId,
          dependencyTaskId,
        })),
      )
      .onConflictDoNothing();

    await this.addActivity(
      userId,
      taskId,
      'dependency_added',
      'Dependency added',
      { dependencyTaskIds: uniqueIds },
    );

    return this.findOne(userId, taskId);
  }

  async listDependencies(userId: string, taskId: string) {
    await this.getTaskForUser(userId, taskId);
    return this.getDependencies(userId, taskId);
  }

  async replaceDependency(
    userId: string,
    taskId: string,
    dependencyTaskId: string,
    dto: ReplaceDependencyDto,
  ) {
    await this.getTaskForUser(userId, taskId);
    await this.getTaskForUser(userId, dependencyTaskId, 'viewer');
    await this.assertCanAddDependency(userId, taskId, dto.replacementTaskId);

    await this.db
      .delete(taskDependencies)
      .where(
        and(
          eq(taskDependencies.taskId, taskId),
          eq(taskDependencies.dependencyTaskId, dependencyTaskId),
        ),
      );
    await this.addDependencies(userId, taskId, {
      dependencyTaskIds: [dto.replacementTaskId],
    });

    return this.findOne(userId, taskId);
  }

  async removeDependency(
    userId: string,
    taskId: string,
    dependencyTaskId: string,
  ) {
    await this.getTaskForUser(userId, taskId);
    await this.getTaskForUser(userId, dependencyTaskId, 'viewer');
    await this.db
      .delete(taskDependencies)
      .where(
        and(
          eq(taskDependencies.taskId, taskId),
          eq(taskDependencies.dependencyTaskId, dependencyTaskId),
        ),
      );
    await this.addActivity(
      userId,
      taskId,
      'dependency_removed',
      'Dependency removed',
      { dependencyTaskId },
    );

    return this.findOne(userId, taskId);
  }

  async saveRecurrence(userId: string, taskId: string, dto: TaskRecurrenceDto) {
    await this.getTaskForUser(userId, taskId);
    this.validateRecurrence(dto);
    await this.upsertRecurrence(taskId, dto);
    await this.addActivity(
      userId,
      taskId,
      'recurrence_saved',
      'Recurrence saved',
    );

    return this.findOne(userId, taskId);
  }

  async getRecurrence(userId: string, taskId: string) {
    await this.getTaskForUser(userId, taskId);
    const recurrence = await this.db.query.taskRecurrenceRules.findFirst({
      where: eq(taskRecurrenceRules.taskId, taskId),
    });

    return recurrence ? this.toRecurrenceEntity(recurrence) : null;
  }

  async removeRecurrence(userId: string, taskId: string) {
    await this.getTaskForUser(userId, taskId);
    await this.db
      .delete(taskRecurrenceRules)
      .where(eq(taskRecurrenceRules.taskId, taskId));
    await this.addActivity(
      userId,
      taskId,
      'recurrence_removed',
      'Recurrence removed',
    );

    return this.findOne(userId, taskId);
  }

  async listActivity(userId: string, taskId: string) {
    // Any member (viewer+) sees the full shared timeline — activity is no
    // longer filtered to the caller's own actions.
    await this.getTaskForUser(userId, taskId, 'viewer');
    const activities = await this.db
      .select()
      .from(taskActivities)
      .where(eq(taskActivities.taskId, taskId))
      .orderBy(desc(taskActivities.createdAt));

    return activities.map((row) => this.toActivityEntity(row));
  }

  /**
   * Authorizes the caller for a task and returns the row. Access now spans the
   * owner AND accepted collaborators: `minRole` gates the action (viewer for
   * reads, editor for edits, owner for delete/transfer). A personal task's
   * owner satisfies every role, so single-user behaviour is unchanged.
   */
  private async getTaskForUser(
    userId: string,
    taskId: string,
    minRole: TaskRole = 'editor',
  ) {
    const { task } = await this.access.require(userId, taskId, minRole);
    return task;
  }

  /**
   * Map of taskId -> the user's accepted role, for every task shared *with*
   * them (i.e. not owned by them). Used both to widen the list query and to
   * apply per-task subtask visibility in the list view.
   */
  private async getAcceptedMemberRoleMap(
    userId: string,
  ): Promise<Map<string, ViewerRole>> {
    const rows = await this.db
      .select({ taskId: taskMembers.taskId, role: taskMembers.role })
      .from(taskMembers)
      .where(
        and(
          eq(taskMembers.userId, userId),
          eq(taskMembers.status, 'accepted'),
        ),
      );
    return new Map(
      rows.map((row) => [
        row.taskId,
        (row.role === 'editor' || row.role === 'viewer'
          ? row.role
          : 'viewer') as ViewerRole,
      ]),
    );
  }

  /**
   * Write guard: an editor may only mutate shared, unassigned, or their own
   * personal subtasks — never another member's personal subtask. Owners are
   * unrestricted. Mirrors the read-side base visibility rule.
   */
  private assertCanModifySubtask(
    role: ViewerRole,
    userId: string,
    subtask: SubtaskRow,
  ) {
    if (!canModifySubtask(subtask, { userId, role })) {
      throw new ForbiddenException(
        'You can only edit shared, unassigned, or your own subtasks.',
      );
    }
  }

  private async getSubtaskForTask(taskId: string, subtaskId: string) {
    const [subtask] = await this.db
      .select()
      .from(subtasks)
      .where(and(eq(subtasks.id, subtaskId), eq(subtasks.taskId, taskId)));

    if (!subtask) {
      throw new NotFoundException('Subtask not found.');
    }

    return subtask;
  }

  private async toEntity(task: TaskRow, viewer: SubtaskViewer) {
    const [subtaskRows, dependencies, recurrence, activities] =
      await Promise.all([
        this.db
          .select()
          .from(subtasks)
          .where(eq(subtasks.taskId, task.id))
          .orderBy(asc(subtasks.orderIndex), asc(subtasks.createdAt)),
        this.getDependencies(task.userId, task.id),
        this.db.query.taskRecurrenceRules.findFirst({
          where: eq(taskRecurrenceRules.taskId, task.id),
        }),
        this.db
          .select()
          .from(taskActivities)
          .where(eq(taskActivities.taskId, task.id))
          .orderBy(desc(taskActivities.createdAt)),
      ]);

    const subtaskDepsBySubtaskId = await this.getSubtaskDepsMap(
      subtaskRows.map((row) => row.id),
    );

    return this.assembleEntity(
      task,
      {
        subtaskRows,
        dependencies,
        recurrence,
        activities,
        subtaskDepsBySubtaskId,
      },
      viewer,
    );
  }

  private async assembleEntity(
    task: TaskRow,
    related: TaskRelatedRows,
    viewer: SubtaskViewer,
  ) {
    const {
      subtaskRows,
      dependencies,
      recurrence,
      activities,
      subtaskDepsBySubtaskId,
    } = related;

    // Role-aware visibility: the whole-task status/progress logic below keeps
    // using the FULL subtaskRows (progress stays authoritative), but only the
    // subset this viewer is allowed to see is emitted in `subtasks`.
    const visibleSubtaskRows = filterVisibleSubtasks(subtaskRows, viewer);

    const dependenciesComplete =
      dependencies.length > 0 &&
      dependencies.every((dependency) => dependency.status === 'done');

    // Self-heals any task whose stored "done" status has fallen out of sync
    // with its subtasks (e.g. a legacy row from before subtask completion
    // demoted status), so a plain GET/refresh never resurfaces a stale
    // "done" status even if some write path failed to call
    // recalculateProgress.
    let status = task.status;
    if (subtaskRows.length && task.status === 'done') {
      const completed = subtaskRows.filter((row) => row.isDone).length;
      if (completed < subtaskRows.length) {
        status = completed > 0 ? 'in_progress' : 'todo';
        await this.db
          .update(tasks)
          .set({ status, updatedAt: new Date() })
          .where(eq(tasks.id, task.id));
      }
    }

    return {
      id: task.id,
      userId: task.userId,
      title: task.title,
      description: task.description ?? '',
      priority: task.priority,
      status,
      progress: task.progress,
      dueDate: task.dueDate?.toISOString(),
      dueTime: task.dueTime ?? '',
      category: task.category ?? '',
      notes: task.notes ?? '',
      estimatedTimeMinutes: task.estimatedTimeMinutes,
      spentTimeMinutes: task.spentTimeMinutes,
      remainingTimeMinutes: task.remainingTimeMinutes,
      reminderEnabled: task.reminderEnabled,
      reminderBeforeMinutes: task.reminderBeforeMinutes ?? undefined,
      labels: this.normalizeLabelNames(
        this.toLabelEntities(task.labels).map((label) => label.name),
      ),
      labelDetails: this.toLabelEntities(task.labels),
      attachments: (task.attachments as unknown[] | null) ?? [],
      ...this.toTimeEstimationEntity(task),
      isFavorite: task.isFavorite,
      isFocusTask: task.isFocusTask,
      isBlocked:
        dependencies.length > 0 &&
        dependencies.some((dependency) => dependency.status !== 'done'),
      dependenciesComplete,
      subtasks: visibleSubtaskRows.map((row) =>
        this.toSubtaskEntity(row, subtaskDepsBySubtaskId?.get(row.id) ?? []),
      ),
      dependencies,
      recurrence: recurrence ? this.toRecurrenceEntity(recurrence) : null,
      activities: activities.map((row) => this.toActivityEntity(row)),
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }

  private toSubtaskEntity(row: SubtaskRow, dependencyIds: string[] = []) {
    return {
      id: row.id,
      taskId: row.taskId,
      title: row.title,
      isDone: row.isDone,
      orderIndex: row.orderIndex,
      assignee: row.assignee ?? '',
      assigneeUserId: row.assigneeUserId ?? undefined,
      isShared: row.isShared,
      description: row.description ?? '',
      priority: row.priority,
      status: row.status,
      startDate: row.startDate?.toISOString(),
      dueDate: row.dueDate?.toISOString(),
      estimatedDurationMinutes: row.estimatedDurationMinutes ?? undefined,
      actualDurationMinutes: row.actualDurationMinutes ?? undefined,
      estimatedDurationSource: row.estimatedDurationSource,
      reminderEnabled: row.reminderEnabled,
      reminderMinutesBeforeDue: row.reminderMinutesBeforeDue ?? undefined,
      reminderTime: row.reminderTime?.toISOString(),
      reminderSentAt: row.reminderSentAt?.toISOString(),
      reminderStatus: row.reminderStatus,
      notes: row.notes ?? '',
      tags: (row.tags as string[] | null) ?? [],
      dependencyIds,
      completedAt: row.completedAt?.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /**
   * Batch-loads subtask dependency links for a set of subtask ids and returns
   * a map of subtaskId -> ids of the sibling subtasks it depends on. Avoids an
   * N+1 when assembling task lists.
   */
  private async getSubtaskDepsMap(
    subtaskIds: string[],
  ): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (!subtaskIds.length) return map;

    const links = await this.db
      .select()
      .from(subtaskDependencies)
      .where(inArray(subtaskDependencies.subtaskId, subtaskIds));

    for (const link of links) {
      const existing = map.get(link.subtaskId);
      if (existing) existing.push(link.dependsOnSubtaskId);
      else map.set(link.subtaskId, [link.dependsOnSubtaskId]);
    }

    return map;
  }

  private toRecurrenceEntity(row: RecurrenceRow) {
    const weekdays = (row.weekdays as string[] | null) ?? [];
    const recurrence = {
      frequency: row.frequency,
      weekdays,
      monthlyMode: row.monthlyMode ?? 'sameDay',
      customInterval: row.customInterval,
      customUnit: row.customUnit,
      endType: row.endType,
      endDate: row.endDate ?? '',
      occurrences: row.occurrences ?? 1,
    };

    return {
      id: row.id,
      taskId: row.taskId,
      ...recurrence,
      summary: this.createRecurrenceSummary(recurrence),
      nextOccurrenceDate: this.getNextOccurrenceDate(recurrence),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toActivityEntity(row: ActivityRow) {
    return {
      id: row.id,
      taskId: row.taskId,
      action: row.action,
      description: row.description,
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toTimeEstimationEntity(
    task: Pick<
      TaskRow,
      'estimatedTimeMinutes' | 'spentTimeMinutes' | 'remainingTimeMinutes'
    >,
  ) {
    const estimatedHours = this.minutesToHours(task.estimatedTimeMinutes);
    const spentHours = this.minutesToHours(task.spentTimeMinutes);
    const remainingHours = Math.max(
      this.minutesToHours(task.remainingTimeMinutes),
      0,
    );
    const progressPercentage =
      estimatedHours > 0 ? Math.round((spentHours / estimatedHours) * 100) : 0;

    return {
      estimatedHours,
      spentHours,
      remainingHours,
      progressPercentage,
    };
  }

  private toLabelEntities(value: unknown): TaskLabel[] {
    if (!Array.isArray(value)) return [];

    return this.normalizeLabelNames(
      value
        .map((item) => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object' && 'name' in item) {
            const name = (item as Record<string, unknown>).name;
            if (typeof name === 'string') return name;
          }

          return '';
        })
        .filter(Boolean),
    ).map((name) => this.toLabelEntity(name));
  }

  private toLabelEntity(name: string): TaskLabel {
    return {
      id: this.toLabelId(name),
      name,
    };
  }

  private normalizeLabelNames(labels?: string[] | null): string[] {
    const names =
      labels?.map((label) => this.normalizeLabelName(label)).filter(Boolean) ??
      [];
    const seen = new Set<string>();

    return names.filter((name) => {
      const key = name.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private normalizeLabelName(label: string) {
    return label.trim().replace(/\s+/g, ' ').slice(0, 60);
  }

  private toLabelId(label: string) {
    return (
      label
        .trim()
        .toLocaleLowerCase()
        .replace(/[^a-z0-9\u0600-\u06ff]+/gi, '-')
        .replace(/^-+|-+$/g, '') || encodeURIComponent(label)
    );
  }

  private calculateRemainingMinutes(
    estimatedMinutes: number,
    spentMinutes: number,
  ) {
    return Math.max(estimatedMinutes - spentMinutes, 0);
  }

  private hoursToMinutes(hours: number) {
    return Math.round(hours * 60);
  }

  private minutesToHours(minutes: number) {
    return Math.round((minutes / 60) * 100) / 100;
  }

  private createRecurrenceSummary(recurrence: {
    frequency: string;
    weekdays?: string[];
    monthlyMode?: string | null;
    customInterval?: number;
    customUnit?: string;
    endType?: string;
    endDate?: string | null;
    occurrences?: number | null;
  }) {
    if (recurrence.frequency === 'Never') return 'No repeat';

    let summary = '';
    if (recurrence.frequency === 'Daily') summary = 'Every day';
    if (recurrence.frequency === 'Weekly') {
      summary = recurrence.weekdays?.length
        ? `Every ${recurrence.weekdays.join(', ')}`
        : 'Every week';
    }
    if (recurrence.frequency === 'Monthly') {
      if (recurrence.monthlyMode === 'lastDay') {
        summary = 'Every last day of the month';
      } else if (
        recurrence.monthlyMode === 'firstWeekday' &&
        recurrence.weekdays?.length
      ) {
        summary = `Every first ${recurrence.weekdays[0]} of the month`;
      } else {
        summary = 'Every month';
      }
    }
    if (recurrence.frequency === 'Yearly') summary = 'Every year';
    if (recurrence.frequency === 'Custom') {
      summary = `Every ${recurrence.customInterval ?? 1} ${recurrence.customUnit ?? 'weeks'}`;
      if (recurrence.customUnit === 'weeks' && recurrence.weekdays?.length) {
        summary += ` on ${recurrence.weekdays.join(', ')}`;
      }
      if (
        recurrence.customUnit === 'months' &&
        recurrence.monthlyMode === 'firstWeekday' &&
        recurrence.weekdays?.length
      ) {
        summary += ` on the first ${recurrence.weekdays[0]}`;
      }
    }

    if (recurrence.endType === 'date' && recurrence.endDate) {
      summary += ` until ${recurrence.endDate}`;
    }
    if (recurrence.endType === 'occurrences' && recurrence.occurrences) {
      summary += ` for ${recurrence.occurrences} occurrences`;
    }

    return summary || 'Repeats';
  }

  private getNextOccurrenceDate(recurrence: {
    frequency: string;
    weekdays?: string[];
  }) {
    if (recurrence.frequency === 'Never') return null;

    const next = new Date();
    next.setHours(0, 0, 0, 0);

    if (recurrence.frequency === 'Daily') {
      next.setDate(next.getDate() + 1);
      return next.toISOString();
    }

    if (recurrence.frequency === 'Weekly' && recurrence.weekdays?.length) {
      const weekdayIndexes: Record<string, number> = {
        Sunday: 0,
        Monday: 1,
        Tuesday: 2,
        Wednesday: 3,
        Thursday: 4,
        Friday: 5,
        Saturday: 6,
      };
      const today = next.getDay();
      const offsets = recurrence.weekdays
        .map((day) => weekdayIndexes[day])
        .filter((day): day is number => day !== undefined)
        .map((day) => {
          const offset = day - today;
          return offset > 0 ? offset : offset + 7;
        });
      if (!offsets.length) {
        next.setDate(next.getDate() + 7);
        return next.toISOString();
      }
      next.setDate(next.getDate() + Math.min(...offsets));
      return next.toISOString();
    }

    if (recurrence.frequency === 'Monthly') next.setMonth(next.getMonth() + 1);
    else if (recurrence.frequency === 'Yearly')
      next.setFullYear(next.getFullYear() + 1);
    else next.setDate(next.getDate() + 7);

    return next.toISOString();
  }

  private async getDependencies(
    userId: string,
    taskId: string,
  ): Promise<DependencyEntity[]> {
    const rows = await this.db
      .select()
      .from(taskDependencies)
      .where(eq(taskDependencies.taskId, taskId));

    const dependencyIds = rows.map((row) => row.dependencyTaskId);

    if (!dependencyIds.length) return [];

    const dependencyTasks = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, userId), inArray(tasks.id, dependencyIds)));

    return dependencyTasks.map((task) => this.toDependencyEntity(task));
  }

  private toDependencyEntity(task: TaskRow): DependencyEntity {
    return {
      id: task.id,
      title: task.title,
      category: task.category ?? '',
      status: task.status,
      dueDate: task.dueDate?.toISOString(),
      priority: task.priority,
      progress: task.progress,
    };
  }

  private toSubtaskInsert(taskId: string, dto: SubtaskDto, index: number) {
    const status: SubtaskStatus =
      dto.status ?? (dto.isDone ? 'done' : 'todo');
    const isDone = dto.isDone ?? status === 'done';
    return {
      taskId,
      title: dto.title.trim(),
      isDone,
      orderIndex: dto.orderIndex ?? index,
      assignee: dto.assignee?.trim() || null,
      assigneeUserId: dto.assigneeUserId ?? null,
      isShared: dto.isShared ?? false,
      description: dto.description?.trim() || null,
      priority: dto.priority ?? 'medium',
      status,
      startDate: dto.startDate ? new Date(dto.startDate) : null,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      estimatedDurationMinutes: dto.estimatedDurationMinutes ?? null,
      actualDurationMinutes: dto.actualDurationMinutes ?? null,
      estimatedDurationSource: dto.estimatedDurationSource ?? 'user',
      reminderEnabled: dto.reminderEnabled ?? false,
      reminderMinutesBeforeDue: dto.reminderMinutesBeforeDue ?? null,
      reminderTime: dto.reminderTime ? new Date(dto.reminderTime) : null,
      reminderStatus: dto.reminderEnabled ? 'scheduled' : 'none',
      notes: dto.notes?.trim() || null,
      tags: dto.tags?.length ? dto.tags : null,
      completedAt: isDone ? new Date() : null,
    };
  }

  private validateTaskPayload(
    dto: Partial<CreateTaskDto | UpdateTaskDto>,
    partial = false,
  ) {
    if (!partial || dto.title !== undefined) {
      if (!dto.title?.trim()) {
        throw new BadRequestException('Task title is required.');
      }
    }

    if (dto.dueDate && Number.isNaN(new Date(dto.dueDate).getTime())) {
      throw new BadRequestException('Due date must be valid.');
    }
  }

  private validateRecurrence(dto?: TaskRecurrenceDto | null) {
    if (!dto || dto.frequency === 'Never') return;

    if (dto.frequency === 'Weekly' && !dto.weekdays?.length) {
      throw new BadRequestException(
        'Weekly recurrence must include at least one weekday.',
      );
    }

    if (
      dto.frequency === 'Custom' &&
      (!dto.customInterval || dto.customInterval <= 0)
    ) {
      throw new BadRequestException(
        'Custom recurrence interval must be greater than 0.',
      );
    }

    if (
      dto.frequency === 'Custom' &&
      dto.customUnit === 'weeks' &&
      !dto.weekdays?.length
    ) {
      throw new BadRequestException(
        'Weekly custom recurrence must include at least one weekday.',
      );
    }

    if (
      (dto.frequency === 'Monthly' ||
        (dto.frequency === 'Custom' && dto.customUnit === 'months')) &&
      dto.monthlyMode === 'firstWeekday' &&
      !dto.weekdays?.length
    ) {
      throw new BadRequestException(
        'First-weekday monthly recurrence must include a weekday.',
      );
    }

    if (dto.endType === 'date' && !dto.endDate) {
      throw new BadRequestException('End date is required.');
    }

    if (
      dto.endType === 'occurrences' &&
      (!dto.occurrences || dto.occurrences <= 0)
    ) {
      throw new BadRequestException('Occurrences must be greater than 0.');
    }
  }

  /**
   * Subtasks are the source of truth for progress whenever they exist —
   * even a "done" task shows less than 100% if a subtask is incomplete.
   * Only tasks with no subtasks fall back to a status-derived percentage.
   *
   * A "done" status is only valid while subtasks are all complete (this is
   * also enforced up-front by assertSubtasksComplete when a caller tries to
   * set status = done). If a subtask is unchecked after the task was marked
   * done, that would otherwise leave a stale "done" status paired with a
   * <100% progress — so here we demote the stored status back to
   * in_progress/todo whenever subtasks fall out of sync with it.
   */
  private async recalculateProgress(userId: string, taskId: string) {
    const task = await this.getTaskForUser(userId, taskId);

    const subtaskRows = await this.db
      .select()
      .from(subtasks)
      .where(eq(subtasks.taskId, taskId));

    if (subtaskRows.length) {
      const completed = subtaskRows.filter((row) => row.isDone).length;
      const allComplete = completed === subtaskRows.length;
      const progress = Math.round((completed / subtaskRows.length) * 100);

      // Smart behavior: promote the parent to "done" once every subtask is
      // complete, and demote a stale "done" back to in_progress/todo when a
      // subtask is reopened.
      let correctedStatus: TaskStatus | undefined;
      if (allComplete && task.status !== 'done') {
        correctedStatus = 'done';
      } else if (task.status === 'done' && !allComplete) {
        correctedStatus = completed > 0 ? 'in_progress' : 'todo';
      }

      await this.setTaskProgress(taskId, progress, correctedStatus);
      return;
    }

    const progress =
      task.status === 'done' ? 100 : task.status === 'in_progress' ? 50 : 0;
    await this.setTaskProgress(taskId, progress);
  }

  private async setTaskProgress(
    taskId: string,
    progress: number,
    status?: TaskStatus,
  ) {
    await this.db
      .update(tasks)
      .set({
        progress,
        ...(status ? { status } : {}),
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));
  }

  private async assertDependenciesComplete(userId: string, taskId: string) {
    const dependencies = await this.getDependencies(userId, taskId);

    if (dependencies.some((dependency) => dependency.status !== 'done')) {
      throw new ConflictException(
        'This task cannot start until all its dependencies are completed.',
      );
    }
  }

  private async assertSubtasksComplete(taskId: string) {
    const subtaskRows = await this.db
      .select()
      .from(subtasks)
      .where(eq(subtasks.taskId, taskId));

    if (subtaskRows.length && subtaskRows.some((row) => !row.isDone)) {
      throw new ConflictException(
        'Complete all subtasks before marking this task as Done.',
      );
    }
  }

  private async assertCanAddDependency(
    userId: string,
    taskId: string,
    dependencyTaskId: string,
  ) {
    if (taskId === dependencyTaskId) {
      throw new BadRequestException('A task cannot depend on itself.');
    }

    await this.getTaskForUser(userId, dependencyTaskId, 'viewer');

    const [existing] = await this.db
      .select()
      .from(taskDependencies)
      .where(
        and(
          eq(taskDependencies.taskId, taskId),
          eq(taskDependencies.dependencyTaskId, dependencyTaskId),
        ),
      );

    if (existing) {
      throw new ConflictException('This dependency already exists.');
    }

    if (await this.hasDependencyPath(dependencyTaskId, taskId)) {
      throw new ConflictException('Circular dependencies are not allowed.');
    }
  }

  private async hasDependencyPath(fromTaskId: string, targetTaskId: string) {
    const visited = new Set<string>();
    const queue = [fromTaskId];

    while (queue.length) {
      const currentId = queue.shift()!;
      if (currentId === targetTaskId) return true;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const rows = await this.db
        .select()
        .from(taskDependencies)
        .where(eq(taskDependencies.taskId, currentId));

      queue.push(...rows.map((row) => row.dependencyTaskId));
    }

    return false;
  }

  private async upsertRecurrence(taskId: string, dto: TaskRecurrenceDto) {
    await this.db
      .insert(taskRecurrenceRules)
      .values({
        taskId,
        frequency: dto.frequency,
        weekdays: dto.weekdays ?? [],
        monthlyMode: dto.monthlyMode ?? null,
        customInterval: dto.customInterval ?? 1,
        customUnit: dto.customUnit ?? 'weeks',
        endType: dto.endType,
        endDate: dto.endDate ?? null,
        occurrences: dto.occurrences ?? null,
      })
      .onConflictDoUpdate({
        target: taskRecurrenceRules.taskId,
        set: {
          frequency: dto.frequency,
          weekdays: dto.weekdays ?? [],
          monthlyMode: dto.monthlyMode ?? null,
          customInterval: dto.customInterval ?? 1,
          customUnit: dto.customUnit ?? 'weeks',
          endType: dto.endType,
          endDate: dto.endDate ?? null,
          occurrences: dto.occurrences ?? null,
          updatedAt: new Date(),
        },
      });
  }

  private async addActivity(
    userId: string,
    taskId: string,
    action: string,
    description: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.db.insert(taskActivities).values({
      userId,
      taskId,
      action,
      description,
      metadata: metadata ?? null,
    });
  }

  private async getActorName(userId: string): Promise<string> {
    const [user] = await this.db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, userId));
    return user?.fullName ?? 'A collaborator';
  }

  /**
   * Fans out change notifications to every OTHER accepted member of a shared
   * task. A no-op for personal tasks (the actor is the only recipient), so
   * single-user flows never touch the notifications table.
   */
  private async notifyMembersOfChange(
    actorId: string,
    task: TaskRow,
    dto: Partial<UpdateTaskDto>,
  ) {
    const recipients = await this.access.getRecipientIds(task.id);
    if (recipients.length <= 1) return;

    const name = await this.getActorName(actorId);
    const events: { type: NotificationType; body: string }[] = [];

    if (dto.status === 'done' && task.status !== 'done') {
      events.push({
        type: 'task_completed',
        body: `${name} completed "${task.title}".`,
      });
    }
    if (dto.dueDate !== undefined) {
      const next = dto.dueDate ? new Date(dto.dueDate).getTime() : null;
      const prev = task.dueDate ? task.dueDate.getTime() : null;
      if (next !== prev) {
        events.push({
          type: 'due_date_changed',
          body: `${name} changed the due date of "${task.title}".`,
        });
      }
    }
    if (dto.priority !== undefined && dto.priority !== task.priority) {
      events.push({
        type: 'priority_changed',
        body: `${name} set the priority of "${task.title}" to ${dto.priority}.`,
      });
    }
    if (!events.length) {
      events.push({
        type: 'task_updated',
        body: `${name} updated "${task.title}".`,
      });
    }

    await this.notifications.createMany(
      events.flatMap((event) =>
        recipients.map((userId) => ({
          userId,
          type: event.type,
          actorId,
          taskId: task.id,
          title: 'Task update',
          body: event.body,
        })),
      ),
      actorId,
    );
  }
}
