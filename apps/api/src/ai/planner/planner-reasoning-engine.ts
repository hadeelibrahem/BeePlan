import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { daysBetween } from './planner.util';
import type {
  PlannerConstraints,
  PlannerContext,
  PlannerTask,
  ReasoningResult,
  TaskDecision,
} from './planner.types';

const PRIORITY_SCORE: Record<PlannerTask['priority'], number> = {
  urgent: 90,
  high: 70,
  medium: 40,
  low: 20,
};

/**
 * Layer 2 — AI Reasoning Engine.
 *
 * Decides the *order* work should happen in and produces a short, human
 * explanation for each task. It is AI-first: when a model is configured it asks
 * the model to rank the schedulable tasks; if that is unavailable or returns
 * unusable output it falls back to a deterministic, explainable scoring model.
 * It never assigns clock times — that is the Scheduler's job.
 */
@Injectable()
export class PlannerReasoningEngine {
  private readonly logger = new Logger(PlannerReasoningEngine.name);
  private readonly client: OpenAI | null;
  private readonly model: string | null;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('QWEN_API_KEY');
    const baseURL = this.configService.get<string>('QWEN_BASE_URL');
    const model = this.configService.get<string>('QWEN_MODEL');
    this.client = apiKey && baseURL ? new OpenAI({ apiKey, baseURL }) : null;
    this.model = model ?? null;
  }

  get aiEnabled(): boolean {
    return Boolean(this.client && this.model);
  }

  /**
   * Ask the AI model to rank the schedulable tasks and explain each choice.
   * Returns `null` (never throws) when the model is unavailable or its output
   * cannot be trusted, so the caller can fall back deterministically.
   */
  async rankWithAI(
    context: PlannerContext,
    constraints: PlannerConstraints,
  ): Promise<ReasoningResult | null> {
    if (!this.client || !this.model) return null;
    if (!constraints.schedulableTasks.length) {
      return { source: 'ai', order: [], summary: 'Nothing to schedule today.' };
    }

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: this.systemPrompt() },
          {
            role: 'user',
            content: JSON.stringify(this.promptContext(context, constraints)),
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });
      const parsed = this.parseAiOrder(
        response.choices[0]?.message?.content ?? '',
        constraints,
      );
      if (!parsed) return null;
      return { source: 'ai', order: parsed.order, summary: parsed.summary };
    } catch (error) {
      this.logger.warn(
        `AI reasoning unavailable, using deterministic ranking: ${errorMessage(error)}`,
      );
      return null;
    }
  }

  /**
   * Deterministic, fully explainable ranking. Scores each task by priority,
   * deadline pressure, overdue/started status and focus, then groups tasks of
   * the same category next to each other to reduce context switching.
   */
  rankDeterministic(
    context: PlannerContext,
    constraints: PlannerConstraints,
  ): ReasoningResult {
    const { schedulableTasks } = constraints;
    const scored = [...schedulableTasks].sort(
      (a, b) =>
        this.score(b, context, constraints) -
        this.score(a, context, constraints),
    );
    const grouped = constraints.preferences.groupSimilarTasks
      ? groupByCategoryPreservingRank(scored)
      : scored;

    const order: TaskDecision[] = grouped.map((task, index) => ({
      taskId: task.id,
      rationale: this.explain(task, context, constraints, {
        previous: index > 0 ? grouped[index - 1] : undefined,
      }),
    }));

    return {
      source: 'fallback',
      order,
      summary: buildSummary(order.length, constraints),
    };
  }

  /** Human explanation for a single task's placement. */
  private explain(
    task: PlannerTask,
    context: PlannerContext,
    constraints: PlannerConstraints,
    neighbours: { previous?: PlannerTask },
  ): string {
    const started = task.spentMinutes > 0 || task.progress > 0;
    const dueToday = constraints.dueTodayTaskIds.has(task.id);
    const overdue = constraints.overdueTaskIds.has(task.id);
    const groupedWithPrevious =
      neighbours.previous?.category &&
      task.category &&
      neighbours.previous.category === task.category;

    if (overdue) {
      return task.isFocusTask
        ? 'Prioritized first because it is overdue and needs deep focus.'
        : 'Prioritized because it is overdue and should not slip again.';
    }
    if (dueToday && task.isFocusTask) {
      return 'Scheduled early because it is due today and requires deep focus.';
    }
    if (dueToday) {
      return 'Placed today because it is due and fits before the next fixed block.';
    }
    if (started && constraints.preferences.finishStartedFirst) {
      return 'Continued first to finish work already in progress, as you prefer.';
    }
    if (groupedWithPrevious && constraints.preferences.groupSimilarTasks) {
      return `Grouped with similar ${task.category} work to reduce context switching.`;
    }
    if (task.isFocusTask) {
      return 'Placed in the morning because it needs high concentration.';
    }
    if (task.estimatedMinutes <= 30) {
      return 'Short lightweight task slotted into a small available window.';
    }
    return 'Scheduled by priority, deadline, and the time available today.';
  }

  private score(
    task: PlannerTask,
    context: PlannerContext,
    constraints: PlannerConstraints,
  ): number {
    const priority = PRIORITY_SCORE[task.priority];
    // Hard-deadline signals stay dominant so preferences can never bump an
    // overdue / due-today task below ordinary work.
    const overdue = constraints.overdueTaskIds.has(task.id) ? 600 : 0;
    const dueToday = constraints.dueTodayTaskIds.has(task.id) ? 400 : 0;
    const deadlinePressure = task.dueDate
      ? Math.max(0, 14 - daysBetween(context.date, new Date(task.dueDate))) * 6
      : 0;
    const focus = task.isFocusTask ? 18 : 0;
    // "Finish started tasks first" — only boosts when the user enabled it, and
    // stays below the overdue / due-today tiers above.
    const isStarted = task.spentMinutes > 0 || task.progress > 0;
    const started =
      isStarted && constraints.preferences.finishStartedFirst ? 200 : 0;
    const missed = task.status === 'missed' ? 25 : 0;
    const staleness = Math.min(
      12,
      Math.max(0, daysBetween(task.updatedAt.slice(0, 10), new Date())),
    );
    return (
      priority +
      overdue +
      dueToday +
      deadlinePressure +
      focus +
      started +
      missed +
      staleness
    );
  }

  private promptContext(
    context: PlannerContext,
    constraints: PlannerConstraints,
  ) {
    const preferences = constraints.preferences;
    return {
      date: context.date,
      currentTime: context.currentTime,
      workingHours: context.workingHours,
      preferences: {
        focusHours: {
          start: preferences.focusStartTime,
          end: preferences.focusEndTime,
        },
        energyByPartOfDay: preferences.energy,
        scheduleHardTasksInFocus: preferences.scheduleHardTasksInFocus,
        finishStartedFirst: preferences.finishStartedFirst,
        groupSimilarTasks: preferences.groupSimilarTasks,
        personalNote: preferences.note || undefined,
      },
      fixedBlocks: constraints.fixedBlocks.map((block) => ({
        title: block.title,
        type: block.type,
        start: block.startMinutes,
        end: block.endMinutes,
      })),
      tasks: constraints.schedulableTasks.map((task) => ({
        id: task.id,
        title: task.title,
        priority: task.priority,
        category: task.category ?? undefined,
        estimatedMinutes: task.estimatedMinutes,
        isFocusTask: task.isFocusTask,
        dueToday: constraints.dueTodayTaskIds.has(task.id),
        overdue: constraints.overdueTaskIds.has(task.id),
        started: task.spentMinutes > 0 || task.progress > 0,
      })),
    };
  }

  private parseAiOrder(
    raw: string,
    constraints: PlannerConstraints,
  ): { order: TaskDecision[]; summary: string } | null {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();
    if (!cleaned) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return null;
    }

    const root =
      parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : {};
    const rawOrder = Array.isArray(root.order) ? root.order : null;
    if (!rawOrder) return null;

    const schedulable = new Map(
      constraints.schedulableTasks.map((task) => [task.id, task]),
    );
    const seen = new Set<string>();
    const order: TaskDecision[] = [];

    for (const entry of rawOrder) {
      const row =
        entry && typeof entry === 'object'
          ? (entry as Record<string, unknown>)
          : {};
      const taskId = typeof row.taskId === 'string' ? row.taskId : undefined;
      if (!taskId || !schedulable.has(taskId) || seen.has(taskId)) continue;
      seen.add(taskId);
      order.push({
        taskId,
        rationale:
          typeof row.rationale === 'string' && row.rationale.trim()
            ? row.rationale.trim()
            : 'Scheduled by the assistant based on priority and deadlines.',
      });
    }

    // AI must cover at least one real task; append anything it forgot so no
    // schedulable work is silently dropped.
    if (!order.length) return null;
    for (const task of constraints.schedulableTasks) {
      if (!seen.has(task.id)) {
        order.push({
          taskId: task.id,
          rationale: 'Added to fill remaining available time today.',
        });
      }
    }

    const summary =
      typeof root.summary === 'string' && root.summary.trim()
        ? root.summary.trim()
        : buildSummary(order.length, constraints);
    return { order, summary };
  }

  private systemPrompt(): string {
    return [
      "You are BeePlan's AI reasoning layer for daily planning.",
      'You DECIDE THE ORDER tasks should be done and EXPLAIN each choice. You do NOT assign clock times.',
      'Think like an experienced human productivity coach, not a priority sorter.',
      'Consider: priority, due today, overdue, focus tasks, estimated duration, work already started, category, and the fixed blocks (reminders/breaks) already on the calendar.',
      'Prefer deep-focus work earlier in the day and lighter work later. Prefer finishing already-started tasks. Group similar categories together to reduce context switching.',
      'IMPORTANT: honor the user "preferences" object. Put difficult/focus work inside their focusHours, respect energyByPartOfDay (hard work in high-energy periods), and obey the toggles (finishStartedFirst, groupSimilarTasks).',
      'If preferences.personalNote is present, treat it as direct personal instructions from the user and follow it whenever it does not conflict with deadlines, reminders, dependencies, or locked items.',
      'Return exactly one JSON object, no markdown: {"summary":"one short sentence","order":[{"taskId":"<id from input>","rationale":"short human reason"}]}.',
      'Only use taskId values from the input tasks. Include every input task exactly once, most important first.',
    ].join('\n');
  }
}

function groupByCategoryPreservingRank(tasks: PlannerTask[]): PlannerTask[] {
  const result: PlannerTask[] = [];
  const consumed = new Set<number>();
  for (let i = 0; i < tasks.length; i += 1) {
    if (consumed.has(i)) continue;
    const task = tasks[i];
    result.push(task);
    consumed.add(i);
    if (!task.category) continue;
    // Pull the next same-category tasks up next to this one, keeping their
    // relative (score) order, so we cluster similar work without re-sorting.
    for (let j = i + 1; j < tasks.length; j += 1) {
      if (!consumed.has(j) && tasks[j].category === task.category) {
        result.push(tasks[j]);
        consumed.add(j);
      }
    }
  }
  return result;
}

function buildSummary(
  taskCount: number,
  constraints: PlannerConstraints,
): string {
  const dueToday = constraints.dueTodayTaskIds.size;
  const focus = constraints.schedulableTasks.filter(
    (task) => task.isFocusTask,
  ).length;
  const parts = [
    `Planned ${taskCount} task${taskCount === 1 ? '' : 's'} around your reminders and breaks`,
  ];
  if (focus)
    parts.push(`${focus} deep-focus block${focus === 1 ? '' : 's'} up front`);
  if (dueToday) parts.push(`${dueToday} due today`);
  return `${parts.join(', ')}.`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
