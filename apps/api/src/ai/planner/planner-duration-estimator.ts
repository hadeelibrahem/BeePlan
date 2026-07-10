import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { DurationConfidence, DurationEstimate, TaskType } from './planner.types';

/** Minimal task shape the estimator needs (kept independent of DB rows). */
export interface EstimatorInput {
  id: string;
  title: string;
  category?: string | null;
  isFocusTask: boolean;
  /** User-provided duration in minutes, or 0/undefined when unknown. */
  knownMinutes?: number;
}

export type EstimatorResult = DurationEstimate & { taskType: TaskType };

const MIN_MINUTES = 5;
const MAX_MINUTES = 8 * 60;

/**
 * Estimates a realistic duration — and classifies the kind of work — for tasks
 * that have no user-provided estimate. AI-first (one batched call for the whole
 * day), with a deterministic keyword model as the always-available fallback so
 * the planner never has to fall back on a single fixed default duration.
 *
 * Tasks that already have a duration keep it verbatim; only their task type is
 * classified (deterministically) so energy matching still works.
 */
@Injectable()
export class PlannerDurationEstimator {
  private readonly logger = new Logger(PlannerDurationEstimator.name);
  private readonly client: OpenAI | null;
  private readonly model: string | null;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('QWEN_API_KEY');
    const baseURL = this.configService.get<string>('QWEN_BASE_URL');
    const model = this.configService.get<string>('QWEN_MODEL');
    this.client = apiKey && baseURL ? new OpenAI({ apiKey, baseURL }) : null;
    this.model = model ?? null;
  }

  /**
   * Returns an estimate + task type per input id. Never throws: any AI failure
   * degrades to the deterministic model. Tasks whose duration is already known
   * are returned as `estimated: false` with high confidence.
   */
  async estimate(tasks: EstimatorInput[]): Promise<Map<string, EstimatorResult>> {
    const result = new Map<string, EstimatorResult>();
    if (!tasks.length) return result;

    // Deterministic baseline for everyone first — this is the fallback and also
    // fills in the task type for tasks that keep their known duration.
    for (const task of tasks) {
      result.set(task.id, this.deterministic(task));
    }

    // Only ask the AI about tasks whose duration we genuinely don't know.
    const needEstimate = tasks.filter((task) => !hasKnownDuration(task.knownMinutes));
    if (!needEstimate.length || !this.client || !this.model) return result;

    try {
      const aiEstimates = await this.estimateWithAI(needEstimate);
      for (const [id, estimate] of aiEstimates) {
        const baseline = result.get(id);
        // Keep the deterministic task type if the AI didn't provide one.
        result.set(id, { ...estimate, taskType: estimate.taskType ?? baseline?.taskType ?? 'light' });
      }
    } catch (error) {
      this.logger.warn(`AI duration estimation unavailable, using deterministic estimates: ${message(error)}`);
    }

    return result;
  }

  private async estimateWithAI(tasks: EstimatorInput[]): Promise<Map<string, EstimatorResult>> {
    const response = await this.client!.chat.completions.create({
      model: this.model!,
      messages: [
        { role: 'system', content: this.systemPrompt() },
        {
          role: 'user',
          content: JSON.stringify({
            tasks: tasks.map((task) => ({
              id: task.id,
              title: task.title,
              category: task.category ?? undefined,
              isFocusTask: task.isFocusTask,
            })),
          }),
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    return this.parse(response.choices[0]?.message?.content ?? '', tasks);
  }

  private parse(raw: string, tasks: EstimatorInput[]): Map<string, EstimatorResult> {
    const out = new Map<string, EstimatorResult>();
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();
    if (!cleaned) return out;

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return out;
    }

    const root = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    const rows = Array.isArray(root.estimates) ? root.estimates : [];
    const known = new Set(tasks.map((task) => task.id));

    for (const entry of rows) {
      const row = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
      const id = typeof row.id === 'string' ? row.id : undefined;
      if (!id || !known.has(id)) continue;
      const minutes = clampMinutes(Number(row.minutes));
      if (!minutes) continue;
      out.set(id, {
        minutes,
        confidence: normalizeConfidence(row.confidence),
        reason: typeof row.reason === 'string' && row.reason.trim() ? row.reason.trim() : 'Estimated by the assistant.',
        estimated: true,
        taskType: normalizeTaskType(row.taskType),
      });
    }
    return out;
  }

  /**
   * Deterministic estimate + classification from the task title/category. This
   * is the fallback, so it must always produce a sensible, explainable number.
   */
  private deterministic(task: EstimatorInput): EstimatorResult {
    const taskType = classifyTaskType(task.title, task.category, task.isFocusTask);

    if (hasKnownDuration(task.knownMinutes)) {
      return {
        minutes: clampMinutes(task.knownMinutes!),
        confidence: 'high',
        reason: 'Used the duration you set for this task.',
        estimated: false,
        taskType,
      };
    }

    const { minutes, reason } = estimateFromKeywords(task.title, taskType);
    return { minutes, confidence: 'low', reason, estimated: true, taskType };
  }

  private systemPrompt(): string {
    return [
      "You are BeePlan's task duration estimator.",
      'For each task, estimate how long it realistically takes in minutes for a typical person, and classify the kind of work.',
      'Be realistic, not optimistic: quick errands 10-20 min, emails/admin 20-40 min, study/deep work 60-150 min, large projects 180-240 min.',
      'taskType must be one of: deep, light, meeting, errand, admin, creative, learning, exercise.',
      'confidence must be one of: low, medium, high.',
      'Return exactly one JSON object, no markdown: {"estimates":[{"id":"<id from input>","minutes":<int>,"confidence":"low|medium|high","taskType":"<type>","reason":"short human reason"}]}.',
      'Only use id values from the input. Include every input task exactly once.',
    ].join('\n');
  }
}

function hasKnownDuration(minutes?: number): boolean {
  return typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0;
}

function clampMinutes(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, Math.round(value)));
}

function normalizeConfidence(value: unknown): DurationConfidence {
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'medium';
}

const TASK_TYPES: TaskType[] = ['deep', 'light', 'meeting', 'errand', 'admin', 'creative', 'learning', 'exercise'];

function normalizeTaskType(value: unknown): TaskType {
  return TASK_TYPES.includes(value as TaskType) ? (value as TaskType) : 'light';
}

/** Keyword buckets used by both classification and the fallback estimate. */
const TYPE_KEYWORDS: { type: TaskType; words: RegExp }[] = [
  { type: 'meeting', words: /\b(meeting|call|standup|sync|interview|1:1|zoom|catch\s?up|discussion)\b/i },
  { type: 'exercise', words: /\b(gym|run|running|workout|exercise|walk|yoga|training|swim|jog)\b/i },
  { type: 'learning', words: /\b(study|studying|learn|read|reading|course|lecture|revise|revision|research|exam|homework|assignment)\b/i },
  { type: 'creative', words: /\b(design|write|writing|draft|brainstorm|prototype|sketch|compose|content|blog|video|edit)\b/i },
  { type: 'errand', words: /\b(buy|groceries|shop|shopping|pick\s?up|drop\s?off|errand|pay|bank|post|deliver|pharmacy)\b/i },
  { type: 'admin', words: /\b(email|emails|reply|invoice|report|expense|schedule|organize|plan|paperwork|form|submit|book)\b/i },
  { type: 'deep', words: /\b(build|develop|code|coding|implement|debug|project|architecture|analyze|thesis|presentation|prepare)\b/i },
];

export function classifyTaskType(title: string, category?: string | null, isFocusTask?: boolean): TaskType {
  const haystack = `${title} ${category ?? ''}`;
  for (const { type, words } of TYPE_KEYWORDS) {
    if (words.test(haystack)) return type;
  }
  // Focus tasks with no keyword signal are treated as deep work.
  return isFocusTask ? 'deep' : 'light';
}

/** Rough per-type duration used only when nothing better is known. */
function estimateFromKeywords(title: string, taskType: TaskType): { minutes: number; reason: string } {
  const base: Record<TaskType, number> = {
    deep: 90,
    learning: 90,
    creative: 75,
    meeting: 45,
    admin: 30,
    light: 30,
    errand: 20,
    exercise: 45,
  };
  const minutes = clampMinutes(base[taskType]);
  const label: Record<TaskType, string> = {
    deep: 'deep-focus work',
    learning: 'studying/learning',
    creative: 'creative work',
    meeting: 'a meeting',
    admin: 'admin work',
    light: 'a light task',
    errand: 'an errand',
    exercise: 'exercise',
  };
  return { minutes, reason: `Estimated ${minutes} min — looks like ${label[taskType]} (no duration set).` };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
