import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, lt, or } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import {
  locationSharingPermissions,
  reminders as remindersTable,
} from '../db/schema';
import { RequestLocationSharingDto } from './dto/social.dto';
import { FriendsService, FriendSummary } from './friends.service';
import { resolveExpiration, SharingExpiration } from './proximity.util';

type PermissionRow = typeof locationSharingPermissions.$inferSelect;

export type PermissionSummary = {
  id: string;
  mode: string;
  status: string;
  direction: 'incoming' | 'outgoing';
  expiresAt: string | null;
  respondedAt: string | null;
  friend: FriendSummary | null;
  createdAt: string;
  // Most recent state change (accept/reject/revoke/expire), else creation time.
  lastActivityAt: string;
  // Radius of the outgoing person reminder that requested this permission, if
  // any. Null for incoming permissions and permissions without a linked
  // reminder. Additive — older clients ignore it.
  radiusMeters: number | null;
};

@Injectable()
export class LocationSharingService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly friendsService: FriendsService,
  ) {}

  private get db() {
    return this.databaseService.db;
  }

  /**
   * Flips any active permission whose `expiresAt` has passed to `expired`.
   * Called before reads/proximity checks so status is always truthful without
   * a background job. Returns the effective status for a single row.
   */
  private async expireStale(): Promise<void> {
    await this.db
      .update(locationSharingPermissions)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(
        and(
          eq(locationSharingPermissions.status, 'active'),
          lt(locationSharingPermissions.expiresAt, new Date()),
        ),
      );
  }

  private effectiveStatus(row: PermissionRow): string {
    if (
      row.status === 'active' &&
      row.expiresAt &&
      row.expiresAt.getTime() <= Date.now()
    ) {
      return 'expired';
    }
    return row.status;
  }

  /**
   * The viewer asks a friend (owner) to share their location. Reuses an
   * existing pending/active row if one already links them (so re-requesting
   * doesn't stack duplicates); otherwise inserts a fresh pending permission.
   */
  async requestSharing(viewerId: string, dto: RequestLocationSharingDto) {
    const { friendId, mode = 'proximity', expiration } = dto;

    if (friendId === viewerId) {
      throw new BadRequestException('You cannot request sharing with yourself.');
    }
    const friends = await this.friendsService.areFriends(viewerId, friendId);
    if (!friends) {
      throw new BadRequestException(
        'You can only request location sharing from an accepted friend.',
      );
    }

    return this.upsertRequest(viewerId, friendId, mode, expiration);
  }

  /**
   * Ensures a pending/active permission exists for (owner=friendId,
   * viewer=viewerId). Shared by the standalone request endpoint and person
   * reminder creation. Returns the permission id + effective status.
   */
  async upsertRequest(
    viewerId: string,
    friendId: string,
    mode: string,
    expiration: SharingExpiration,
  ): Promise<{ id: string; status: string }> {
    const expiresAt = resolveExpiration(expiration);

    const [existing] = await this.db
      .select()
      .from(locationSharingPermissions)
      .where(
        and(
          eq(locationSharingPermissions.ownerId, friendId),
          eq(locationSharingPermissions.viewerId, viewerId),
          or(
            eq(locationSharingPermissions.status, 'pending'),
            eq(locationSharingPermissions.status, 'active'),
          ),
        ),
      );

    if (existing) {
      const [row] = await this.db
        .update(locationSharingPermissions)
        .set({ mode, expiresAt, updatedAt: new Date() })
        .where(eq(locationSharingPermissions.id, existing.id))
        .returning();
      return { id: row.id, status: this.effectiveStatus(row) };
    }

    const [row] = await this.db
      .insert(locationSharingPermissions)
      .values({
        ownerId: friendId,
        viewerId,
        mode,
        status: 'pending',
        expiresAt,
      })
      .returning();
    return { id: row.id, status: row.status };
  }

  /** Owner accepts a pending request, activating proximity sharing. */
  async accept(ownerId: string, permissionId: string) {
    const row = await this.findForOwner(ownerId, permissionId);
    if (row.status !== 'pending') {
      throw new BadRequestException('This request is no longer pending.');
    }
    const [updated] = await this.db
      .update(locationSharingPermissions)
      .set({ status: 'active', respondedAt: new Date(), updatedAt: new Date() })
      .where(eq(locationSharingPermissions.id, permissionId))
      .returning();
    return { id: updated.id, status: updated.status };
  }

  /** Owner rejects a pending request. */
  async reject(ownerId: string, permissionId: string) {
    const row = await this.findForOwner(ownerId, permissionId);
    if (row.status !== 'pending') {
      throw new BadRequestException('This request is no longer pending.');
    }
    const [updated] = await this.db
      .update(locationSharingPermissions)
      .set({
        status: 'rejected',
        respondedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(locationSharingPermissions.id, permissionId))
      .returning();
    return { id: updated.id, status: updated.status };
  }

  /** Owner revokes an active (or still-pending) permission at any time. */
  async revoke(ownerId: string, permissionId: string) {
    const row = await this.findForOwner(ownerId, permissionId);
    if (row.status === 'revoked') {
      return { id: row.id, status: row.status };
    }
    const [updated] = await this.db
      .update(locationSharingPermissions)
      .set({ status: 'revoked', updatedAt: new Date() })
      .where(eq(locationSharingPermissions.id, permissionId))
      .returning();
    return { id: updated.id, status: updated.status };
  }

  private async findForOwner(
    ownerId: string,
    permissionId: string,
  ): Promise<PermissionRow> {
    const [row] = await this.db
      .select()
      .from(locationSharingPermissions)
      .where(
        and(
          eq(locationSharingPermissions.id, permissionId),
          eq(locationSharingPermissions.ownerId, ownerId),
        ),
      );
    if (!row) {
      throw new NotFoundException('Location sharing permission not found.');
    }
    return row;
  }

  /** Lists permissions in both directions for the user, with live status. */
  async listForUser(userId: string): Promise<PermissionSummary[]> {
    await this.expireStale();

    const rows = await this.db
      .select()
      .from(locationSharingPermissions)
      .where(
        or(
          eq(locationSharingPermissions.ownerId, userId),
          eq(locationSharingPermissions.viewerId, userId),
        ),
      );

    const otherIds = rows.map((row) =>
      row.ownerId === userId ? row.viewerId : row.ownerId,
    );
    const summaries = await this.friendsService.loadSummaries(otherIds);
    const byId = new Map(summaries.map((s) => [s.userId, s]));

    // Radius lives on the person reminder, not the permission. Map each of the
    // viewer's person reminders back to the permission it requested so outgoing
    // permissions can surface their radius without a per-row query.
    const radiusByPermissionId = await this.loadRadiusByPermissionId(userId);

    return rows.map((row) => {
      const otherId = row.ownerId === userId ? row.viewerId : row.ownerId;
      const lastActivity = row.respondedAt ?? row.updatedAt ?? row.createdAt;
      return {
        id: row.id,
        mode: row.mode,
        status: this.effectiveStatus(row),
        direction:
          row.viewerId === userId
            ? ('outgoing' as const)
            : ('incoming' as const),
        expiresAt: row.expiresAt?.toISOString() ?? null,
        respondedAt: row.respondedAt?.toISOString() ?? null,
        friend: byId.get(otherId) ?? null,
        createdAt: row.createdAt.toISOString(),
        lastActivityAt: lastActivity.toISOString(),
        radiusMeters: radiusByPermissionId.get(row.id) ?? null,
      };
    });
  }

  /**
   * Builds permissionId -> radiusMeters from the viewer's person reminders, so
   * `listForUser` can annotate outgoing permissions with the radius the reminder
   * asked for. Only person reminders carry a radius + `permissionId` link.
   */
  private async loadRadiusByPermissionId(
    viewerId: string,
  ): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ person: remindersTable.person })
      .from(remindersTable)
      .where(
        and(
          eq(remindersTable.userId, viewerId),
          eq(remindersTable.type, 'person'),
        ),
      );

    const result = new Map<string, number>();
    for (const row of rows) {
      const config = row.person as {
        permissionId?: string | null;
        radiusMeters?: number;
      } | null;
      if (config?.permissionId && typeof config.radiusMeters === 'number') {
        result.set(config.permissionId, config.radiusMeters);
      }
    }
    return result;
  }

  /**
   * Returns a map of ownerId -> best effective permission status for every
   * permission the viewer has requested. Used to enrich person reminders in the
   * reminders list without an extra client round-trip. "Best" prefers active >
   * pending > the most recent terminal status (expired/revoked/rejected), so a
   * reminder shows the most relevant state when several rows exist for a friend.
   */
  async getViewerPermissionStatuses(
    viewerId: string,
  ): Promise<Map<string, string>> {
    const rows = await this.db
      .select()
      .from(locationSharingPermissions)
      .where(eq(locationSharingPermissions.viewerId, viewerId));

    const rank = (status: string): number => {
      if (status === 'active') return 3;
      if (status === 'pending') return 2;
      return 1;
    };

    const best = new Map<string, { status: string; rank: number; createdAt: number }>();
    for (const row of rows) {
      const status = this.effectiveStatus(row);
      const r = rank(status);
      const createdAt = row.createdAt.getTime();
      const current = best.get(row.ownerId);
      if (
        !current ||
        r > current.rank ||
        (r === current.rank && createdAt > current.createdAt)
      ) {
        best.set(row.ownerId, { status, rank: r, createdAt });
      }
    }

    const result = new Map<string, string>();
    for (const [ownerId, value] of best) {
      result.set(ownerId, value.status);
    }
    return result;
  }

  /**
   * Guard used by the nearby check: returns the active, non-expired permission
   * where `ownerId` shares with `viewerId`, or null. Never returns coordinates.
   */
  async findActivePermission(
    viewerId: string,
    ownerId: string,
  ): Promise<PermissionRow | null> {
    const [row] = await this.db
      .select()
      .from(locationSharingPermissions)
      .where(
        and(
          eq(locationSharingPermissions.viewerId, viewerId),
          eq(locationSharingPermissions.ownerId, ownerId),
          eq(locationSharingPermissions.status, 'active'),
        ),
      );
    if (!row) return null;
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
      await this.db
        .update(locationSharingPermissions)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(eq(locationSharingPermissions.id, row.id));
      return null;
    }
    return row;
  }
}
