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

/**
 * Coerces an incoming radius into a valid meter value. Handles junk like "020"
 * (→ 20) or non-numeric input by falling back to the default, then clamps to
 * [20, 1000]. Keeps every stored person reminder within a sane radius.
 */
function normalizeRadius(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : (value as number);
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) {
    return DEFAULT_RADIUS_METERS;
  }
  return Math.min(MAX_RADIUS_METERS, Math.max(MIN_RADIUS_METERS, Math.round(parsed)));
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
};

export type NearbyHit = {
  reminderId: string;
  title: string;
  message: string;
  targetName: string;
};

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

    // Ask the friend to share their location (idempotent — reuses any existing
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
   *  - both users have a recent snapshot and are within the reminder radius,
   *  - the cooldown since `lastNotifiedAt` has elapsed.
   * Firing reminders get their `lastNotifiedAt` stamped so the cooldown is
   * enforced server-side. Coordinates are never returned to the client.
   */
  async checkNearby(userId: string): Promise<NearbyHit[]> {
    const viewerSnapshot = await this.getSnapshot(userId);
    if (!viewerSnapshot) {
      this.trace(
        `checkNearby(${userId}): no viewer snapshot yet — the caller hasn't posted a location. Returning [].`,
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
      `checkNearby(${userId}): viewer snapshot OK; ${rows.length} active person reminder(s) to evaluate.`,
    );

    const hits: NearbyHit[] = [];
    const now = Date.now();

    for (const row of rows) {
      const config = row.person as PersonReminderConfig | null;
      if (!config?.targetUserId) {
        this.trace(`  reminder ${row.id}: SKIP — no targetUserId in config.`);
        continue;
      }

      const permission = await this.locationSharingService.findActivePermission(
        userId,
        config.targetUserId,
      );
      if (!permission) {
        this.trace(
          `  reminder ${row.id}: SKIP — no ACTIVE sharing permission from target ${config.targetUserId} (pending/rejected/revoked/expired).`,
        );
        continue;
      }

      const targetSnapshot = await this.getSnapshot(config.targetUserId);
      if (!targetSnapshot) {
        this.trace(
          `  reminder ${row.id}: SKIP — target ${config.targetUserId} has NO location snapshot. The target's app must run the proximity monitor and post a snapshot too.`,
        );
        continue;
      }

      const distance = haversineMeters(viewerSnapshot, targetSnapshot);
      const radius = config.radiusMeters ?? DEFAULT_RADIUS_METERS;
      if (distance > radius) {
        this.trace(
          `  reminder ${row.id}: SKIP — distance ${Math.round(distance)}m > radius ${radius}m.`,
        );
        continue;
      }

      const cooldownMs =
        (config.cooldownMinutes ?? DEFAULT_COOLDOWN_MINUTES) * 60 * 1000;
      const last = config.lastNotifiedAt
        ? new Date(config.lastNotifiedAt).getTime()
        : 0;
      if (now - last < cooldownMs) {
        this.trace(
          `  reminder ${row.id}: SKIP — cooldown active (${Math.round((cooldownMs - (now - last)) / 1000)}s remaining).`,
        );
        continue;
      }

      // Stamp the cooldown before returning so a concurrent poll can't
      // double-fire, then include the hit (no coordinates).
      const updated: PersonReminderConfig = {
        ...config,
        lastNotifiedAt: new Date(now).toISOString(),
      };
      await this.db
        .update(remindersTable)
        .set({ person: updated, updatedAt: new Date() })
        .where(eq(remindersTable.id, row.id));

      this.trace(
        `  reminder ${row.id}: FIRE — distance ${Math.round(distance)}m <= radius ${radius}m, cooldown clear.`,
      );
      hits.push({
        reminderId: row.id,
        title: row.title,
        message: config.message ?? '',
        targetName: config.targetName ?? 'Friend',
      });
    }

    this.trace(`checkNearby(${userId}): returning ${hits.length} hit(s).`);
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
