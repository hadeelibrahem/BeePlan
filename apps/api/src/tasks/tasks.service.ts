import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import {
  subtasks,
  taskActivities,
  taskDependencies,
  taskRecurrenceRules,
  tasks,
} from '../db/schema';
import type { CreateTaskDto } from './dto/create-task.dto';
import {
  type DependencyTaskIdsDto,
  type ReplaceDependencyDto,
  type SubtaskDto,
  type TaskLabelDto,
  type TaskProgressDto,
  type TaskRecurrenceDto,
  type TaskStatus,
  type TaskStatusDto,
  type TaskTimeEstimationDto,
} from './dto/task-shared.dto';
import type { UpdateTaskDto } from './dto/update-task.dto';

type TaskRow = typeof tasks.$inferSelect;
type SubtaskRow = typeof subtasks.$inferSelect;
type RecurrenceRow = typeof taskRecurrenceRules.$inferSelect;
type ActivityRow = typeof taskActivities.$inferSelect;
type TaskLabel = { id: string; name: string };

@Injectable()
export class TasksService {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  async create(userId: string, dto: CreateTaskDto) {
    this.validateTaskPayload(dto);
    this.validateRecurrence(dto.recurrence ?? undefined);

    const status = dto.status ?? 'todo';
    const progress = status === 'done' ? 100 : dto.progress ?? 0;
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
          this.calculateRemainingMinutes(estimatedTimeMinutes, spentTimeMinutes),
        reminderEnabled: dto.reminderEnabled ?? false,
        reminderBeforeMinutes: dto.reminderBeforeMinutes ?? null,
        labels: this.normalizeLabelNames(dto.labels),
        attachments: dto.attachments ?? null,
        isFavorite: dto.isFavorite ?? false,
      })
      .returning();

    if (dto.subtasks?.length) {
      await this.db.insert(subtasks).values(
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

  async findAll(userId: string) {
    const rows = await this.db
      .select()
      .from(tasks)
      .where(eq(tasks.userId, userId))
      .orderBy(desc(tasks.updatedAt));

    return Promise.all(rows.map((row) => this.toEntity(row)));
  }

  async findOne(userId: string, taskId: string) {
    const task = await this.getTaskForUser(userId, taskId);
    return this.toEntity(task);
  }

  async update(userId: string, taskId: string, dto: UpdateTaskDto) {
    const existingTask = await this.getTaskForUser(userId, taskId);
    this.validateTaskPayload(dto, true);
    this.validateRecurrence(dto.recurrence ?? undefined);

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
    if (dto.estimatedTimeMinutes !== undefined || dto.spentTimeMinutes !== undefined) {
      const estimatedTimeMinutes =
        dto.estimatedTimeMinutes ?? existingTask.estimatedTimeMinutes;
      const spentTimeMinutes = dto.spentTimeMinutes ?? existingTask.spentTimeMinutes;
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

    await this.db
      .update(tasks)
      .set(updateData)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));

    if (dto.recurrence !== undefined) {
      if (!dto.recurrence || dto.recurrence.frequency === 'Never') {
        await this.removeRecurrence(userId, taskId);
      } else {
        await this.upsertRecurrence(taskId, dto.recurrence);
      }
    }

    await this.recalculateProgress(userId, taskId);
    await this.addActivity(userId, taskId, 'updated', 'Task updated');

    return this.findOne(userId, taskId);
  }

  async remove(userId: string, taskId: string) {
    await this.getTaskForUser(userId, taskId);
    await this.db
      .delete(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
  }

  async changeStatus(userId: string, taskId: string, dto: TaskStatusDto) {
    await this.getTaskForUser(userId, taskId);
    const progress =
      dto.status === 'done'
        ? 100
        : dto.progress !== undefined
          ? dto.progress
          : undefined;

    await this.db
      .update(tasks)
      .set({
        status: dto.status,
        progress,
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));

    if (dto.status !== 'done') {
      await this.recalculateProgress(userId, taskId, { keepManual: true });
    }

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

    return this.findOne(userId, taskId);
  }

  async updateProgress(userId: string, taskId: string, dto: TaskProgressDto) {
    await this.getTaskForUser(userId, taskId);
    await this.db
      .update(tasks)
      .set({ progress: dto.progress, updatedAt: new Date() })
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
    await this.addActivity(
      userId,
      taskId,
      'progress_updated',
      `Progress updated to ${dto.progress}%`,
    );

    return this.findOne(userId, taskId);
  }

  async listLabels(userId: string, taskId: string) {
    const task = await this.getTaskForUser(userId, taskId);
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
      (label) => label.name.toLocaleLowerCase() === labelName.toLocaleLowerCase(),
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
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));

    await this.addActivity(userId, taskId, 'label_added', `Label added: ${labelName}`);

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
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));

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
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));

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

  async listSubtasks(userId: string, taskId: string) {
    await this.getTaskForUser(userId, taskId);
    const rows = await this.db
      .select()
      .from(subtasks)
      .where(eq(subtasks.taskId, taskId))
      .orderBy(asc(subtasks.orderIndex), asc(subtasks.createdAt));

    return rows.map((row) => this.toSubtaskEntity(row));
  }

  async addSubtask(userId: string, taskId: string, dto: SubtaskDto) {
    await this.getTaskForUser(userId, taskId);
    const existing = await this.db
      .select()
      .from(subtasks)
      .where(eq(subtasks.taskId, taskId));

    await this.db.insert(subtasks).values(
      this.toSubtaskInsert(taskId, dto, dto.orderIndex ?? existing.length),
    );
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
    await this.getTaskForUser(userId, taskId);
    await this.getSubtaskForTask(taskId, subtaskId);

    await this.db
      .update(subtasks)
      .set({
        title: dto.title?.trim(),
        isDone: dto.isDone,
        orderIndex: dto.orderIndex,
        assignee: dto.assignee,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        status: dto.status ?? (dto.isDone ? 'done' : undefined),
        updatedAt: new Date(),
      })
      .where(and(eq(subtasks.id, subtaskId), eq(subtasks.taskId, taskId)));

    await this.recalculateProgress(userId, taskId);
    await this.addActivity(
      userId,
      taskId,
      dto.isDone === true ? 'subtask_completed' : 'subtask_updated',
      dto.isDone === true ? 'Subtask completed' : 'Subtask updated',
    );

    return this.findOne(userId, taskId);
  }

  async deleteSubtask(userId: string, taskId: string, subtaskId: string) {
    await this.getTaskForUser(userId, taskId);
    await this.getSubtaskForTask(taskId, subtaskId);
    await this.db
      .delete(subtasks)
      .where(and(eq(subtasks.id, subtaskId), eq(subtasks.taskId, taskId)));
    await this.recalculateProgress(userId, taskId);
    await this.addActivity(userId, taskId, 'subtask_deleted', 'Subtask deleted');

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
    await this.getTaskForUser(userId, dependencyTaskId);
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
    await this.getTaskForUser(userId, dependencyTaskId);
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

  async saveRecurrence(
    userId: string,
    taskId: string,
    dto: TaskRecurrenceDto,
  ) {
    await this.getTaskForUser(userId, taskId);
    this.validateRecurrence(dto);
    await this.upsertRecurrence(taskId, dto);
    await this.addActivity(userId, taskId, 'recurrence_saved', 'Recurrence saved');

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
    await this.getTaskForUser(userId, taskId);
    const activities = await this.db
      .select()
      .from(taskActivities)
      .where(and(eq(taskActivities.taskId, taskId), eq(taskActivities.userId, userId)))
      .orderBy(desc(taskActivities.createdAt));

    return activities.map((row) => this.toActivityEntity(row));
  }

  private async getTaskForUser(userId: string, taskId: string) {
    const [task] = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));

    if (!task) {
      throw new NotFoundException('Task not found.');
    }

    return task;
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

  private async toEntity(task: TaskRow) {
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

    const dependenciesComplete =
      dependencies.length > 0 &&
      dependencies.every((dependency) => dependency.status === 'done');

    return {
      id: task.id,
      userId: task.userId,
      title: task.title,
      description: task.description ?? '',
      priority: task.priority,
      status: task.status,
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
      labels: this.normalizeLabelNames(this.toLabelEntities(task.labels).map((label) => label.name)),
      labelDetails: this.toLabelEntities(task.labels),
      attachments: (task.attachments as unknown[] | null) ?? [],
      ...this.toTimeEstimationEntity(task),
      isFavorite: task.isFavorite,
      isBlocked:
        dependencies.length > 0 &&
        dependencies.some((dependency) => dependency.status !== 'done'),
      dependenciesComplete,
      subtasks: subtaskRows.map((row) => this.toSubtaskEntity(row)),
      dependencies,
      recurrence: recurrence ? this.toRecurrenceEntity(recurrence) : null,
      activities: activities.map((row) => this.toActivityEntity(row)),
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }

  private toSubtaskEntity(row: SubtaskRow) {
    return {
      id: row.id,
      taskId: row.taskId,
      title: row.title,
      isDone: row.isDone,
      orderIndex: row.orderIndex,
      assignee: row.assignee ?? '',
      dueDate: row.dueDate?.toISOString(),
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
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
          if (
            item &&
            typeof item === 'object' &&
            'name' in item &&
            typeof item.name === 'string'
          ) {
            return item.name;
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
    const names = labels
      ?.map((label) => this.normalizeLabelName(label))
      .filter(Boolean) ?? [];
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
    return label
      .trim()
      .toLocaleLowerCase()
      .replace(/[^a-z0-9\u0600-\u06ff]+/gi, '-')
      .replace(/^-+|-+$/g, '') || encodeURIComponent(label);
  }

  private calculateRemainingMinutes(estimatedMinutes: number, spentMinutes: number) {
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
    if (recurrence.frequency === 'Monthly') summary = 'Every month';
    if (recurrence.frequency === 'Yearly') summary = 'Every year';
    if (recurrence.frequency === 'Custom') {
      summary = `Every ${recurrence.customInterval ?? 1} ${recurrence.customUnit ?? 'weeks'}`;
      if (recurrence.customUnit === 'weeks' && recurrence.weekdays?.length) {
        summary += ` on ${recurrence.weekdays.join(', ')}`;
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
    else if (recurrence.frequency === 'Yearly') next.setFullYear(next.getFullYear() + 1);
    else next.setDate(next.getDate() + 7);

    return next.toISOString();
  }

  private async getDependencies(userId: string, taskId: string) {
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

    return dependencyTasks.map((task) => ({
      id: task.id,
      title: task.title,
      category: task.category ?? '',
      status: task.status,
      dueDate: task.dueDate?.toISOString(),
      priority: task.priority,
      progress: task.progress,
    }));
  }

  private toSubtaskInsert(taskId: string, dto: SubtaskDto, index: number) {
    return {
      taskId,
      title: dto.title.trim(),
      isDone: dto.isDone ?? false,
      orderIndex: dto.orderIndex ?? index,
      assignee: dto.assignee?.trim() || null,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      status: dto.status ?? (dto.isDone ? 'done' : 'todo'),
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
      throw new BadRequestException('Weekly recurrence must include at least one weekday.');
    }

    if (dto.frequency === 'Custom' && (!dto.customInterval || dto.customInterval <= 0)) {
      throw new BadRequestException('Custom recurrence interval must be greater than 0.');
    }

    if (dto.frequency === 'Custom' && dto.customUnit === 'weeks' && !dto.weekdays?.length) {
      throw new BadRequestException('Weekly custom recurrence must include at least one weekday.');
    }

    if (dto.endType === 'date' && !dto.endDate) {
      throw new BadRequestException('End date is required.');
    }

    if (dto.endType === 'occurrences' && (!dto.occurrences || dto.occurrences <= 0)) {
      throw new BadRequestException('Occurrences must be greater than 0.');
    }
  }

  private async recalculateProgress(
    userId: string,
    taskId: string,
    options: { keepManual?: boolean } = {},
  ) {
    const task = await this.getTaskForUser(userId, taskId);

    if (task.status === 'done') {
      await this.setTaskProgress(taskId, 100);
      return;
    }

    const subtaskRows = await this.db
      .select()
      .from(subtasks)
      .where(eq(subtasks.taskId, taskId));

    if (!subtaskRows.length) {
      if (task.status === 'todo') {
        await this.setTaskProgress(taskId, 0);
      }
      return;
    }

    if (options.keepManual) return;

    const completed = subtaskRows.filter((row) => row.isDone).length;
    await this.setTaskProgress(
      taskId,
      Math.round((completed / subtaskRows.length) * 100),
    );
  }

  private async setTaskProgress(taskId: string, progress: number) {
    await this.db
      .update(tasks)
      .set({ progress, updatedAt: new Date() })
      .where(eq(tasks.id, taskId));
  }

  private async assertCanAddDependency(
    userId: string,
    taskId: string,
    dependencyTaskId: string,
  ) {
    if (taskId === dependencyTaskId) {
      throw new BadRequestException('A task cannot depend on itself.');
    }

    await this.getTaskForUser(userId, dependencyTaskId);

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
}
