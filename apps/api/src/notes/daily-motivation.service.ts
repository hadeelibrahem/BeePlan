import { Injectable, Logger } from '@nestjs/common';
import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import { AiService } from '../ai/ai.service';
import { DatabaseService } from '../db/database.service';
import { focusSessions, plannerAcceptedPlans, reminders, subtasks, taskActivities, tasks, users } from '../db/schema';
import { getDashboardDayBoundaries, resolveDashboardTimezone } from '../dashboard/dashboard-timezone';
import {
  activityFingerprint,
  DAILY_MOTIVATION_SYSTEM_PROMPT,
  fallbackMotivation,
  type DailyMotivationSummary,
  type MotivationLanguage,
  validateMotivationMessage,
} from './daily-motivation.logic';

type CachedMotivation = { fingerprint: string; expiresAt: number; response: DailyMotivationResponse };

export type DailyMotivationResponse = {
  message: string;
  generatedAt: string;
  localDate: string;
  source: 'ai' | 'fallback';
  summary: Pick<DailyMotivationSummary, 'completedTasks' | 'completedSubtasks' | 'focusMinutes'>;
};

@Injectable()
export class DailyMotivationService {
  private readonly logger = new Logger(DailyMotivationService.name);
  private readonly cache = new Map<string, CachedMotivation>();
  private readonly cacheMs = 10 * 60 * 1000;

  constructor(private readonly databaseService: DatabaseService, private readonly aiService: AiService) {}

  private get db() { return this.databaseService.db; }

  async getForUser(userId: string, requestedTimezone?: string, language: MotivationLanguage = 'en', now = new Date()): Promise<DailyMotivationResponse> {
    const [user] = await this.db.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId)).limit(1);
    const timezone = isValidTimezone(user?.timezone)
      ? resolveDashboardTimezone(user?.timezone)
      : resolveDashboardTimezone(requestedTimezone);
    const boundaries = getDashboardDayBoundaries(timezone, now);
    const summary = await this.getSummary(userId, boundaries.localDate, boundaries.startOfToday, boundaries.startOfTomorrow);
    const fingerprint = activityFingerprint(summary);
    const cacheKey = `${userId}:${language}:${boundaries.localDate}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now.getTime() && cached.fingerprint === fingerprint) return cached.response;

    let source: 'ai' | 'fallback' = 'fallback';
    let message = fallbackMotivation(summary, language);
    try {
      const candidate = await this.aiService.generateDailyMotivation({
        systemPrompt: DAILY_MOTIVATION_SYSTEM_PROMPT,
        summary: { localDate: boundaries.localDate, localTime: new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now), language, ...summary },
      });
      if (validateMotivationMessage(candidate)) {
        message = candidate.trim();
        source = 'ai';
      }
    } catch (error) {
      this.logger.warn(`Daily motivation AI unavailable: ${error instanceof Error ? error.message : 'unknown error'}`);
    }

    const response: DailyMotivationResponse = {
      message,
      generatedAt: now.toISOString(),
      localDate: boundaries.localDate,
      source,
      summary: { completedTasks: summary.completedTasks, completedSubtasks: summary.completedSubtasks, focusMinutes: summary.focusMinutes },
    };
    this.cache.set(cacheKey, { fingerprint, expiresAt: now.getTime() + this.cacheMs, response });
    return response;
  }

  private async getSummary(userId: string, localDate: string, start: Date, end: Date): Promise<DailyMotivationSummary> {
    // Reminders are an additive signal only. Keep the core task, subtask, and
    // focus aggregation strict while legacy reminder schemas are repaired.
    const completedRemindersQuery = this.db.select().from(reminders)
      .where(and(eq(reminders.userId, userId), eq(reminders.status, 'done'), gte(reminders.updatedAt, start), lt(reminders.updatedAt, end)))
      .catch((error) => {
        this.logger.warn(`Completed-reminders aggregation unavailable: ${error instanceof Error ? error.message : 'unknown error'}`);
        return [];
      });
    const [ownedTasks, completedActivities, completedFocus, completedReminders, acceptedPlans] = await Promise.all([
      this.db.select().from(tasks).where(eq(tasks.userId, userId)),
      this.db.select().from(taskActivities).where(and(eq(taskActivities.userId, userId), eq(taskActivities.action, 'status_changed'), gte(taskActivities.createdAt, start), lt(taskActivities.createdAt, end))),
      this.db.select().from(focusSessions).where(and(eq(focusSessions.userId, userId), eq(focusSessions.status, 'completed'), gte(focusSessions.endedAt, start), lt(focusSessions.endedAt, end))),
      completedRemindersQuery,
      this.db.select({ plan: plannerAcceptedPlans.plan }).from(plannerAcceptedPlans).where(and(eq(plannerAcceptedPlans.userId, userId), eq(plannerAcceptedPlans.date, localDate))),
    ]);
    const completedTaskIds = [...new Set(completedActivities.filter((activity) => (activity.metadata as { status?: unknown } | null)?.status === 'done').map((activity) => activity.taskId))];
    const taskRows = completedTaskIds.length ? await this.db.select().from(tasks).where(inArray(tasks.id, completedTaskIds)) : [];
    const completedSubtasks = ownedTasks.length
      ? await this.db.select().from(subtasks).where(and(inArray(subtasks.taskId, ownedTasks.map((task) => task.id)), gte(subtasks.completedAt, start), lt(subtasks.completedAt, end)))
      : [];
    const latest = [
      ...completedActivities.map((item) => item.createdAt),
      ...completedSubtasks.map((item) => item.completedAt),
      ...completedFocus.map((item) => item.endedAt),
      ...completedReminders.map((item) => item.updatedAt),
    ].filter((item): item is Date => Boolean(item)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    const plannedTaskIds = new Set(acceptedPlans.flatMap((row) => extractTaskIds(row.plan)));
    const incompletePlannedTasks = ownedTasks.filter((task) =>
      task.status !== 'done' && task.status !== 'missed' &&
      (Boolean(task.dueDate && task.dueDate >= start && task.dueDate < end) || plannedTaskIds.has(task.id)),
    );
    return {
      completedTasks: completedTaskIds.length,
      completedSubtasks: completedSubtasks.length,
      focusSessions: completedFocus.length,
      focusMinutes: completedFocus.reduce((total, session) => total + Math.max(0, session.actualMinutes ?? 0), 0),
      highPriorityCompleted: taskRows.filter((task) => task.priority === 'high' || task.priority === 'urgent').length,
      inProgressTasks: ownedTasks.filter((task) => task.status === 'in_progress').length,
      remainingPlannedTasks: incompletePlannedTasks.length,
      completedReminders: completedReminders.length,
      recentCompletedTitles: taskRows.map((task) => task.title.trim()).filter(Boolean).slice(0, 3),
      latestActivityTimestamp: latest?.toISOString() ?? null,
    };
  }
}

function isValidTimezone(timezone: string | null | undefined) {
  if (!timezone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Extracts only task identifiers from a stored plan; planner text never leaves the server. */
function extractTaskIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(extractTaskIds);
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const taskId = typeof record.taskId === 'string' ? [record.taskId] : [];
  return [...taskId, ...Object.entries(record).flatMap(([key, child]) => key === 'taskId' ? [] : extractTaskIds(child))];
}
