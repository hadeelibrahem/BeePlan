import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import {
  challenges,
  focusSessions,
  tasks,
  userChallengeProgress,
} from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';
import {
  RuntimeTelemetryRegistry,
  runtimeTelemetry,
} from '../admin/system-health/runtime-telemetry.registry';

export const CHALLENGE_TYPES = [
  'focus_minutes',
  'focus_sessions',
  'tasks_completed',
] as const;
export const CHALLENGE_STATUSES = [
  'draft',
  'scheduled',
  'active',
  'completed',
  'cancelled',
] as const;
export type ChallengeType = (typeof CHALLENGE_TYPES)[number];
type Challenge = typeof challenges.$inferSelect;

export type ChallengeAnalytics = {
  challengeId: string;
  participants: number;
  madeProgress: number;
  completed: number;
  notStarted: number;
  inProgress: number;
  completionRate: number;
  engagementRate: number;
  averageProgressPercent: number;
  target: number;
  metricType: string;
  startsAt: string;
  endsAt: string;
  status: string;
};

export function calculateChallengeAnalytics(input: {
  challengeId: string;
  target: number;
  metricType: string;
  startAt: Date | string;
  endAt: Date | string;
  status: string;
  participants: number;
  madeProgress: number;
  completed: number;
  notStarted: number;
  inProgress: number;
  averageProgressPercent: number;
}): ChallengeAnalytics {
  const participants = Math.max(0, Number(input.participants) || 0);
  const madeProgress = Math.max(0, Number(input.madeProgress) || 0);
  const completed = Math.max(0, Number(input.completed) || 0);
  const notStarted = Math.max(0, Number(input.notStarted) || 0);
  const inProgress = Math.max(0, Number(input.inProgress) || 0);
  const rate = (value: number) =>
    participants ? Math.min(100, Math.max(0, (value / participants) * 100)) : 0;
  const averageProgressPercent = participants
    ? Math.min(100, Math.max(0, Number(input.averageProgressPercent) || 0))
    : 0;
  return {
    challengeId: input.challengeId,
    participants,
    madeProgress,
    completed,
    notStarted,
    inProgress,
    completionRate: rate(completed),
    engagementRate: rate(madeProgress),
    averageProgressPercent,
    target: Math.max(0, Number(input.target) || 0),
    metricType: input.metricType,
    startsAt: new Date(input.startAt).toISOString(),
    endsAt: new Date(input.endAt).toISOString(),
    status: input.status,
  };
}

@Injectable()
export class ChallengesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly notifications: NotificationsService,
    private readonly telemetry: RuntimeTelemetryRegistry = runtimeTelemetry,
  ) {}
  private get db() {
    return this.database.db;
  }
  private lifecycle(row: Challenge, now = new Date()) {
    if (row.status === 'draft' || row.status === 'cancelled') return row.status;
    if (row.endAt <= now) return 'completed';
    return row.startAt <= now ? 'active' : 'scheduled';
  }
  private entity(row: Challenge) {
    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      publishedAt: row.publishedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
    };
  }
  private validate(
    input: {
      title?: string;
      description?: string;
      type?: string;
      targetValue?: number;
      startAt?: string;
      endAt?: string;
      rewardType?: unknown;
      rewardValue?: unknown;
      badgeKey?: unknown;
    },
    required = false,
  ) {
    if (
      required &&
      (!input.title?.trim() ||
        !input.type ||
        !input.startAt ||
        !input.endAt ||
        input.targetValue === undefined)
    )
      throw new BadRequestException(
        'Title, type, targetValue, startAt and endAt are required.',
      );
    if (
      input.title !== undefined &&
      (input.title.trim().length < 1 || input.title.trim().length > 160)
    )
      throw new BadRequestException('Title must be 1–160 characters.');
    if (input.description !== undefined && input.description.length > 2000)
      throw new BadRequestException(
        'Description must be at most 2000 characters.',
      );
    if (
      input.type !== undefined &&
      !CHALLENGE_TYPES.includes(input.type as ChallengeType)
    )
      throw new BadRequestException('Invalid challenge type.');
    if (
      input.targetValue !== undefined &&
      (!Number.isInteger(input.targetValue) || input.targetValue <= 0)
    )
      throw new BadRequestException('targetValue must be a positive integer.');
    if (input.startAt && Number.isNaN(new Date(input.startAt).getTime()))
      throw new BadRequestException('Invalid startAt.');
    if (input.endAt && Number.isNaN(new Date(input.endAt).getTime()))
      throw new BadRequestException('Invalid endAt.');
    if (
      input.startAt &&
      input.endAt &&
      new Date(input.endAt) <= new Date(input.startAt)
    )
      throw new BadRequestException('endAt must be after startAt.');
    if (
      input.rewardType !== undefined ||
      input.rewardValue !== undefined ||
      input.badgeKey !== undefined
    )
      throw new BadRequestException('Rewards are not supported yet.');
  }
  async create(adminId: string, dto: any) {
    this.validate(dto, true);
    const [row] = await this.db
      .insert(challenges)
      .values({
        title: dto.title.trim(),
        description: dto.description?.trim() ?? '',
        type: dto.type,
        targetValue: dto.targetValue,
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
        createdByAdminId: adminId,
      })
      .returning();
    return this.entity(row);
  }
  async get(id: string) {
    const [row] = await this.db
      .select()
      .from(challenges)
      .where(eq(challenges.id, id));
    if (!row) throw new NotFoundException('Challenge not found.');
    return row;
  }
  async listAdmin(query: any) {
    await this.transitionStatuses();
    const clauses = [];
    if (query.status && CHALLENGE_STATUSES.includes(query.status))
      clauses.push(eq(challenges.status, query.status));
    if (query.type && CHALLENGE_TYPES.includes(query.type))
      clauses.push(eq(challenges.type, query.type));
    if (query.from) clauses.push(gte(challenges.endAt, new Date(query.from)));
    if (query.to) clauses.push(lte(challenges.startAt, new Date(query.to)));
    const page = Math.max(1, Number(query.page) || 1),
      limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const rows = await this.db
      .select()
      .from(challenges)
      .where(clauses.length ? and(...clauses) : undefined)
      .orderBy(
        asc(
          sql`case ${challenges.status} when 'active' then 1 when 'scheduled' then 2 when 'draft' then 3 when 'completed' then 4 else 5 end`,
        ),
        desc(challenges.startAt),
      )
      .limit(limit)
      .offset((page - 1) * limit);
    return {
      items: await Promise.all(rows.map((row) => this.adminDetail(row))),
      page,
      limit,
    };
  }
  async adminDetail(row: Challenge) {
    const [metric] = await this.db
      .select({
        participants: sql<number>`count(*) filter (where ${userChallengeProgress.progressValue} > 0)`,
        completed: sql<number>`count(*) filter (where ${userChallengeProgress.completedAt} is not null)`,
        totalProgress: sql<number>`coalesce(sum(${userChallengeProgress.progressValue}), 0)`,
      })
      .from(userChallengeProgress)
      .where(eq(userChallengeProgress.challengeId, row.id));
    const participants = Number(metric?.participants ?? 0),
      completed = Number(metric?.completed ?? 0);
    return {
      ...this.entity(row),
      metrics: {
        participants,
        completed,
        completionRate: participants ? completed / participants : 0,
        totalProgress: Number(metric?.totalProgress ?? 0),
      },
    };
  }
  async analytics(id: string) {
    await this.transitionStatuses();
    const challenge = await this.get(id);
    const [metric] = await this.db
      .select({
        participants: sql<number>`count(*)`,
        madeProgress: sql<number>`count(*) filter (where ${userChallengeProgress.progressValue} > 0)`,
        completed: sql<number>`count(*) filter (where ${userChallengeProgress.completedAt} is not null)`,
        notStarted: sql<number>`count(*) filter (where ${userChallengeProgress.progressValue} <= 0 and ${userChallengeProgress.completedAt} is null)`,
        inProgress: sql<number>`count(*) filter (where ${userChallengeProgress.progressValue} > 0 and ${userChallengeProgress.completedAt} is null)`,
        averageProgressPercent: sql<number>`coalesce(avg(case when ${challenge.targetValue} > 0 then least(greatest(${userChallengeProgress.progressValue} * 100.0 / ${challenge.targetValue}, 0), 100) else 0 end), 0)`,
      })
      .from(userChallengeProgress)
      .where(eq(userChallengeProgress.challengeId, id));
    return calculateChallengeAnalytics({
      challengeId: id,
      target: challenge.targetValue,
      metricType: challenge.type,
      startAt: challenge.startAt,
      endAt: challenge.endAt,
      status: this.lifecycle(challenge),
      participants: Number(metric?.participants ?? 0),
      madeProgress: Number(metric?.madeProgress ?? 0),
      completed: Number(metric?.completed ?? 0),
      notStarted: Number(metric?.notStarted ?? 0),
      inProgress: Number(metric?.inProgress ?? 0),
      averageProgressPercent: Number(metric?.averageProgressPercent ?? 0),
    });
  }
  async detailAdmin(id: string) {
    await this.transitionStatuses();
    return this.adminDetail(await this.get(id));
  }
  async update(adminId: string, id: string, dto: any) {
    const row = await this.get(id);
    this.validate(dto);
    const core = [
      'type',
      'targetValue',
      'startAt',
      'endAt',
      'rewardType',
      'rewardValue',
      'badgeKey',
    ];
    if (row.status !== 'draft' && core.some((key) => dto[key] !== undefined))
      throw new BadRequestException(
        'Core challenge settings are locked after publishing.',
      );
    const values: any = { updatedAt: new Date() };
    for (const key of ['title', 'description', 'type', 'targetValue'])
      if (dto[key] !== undefined)
        values[key] = typeof dto[key] === 'string' ? dto[key].trim() : dto[key];
    if (dto.startAt) values.startAt = new Date(dto.startAt);
    if (dto.endAt) values.endAt = new Date(dto.endAt);
    const merged = { ...row, ...values };
    if (merged.endAt <= merged.startAt)
      throw new BadRequestException('endAt must be after startAt.');
    const [updated] = await this.db
      .update(challenges)
      .set(values)
      .where(eq(challenges.id, id))
      .returning();
    return this.entity(updated);
  }
  async publish(id: string) {
    const row = await this.get(id);
    if (row.status !== 'draft')
      throw new BadRequestException('Only draft challenges can be published.');
    const now = new Date();
    const status =
      row.startAt <= now && now < row.endAt
        ? 'active'
        : row.startAt > now
          ? 'scheduled'
          : 'completed';
    const [updated] = await this.db
      .update(challenges)
      .set({ status, publishedAt: now, updatedAt: now })
      .where(eq(challenges.id, id))
      .returning();
    return this.entity(updated);
  }
  async cancel(id: string) {
    const row = await this.get(id);
    if (!['scheduled', 'active'].includes(row.status))
      throw new BadRequestException(
        'Only scheduled or active challenges can be cancelled.',
      );
    const now = new Date();
    const [updated] = await this.db
      .update(challenges)
      .set({ status: 'cancelled', cancelledAt: now, updatedAt: now })
      .where(eq(challenges.id, id))
      .returning();
    return this.entity(updated);
  }
  async progressFor(userId: string, challenge: Challenge) {
    const now = new Date();
    if (
      this.lifecycle(challenge, now) === 'cancelled' ||
      challenge.status === 'draft'
    )
      return null;
    let value = 0;
    const window = [
      eq(focusSessions.userId, userId),
      eq(focusSessions.status, 'completed'),
      gte(focusSessions.endedAt, challenge.startAt),
      lte(focusSessions.endedAt, challenge.endAt),
    ];
    if (challenge.type === 'tasks_completed') {
      const [row] = await this.db
        .select({ value: sql<number>`count(*)` })
        .from(tasks)
        .where(
          and(
            eq(tasks.userId, userId),
            eq(tasks.status, 'done'),
            gte(tasks.completedAt, challenge.startAt),
            lte(tasks.completedAt, challenge.endAt),
          ),
        );
      value = Number(row?.value ?? 0);
    } else {
      const [row] = await this.db
        .select({
          value:
            challenge.type === 'focus_minutes'
              ? sql<number>`coalesce(sum(${focusSessions.actualMinutes}), 0)`
              : sql<number>`count(*)`,
        })
        .from(focusSessions)
        .where(and(...window));
      value = Number(row?.value ?? 0);
    }
    value = Math.min(value, challenge.targetValue);
    const existing = await this.db
      .select()
      .from(userChallengeProgress)
      .where(
        and(
          eq(userChallengeProgress.challengeId, challenge.id),
          eq(userChallengeProgress.userId, userId),
        ),
      )
      .limit(1);
    const prior = existing[0];
    const completedNow =
      value >= challenge.targetValue &&
      !prior?.completedAt &&
      this.lifecycle(challenge, now) === 'active';
    const completionAt = completedNow ? now : (prior?.completedAt ?? null);
    const [saved] = await this.db
      .insert(userChallengeProgress)
      .values({
        challengeId: challenge.id,
        userId,
        progressValue: value,
        completedAt: completionAt,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          userChallengeProgress.challengeId,
          userChallengeProgress.userId,
        ],
        set: {
          progressValue: value,
          completedAt: completionAt,
          updatedAt: now,
        },
      })
      .returning();
    if (completedNow)
      await this.notifications.createOnce(
        {
          userId,
          type: 'challenge_completed' as any,
          title: 'Challenge completed',
          body: `You completed “${challenge.title}”.`,
          data: { challengeId: challenge.id },
        },
        {
          entityType: 'challenge_completion',
          entityId: `${challenge.id}:${userId}`,
          triggerAt: now,
        },
      );
    return saved;
  }
  async visibleForUser(userId: string, id?: string) {
    await this.transitionStatuses();
    const now = new Date();
    const rows = await this.db
      .select()
      .from(challenges)
      .where(
        and(
          inArray(challenges.status, ['scheduled', 'active', 'completed']),
          id ? eq(challenges.id, id) : undefined,
        ),
      )
      .orderBy(desc(challenges.startAt));
    if (id && !rows.length) throw new NotFoundException('Challenge not found.');
    return Promise.all(
      rows.map(async (row) => {
        const progress = await this.progressFor(userId, row);
        return {
          id: row.id,
          title: row.title,
          description: row.description,
          type: row.type,
          targetValue: row.targetValue,
          status: this.lifecycle(row, now),
          startAt: row.startAt.toISOString(),
          endAt: row.endAt.toISOString(),
          reward: null,
          progressValue: progress?.progressValue ?? 0,
          completed: Boolean(progress?.completedAt),
          completedAt: progress?.completedAt?.toISOString() ?? null,
        };
      }),
    );
  }
  @Cron('*/5 * * * *') async transitionStatuses() {
    const started = Date.now();
    this.telemetry.workerStarted('challenge-worker');
    try {
      const now = new Date();
      await this.db
        .update(challenges)
        .set({ status: 'active', updatedAt: now })
        .where(
          and(
            eq(challenges.status, 'scheduled'),
            lte(challenges.startAt, now),
            gte(challenges.endAt, now),
          ),
        );
      await this.db
        .update(challenges)
        .set({ status: 'completed', updatedAt: now })
        .where(
          and(
            inArray(challenges.status, ['scheduled', 'active']),
            lte(challenges.endAt, now),
          ),
        );
      this.telemetry.workerSucceeded(
        'challenge-worker',
        Date.now() - started,
      );
    } catch (error) {
      this.telemetry.workerFailed(
        'challenge-worker',
        'database_failure',
        Date.now() - started,
      );
      throw error;
    }
  }
}
