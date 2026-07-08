import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, gte } from 'drizzle-orm';
import OpenAI from 'openai';
import { DatabaseService } from '../db/database.service';
import {
  taskActivities,
  taskRecurrenceRules,
  taskRecurrenceSuggestionDismissals,
  tasks,
} from '../db/schema';
import {
  detectRecurrenceSuggestions,
  type RecurrenceSuggestion,
  type RecurrenceSuggestionTask,
} from './recurrence-suggestions';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini';
const PROVIDER_TIMEOUT_MS = 7_000;

@Injectable()
export class RecurrenceSuggestionsService {
  private readonly logger = new Logger(RecurrenceSuggestionsService.name);
  private readonly client: OpenAI | null;
  private readonly model: string;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('OPENROUTER_API_KEY');
    const baseURL =
      this.configService.get<string>('OPENROUTER_BASE_URL') ?? OPENROUTER_BASE_URL;
    this.model =
      this.configService.get<string>('OPENROUTER_MODEL') ?? DEFAULT_OPENROUTER_MODEL;
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

  async list(userId: string) {
    const [recentTasks, recurringTaskIds, completionDates, dismissedIds] =
      await Promise.all([
        this.loadRecentTasks(userId),
        this.loadRecurringTaskIds(),
        this.loadCompletionDates(userId),
        this.loadDismissedSuggestionIds(userId),
      ]);

    const candidates: RecurrenceSuggestionTask[] = recentTasks.map((task) => ({
      id: task.id,
      title: task.title,
      category: task.category,
      dueDate: task.dueDate,
      dueTime: task.dueTime,
      status: task.status,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      completedAt: completionDates.get(task.id) ?? null,
      isRecurring:
        Boolean(task.recurrenceRootId) || recurringTaskIds.has(task.id),
    }));

    const suggestions = detectRecurrenceSuggestions(candidates, dismissedIds);
    return { suggestions: await this.maybeEnhanceWithAi(suggestions) };
  }

  async dismiss(userId: string, suggestionId: string) {
    await this.db
      .insert(taskRecurrenceSuggestionDismissals)
      .values({ userId, suggestionId })
      .onConflictDoNothing({
        target: [
          taskRecurrenceSuggestionDismissals.userId,
          taskRecurrenceSuggestionDismissals.suggestionId,
        ],
      });

    return { ok: true };
  }

  private async loadRecentTasks(userId: string) {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 120);

    return this.db
      .select({
        id: tasks.id,
        title: tasks.title,
        category: tasks.category,
        dueDate: tasks.dueDate,
        dueTime: tasks.dueTime,
        status: tasks.status,
        recurrenceRootId: tasks.recurrenceRootId,
        createdAt: tasks.createdAt,
        updatedAt: tasks.updatedAt,
      })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), gte(tasks.createdAt, cutoff)))
      .orderBy(desc(tasks.updatedAt))
      .limit(300);
  }

  private async loadRecurringTaskIds() {
    const rows = await this.db
      .select({ taskId: taskRecurrenceRules.taskId })
      .from(taskRecurrenceRules);
    return new Set(rows.map((row) => row.taskId));
  }

  private async loadCompletionDates(userId: string) {
    const rows = await this.db
      .select({
        taskId: taskActivities.taskId,
        metadata: taskActivities.metadata,
        createdAt: taskActivities.createdAt,
      })
      .from(taskActivities)
      .where(
        and(
          eq(taskActivities.userId, userId),
          eq(taskActivities.action, 'status_changed'),
        ),
      )
      .orderBy(desc(taskActivities.createdAt))
      .limit(500);

    const dates = new Map<string, Date>();
    for (const row of rows) {
      if (dates.has(row.taskId)) continue;
      const completionDate = completionDateFromMetadata(row.metadata) ?? row.createdAt;
      dates.set(row.taskId, completionDate);
    }
    return dates;
  }

  private async loadDismissedSuggestionIds(userId: string) {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 45);
    const rows = await this.db
      .select({ suggestionId: taskRecurrenceSuggestionDismissals.suggestionId })
      .from(taskRecurrenceSuggestionDismissals)
      .where(
        and(
          eq(taskRecurrenceSuggestionDismissals.userId, userId),
          gte(taskRecurrenceSuggestionDismissals.dismissedAt, cutoff),
        ),
      );
    return new Set(rows.map((row) => row.suggestionId));
  }

  private async maybeEnhanceWithAi(
    suggestions: RecurrenceSuggestion[],
  ): Promise<RecurrenceSuggestion[]> {
    if (!this.client || suggestions.length === 0) return suggestions;

    try {
      const response = await this.client.chat.completions.create(
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content:
                'You polish BeePlan recurrence suggestion copy. Return JSON only: {"suggestions":[{"id":string,"reason":string,"preview":string}]}. Keep reason friendly, concise, and truthful. Do not change ids or recurrence details.',
            },
            {
              role: 'user',
              content: JSON.stringify(
                suggestions.map((suggestion) => ({
                  id: suggestion.id,
                  taskTitle: suggestion.taskTitle,
                  reason: suggestion.reason,
                  preview: suggestion.preview,
                })),
              ),
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
        },
        { timeout: PROVIDER_TIMEOUT_MS },
      );

      const raw = response.choices[0]?.message?.content ?? '';
      const parsed = JSON.parse(raw) as {
        suggestions?: { id?: unknown; reason?: unknown; preview?: unknown }[];
      };
      const byId = new Map(
        (parsed.suggestions ?? [])
          .filter(
            (item): item is { id: string; reason?: string; preview?: string } =>
              typeof item.id === 'string',
          )
          .map((item) => [item.id, item]),
      );

      return suggestions.map((suggestion) => {
        const enhanced = byId.get(suggestion.id);
        if (!enhanced) return suggestion;
        return {
          ...suggestion,
          reason:
            typeof enhanced.reason === 'string' && enhanced.reason.trim()
              ? enhanced.reason.trim().slice(0, 220)
              : suggestion.reason,
          preview:
            typeof enhanced.preview === 'string' && enhanced.preview.trim()
              ? enhanced.preview.trim().slice(0, 180)
              : suggestion.preview,
        };
      });
    } catch (error) {
      this.logger.warn(
        `AI recurrence suggestion wording failed; using rules copy: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return suggestions;
    }
  }
}

function completionDateFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object') return null;
  const value = (metadata as { completionDate?: unknown }).completionDate;
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
