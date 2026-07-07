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
import { PlannerPreferencesService } from './planner/planner-preferences.service';
import type { PlannerPreferences } from './planner/planner.types';
import { normalizeTaskPlanChatResponse, TaskPlanChatResponse } from './task-plan';

// The conversation grows every turn (full history + the open-tasks list is
// re-sent each time), so later turns take noticeably longer for the provider
// to answer than the first one. This bounds that latency so the request
// always resolves with a clear error instead of hanging indefinitely — it
// must stay comfortably under the mobile client's own abort timeout so the
// client gets this graceful response rather than aborting first.
const PROVIDER_TIMEOUT_MS = 45_000;

const RESPONSE_SCHEMA = `{
  "type": "question" | "advice" | "plan",
  "message": string,
  "quickReplies"?: string[],
  "state": "discovery" | "scope_refinement" | "planning" | "review" | "save_ready",
  "understoodSummary"?: {
    "goal": string,
    "goalType": string | null,
    "deadline": string | null,
    "availableTime": string | null,
    "currentProgress": string | null,
    "deliverables": string[],
    "constraints": string[],
    "risks": string[]
  },
  "plan"?: {
    "mainTask": {
      "title": string,
      "description": string,
      "dueDate": string | null,
      "priority": "low" | "medium" | "high"
    },
    "subtasks": [
      { "title": string, "description": string, "estimatedMinutes": number, "order": number }
    ],
    "focusSessions": [
      { "title": string, "startTime": string, "endTime": string, "relatedSubtaskTitle": string }
    ],
    "reminders": [
      { "title": string, "remindAt": string, "type": "time" }
    ]
  }
}`;

type ExistingTaskSummary = {
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  estimatedTimeMinutes: number;
};

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
              content: this.buildSystemInstruction(existingTasks, preferences, dto.availability),
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

  private buildSystemInstruction(
    existingTasks: ExistingTaskSummary[],
    preferences: PlannerPreferences,
    availability?: Record<string, unknown>,
  ): string {
    const now = new Date();
    const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });

    return [
      "You are BeePlan's AI Planning Coach, a thoughtful planning assistant inside a chat wizard — not a form and not a fixed questionnaire.",
      'The user describes a large goal or task in natural language (Arabic, English, or a mix).',
      'Your job is to actually understand the goal, think with the user, and only produce a structured plan once you both agree it is time.',
      `Current date and time: ${now.toISOString()} (${weekday}). Resolve all relative dates against this.`,
      '',
      'HOW TO BEHAVE — you are a coach, not a checklist:',
      '- Never work through a fixed, pre-scripted list of questions. Read what the user actually wrote and respond to the substance of it.',
      '- Do not just ask for whatever field happens to be missing. Understand the goal first: what kind of project or task is this, what does "done" look like, why does it matter to the user right now.',
      '- Offer real planning value: suggestions, tradeoffs, warnings about unrealistic scope or timelines, and options — not only questions.',
      '- Help the user narrow and clarify scope before anything gets turned into tasks. A vague goal ("build an app", "study for finals") deserves a clarifying conversation, not an instant generic plan.',
      '- Never assume the project type, domain, or approach. If it is ambiguous, ask or offer a short set of plausible interpretations as quickReplies instead of guessing.',
      '- Never produce a generic, one-size-fits-all plan. Every plan must clearly reflect what THIS user told you about THIS goal.',
      '',
      'HANDLING VAGUE OR NON-COMMITTAL REPLIES:',
      '- If the user\'s latest message is vague or non-committal relative to what you just asked or proposed (e.g. "yes", "ok", "sure", "maybe", "I don\'t know", "whatever works", a bare emoji, or anything that does not actually answer your question) — do NOT treat it as confirmation or new information, and do NOT advance to the next state.',
      '- Instead, acknowledge it briefly, gently point out you need a bit more to go on, and re-ask the same underlying question in a slightly more concrete way — ideally with 2-4 specific quickReplies so the user can pick rather than type.',
      '',
      'CONVERSATION STATES (put the current one in "state" every time):',
      '- "discovery": you are still figuring out what the goal actually is — its type, what success/done looks like, and why it matters. Use type "question" (to learn more) or type "advice" (to share a relevant observation) while here.',
      '- "scope_refinement": the goal is roughly clear, but specifics are still fuzzy — deliverables, constraints, current progress, realistic timeframe. Keep clarifying and offering tradeoffs/advice here.',
      '- "planning": you have enough to start reasoning about structure. You may float a rough direction or approach, but label it clearly as type "advice", never as a final "plan".',
      '- "review": you now have enough context end-to-end. Summarize what you understood in "understoodSummary" and in "message" say something like "Here is what I understood..." followed by "Do you want me to generate the final task plan?". Use type "question" (or "advice") here — never emit type "plan" yet.',
      '- "save_ready": the user just clearly confirmed they want the plan (e.g. explicitly said yes / "generate it" / picked a quick reply that means that). Now, and only now, respond with type "plan" containing the full structured plan.',
      '',
      'For a large goal, "enough context" to reach review/save_ready usually means you have a reasonable sense of: goal type, expected outcome/deliverables, deadline or duration, available time, current progress, and any real constraints. You do not need to interrogate every single one — use judgment, and do not stall the user forever chasing minor details.',
      'Keep "understoodSummary" reasonably up to date whenever you have enough to fill it in (even partially) — it is shown to the user as "what I understood so far", so keep it accurate to the actual conversation, not padded or invented.',
      'If the user asks to regenerate or change an already-generated plan, treat that as new input, move back into "scope_refinement" or "planning" as appropriate, and only return type "plan" again once they confirm.',
      '',
      'PLANNING RULES (apply only once you actually emit type "plan"):',
      '- Break the goal into realistic, concrete subtasks (typically 3-8), each with a short clear title and an honest estimatedMinutes.',
      '- Keep all generated titles short and clear.',
      '- Distribute focus sessions across the available days before the deadline; do not pile everything on one day when there is enough time.',
      '- Never schedule a focus session or reminder in the past; the first session must start after the current date and time above.',
      `- Prefer the user's focus window (${preferences.focusStartTime}-${preferences.focusEndTime}) for focus sessions, with work blocks of about ${preferences.workBlockMinutes} minutes and ${preferences.breakMinutes}-minute breaks between consecutive sessions.`,
      '- Each focus session must reference an existing subtask title in "relatedSubtaskTitle".',
      '- Suggest 1-3 reminders of type "time" (e.g. a kickoff reminder and one before the due date), all in the future.',
      '- "dueDate", "startTime", "endTime", and "remindAt" must be ISO 8601 date-time strings.',
      preferences.note ? `- Personal user instructions: ${preferences.note}` : '',
      '',
      'CONTEXT — the user already has these open tasks (avoid double-booking days that look busy, and do not duplicate existing tasks):',
      existingTasks.length ? JSON.stringify(existingTasks) : '(none)',
      availability && Object.keys(availability).length
        ? `CONTEXT — availability provided by the app: ${JSON.stringify(availability)}`
        : '',
      '',
      'Respond with exactly one valid JSON object and nothing else: no markdown, no code fences, no explanations.',
      'The JSON object must match this exact shape (types shown, not literal values). "state" is always required; "understoodSummary" and "quickReplies" are included whenever you have them to offer:',
      RESPONSE_SCHEMA,
    ]
      .filter((line) => line !== '')
      .join('\n');
  }

  private toResponse(raw: string, requestId: string): TaskPlanChatResponse {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      this.logger.error(`[${requestId}] Qwen returned a task-plan response that was not valid JSON.`);
      throw new InternalServerErrorException('AI returned an invalid response.');
    }

    return normalizeTaskPlanChatResponse(parsed);
  }
}
