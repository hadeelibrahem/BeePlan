import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import OpenAI from 'openai';
import { DatabaseService } from '../db/database.service';
import {
  focusSessions,
  subtasks,
  taskActivities,
  tasks,
} from '../db/schema';
import type {
  CancelFocusSessionDto,
  FinishFocusSessionDto,
  StartFocusSessionDto,
} from './dto/focus.dto';
import {
  computeFocusStats,
  recommendFocusTask,
  type FocusCandidate,
  type FocusRecommendation,
  type FocusSessionForStats,
  type FocusStats,
} from './focus.logic';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini';
const PROVIDER_TIMEOUT_MS = 6_000;
const STATS_WINDOW_DAYS = 60;

type FocusSessionRow = typeof focusSessions.$inferSelect;

export type FocusSessionEntity = {
  id: string;
  taskId: string | null;
  taskTitle: string | null;
  startedAt: string;
  endedAt: string | null;
  plannedMinutes: number;
  actualMinutes: number | null;
  status: string;
  sessionType: string;
  notes: string | null;
  createdAt: string;
};

@Injectable()
export class FocusService {
  private readonly logger = new Logger(FocusService.name);
  private readonly client: OpenAI | null;
  private readonly model: string;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('OPENROUTER_API_KEY');
    const baseURL =
      this.configService.get<string>('OPENROUTER_BASE_URL') ??
      OPENROUTER_BASE_URL;
    this.model =
      this.configService.get<string>('OPENROUTER_MODEL') ??
      DEFAULT_OPENROUTER_MODEL;
    this.client = apiKey
      ? new OpenAI({
          apiKey,
          baseURL,
          defaultHeaders: {
            'HTTP-Referer': 'https://beeplan.local',
            'X-Title': 'BeePlan',
          },
        })
      : null;
  }

  private get db() {
    return this.databaseService.db;
  }

  async start(
    userId: string,
    dto: StartFocusSessionDto,
  ): Promise<FocusSessionEntity> {
    let taskTitle: string | null = null;
    if (dto.taskId) {
      const task = await this.getTaskForUser(userId, dto.taskId);
      taskTitle = task.title;
    }

    const [row] = await this.db
      .insert(focusSessions)
      .values({
        userId,
        taskId: dto.taskId ?? null,
        plannedMinutes: dto.plannedMinutes,
        sessionType: dto.sessionType ?? 'pomodoro',
        status: 'active',
        startedAt: new Date(),
      })
      .returning();

    return this.toEntity(row, taskTitle);
  }

  async finish(
    userId: string,
    sessionId: string,
    dto: FinishFocusSessionDto,
  ): Promise<{ session: FocusSessionEntity; taskUpdated: boolean }> {
    const session = await this.getSessionForUser(userId, sessionId);
    const endedAt = new Date();
    const actualMinutes = this.resolveActualMinutes(
      dto.actualMinutes,
      session.startedAt,
      endedAt,
      session.plannedMinutes,
    );

    const [updated] = await this.db
      .update(focusSessions)
      .set({
        endedAt,
        actualMinutes,
        status: 'completed',
        notes: dto.notes ?? session.notes,
      })
      .where(eq(focusSessions.id, sessionId))
      .returning();

    let taskUpdated = false;
    let taskTitle: string | null = null;

    if (session.taskId) {
      const task = await this.findTask(userId, session.taskId);
      if (task) {
        taskTitle = task.title;
        await this.applyFocusTimeToTask(task, actualMinutes);
        if (dto.taskOutcome === 'done') {
          await this.markTaskDone(userId, task.id);
        }
        taskUpdated = true;
      }
    }

    return { session: this.toEntity(updated, taskTitle), taskUpdated };
  }

  async cancel(
    userId: string,
    sessionId: string,
    dto: CancelFocusSessionDto,
  ): Promise<FocusSessionEntity> {
    const session = await this.getSessionForUser(userId, sessionId);
    const endedAt = new Date();
    const actualMinutes = this.resolveActualMinutes(
      dto.actualMinutes,
      session.startedAt,
      endedAt,
      session.plannedMinutes,
    );

    const [updated] = await this.db
      .update(focusSessions)
      .set({
        endedAt,
        actualMinutes,
        status: 'cancelled',
        notes: dto.notes ?? session.notes,
      })
      .where(eq(focusSessions.id, sessionId))
      .returning();

    const taskTitle = session.taskId
      ? ((await this.findTask(userId, session.taskId))?.title ?? null)
      : null;

    return this.toEntity(updated, taskTitle);
  }

  async today(userId: string): Promise<FocusSessionEntity[]> {
    const startOfToday = startOfUtcDay(new Date());
    const rows = await this.db
      .select()
      .from(focusSessions)
      .where(
        and(
          eq(focusSessions.userId, userId),
          gte(focusSessions.startedAt, startOfToday),
        ),
      )
      .orderBy(desc(focusSessions.startedAt));

    const titles = await this.taskTitles(userId, rows);
    return rows.map((row) =>
      this.toEntity(row, row.taskId ? (titles.get(row.taskId) ?? null) : null),
    );
  }

  async stats(userId: string): Promise<FocusStats> {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - STATS_WINDOW_DAYS);

    const rows = await this.db
      .select()
      .from(focusSessions)
      .where(
        and(
          eq(focusSessions.userId, userId),
          gte(focusSessions.startedAt, cutoff),
        ),
      );

    const titles = await this.taskTitles(userId, rows);
    const sessionsForStats: FocusSessionForStats[] = rows.map((row) => ({
      taskId: row.taskId,
      startedAt: row.startedAt,
      plannedMinutes: row.plannedMinutes,
      actualMinutes: row.actualMinutes,
      status: row.status,
    }));

    return computeFocusStats(sessionsForStats, titles, new Date());
  }

  async recommendation(
    userId: string,
  ): Promise<FocusRecommendation | null> {
    const candidates = await this.loadCandidates(userId);
    const recommendation = recommendFocusTask(candidates, new Date());
    if (!recommendation) return null;

    return {
      ...recommendation,
      reason: await this.maybePolishReason(
        recommendation.taskTitle,
        recommendation.reason,
      ),
    };
  }

  // --- helpers -------------------------------------------------------------

  private resolveActualMinutes(
    provided: number | undefined,
    startedAt: Date,
    endedAt: Date,
    plannedMinutes: number,
  ): number {
    if (typeof provided === 'number' && Number.isFinite(provided)) {
      return clamp(Math.round(provided), 0, 1440);
    }
    const elapsedMinutes = Math.round(
      (endedAt.getTime() - startedAt.getTime()) / 60_000,
    );
    // Never record more than the planned duration when we have to infer it.
    return clamp(elapsedMinutes, 0, Math.max(plannedMinutes, 1));
  }

  private async applyFocusTimeToTask(
    task: typeof tasks.$inferSelect,
    minutes: number,
  ): Promise<void> {
    if (minutes <= 0) return;
    const spent = task.spentTimeMinutes + minutes;
    const remaining = Math.max(0, task.estimatedTimeMinutes - spent);
    await this.db
      .update(tasks)
      .set({
        spentTimeMinutes: spent,
        remainingTimeMinutes: remaining,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, task.id));
  }

  private async markTaskDone(userId: string, taskId: string): Promise<void> {
    await this.db
      .update(tasks)
      .set({ status: 'done', progress: 100, updatedAt: new Date() })
      .where(eq(tasks.id, taskId));
    await this.db.insert(taskActivities).values({
      userId,
      taskId,
      action: 'status_changed',
      description: 'Marked done from a focus session',
      metadata: { status: 'done', source: 'focus' },
    });
  }

  private async loadCandidates(userId: string): Promise<FocusCandidate[]> {
    const taskRows = await this.db
      .select()
      .from(tasks)
      .where(eq(tasks.userId, userId))
      .orderBy(desc(tasks.updatedAt))
      .limit(200);

    const actionable = taskRows.filter(
      (task) => task.status !== 'done' && task.status !== 'missed',
    );
    if (actionable.length === 0) return [];

    const ids = actionable.map((task) => task.id);
    const subtaskRows = await this.db
      .select({
        taskId: subtasks.taskId,
        isDone: subtasks.isDone,
      })
      .from(subtasks)
      .where(inArray(subtasks.taskId, ids));

    const totalByTask = new Map<string, number>();
    const incompleteByTask = new Map<string, number>();
    for (const row of subtaskRows) {
      totalByTask.set(row.taskId, (totalByTask.get(row.taskId) ?? 0) + 1);
      if (!row.isDone) {
        incompleteByTask.set(
          row.taskId,
          (incompleteByTask.get(row.taskId) ?? 0) + 1,
        );
      }
    }

    return actionable.map((task) => ({
      id: task.id,
      title: task.title,
      priority: task.priority,
      status: task.status,
      dueDate: task.dueDate ?? null,
      estimatedMinutes: task.estimatedTimeMinutes,
      progress: task.progress,
      isFocusTask: task.isFocusTask,
      totalSubtasks: totalByTask.get(task.id) ?? 0,
      incompleteSubtasks: incompleteByTask.get(task.id) ?? 0,
    }));
  }

  private async maybePolishReason(
    taskTitle: string,
    reason: string,
  ): Promise<string> {
    if (!this.client) return reason;

    try {
      const response = await this.client.chat.completions.create(
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content:
                'You write one short, friendly sentence explaining why a task is a good pick for a deep-work focus session now. Return only the sentence, no quotes, max 18 words.',
            },
            {
              role: 'user',
              content: `Task: ${taskTitle}\nSignals: ${reason}`,
            },
          ],
          temperature: 0.3,
        },
        { timeout: PROVIDER_TIMEOUT_MS },
      );
      const text = response.choices[0]?.message?.content?.trim();
      return text ? text.slice(0, 160) : reason;
    } catch (error) {
      this.logger.warn(
        `Focus recommendation polish failed; using rules copy: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return reason;
    }
  }

  private async taskTitles(
    userId: string,
    rows: FocusSessionRow[],
  ): Promise<Map<string, string>> {
    const ids = [
      ...new Set(
        rows.map((row) => row.taskId).filter((id): id is string => Boolean(id)),
      ),
    ];
    if (ids.length === 0) return new Map();

    const taskRows = await this.db
      .select({ id: tasks.id, title: tasks.title })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), inArray(tasks.id, ids)));

    return new Map(taskRows.map((task) => [task.id, task.title]));
  }

  private async getSessionForUser(
    userId: string,
    sessionId: string,
  ): Promise<FocusSessionRow> {
    const [row] = await this.db
      .select()
      .from(focusSessions)
      .where(
        and(eq(focusSessions.id, sessionId), eq(focusSessions.userId, userId)),
      )
      .limit(1);

    if (!row) throw new NotFoundException('Focus session not found.');
    if (row.status === 'completed' || row.status === 'cancelled') {
      throw new BadRequestException('This focus session has already ended.');
    }
    return row;
  }

  private async getTaskForUser(userId: string, taskId: string) {
    const task = await this.findTask(userId, taskId);
    if (!task) throw new NotFoundException('Task not found.');
    return task;
  }

  private async findTask(userId: string, taskId: string) {
    const [task] = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
      .limit(1);
    return task ?? null;
  }

  private toEntity(
    row: FocusSessionRow,
    taskTitle: string | null,
  ): FocusSessionEntity {
    return {
      id: row.id,
      taskId: row.taskId,
      taskTitle,
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt ? row.endedAt.toISOString() : null,
      plannedMinutes: row.plannedMinutes,
      actualMinutes: row.actualMinutes,
      status: row.status,
      sessionType: row.sessionType,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}
