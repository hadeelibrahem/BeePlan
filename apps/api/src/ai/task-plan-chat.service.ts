import {
  GatewayTimeoutException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { and, eq, ne } from 'drizzle-orm';
import OpenAI, { APIConnectionTimeoutError } from 'openai';
import { DatabaseService } from '../db/database.service';
import { tasks } from '../db/schema';
import type { TaskPlanChatDto } from './dto/task-plan-chat.dto';
import { buildTaskPlanChatPrompt } from './prompts/task-plan-chat.prompt';
import { PlannerPreferencesService } from './planner/planner-preferences.service';
import { normalizeTaskPlanChatResponse, TaskPlanChatResponse } from './task-plan';
import type { ExistingTaskSummary } from './task-plan-chat.types';
import { parseJsonResponse } from './utils/json-response';

// The conversation grows every turn (full history + the open-tasks list is
// re-sent each time), so later turns take noticeably longer for the provider
// to answer than the first one. This bounds that latency so the request
// always resolves with a clear error instead of hanging indefinitely — it
// must stay comfortably under the mobile client's own abort timeout so the
// client gets this graceful response rather than aborting first.
const PROVIDER_TIMEOUT_MS = 45_000;

/**
 * Conversational task planning for the "AI Plan Task" wizard. Each call gets
 * the whole conversation so far plus server-side context (open tasks, planner
 * preferences) and returns either a follow-up question or a full plan.
 */
@Injectable()
export class TaskPlanChatService {
  private readonly logger = new Logger(TaskPlanChatService.name);
  private readonly client: OpenAI | null;
  private readonly model: string | null;

  constructor(
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
    private readonly preferencesService: PlannerPreferencesService,
  ) {
    const apiKey = this.configService.get<string>('QWEN_API_KEY');
    const baseURL = this.configService.get<string>('QWEN_BASE_URL');
    const model = this.configService.get<string>('QWEN_MODEL');
    this.client = apiKey && baseURL ? new OpenAI({ apiKey, baseURL }) : null;
    this.model = model ?? null;
  }

  async chat(userId: string, dto: TaskPlanChatDto): Promise<TaskPlanChatResponse> {
    const requestId = randomUUID();
    const receivedAt = Date.now();
    this.logger.log(
      `[${requestId}] task-plan chat received (user=${userId}, messages=${dto.messages.length})`,
    );

    if (!this.client || !this.model) {
      throw new InternalServerErrorException('AI task planning is not configured.');
    }

    const [existingTasks, preferences] = await Promise.all([
      this.loadOpenTasks(userId),
      this.preferencesService.getPreferences(userId),
    ]);

    const providerStartedAt = Date.now();
    this.logger.log(`[${requestId}] provider call starting (timeout=${PROVIDER_TIMEOUT_MS}ms)`);

    let raw: string;
    try {
      const response = await this.client.chat.completions.create(
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: buildTaskPlanChatPrompt(existingTasks, preferences, dto.availability),
            },
            ...dto.messages.map((message) => ({
              role: message.role,
              content: message.content,
            })),
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3,
        },
        { timeout: PROVIDER_TIMEOUT_MS },
      );
      raw = response.choices[0]?.message?.content ?? '';
    } catch (error) {
      const providerDurationMs = Date.now() - providerStartedAt;

      if (error instanceof APIConnectionTimeoutError) {
        this.logger.error(`[${requestId}] provider call timed out after ${providerDurationMs}ms`);
        throw new GatewayTimeoutException(
          'The AI planning assistant took too long to respond. Please try again.',
        );
      }

      this.logger.error(
        `[${requestId}] provider call failed after ${providerDurationMs}ms: ` +
          `${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw new InternalServerErrorException('Failed to generate a task plan with AI.');
    }

    const providerDurationMs = Date.now() - providerStartedAt;
    this.logger.log(`[${requestId}] provider call finished in ${providerDurationMs}ms`);

    const response = this.toResponse(raw, requestId);
    this.logger.log(
      `[${requestId}] request completed in ${Date.now() - receivedAt}ms (type=${response.type})`,
    );
    return response;
  }

  private async loadOpenTasks(userId: string): Promise<ExistingTaskSummary[]> {
    const rows = await this.databaseService.db
      .select({
        title: tasks.title,
        status: tasks.status,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        estimatedTimeMinutes: tasks.estimatedTimeMinutes,
      })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), ne(tasks.status, 'done')))
      .limit(30);

    return rows.map((row) => ({
      title: row.title,
      status: row.status,
      priority: row.priority,
      dueDate: row.dueDate ? row.dueDate.toISOString() : null,
      estimatedTimeMinutes: row.estimatedTimeMinutes ?? 0,
    }));
  }

  private toResponse(raw: string, requestId: string): TaskPlanChatResponse {
    let parsed: unknown;
    try {
      parsed = parseJsonResponse(raw);
    } catch {
      this.logger.error(`[${requestId}] Qwen returned a task-plan response that was not valid JSON.`);
      throw new InternalServerErrorException('AI returned an invalid response.');
    }

    return normalizeTaskPlanChatResponse(parsed);
  }
}
