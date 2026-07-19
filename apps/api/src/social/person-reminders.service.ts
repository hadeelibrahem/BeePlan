import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import {
  reminders as remindersTable,
  userLocationSnapshots,
} from '../db/schema';
import {
  CreatePersonReminderDto,
  UpdateLocationSnapshotDto,
} from './dto/social.dto';
import { FriendsService } from './friends.service';
import { LocationSharingService } from './location-sharing.service';
import { haversineMeters } from './proximity.util';

const DEFAULT_RADIUS_METERS = 100;
const MIN_RADIUS_METERS = 20;
const MAX_RADIUS_METERS = 1000;
const DEFAULT_COOLDOWN_MINUTES = 30;
const EXIT_HYSTERESIS_RATIO = 0.2;
const MIN_EXIT_HYSTERESIS_METERS = 20;

/**
 * Coerces an incoming radius into a valid meter value. Handles junk like "020"
 * (-> 20) or non-numeric input by falling back to the default, then clamps to
 * [20, 1000]. Keeps every stored person reminder within a sane radius.
 */
function normalizeRadius(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : (value as number);
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) {
    return DEFAULT_RADIUS_METERS;
  }
  return Math.min(
    MAX_RADIUS_METERS,
    Math.max(MIN_RADIUS_METERS, Math.round(parsed)),
  );
}

function getExitRadius(radiusMeters: number): number {
  return (
    radiusMeters +
    Math.max(
      MIN_EXIT_HYSTERESIS_METERS,
      Math.round(radiusMeters * EXIT_HYSTERESIS_RATIO),
    )
  );
}

/** Shape stored in reminders.person (jsonb). */
export type PersonReminderConfig = {
  targetUserId: string;
  targetName: string;
  message: string;
  radiusMeters: number;
  cooldownMinutes: number;
  permissionId: string | null;
  lastNotifiedAt: string | null;
  proximityState?: 'inside' | 'outside' | null;
  lastEnteredAt?: string | null;
  lastExitedAt?: string | null;
  lastTransitionAt?: string | null;
  completedAt?: string | null;
};

export type NearbyHit = {
  reminderId: string;
  title: string;
  message: string;
  targetName: string;
};

type ProximityEvaluation =
  | {
      action: 'skip';
      log: string;
      updatedConfig?: PersonReminderConfig;
      updatedStatus?: 'active' | 'done';
    }
  | {
      action: 'trigger';
      log: string;
      updatedConfig: PersonReminderConfig;
      updatedStatus: 'active' | 'done';
    };

export function evaluatePersonReminderProximity(args: {
  reminderId: string;
  repeat: string;
  config: PersonReminderConfig;
  distanceMeters: number;
  now: Date;
}): ProximityEvaluation {
  const { reminderId, repeat, config, distanceMeters, now } = args;
  const nowIso = now.toISOString();
  const radius = config.radiusMeters ?? DEFAULT_RADIUS_METERS;
  const exitRadius = getExitRadius(radius);
  const proximityState = config.proximityState ?? null;
  const isOneTime = repeat === 'none';

  if (isOneTime && config.completedAt) {
    return {
      action: 'skip',
      log: `[PersonReminder] skip: one-time reminder already completed (reminderId=${reminderId})`,
      updatedStatus: 'done',
    };
  }

  if (proximityState === 'inside') {
    if (distanceMeters > exitRadius) {
      return {
        action: 'skip',
        log: `[PersonReminder] re-armed: exited radius (reminderId=${reminderId}, distance=${Math.round(distanceMeters)}m, exitRadius=${exitRadius}m)`,
        updatedConfig: {
          ...config,
          proximityState: 'outside',
          lastExitedAt: nowIso,
          lastTransitionAt: nowIso,
        },
      };
    }

    return {
      action: 'skip',
      log: `[PersonReminder] skip: already nearby (reminderId=${reminderId}, distance=${Math.round(distanceMeters)}m, exitRadius=${exitRadius}m)`,
    };
  }

  if (proximityState === 'outside') {
    if (distanceMeters > radius) {
      return {
        action: 'skip',
        log: `[PersonReminder] skip: outside radius (reminderId=${reminderId}, distance=${Math.round(distanceMeters)}m, enterRadius=${radius}m)`,
      };
    }

    const cooldownMs =
      (config.cooldownMinutes ?? DEFAULT_COOLDOWN_MINUTES) * 60 * 1000;
    const lastNotifiedAt = config.lastNotifiedAt
      ? new Date(config.lastNotifiedAt).getTime()
      : 0;
    if (now.getTime() - lastNotifiedAt < cooldownMs) {
      return {
        action: 'skip',
        log: `[PersonReminder] skip: cooldown safeguard active after entry (reminderId=${reminderId})`,
        updatedConfig: {
          ...config,
          proximityState: 'inside',
          lastEnteredAt: nowIso,
          lastTransitionAt: nowIso,
        },
      };
    }

    return {
      action: 'trigger',
      log: `[PersonReminder] trigger: entered radius (reminderId=${reminderId}, distance=${Math.round(distanceMeters)}m, enterRadius=${radius}m)`,
      updatedStatus: isOneTime ? 'done' : 'active',
      updatedConfig: {
        ...config,
        proximityState: 'inside',
        lastEnteredAt: nowIso,
        lastTransitionAt: nowIso,
        lastNotifiedAt: nowIso,
        completedAt: isOneTime ? nowIso : config.completedAt ?? null,
      },
    };
  }

  if (distanceMeters <= radius) {
    return {
      action: 'skip',
      log: `[PersonReminder] skip: already nearby (reminderId=${reminderId}, distance=${Math.round(distanceMeters)}m, baseline initialized)`,
      updatedConfig: {
        ...config,
        proximityState: 'inside',
        lastTransitionAt: nowIso,
      },
    };
  }

  return {
    action: 'skip',
    log: `[PersonReminder] skip: outside radius (reminderId=${reminderId}, distance=${Math.round(distanceMeters)}m, baseline initialized)`,
    updatedConfig: {
      ...config,
      proximityState: 'outside',
      lastTransitionAt: nowIso,
    },
  };
}

@Injectable()
export class PersonRemindersService {
  private readonly logger = new Logger(PersonRemindersService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly friendsService: FriendsService,
    private readonly locationSharingService: LocationSharingService,
  ) {}

  private get db() {
    return this.databaseService.db;
  }

  // Visible tracing for the notification pipeline. Uses `.log` (not `.debug`,
  // which the default Nest logger can suppress) but only outside production, so
  // developers can see exactly why a person reminder does or doesn't fire.
  private trace(message: string): void {
    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(message);
    }
  }

  /**
   * Creates a `type = 'person'` reminder targeting an accepted friend, and
   * ensures a location-sharing request exists for that friend. The reminder
   * only ever fires once the friend accepts sharing (checked at nearby time),
   * so creating it here does not leak or assume consent.
   */
  async create(userId: string, dto: CreatePersonReminderDto) {
    const { title, targetUserId, message = '', expiration } = dto;
    const radiusMeters = normalizeRadius(dto.radiusMeters);
    const cooldownMinutes = dto.cooldownMinutes ?? DEFAULT_COOLDOWN_MINUTES;

    if (targetUserId === userId) {
      throw new BadRequestException('You cannot target yourself.');
    }
    const isFriend = await this.friendsService.areFriends(userId, targetUserId);
    if (!isFriend) {
      throw new BadRequestException(
        'You can only create a person reminder for an accepted friend.',
      );
    }

    const [target] = await this.friendsService.loadSummaries([targetUserId]);
    const targetName = target?.fullName ?? 'Friend';

    // Ask the friend to share their location (idempotent - reuses any existing
    // pending/active permission between these two users).
    const permission = await this.locationSharingService.upsertRequest(
      userId,
      targetUserId,
      'proximity',
      expiration,
    );

    const config: PersonReminderConfig = {
      targetUserId,
      targetName,
      message,
      radiusMeters,
      cooldownMinutes,
      permissionId: permission.id,
      lastNotifiedAt: null,
      proximityState: null,
      lastEnteredAt: null,
      lastExitedAt: null,
      lastTransitionAt: null,
      completedAt: null,
    };

    const [row] = await this.db
      .insert(remindersTable)
      .values({
        userId,
        title,
        type: 'person',
        repeat: 'none',
        priority: 'medium',
        status: 'active',
        notes: message || undefined,
        person: config,
      })
      .returning();

    return {
      id: row.id,
      title: row.title,
      type: row.type,
      status: row.status,
      person: config,
      permissionStatus: permission.status,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Upserts the caller's latest location snapshot (one row per user). */
  async updateSnapshot(userId: string, dto: UpdateLocationSnapshotDto) {
    const now = new Date();
    await this.db
      .insert(userLocationSnapshots)
      .values({
        userId,
        latitude: dto.latitude.toString(),
        longitude: dto.longitude.toString(),
        accuracyMeters: dto.accuracy != null ? Math.round(dto.accuracy) : null,
        capturedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userLocationSnapshots.userId,
        set: {
          latitude: dto.latitude.toString(),
          longitude: dto.longitude.toString(),
          accuracyMeters:
            dto.accuracy != null ? Math.round(dto.accuracy) : null,
          capturedAt: now,
          updatedAt: now,
        },
      });

    return { ok: true };
  }

  /**
   * For each active person reminder owned by the caller, decides whether it
   * should fire right now. A reminder fires only when ALL hold:
   *  - the target still has an active, non-expired sharing permission,
   *  - both users have a recent snapshot and genuinely transition from
   *    outside -> inside the reminder radius,
   *  - any persisted nearby/complete state still allows firing,
   *  - the cooldown since `lastNotifiedAt` has elapsed as a secondary guard.
   * The persisted proximity state lives in `reminders.person`, so proximity
   * entry/exit survives app restart, monitor restart, service restart, and
   * temporary network loss. Coordinates are never returned to the client.
   */
  async checkNearby(userId: string): Promise<NearbyHit[]> {
    const viewerSnapshot = await this.getSnapshot(userId);
    if (!viewerSnapshot) {
      this.trace(
        `[PersonReminder] skip: viewer has no snapshot yet (userId=${userId})`,
      );
      return [];
    }

    const rows = await this.db
      .select()
      .from(remindersTable)
      .where(
        and(
          eq(remindersTable.userId, userId),
          eq(remindersTable.type, 'person'),
          eq(remindersTable.status, 'active'),
        ),
      );

    this.trace(
      `[PersonReminder] evaluating ${rows.length} active reminder(s) for userId=${userId}`,
    );

    const hits: NearbyHit[] = [];
    const now = new Date();

    for (const row of rows) {
      const config = row.person as PersonReminderConfig | null;
      if (!config?.targetUserId) {
        this.trace(
          `[PersonReminder] skip: missing target user in config (reminderId=${row.id})`,
        );
        continue;
      }

      const permission = await this.locationSharingService.findActivePermission(
        userId,
        config.targetUserId,
      );
      if (!permission) {
        this.trace(
          `[PersonReminder] skip: no active sharing permission (reminderId=${row.id}, targetUserId=${config.targetUserId})`,
        );
        continue;
      }

      const targetSnapshot = await this.getSnapshot(config.targetUserId);
      if (!targetSnapshot) {
        this.trace(
          `[PersonReminder] skip: target has no snapshot yet (reminderId=${row.id}, targetUserId=${config.targetUserId})`,
        );
        continue;
      }

      const evaluation = evaluatePersonReminderProximity({
        reminderId: row.id,
        repeat: row.repeat,
        config,
        distanceMeters: haversineMeters(viewerSnapshot, targetSnapshot),
        now,
      });

      if (evaluation.updatedConfig || evaluation.updatedStatus) {
        await this.db
          .update(remindersTable)
          .set({
            ...(evaluation.updatedConfig
              ? { person: evaluation.updatedConfig }
              : {}),
            ...(evaluation.updatedStatus
              ? { status: evaluation.updatedStatus }
              : {}),
            updatedAt: now,
          })
          .where(eq(remindersTable.id, row.id));
      }

      this.trace(evaluation.log);

      if (evaluation.action === 'trigger') {
        hits.push({
          reminderId: row.id,
          title: row.title,
          message: config.message ?? '',
          targetName: config.targetName ?? 'Friend',
        });
      }
    }

    this.trace(
      `[PersonReminder] nearby returning ${hits.length} hit(s) for userId=${userId}`,
    );
    return hits;
  }

  /** True when the user has at least one active person reminder. */
  async hasActivePersonReminders(userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: remindersTable.id })
      .from(remindersTable)
      .where(
        and(
          eq(remindersTable.userId, userId),
          eq(remindersTable.type, 'person'),
          eq(remindersTable.status, 'active'),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  private async getSnapshot(
    userId: string,
  ): Promise<{ latitude: number; longitude: number } | null> {
    const [row] = await this.db
      .select()
      .from(userLocationSnapshots)
      .where(eq(userLocationSnapshots.userId, userId));
    if (!row) return null;
    return {
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
    };
  }
}
