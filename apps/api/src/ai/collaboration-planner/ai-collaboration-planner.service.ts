import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import OpenAI, { APIConnectionTimeoutError } from 'openai';
import { TaskAccessService } from '../../collaboration/task-access.service';
import { TaskActivityService } from '../../collaboration/task-activity.service';
import { DatabaseService } from '../../db/database.service';
import {
  subtaskDependencies,
  subtasks,
  taskMembers,
  tasks,
  users,
} from '../../db/schema';
import { NotificationsService } from '../../notifications/notifications.service';
import { parseJsonResponse } from '../utils/json-response';
import {
  ApplyCollaborationPlanDto,
  CollaborationPlanItemInputDto,
  GenerateCollaborationPlanDto,
} from './dto/collaboration-plan.dto';
import {
  buildCollaborationPlanPrompt,
  type CollaborationPlanPreferences,
} from './prompts/collaboration-plan.prompt';
import {
  buildFallbackProposal,
  classifyCollaborationTaskType,
  computeWorkload,
  enforceSharedOutcomeCoverage,
  subjectKeys,
  type ActivityType,
  type CollaborationPlanProposal,
  type CollaborationTaskType,
  type EligibleMember,
  normalizeCollaborationPlanResponse,
} from './collaboration-plan.types';
import {
  findCyclicNodes,
  rebalanceWorkload,
  buildSharedOutcomeSummary,
  sanitizeAndMinimizeDependencies,
  scheduleItems,
  validateFinalPlan,
} from './plan-graph';
import {
  AI_COLLABORATION_PLANNER_SOURCE,
  buildApplyPlan,
  stripAssigneePrefix,
  type ApplyCandidate,
} from './apply-plan';

// Fallback used only if AI_COLLABORATION_TIMEOUT_MS is somehow absent at
// runtime (env.ts always supplies a default of 90_000, so this is a last
// resort, not the primary source of truth).
const DEFAULT_PROVIDER_TIMEOUT_MS = 90_000;

// How much of the raw provider response to include in logs/dev error
// messages. Generous enough to diagnose shape mismatches without flooding
// logs on a pathological response.
const RAW_LOG_CHARS = 4000;

// Default durations used both for the shared-outcome deterministic fallback
// and for any coverage items synthesized on top of a real AI response that
// left a participant short of full-scope study/practice/error-analysis.
const DEFAULT_STUDY_MINUTES = 90;
const DEFAULT_PRACTICE_MINUTES = 60;
const DEFAULT_ERROR_ANALYSIS_MINUTES = 30;

type FallbackContext = {
  planId: string;
  now: Date;
  taskTitle: string;
  totalEstimateMinutes: number;
  eligibleMembers: Map<string, EligibleMember>;
  memberOrder: string[];
  taskCollaborationType: CollaborationTaskType;
  recoveryMode: boolean;
};

export type ApplyItemError = { proposalId: string; error: string };

export type ApplyCollaborationPlanResult = {
  success: true;
  created: { subtaskIds: string[]; dependencyCount: number };
  itemErrors: ApplyItemError[];
};

type ProfileRow = { id: string; fullName: string };

@Injectable()
export class AiCollaborationPlannerService {
  private readonly logger = new Logger(AiCollaborationPlannerService.name);
  private readonly client: OpenAI | null;
  private readonly model: string | null;
  private readonly providerTimeoutMs: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
    private readonly access: TaskAccessService,
    private readonly activity: TaskActivityService,
    private readonly notifications: NotificationsService,
  ) {
    const apiKey = this.configService.get<string>('QWEN_API_KEY');
    const baseURL = this.configService.get<string>('QWEN_BASE_URL');
    const model = this.configService.get<string>('QWEN_MODEL');
    this.client = apiKey && baseURL ? new OpenAI({ apiKey, baseURL }) : null;
    this.model = model ?? null;
    this.providerTimeoutMs =
      this.configService.get<number>('AI_COLLABORATION_TIMEOUT_MS') ??
      DEFAULT_PROVIDER_TIMEOUT_MS;

    if (this.client && this.model) {
      this.logger.log(
        `AI collaboration planner configured — baseURL=${baseURL}, model=${this.model}, ` +
          `timeoutMs=${this.providerTimeoutMs}.`,
      );
    } else {
      this.logger.warn(
        `AI collaboration planner NOT configured (apiKey=${apiKey ? 'set' : 'missing'}, ` +
          `baseURL=${baseURL ? 'set' : 'missing'}, model=${model ? 'set' : 'missing'}) — every generate() call will ` +
          `${this.isProduction() ? 'fall back to a deterministic split' : 'throw with this detail'}.`,
      );
    }
  }

  private get db() {
    return this.databaseService.db;
  }

  // --- Generate (read-only, never touches the database) ----------------------

  async generate(
    userId: string,
    taskId: string,
    dto: GenerateCollaborationPlanDto,
  ): Promise<CollaborationPlanProposal> {
    const requestId = randomUUID();
    const { task } = await this.access.require(userId, taskId, 'owner');

    const preferences = this.normalizePreferences(dto.preferences);

    const memberRows = await this.db
      .select({ userId: taskMembers.userId, role: taskMembers.role })
      .from(taskMembers)
      .where(
        and(eq(taskMembers.taskId, taskId), eq(taskMembers.status, 'accepted')),
      );
    const eligibleEditorIds = new Set(
      memberRows
        .filter((row) => row.role === 'editor')
        .map((row) => row.userId),
    );

    const invalidSelections = dto.selectedMemberIds.filter(
      (id) => !eligibleEditorIds.has(id),
    );
    if (invalidSelections.length) {
      throw new BadRequestException(
        'Only accepted collaborators with an editable role can be selected for planning.',
      );
    }

    const owner = await this.getUserOrThrow(task.userId);
    const selectedProfiles = await this.loadProfiles(dto.selectedMemberIds);

    const assignableMembers = new Map<string, EligibleMember>();
    if (preferences.includeOwner) {
      assignableMembers.set(task.userId, {
        userId: task.userId,
        displayName: owner.fullName,
      });
    }
    for (const id of dto.selectedMemberIds) {
      assignableMembers.set(id, {
        userId: id,
        displayName: selectedProfiles.get(id)?.fullName ?? 'Collaborator',
      });
    }

    const existingSubtaskRows = await this.db
      .select({
        title: subtasks.title,
        status: subtasks.status,
        assignee: subtasks.assignee,
      })
      .from(subtasks)
      .where(eq(subtasks.taskId, taskId));

    const now = new Date();
    const planId = randomUUID();
    const totalEstimateMinutes = task.estimatedTimeMinutes || 120;
    const taskCollaborationType = classifyCollaborationTaskType(
      {
        title: task.title,
        description: task.description,
        category: task.category,
      },
      dto.preferences?.taskType,
    );
    const recoveryMode = Boolean(
      task.dueDate && task.dueDate.getTime() < now.getTime(),
    );
    this.logger.log(
      `[${requestId}] classified task — taskCollaborationType=${taskCollaborationType}, recoveryMode=${recoveryMode}`,
    );
    const fallbackContext: FallbackContext = {
      planId,
      now,
      taskTitle: task.title,
      totalEstimateMinutes,
      eligibleMembers: assignableMembers,
      memberOrder: [...assignableMembers.keys()],
      taskCollaborationType,
      recoveryMode,
    };

    if (!this.client || !this.model) {
      return this.finalizePlan(
        requestId,
        this.failOrFallback(
          requestId,
          'missing_config',
          'QWEN_API_KEY, QWEN_BASE_URL, and/or QWEN_MODEL are not set — the AI client was never constructed.',
          fallbackContext,
        ),
        task,
        preferences,
        recoveryMode,
        assignableMembers,
        now,
      );
    }

    const prompt = buildCollaborationPlanPrompt({
      task: {
        title: task.title,
        description: task.description,
        category: task.category,
        priority: task.priority,
        dueDate: task.dueDate ? task.dueDate.toISOString() : null,
        dueTime: task.dueTime,
        estimatedTimeMinutes: task.estimatedTimeMinutes,
      },
      owner: { userId: task.userId, displayName: owner.fullName },
      selectedMembers: dto.selectedMemberIds.map((id) => ({
        userId: id,
        displayName: selectedProfiles.get(id)?.fullName ?? 'Collaborator',
        role: 'editor',
      })),
      includeOwnerAsAssignee: preferences.includeOwner,
      preferences,
      existingSubtasks: existingSubtaskRows,
      now,
      taskCollaborationType,
      recoveryMode,
    });

    // Step 1/2: confirm the call is actually made and reaches the provider.
    this.logger.log(
      `[${requestId}] calling AI provider — model=${this.model}, selectedMembers=${dto.selectedMemberIds.length}, ` +
        `includeOwner=${preferences.includeOwner}, promptChars=${prompt.length}, timeoutMs=${this.providerTimeoutMs}`,
    );

    let raw: string;
    const providerStartedAt = Date.now();
    try {
      const response = await this.client.chat.completions.create(
        {
          model: this.model,
          messages: [{ role: 'system', content: prompt }],
          response_format: { type: 'json_object' },
          temperature: 0.3,
        },
        { timeout: this.providerTimeoutMs },
      );
      raw = response.choices[0]?.message?.content ?? '';
      // Step 3: always log the provider response, success or not, so a dev
      // can see exactly what came back without needing to reproduce a failure.
      this.logger.log(
        `[${requestId}] provider responded — finishReason=${response.choices[0]?.finish_reason ?? 'unknown'}, ` +
          `chars=${raw.length}, completionMs=${Date.now() - providerStartedAt}, ` +
          `totalTokens=${response.usage?.total_tokens ?? 'unavailable'}`,
      );
      this.logger.debug(
        `[${requestId}] provider raw response: ${raw.slice(0, RAW_LOG_CHARS)}`,
      );
    } catch (error) {
      this.logger.warn(
        `[${requestId}] provider call failed — completionMs=${Date.now() - providerStartedAt}, ` +
          `totalTokens=unavailable, error=${error instanceof Error ? error.name : 'unknown'}`,
      );
      if (error instanceof APIConnectionTimeoutError) {
        return this.finalizePlan(
          requestId,
          this.failOrFallback(
            requestId,
            'timeout',
            `Provider call timed out after ${this.providerTimeoutMs}ms (AI_COLLABORATION_TIMEOUT_MS). Increase this ` +
              'env var if the provider consistently needs longer.',
            fallbackContext,
          ),
          task,
          preferences,
          recoveryMode,
          assignableMembers,
          now,
        );
      }
      return this.finalizePlan(
        requestId,
        this.failOrFallback(
          requestId,
          'provider_error',
          this.describeProviderError(error),
          fallbackContext,
        ),
        task,
        preferences,
        recoveryMode,
        assignableMembers,
        now,
      );
    }

    if (!raw.trim()) {
      return this.finalizePlan(
        requestId,
        this.failOrFallback(
          requestId,
          'empty_response',
          'Provider returned a response with empty message content.',
          fallbackContext,
        ),
        task,
        preferences,
        recoveryMode,
        assignableMembers,
        now,
      );
    }

    let parsed: unknown;
    try {
      parsed = parseJsonResponse(raw);
    } catch (error) {
      return this.finalizePlan(
        requestId,
        this.failOrFallback(
          requestId,
          'invalid_json',
          `${error instanceof Error ? error.message : 'Unknown JSON parse error.'} — raw response (first ${RAW_LOG_CHARS} ` +
            `chars): ${raw.slice(0, RAW_LOG_CHARS)}`,
          fallbackContext,
        ),
        task,
        preferences,
        recoveryMode,
        assignableMembers,
        now,
      );
    }

    const rawItemCount = Array.isArray((parsed as { items?: unknown })?.items)
      ? (parsed as { items: unknown[] }).items.length
      : 0;
    let proposal = normalizeCollaborationPlanResponse(parsed, {
      planId,
      now,
      eligibleMembers: assignableMembers,
      taskCollaborationType,
    });
    proposal.recoveryMode = recoveryMode;
    this.logger.log(
      `[${requestId}] normalized proposal — rawItems=${rawItemCount}, validItems=${proposal.items.length}`,
    );

    if (!proposal.items.length) {
      const detail =
        rawItemCount > 0
          ? `Provider returned ${rawItemCount} item(s) but every one was dropped during validation (missing/empty ` +
            `title is the most common cause). Parsed response (first ${RAW_LOG_CHARS} chars): ` +
            `${JSON.stringify(parsed).slice(0, RAW_LOG_CHARS)}`
          : `Provider JSON had no usable "items" array. Parsed response (first ${RAW_LOG_CHARS} chars): ` +
            `${JSON.stringify(parsed).slice(0, RAW_LOG_CHARS)}`;
      return this.finalizePlan(
        requestId,
        this.failOrFallback(
          requestId,
          'validation_failed',
          detail,
          fallbackContext,
        ),
        task,
        preferences,
        recoveryMode,
        assignableMembers,
        now,
      );
    }

    if (taskCollaborationType === 'shared_outcome') {
      const beforeCount = proposal.items.length;
      proposal = enforceSharedOutcomeCoverage(proposal, {
        requiredParticipantIds: [...assignableMembers.keys()],
        eligibleMembers: assignableMembers,
        existingTitles: new Set(
          existingSubtaskRows.map((row) => row.title.trim().toLowerCase()),
        ),
        now,
        defaultStudyMinutes: DEFAULT_STUDY_MINUTES,
        defaultPracticeMinutes: DEFAULT_PRACTICE_MINUTES,
        defaultErrorAnalysisMinutes: DEFAULT_ERROR_ANALYSIS_MINUTES,
      });
      if (proposal.items.length !== beforeCount) {
        this.logger.log(
          `[${requestId}] shared-outcome coverage enforcement added ${proposal.items.length - beforeCount} item(s) ` +
            `(${beforeCount} -> ${proposal.items.length}) to cover every participant's full-scope study/practice/error-analysis.`,
        );
      }
    }

    return this.finalizePlan(
      requestId,
      proposal,
      task,
      preferences,
      recoveryMode,
      assignableMembers,
      now,
    );
  }

  /**
   * Runs on EVERY generated proposal (AI or fallback) before it's returned:
   * this is what actually guarantees a minimal, acyclic, non-overlapping,
   * balanced, executable plan — the prompt only asks the model nicely, it
   * can't enforce any of it.
   *  1. sanitize + minimize dependencies (self/dangling/phase-order removal,
   *     cycle-safe deterministic rebuild if needed, transitive reduction)
   *  2. rebalance workload toward <5% spread when equal distribution was
   *     requested
   *  3. schedule every item deterministically (dependency + per-assignee
   *     resource constraints) — this is what makes overlaps structurally
   *     impossible and lets independent branches start immediately
   */
  private finalizePlan(
    requestId: string,
    proposal: CollaborationPlanProposal,
    task: { dueDate: Date | null },
    preferences: CollaborationPlanPreferences,
    recoveryMode: boolean,
    assignableMembers: Map<string, EligibleMember>,
    now: Date,
  ): CollaborationPlanProposal {
    const sanitized = sanitizeAndMinimizeDependencies(proposal.items);
    if (sanitized.cycleRepaired) {
      this.logger.warn(
        `[${requestId}] AI-suggested dependencies contained a cycle — discarded and rebuilt deterministically.`,
      );
    }
    if (
      sanitized.removedSelfDeps ||
      sanitized.removedDangling ||
      sanitized.removedPhaseViolations ||
      sanitized.removedTransitiveRedundant
    ) {
      this.logger.log(
        `[${requestId}] dependency sanitization — selfDeps=${sanitized.removedSelfDeps}, ` +
          `dangling=${sanitized.removedDangling}, phaseViolations=${sanitized.removedPhaseViolations}, ` +
          `transitiveRedundant=${sanitized.removedTransitiveRedundant}`,
      );
    }
    let items = sanitized.items;

    const warnings = [...proposal.warnings];
    if (preferences.workloadDistribution === 'equal') {
      const rebalanced = rebalanceWorkload(
        items,
        [...assignableMembers.keys()],
        assignableMembers,
      );
      items = rebalanced.items;
      if (!rebalanced.balanced && rebalanced.reason) {
        this.logger.log(
          `[${requestId}] workload rebalancing incomplete: ${rebalanced.reason}`,
        );
        warnings.push(rebalanced.reason);
      }
    }

    const scheduled = scheduleItems(items, {
      now,
      taskDueDate: task.dueDate,
      recoveryMode,
    });
    items = scheduled.items;

    const nextProposal: CollaborationPlanProposal = {
      ...proposal,
      items,
      workloadByMember: computeWorkload(items, assignableMembers),
      totalEstimatedMinutes: items.reduce(
        (sum, item) => sum + item.estimatedDurationMinutes,
        0,
      ),
      warnings,
    };
    if (nextProposal.taskCollaborationType === 'shared_outcome') {
      nextProposal.summary = buildSharedOutcomeSummary(items, [
        ...assignableMembers.keys(),
      ]);
    }

    if (!scheduled.deadlineFeasible) {
      nextProposal.deadlineFeasible = false;
      if (
        !nextProposal.warnings.some((w) => w.toLowerCase().includes('deadline'))
      ) {
        nextProposal.warnings.push(
          `The schedule overflows the deadline by about ${scheduled.overflowMinutes} minute` +
            `${scheduled.overflowMinutes === 1 ? '' : 's'} given the current scope and team size.`,
        );
      }
    }

    this.augmentWithDeterministicChecks(nextProposal, task, assignableMembers);
    const validationErrors = validateFinalPlan(
      nextProposal.items,
      nextProposal.taskCollaborationType === 'shared_outcome'
        ? [...assignableMembers.keys()]
        : [],
    );
    if (validationErrors.length) {
      throw new InternalServerErrorException(
        `Final collaboration plan failed deterministic validation: ${validationErrors.join(' ')}`,
      );
    }
    const finalById = new Map(
      nextProposal.items.map((item) => [item.proposalId, item]),
    );
    this.logger.log(
      `[${requestId}] final proposal returned to frontend — ${JSON.stringify(
        nextProposal.items.map((item) => ({
          id: item.proposalId,
          title: item.title,
          dependencyIds: item.dependsOnProposalIds,
          dependencies: item.dependsOnProposalIds.map(
            (id) => finalById.get(id)?.title ?? `[missing:${id}]`,
          ),
        })),
      )}`,
    );
    return nextProposal;
  }

  /**
   * Central failure handler for generate(). In production this degrades
   * gracefully to the deterministic fallback split (never blocks the owner).
   * Everywhere else (local dev, staging without NODE_ENV=production) it
   * throws the real, specific reason instead — silently returning the
   * placeholder plan on every failure is exactly what made this bug invisible
   * last time, so dev builds must surface the root cause directly.
   */
  private failOrFallback(
    requestId: string,
    code: string,
    detail: string,
    context: FallbackContext,
  ): CollaborationPlanProposal {
    const message = `AI collaboration plan generation failed [${code}]: ${detail}`;
    if (!this.isProduction()) {
      this.logger.error(`[${requestId}] ${message}`);
      throw new InternalServerErrorException(message);
    }
    this.logger.error(
      `[${requestId}] ${message} — falling back to a deterministic split (production).`,
    );
    return buildFallbackProposal(context);
  }

  private isProduction(): boolean {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }

  /** Pulls whatever diagnostic detail is available off an OpenAI SDK error without leaking secrets. */
  private describeProviderError(error: unknown): string {
    if (error && typeof error === 'object') {
      const err = error as {
        status?: number;
        code?: string;
        message?: string;
        error?: unknown;
      };
      const parts: string[] = [];
      if (err.status !== undefined) parts.push(`status=${err.status}`);
      if (err.code) parts.push(`code=${err.code}`);
      if (err.message) parts.push(err.message);
      if (err.error !== undefined)
        parts.push(`body=${JSON.stringify(err.error).slice(0, 500)}`);
      if (parts.length) return parts.join(' | ');
    }
    return error instanceof Error ? error.message : 'Unknown provider error.';
  }

  private augmentWithDeterministicChecks(
    proposal: CollaborationPlanProposal,
    task: { dueDate: Date | null },
    assignableMembers: Map<string, EligibleMember>,
  ) {
    if (task.dueDate) {
      const overdueItem = proposal.items.some(
        (item) =>
          item.suggestedDue &&
          new Date(item.suggestedDue).getTime() > task.dueDate!.getTime(),
      );
      if (overdueItem) {
        proposal.deadlineFeasible = false;
        if (
          !proposal.warnings.some((w) => w.toLowerCase().includes('deadline'))
        ) {
          proposal.warnings.push(
            'One or more proposed items are due after the task deadline.',
          );
        }
      }
    }

    if (proposal.workloadByMember.length === 1 && assignableMembers.size > 1) {
      proposal.warnings.push(
        'All proposed work was assigned to a single person even though more collaborators were available.',
      );
    }

    this.warnOnOverlappingAssignments(proposal);
  }

  /** Flags a participant with two dated items whose time ranges overlap — never a hard error, just a warning. */
  private warnOnOverlappingAssignments(proposal: CollaborationPlanProposal) {
    const byAssignee = new Map<string, CollaborationPlanProposal['items']>();
    for (const item of proposal.items) {
      if (!item.assigneeUserId || !item.suggestedStart || !item.suggestedDue)
        continue;
      const list = byAssignee.get(item.assigneeUserId) ?? [];
      list.push(item);
      byAssignee.set(item.assigneeUserId, list);
    }

    for (const items of byAssignee.values()) {
      const sorted = [...items].sort(
        (a, b) =>
          new Date(a.suggestedStart!).getTime() -
          new Date(b.suggestedStart!).getTime(),
      );
      for (let i = 1; i < sorted.length; i += 1) {
        const previous = sorted[i - 1];
        const current = sorted[i];
        // Two items on the same sharedSessionId are meant to overlap (they're
        // the same joint session from each attendee's perspective).
        if (
          previous.sharedSessionId &&
          previous.sharedSessionId === current.sharedSessionId
        )
          continue;
        if (
          new Date(current.suggestedStart!).getTime() <
          new Date(previous.suggestedDue!).getTime()
        ) {
          proposal.warnings.push(
            `${current.assigneeDisplayName ?? 'A participant'} has overlapping scheduled items: "${previous.title}" and "${current.title}".`,
          );
        }
      }
    }
  }

  private normalizePreferences(
    dto: GenerateCollaborationPlanDto['preferences'],
  ): CollaborationPlanPreferences {
    return {
      workloadDistribution: dto?.workloadDistribution ?? 'equal',
      includeOwner: dto?.includeOwner ?? false,
      maxWorkloadItemsPerPerson: dto?.maxWorkloadItemsPerPerson ?? null,
      allowParallelWork: dto?.allowParallelWork ?? true,
      addReviewSteps: dto?.addReviewSteps ?? false,
      addBufferTime: dto?.addBufferTime ?? true,
      taskGranularity: dto?.taskGranularity ?? 'medium',
      notes: dto?.notes?.trim() || null,
    };
  }

  // --- Apply (validates + writes atomically) ----------------------------------

  async apply(
    userId: string,
    taskId: string,
    dto: ApplyCollaborationPlanDto,
  ): Promise<ApplyCollaborationPlanResult> {
    const { task } = await this.access.require(userId, taskId, 'owner');

    const memberRows = await this.db
      .select({ userId: taskMembers.userId, role: taskMembers.role })
      .from(taskMembers)
      .where(
        and(eq(taskMembers.taskId, taskId), eq(taskMembers.status, 'accepted')),
      );
    const eligibleAssigneeIds = new Set<string>([
      task.userId,
      ...memberRows
        .filter((row) => row.role === 'editor')
        .map((row) => row.userId),
    ]);

    // Split the task's current subtasks into "manually created" (source is
    // null — never touched by apply) and "prior planner output" (source =
    // AI_COLLABORATION_PLANNER_SOURCE, from any earlier applied plan — this
    // apply call will replace all of it). Title collisions are only checked
    // against manual subtasks: checking against the planner's own prior
    // output is what forced every regeneration into slightly different
    // wording instead of reusing the same slot.
    const existingSubtaskRows = await this.db
      .select({
        id: subtasks.id,
        title: subtasks.title,
        source: subtasks.source,
      })
      .from(subtasks)
      .where(eq(subtasks.taskId, taskId));
    const manualTitles = new Set(
      existingSubtaskRows
        .filter((row) => row.source !== AI_COLLABORATION_PLANNER_SOURCE)
        .map((row) => row.title.trim().toLowerCase()),
    );
    const priorAiSubtaskIds = existingSubtaskRows
      .filter((row) => row.source === AI_COLLABORATION_PLANNER_SOURCE)
      .map((row) => row.id);

    const itemErrors: ApplyItemError[] = [];
    const seenProposalIds = new Set<string>();
    const candidates: CollaborationPlanItemInputDto[] = [];

    for (const item of dto.items) {
      if (seenProposalIds.has(item.proposalId)) {
        itemErrors.push({
          proposalId: item.proposalId,
          error: 'Duplicate proposalId in submission.',
        });
        continue;
      }
      seenProposalIds.add(item.proposalId);

      if (!item.title.trim()) {
        itemErrors.push({
          proposalId: item.proposalId,
          error: 'Title is required.',
        });
        continue;
      }
      if (manualTitles.has(item.title.trim().toLowerCase())) {
        itemErrors.push({
          proposalId: item.proposalId,
          error: 'A manually-created subtask with this title already exists.',
        });
        continue;
      }
      if (
        item.assigneeUserId &&
        !eligibleAssigneeIds.has(item.assigneeUserId)
      ) {
        itemErrors.push({
          proposalId: item.proposalId,
          error: 'Assignee no longer has an eligible role on this task.',
        });
        continue;
      }
      if (item.suggestedStart && item.suggestedDue) {
        if (
          new Date(item.suggestedStart).getTime() >
          new Date(item.suggestedDue).getTime()
        ) {
          itemErrors.push({
            proposalId: item.proposalId,
            error: 'Start date must be before the due date.',
          });
          continue;
        }
      }

      candidates.push(item);
    }

    const candidateIds = new Set(candidates.map((item) => item.proposalId));
    const adjacency = new Map<string, string[]>();
    for (const item of candidates) {
      adjacency.set(
        item.proposalId,
        (item.dependsOnProposalIds ?? []).filter(
          (id) => candidateIds.has(id) && id !== item.proposalId,
        ),
      );
    }
    const cyclic = findCyclicNodes(adjacency);

    const validItems = candidates.filter((item) => {
      if (cyclic.has(item.proposalId)) {
        itemErrors.push({
          proposalId: item.proposalId,
          error: 'Circular dependency detected.',
        });
        return false;
      }
      return true;
    });
    const validIds = new Set(validItems.map((item) => item.proposalId));
    for (const item of validItems) {
      item.dependsOnProposalIds = (item.dependsOnProposalIds ?? []).filter(
        (id) => validIds.has(id),
      );
    }

    if (!validItems.length) {
      throw new BadRequestException({
        message: 'No valid plan items to apply.',
        itemErrors,
      });
    }

    // Load profiles for every submitted assignee up front so we can both stamp
    // display names and build the known-name set used to strip any legacy
    // "Name:" title prefix a client resubmits (precise, not heuristic).
    const submittedAssigneeIds = [
      ...new Set(validItems.map((item) => item.assigneeUserId).filter(Boolean)),
    ] as string[];
    const profiles = await this.loadProfiles(submittedAssigneeIds);
    const knownNames = new Set(
      [...profiles.values()].map((profile) => profile.fullName.toLowerCase()),
    );

    // Semantic dedup + shared-session collapse + generic-placeholder removal
    // (see apply-plan.ts) — the deterministic layer that guarantees no two
    // submitted items occupy the same participant/stage/subject slot and that
    // shared work is persisted once, mirroring how plan-graph.ts guarantees
    // generate()'s output is valid.
    const itemsById = new Map(validItems.map((item) => [item.proposalId, item]));
    const applyCandidates: ApplyCandidate[] = validItems.map((item) => ({
      proposalId: item.proposalId,
      title: stripAssigneePrefix(item.title, knownNames),
      description: item.description ?? '',
      assigneeUserId: item.assigneeUserId ?? null,
      activityType: (item.activityType as ActivityType | undefined) ?? 'other',
      sharedSessionId: item.sharedSessionId ?? null,
      dependsOnProposalIds: item.dependsOnProposalIds ?? [],
      isShared: false,
    }));
    const { keepItems, itemErrors: dedupErrors } =
      buildApplyPlan(applyCandidates);
    itemErrors.push(...dedupErrors);

    if (!keepItems.length) {
      throw new BadRequestException({
        message: 'No valid plan items to apply after deduplication.',
        itemErrors,
      });
    }

    // Merge the deduplicated identity fields (dependsOnProposalIds may have
    // been remapped onto a canonical survivor; assigneeUserId/title/isShared
    // may have been rewritten by the shared-session collapse) back onto the
    // full submitted item so scheduling/description/dates/etc. are preserved.
    const finalItems = keepItems.map((kept) => ({
      ...itemsById.get(kept.proposalId)!,
      title: kept.title,
      assigneeUserId: kept.assigneeUserId,
      activityType: kept.activityType,
      sharedSessionId: kept.sharedSessionId,
      dependsOnProposalIds: kept.dependsOnProposalIds,
      isShared: kept.isShared,
    }));

    const proposalIdToNewId = new Map<string, string>();
    const createdSubtasks: { id: string; assigneeUserId: string | null }[] = [];
    let dependencyCount = 0;

    await this.databaseService.db.transaction(async (tx) => {
      let index = 0;
      for (const item of finalItems) {
        const displayName = item.assigneeUserId
          ? (profiles.get(item.assigneeUserId)?.fullName ?? null)
          : null;
        const [row] = await tx
          .insert(subtasks)
          .values({
            taskId,
            title: item.title.trim(),
            isDone: false,
            orderIndex: item.order ?? index,
            assignee: displayName,
            assigneeUserId: item.assigneeUserId ?? null,
            isShared: item.isShared,
            description: item.description?.trim() || null,
            priority: item.priority ?? 'medium',
            status: 'todo',
            startDate: item.suggestedStart
              ? new Date(item.suggestedStart)
              : null,
            dueDate: item.suggestedDue ? new Date(item.suggestedDue) : null,
            estimatedDurationMinutes: item.estimatedDurationMinutes ?? null,
            estimatedDurationSource: 'ai',
            reminderEnabled: false,
            reminderStatus: 'none',
            notes: null,
            tags: null,
            completedAt: null,
            source: AI_COLLABORATION_PLANNER_SOURCE,
            sourcePlanId: dto.planId,
            sourceProposalId: item.proposalId,
            semanticType: item.activityType,
            subjectKeys: subjectKeys(`${item.title} ${item.description ?? ''}`),
            sharedSessionGroupId: item.sharedSessionId,
          })
          .returning();
        proposalIdToNewId.set(item.proposalId, row.id);
        createdSubtasks.push({
          id: row.id,
          assigneeUserId: item.assigneeUserId ?? null,
        });
        index += 1;
      }

      const dependencyRows: {
        subtaskId: string;
        dependsOnSubtaskId: string;
      }[] = [];
      for (const item of finalItems) {
        const subtaskId = proposalIdToNewId.get(item.proposalId)!;
        for (const depProposalId of item.dependsOnProposalIds ?? []) {
          const dependsOnSubtaskId = proposalIdToNewId.get(depProposalId);
          if (dependsOnSubtaskId)
            dependencyRows.push({ subtaskId, dependsOnSubtaskId });
        }
      }
      if (dependencyRows.length) {
        await tx.insert(subtaskDependencies).values(dependencyRows);
        dependencyCount = dependencyRows.length;
      }

      // Replace, don't append: delete this task's prior planner-generated
      // subtasks now that their replacements exist. subtask_dependencies FKs
      // cascade on delete (both columns), so stale dependency edges are
      // cleaned up automatically — never left dangling.
      if (priorAiSubtaskIds.length) {
        await tx
          .delete(subtasks)
          .where(
            and(
              eq(subtasks.taskId, taskId),
              inArray(subtasks.id, priorAiSubtaskIds),
            ),
          );
      }
    });

    await this.recalculateProgress(taskId);

    const actor = await this.getUserOrThrow(userId);
    const replacedCount = priorAiSubtaskIds.length;
    await this.activity.log(
      userId,
      taskId,
      'ai_plan_applied',
      `${actor.fullName} applied an AI collaboration plan (${createdSubtasks.length} subtask${
        createdSubtasks.length === 1 ? '' : 's'
      }${
        replacedCount
          ? `, replacing ${replacedCount} prior AI-generated subtask${replacedCount === 1 ? '' : 's'}`
          : ''
      })`,
      { count: createdSubtasks.length, replacedCount },
    );

    const byAssignee = new Map<string, number>();
    for (const created of createdSubtasks) {
      if (!created.assigneeUserId) continue;
      byAssignee.set(
        created.assigneeUserId,
        (byAssignee.get(created.assigneeUserId) ?? 0) + 1,
      );
    }
    await this.notifications.createMany(
      [...byAssignee.entries()].map(([assigneeId, count]) => ({
        userId: assigneeId,
        type: 'ai_plan_applied' as const,
        actorId: userId,
        taskId,
        title: 'New subtasks assigned',
        body: `${actor.fullName} assigned you ${count} subtask${count === 1 ? '' : 's'} in "${task.title}".`,
      })),
      userId,
    );

    return {
      success: true,
      created: {
        subtaskIds: createdSubtasks.map((created) => created.id),
        dependencyCount,
      },
      itemErrors,
    };
  }

  private async recalculateProgress(taskId: string) {
    const [task] = await this.db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId));
    if (!task) return;

    const subtaskRows = await this.db
      .select({ isDone: subtasks.isDone })
      .from(subtasks)
      .where(eq(subtasks.taskId, taskId));
    if (!subtaskRows.length) return;

    const completed = subtaskRows.filter((row) => row.isDone).length;
    const allComplete = completed === subtaskRows.length;
    const progress = Math.round((completed / subtaskRows.length) * 100);

    let correctedStatus: string | undefined;
    if (allComplete && task.status !== 'done') {
      correctedStatus = 'done';
    } else if (task.status === 'done' && !allComplete) {
      correctedStatus = completed > 0 ? 'in_progress' : 'todo';
    }

    await this.db
      .update(tasks)
      .set({
        progress,
        ...(correctedStatus ? { status: correctedStatus } : {}),
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));
  }

  private async getUserOrThrow(userId: string): Promise<ProfileRow> {
    const [user] = await this.db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(eq(users.id, userId));
    return user ?? { id: userId, fullName: 'A collaborator' };
  }

  private async loadProfiles(
    userIds: string[],
  ): Promise<Map<string, ProfileRow>> {
    if (!userIds.length) return new Map();
    const rows = await this.db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(inArray(users.id, userIds));
    return new Map(rows.map((row) => [row.id, row]));
  }
}
