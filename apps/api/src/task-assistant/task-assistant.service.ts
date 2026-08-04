import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { createHash } from 'crypto';
import { DatabaseService } from '../db/database.service';
import {
  taskAssistantContexts,
  taskAssistantEvaluations,
  taskAssistantNotifications,
  taskAssistantPreferences,
  taskAssistantSuggestions,
  taskAssistantTimelineStages,
  subtasks,
  tasks,
  users,
} from '../db/schema';
import { WeatherTravelService } from '../weather-travel/weather-travel.service';
import type {
  Destination,
  TravelMode,
} from '../weather-travel/weather-travel.types';
import { zonedDateTime } from '../weather-travel/zoned-time';
import {
  TASK_CONTEXTS,
  type TaskAssistantPreferences,
  type TaskContextType,
} from './task-assistant.types';
import { TaskContextClassifier } from './task-context.classifier';
import { TaskContextExtractor } from './task-context.extractor';
import { TaskContextValidationService } from './task-context.validation';
import { TaskPreparationEngine } from './task-preparation.engine';
import { ProactiveTaskAssistantEngine } from './proactive-task-assistant.engine';

const DEFAULTS: TaskAssistantPreferences = {
  enabled: true,
  preparationChecklistsEnabled: true,
  travelAdviceEnabled: true,
  weatherAdviceEnabled: true,
  documentAdviceEnabled: true,
  clothingAdviceEnabled: true,
  umbrellaAdviceEnabled: true,
  hydrationAdviceEnabled: true,
  proactiveAssistanceEnabled: true,
  dynamicPreparationEnabled: true,
  dynamicPackingEnabled: true,
  contextTimelineEnabled: true,
  contextualNotificationsEnabled: true,
  electronicsAdviceEnabled: true,
  medicationAdviceEnabled: true,
  departureRemindersEnabled: true,
  notificationMode: 'smart',
  defaultTravelMode: 'driving',
  language: 'en',
};
type EnrichmentPreview = {
  recommendedDepartureTime?: string | null;
  fingerprint?: string;
  recommendations?: { recommendationTypes?: string[] };
};

@Injectable()
export class TaskAssistantService {
  private readonly logger = new Logger(TaskAssistantService.name);
  constructor(
    private readonly database: DatabaseService,
    private readonly extractor: TaskContextExtractor,
    private readonly classifier: TaskContextClassifier,
    private readonly preparation: TaskPreparationEngine,
    private readonly validation: TaskContextValidationService,
    private readonly weatherTravel: WeatherTravelService,
    private readonly proactive: ProactiveTaskAssistantEngine,
  ) {}
  private get db() {
    return this.database.db;
  }

  async getPreferences(userId: string) {
    try {
      const [row] = await this.db
        .select()
        .from(taskAssistantPreferences)
        .where(eq(taskAssistantPreferences.userId, userId))
        .limit(1);
      return row ? preferenceEntity(row) : { ...DEFAULTS };
    } catch (error) {
      const code = databaseErrorCode(error);
      this.logger.error(
        `Unable to load Task Assistant preferences (databaseCode=${code ?? 'unknown'}).`,
      );
      throw new ServiceUnavailableException(
        'Task Assistant settings are temporarily unavailable.',
      );
    }
  }
  async updatePreferences(userId: string, input: unknown) {
    const preferences = validatePreferences(input);
    const values = { ...preferences, userId, updatedAt: new Date() };
    await this.db
      .insert(taskAssistantPreferences)
      .values(values)
      .onConflictDoUpdate({
        target: taskAssistantPreferences.userId,
        set: values,
      });
    const active = await this.db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          inArray(tasks.status, ['todo', 'in_progress', 'blocked']),
        ),
      );
    for (const task of active)
      void this.refresh(userId, task.id).catch(() => undefined);
    return this.getPreferences(userId);
  }

  async getTaskAssistant(userId: string, taskId: string) {
    const [task] = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
      .limit(1);
    if (!task) throw new NotFoundException('Task not found.');
    let [context] = await this.db
      .select()
      .from(taskAssistantContexts)
      .where(
        and(
          eq(taskAssistantContexts.userId, userId),
          eq(taskAssistantContexts.taskId, taskId),
        ),
      )
      .limit(1);
    if (!context || context.scheduleVersion !== scheduleVersion(task))
      context = await this.refresh(userId, taskId);
    const suggestions = await this.db
      .select()
      .from(taskAssistantSuggestions)
      .where(
        and(
          eq(taskAssistantSuggestions.contextId, context.id),
          inArray(taskAssistantSuggestions.status, [
            'pending',
            'accepted',
            'completed',
          ]),
        ),
      );
    const timeline = await this.db
      .select()
      .from(taskAssistantTimelineStages)
      .where(
        and(
          eq(taskAssistantTimelineStages.contextId, context.id),
          inArray(taskAssistantTimelineStages.status, ['pending', 'completed']),
        ),
      )
      .orderBy(taskAssistantTimelineStages.scheduledAt);
    const contextualNotifications = await this.db
      .select()
      .from(taskAssistantNotifications)
      .where(
        and(
          eq(taskAssistantNotifications.contextId, context.id),
          inArray(taskAssistantNotifications.status, [
            'pending',
            'scheduled',
            'delivered',
          ]),
        ),
      );
    let travelWeather: unknown = null;
    if (task.destination && task.scheduledDate && task.scheduledStartTime) {
      try {
        travelWeather = await this.weatherTravel.previewTask(
          userId,
          taskId,
          undefined,
          true,
        );
      } catch {
        travelWeather = null;
      }
    }
    return {
      context,
      suggestions,
      timeline,
      contextualNotifications,
      travelWeather,
    };
  }

  async refresh(
    userId: string,
    taskId: string,
    correctedContext?: TaskContextType,
  ) {
    const [task, children, user] = await Promise.all([
      this.db
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
        .limit(1)
        .then((rows) => rows[0]),
      this.db
        .select({ title: subtasks.title, description: subtasks.description })
        .from(subtasks)
        .where(eq(subtasks.taskId, taskId)),
      this.db
        .select({ timezone: users.timezone })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
        .then((rows) => rows[0]),
    ]);
    if (!task) throw new NotFoundException('Task not found.');
    const existing = await this.db
      .select()
      .from(taskAssistantContexts)
      .where(
        and(
          eq(taskAssistantContexts.userId, userId),
          eq(taskAssistantContexts.taskId, taskId),
        ),
      )
      .limit(1);
    const correction =
      correctedContext ??
      (existing[0]?.correctedContext as TaskContextType | undefined);
    const classified = this.classifier.classify(
      this.extractor.extract({
        taskId,
        title: task.title,
        description: task.description,
        category: task.category,
        labels: stringArray(task.labels),
        subtasks: children,
        attachments: recordArray(task.attachments),
        destination: task.destination as Destination | null,
        scheduledDate: task.scheduledDate,
        scheduledStartTime: task.scheduledStartTime,
        dueDate: task.dueDate,
        travelMode: task.travelMode as TravelMode | null,
        correctedContext: correction ?? null,
      }),
    );
    if (task.scheduledDate && task.scheduledStartTime)
      classified.scheduledExecution = zonedDateTime(
        task.scheduledDate,
        task.scheduledStartTime.slice(0, 5),
        user?.timezone ?? 'UTC',
      ).toISOString();
    const contextValues = {
      userId,
      taskId,
      subtaskId: null,
      primaryContext: classified.primaryContext,
      secondaryContexts: classified.secondaryContexts,
      confidence: classified.confidence,
      confidenceReason: classified.confidenceReason,
      assumptions: classified.assumptions,
      correctedContext: correction ?? null,
      scheduleVersion: scheduleVersion(task),
      generatedAt: new Date(),
      updatedAt: new Date(),
    };
    const [context] = await this.db
      .insert(taskAssistantContexts)
      .values(contextValues)
      .onConflictDoUpdate({
        target: [taskAssistantContexts.userId, taskAssistantContexts.taskId],
        set: contextValues,
      })
      .returning();
    await this.db
      .update(taskAssistantSuggestions)
      .set({ status: 'invalidated', updatedAt: new Date() })
      .where(
        and(
          eq(taskAssistantSuggestions.contextId, context.id),
          inArray(taskAssistantSuggestions.status, ['pending', 'accepted']),
          eq(taskAssistantSuggestions.lockedByUser, false),
        ),
      );
    const preferences = await this.getPreferences(userId);
    let enrichment: EnrichmentPreview | null = null;
    if (task.destination && task.scheduledDate && task.scheduledStartTime) {
      try {
        enrichment = (await this.weatherTravel.previewTask(
          userId,
          taskId,
          undefined,
          true,
        )) as unknown as EnrichmentPreview;
      } catch {
        enrichment = null;
      }
    }
    const protectedSuggestions = await this.db
      .select({ type: taskAssistantSuggestions.type })
      .from(taskAssistantSuggestions)
      .where(
        and(
          eq(taskAssistantSuggestions.contextId, context.id),
          inArray(taskAssistantSuggestions.status, ['completed', 'dismissed']),
        ),
      );
    const generated = this.validation.validate(
      classified,
      this.preparation.generate(classified, preferences),
    );
    const proactive = this.proactive.evaluate({
      userId,
      context: classified,
      preferences,
      scheduleVersion: contextValues.scheduleVersion,
      excludedSuggestionTypes: new Set(
        protectedSuggestions.map((item) => item.type),
      ),
      recommendedDeparture: enrichment?.recommendedDepartureTime
        ? new Date(enrichment.recommendedDepartureTime)
        : null,
      packingEvidence: {
        tripDays: inferTripDays(classified.text),
        cold:
          enrichment?.recommendations?.recommendationTypes?.some((type) =>
            ['cold_clothing', 'very_cold_clothing'].includes(type),
          ) ?? false,
        rain:
          enrichment?.recommendations?.recommendationTypes?.some((type) =>
            ['umbrella', 'rain_protection'].includes(type),
          ) ?? false,
      },
    });
    for (const suggestion of [...generated, ...proactive.packingNeeds]) {
      const fingerprint =
        'fingerprint' in suggestion
          ? String(suggestion.fingerprint)
          : createHash('sha256')
              .update(`${taskId}|${suggestion.type}|${suggestion.title}`)
              .digest('hex');
      const suggestionValues = {
        contextId: context.id,
        ...suggestion,
        fingerprint,
        dueAt: suggestion.dueAt ? new Date(suggestion.dueAt) : null,
        notificationAt: suggestion.notificationAt
          ? new Date(suggestion.notificationAt)
          : null,
        quantity: suggestion.quantity ?? null,
        quantityUnit: suggestion.quantityUnit ?? null,
        category: suggestion.category ?? null,
        priority: suggestion.priority ?? 'medium',
        notificationEligible: suggestion.notificationEligible ?? false,
      };
      const [existingSuggestion] = await this.db
        .select({
          id: taskAssistantSuggestions.id,
          status: taskAssistantSuggestions.status,
          lockedByUser: taskAssistantSuggestions.lockedByUser,
        })
        .from(taskAssistantSuggestions)
        .where(eq(taskAssistantSuggestions.fingerprint, fingerprint))
        .limit(1);
      if (
        existingSuggestion?.status === 'invalidated' &&
        !existingSuggestion.lockedByUser
      )
        await this.db
          .update(taskAssistantSuggestions)
          .set({
            ...suggestionValues,
            status: 'pending',
            updatedAt: new Date(),
          })
          .where(eq(taskAssistantSuggestions.id, existingSuggestion.id));
      else if (!existingSuggestion)
        await this.db.insert(taskAssistantSuggestions).values(suggestionValues);
    }
    await this.db
      .update(taskAssistantTimelineStages)
      .set({
        status: 'invalidated',
        invalidatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(taskAssistantTimelineStages.contextId, context.id),
          eq(taskAssistantTimelineStages.status, 'pending'),
        ),
      );
    await this.db
      .update(taskAssistantNotifications)
      .set({ status: 'invalidated', updatedAt: new Date() })
      .where(
        and(
          eq(taskAssistantNotifications.contextId, context.id),
          inArray(taskAssistantNotifications.status, [
            'pending',
            'scheduled',
            'failed_retryable',
          ]),
        ),
      );
    for (const stage of proactive.timelineStages) {
      const [existingStage] = await this.db
        .select({
          id: taskAssistantTimelineStages.id,
          status: taskAssistantTimelineStages.status,
        })
        .from(taskAssistantTimelineStages)
        .where(eq(taskAssistantTimelineStages.fingerprint, stage.fingerprint))
        .limit(1);
      if (existingStage?.status === 'invalidated')
        await this.db
          .update(taskAssistantTimelineStages)
          .set({
            ...stage,
            status: stage.status,
            invalidatedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(taskAssistantTimelineStages.id, existingStage.id));
      else if (!existingStage)
        await this.db
          .insert(taskAssistantTimelineStages)
          .values({ userId, contextId: context.id, ...stage });
    }
    for (const notification of proactive.notifications) {
      const [existingNotification] = await this.db
        .select({
          id: taskAssistantNotifications.id,
          status: taskAssistantNotifications.status,
        })
        .from(taskAssistantNotifications)
        .where(
          eq(taskAssistantNotifications.fingerprint, notification.fingerprint),
        )
        .limit(1);
      if (existingNotification?.status === 'invalidated')
        await this.db
          .update(taskAssistantNotifications)
          .set({ ...notification, status: 'pending', updatedAt: new Date() })
          .where(eq(taskAssistantNotifications.id, existingNotification.id));
      else if (!existingNotification)
        await this.db
          .insert(taskAssistantNotifications)
          .values({ userId, taskId, contextId: context.id, ...notification });
    }
    await this.db
      .update(taskAssistantEvaluations)
      .set({
        status: 'invalidated',
        invalidatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(taskAssistantEvaluations.userId, userId),
          eq(taskAssistantEvaluations.taskId, taskId),
          eq(taskAssistantEvaluations.status, 'current'),
        ),
      );
    await this.db.insert(taskAssistantEvaluations).values({
      userId,
      taskId,
      contextVersion: context.id,
      scheduleVersion: contextValues.scheduleVersion,
      evidenceVersion: enrichment?.fingerprint ?? contextValues.scheduleVersion,
      confidence: classified.confidence,
      validUntil: proactive.validUntil,
    });
    return context;
  }

  async correctContext(userId: string, taskId: string, context: unknown) {
    if (
      typeof context !== 'string' ||
      !TASK_CONTEXTS.includes(context as TaskContextType)
    )
      throw new BadRequestException('Unsupported task context.');
    await this.refresh(userId, taskId, context as TaskContextType);
    return this.getTaskAssistant(userId, taskId);
  }
  async updateSuggestion(
    userId: string,
    taskId: string,
    suggestionId: string,
    input: unknown,
  ) {
    const [row] = await this.db
      .select({ id: taskAssistantSuggestions.id })
      .from(taskAssistantSuggestions)
      .innerJoin(
        taskAssistantContexts,
        eq(taskAssistantSuggestions.contextId, taskAssistantContexts.id),
      )
      .where(
        and(
          eq(taskAssistantSuggestions.id, suggestionId),
          eq(taskAssistantContexts.taskId, taskId),
          eq(taskAssistantContexts.userId, userId),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundException('Suggestion not found.');
    const values = isRecord(input) ? input : {};
    const allowed = ['pending', 'accepted', 'completed', 'dismissed'] as const;
    const status =
      typeof values.status === 'string' &&
      allowed.includes(values.status as (typeof allowed)[number])
        ? (values.status as (typeof allowed)[number])
        : undefined;
    await this.db
      .update(taskAssistantSuggestions)
      .set({
        ...(typeof values.title === 'string'
          ? { title: values.title.slice(0, 255) }
          : {}),
        ...(typeof values.description === 'string'
          ? { description: values.description }
          : {}),
        ...(typeof values.quantity === 'string'
          ? {
              quantity: values.quantity.slice(0, 80),
              userEdited: true,
              lockedByUser: true,
            }
          : {}),
        ...(status
          ? {
              status,
              completedAt: status === 'completed' ? new Date() : null,
              dismissedAt: status === 'dismissed' ? new Date() : null,
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(taskAssistantSuggestions.id, suggestionId));
    return this.getTaskAssistant(userId, taskId);
  }
  async invalidateTask(userId: string, taskId: string) {
    const contexts = await this.db
      .select({ id: taskAssistantContexts.id })
      .from(taskAssistantContexts)
      .where(
        and(
          eq(taskAssistantContexts.userId, userId),
          eq(taskAssistantContexts.taskId, taskId),
        ),
      );
    for (const context of contexts)
      await this.db
        .update(taskAssistantSuggestions)
        .set({ status: 'invalidated', updatedAt: new Date() })
        .where(
          and(
            eq(taskAssistantSuggestions.contextId, context.id),
            inArray(taskAssistantSuggestions.status, ['pending', 'accepted']),
          ),
        );
    if (contexts.length)
      await this.db
        .update(taskAssistantTimelineStages)
        .set({
          status: 'invalidated',
          invalidatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          inArray(
            taskAssistantTimelineStages.contextId,
            contexts.map((item) => item.id),
          ),
        );
    await this.db
      .update(taskAssistantNotifications)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(
        and(
          eq(taskAssistantNotifications.userId, userId),
          eq(taskAssistantNotifications.taskId, taskId),
          inArray(taskAssistantNotifications.status, [
            'pending',
            'scheduled',
            'failed_retryable',
          ]),
        ),
      );
  }
  async updateNotification(
    userId: string,
    taskId: string,
    notificationId: string,
    input: unknown,
  ) {
    const values = isRecord(input) ? input : {};
    const [row] = await this.db
      .select()
      .from(taskAssistantNotifications)
      .where(
        and(
          eq(taskAssistantNotifications.id, notificationId),
          eq(taskAssistantNotifications.userId, userId),
          eq(taskAssistantNotifications.taskId, taskId),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundException('Contextual notification not found.');
    const scheduledAt =
      typeof values.scheduledAt === 'string'
        ? new Date(values.scheduledAt)
        : null;
    if (scheduledAt && Number.isNaN(scheduledAt.getTime()))
      throw new BadRequestException('Invalid notification time.');
    const status =
      values.status === 'dismissed' || values.status === 'cancelled'
        ? values.status
        : undefined;
    await this.db
      .update(taskAssistantNotifications)
      .set({
        ...(scheduledAt ? { scheduledAt, status: 'pending' } : {}),
        ...(status ? { status } : {}),
        updatedAt: new Date(),
      })
      .where(eq(taskAssistantNotifications.id, notificationId));
    return this.getTaskAssistant(userId, taskId);
  }
}

function scheduleVersion(task: typeof tasks.$inferSelect) {
  return createHash('sha256')
    .update(
      [
        task.updatedAt,
        task.status,
        task.scheduledDate,
        task.scheduledStartTime,
        JSON.stringify(task.destination),
        task.title,
      ].join('|'),
    )
    .digest('hex')
    .slice(0, 40);
}
function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
function recordArray(value: unknown): { name?: string; fileName?: string }[] {
  return Array.isArray(value)
    ? value.filter(isRecord).map((item) => ({
        ...(typeof item.name === 'string' ? { name: item.name } : {}),
        ...(typeof item.fileName === 'string'
          ? { fileName: item.fileName }
          : {}),
      }))
    : [];
}
function preferenceEntity(
  row: typeof taskAssistantPreferences.$inferSelect,
): TaskAssistantPreferences {
  return {
    enabled: row.enabled ?? DEFAULTS.enabled,
    preparationChecklistsEnabled:
      row.preparationChecklistsEnabled ?? DEFAULTS.preparationChecklistsEnabled,
    travelAdviceEnabled:
      row.travelAdviceEnabled ?? DEFAULTS.travelAdviceEnabled,
    weatherAdviceEnabled:
      row.weatherAdviceEnabled ?? DEFAULTS.weatherAdviceEnabled,
    documentAdviceEnabled:
      row.documentAdviceEnabled ?? DEFAULTS.documentAdviceEnabled,
    clothingAdviceEnabled:
      row.clothingAdviceEnabled ?? DEFAULTS.clothingAdviceEnabled,
    umbrellaAdviceEnabled:
      row.umbrellaAdviceEnabled ?? DEFAULTS.umbrellaAdviceEnabled,
    hydrationAdviceEnabled:
      row.hydrationAdviceEnabled ?? DEFAULTS.hydrationAdviceEnabled,
    proactiveAssistanceEnabled:
      row.proactiveAssistanceEnabled ?? DEFAULTS.proactiveAssistanceEnabled,
    dynamicPreparationEnabled:
      row.dynamicPreparationEnabled ?? DEFAULTS.dynamicPreparationEnabled,
    dynamicPackingEnabled:
      row.dynamicPackingEnabled ?? DEFAULTS.dynamicPackingEnabled,
    contextTimelineEnabled:
      row.contextTimelineEnabled ?? DEFAULTS.contextTimelineEnabled,
    contextualNotificationsEnabled:
      row.contextualNotificationsEnabled ??
      DEFAULTS.contextualNotificationsEnabled,
    electronicsAdviceEnabled:
      row.electronicsAdviceEnabled ?? DEFAULTS.electronicsAdviceEnabled,
    medicationAdviceEnabled:
      row.medicationAdviceEnabled ?? DEFAULTS.medicationAdviceEnabled,
    departureRemindersEnabled:
      row.departureRemindersEnabled ?? DEFAULTS.departureRemindersEnabled,
    notificationMode: ['smart', 'minimal', 'important_only'].includes(
      row.notificationMode,
    )
      ? (row.notificationMode as TaskAssistantPreferences['notificationMode'])
      : 'smart',
    defaultTravelMode: ['driving', 'walking', 'cycling'].includes(
      row.defaultTravelMode,
    )
      ? (row.defaultTravelMode as TaskAssistantPreferences['defaultTravelMode'])
      : 'driving',
    language: row.language === 'ar' ? 'ar' : 'en',
  };
}
function validatePreferences(input: unknown): TaskAssistantPreferences {
  const values = isRecord(input) ? input : {};
  const mode = ['smart', 'minimal', 'important_only'].includes(
    typeof values.notificationMode === 'string' ? values.notificationMode : '',
  )
    ? (values.notificationMode as TaskAssistantPreferences['notificationMode'])
    : 'smart';
  const travel = ['driving', 'walking', 'cycling'].includes(
    typeof values.defaultTravelMode === 'string'
      ? values.defaultTravelMode
      : '',
  )
    ? (values.defaultTravelMode as TaskAssistantPreferences['defaultTravelMode'])
    : 'driving';
  return {
    ...DEFAULTS,
    ...Object.fromEntries(
      Object.keys(DEFAULTS)
        .filter(
          (key) =>
            typeof DEFAULTS[key as keyof TaskAssistantPreferences] ===
            'boolean',
        )
        .map((key) => [key, values[key] !== false]),
    ),
    notificationMode: mode,
    defaultTravelMode: travel,
    language: values.language === 'ar' ? 'ar' : 'en',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function databaseErrorCode(error: unknown): string | null {
  if (!isRecord(error)) return null;
  if (typeof error.code === 'string') return error.code;
  return isRecord(error.cause) && typeof error.cause.code === 'string'
    ? error.cause.code
    : null;
}

function inferTripDays(text: string): number | null {
  const match = text.match(/\b(\d{1,3})\s*(?:day|days|night|nights)\b/i);
  if (!match) return null;
  const days = Number(match[1]);
  return days > 0 && days <= 365 ? days : null;
}
