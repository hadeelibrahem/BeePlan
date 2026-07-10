import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray, or } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { friendships, users } from '../db/schema';

export type FriendSummary = {
  userId: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
};

export type FriendRequestSummary = {
  id: string;
  status: string;
  direction: 'incoming' | 'outgoing';
  user: FriendSummary;
  createdAt: string;
};

@Injectable()
export class FriendsService {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /** Sends a friend request to the user with the given email. */
  async sendRequest(requesterId: string, email: string) {
    const [addressee] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()));

    if (!addressee) {
      throw new NotFoundException('No BeePlan user found with that email.');
    }

    if (addressee.id === requesterId) {
      throw new BadRequestException('You cannot add yourself as a friend.');
    }

    // A friendship in either direction already links these two users.
    const existing = await this.db
      .select()
      .from(friendships)
      .where(
        or(
          and(
            eq(friendships.requesterId, requesterId),
            eq(friendships.addresseeId, addressee.id),
          ),
          and(
            eq(friendships.requesterId, addressee.id),
            eq(friendships.addresseeId, requesterId),
          ),
        ),
      );

    const current = existing[0];
    if (current) {
      if (current.status === 'accepted') {
        throw new BadRequestException('You are already friends.');
      }
      if (current.status === 'pending') {
        throw new BadRequestException('A friend request is already pending.');
      }
      // Previously rejected — allow a fresh request by reviving this row.
      const [revived] = await this.db
        .update(friendships)
        .set({
          requesterId,
          addresseeId: addressee.id,
          status: 'pending',
          updatedAt: new Date(),
        })
        .where(eq(friendships.id, current.id))
        .returning();
      return { id: revived.id, status: revived.status };
    }

    const [row] = await this.db
      .insert(friendships)
      .values({ requesterId, addresseeId: addressee.id, status: 'pending' })
      .returning();

    return { id: row.id, status: row.status };
  }

  /** Accepts an incoming request. Only the addressee may accept. */
  async accept(userId: string, requestId: string) {
    const request = await this.findRequestForAddressee(userId, requestId);
    if (request.status !== 'pending') {
      throw new BadRequestException('This request is no longer pending.');
    }
    const [row] = await this.db
      .update(friendships)
      .set({ status: 'accepted', updatedAt: new Date() })
      .where(eq(friendships.id, requestId))
      .returning();
    return { id: row.id, status: row.status };
  }

  /** Rejects an incoming request. Only the addressee may reject. */
  async reject(userId: string, requestId: string) {
    const request = await this.findRequestForAddressee(userId, requestId);
    if (request.status !== 'pending') {
      throw new BadRequestException('This request is no longer pending.');
    }
    const [row] = await this.db
      .update(friendships)
      .set({ status: 'rejected', updatedAt: new Date() })
      .where(eq(friendships.id, requestId))
      .returning();
    return { id: row.id, status: row.status };
  }

  /**
   * Cancels an outgoing pending request. Only the requester may cancel; the row
   * is deleted so a fresh request can be sent later without a stale record.
   */
  async cancelRequest(userId: string, requestId: string): Promise<{ ok: true }> {
    const [request] = await this.db
      .select()
      .from(friendships)
      .where(
        and(
          eq(friendships.id, requestId),
          eq(friendships.requesterId, userId),
        ),
      );
    if (!request) {
      throw new NotFoundException('Friend request not found.');
    }
    if (request.status !== 'pending') {
      throw new BadRequestException('This request is no longer pending.');
    }
    await this.db.delete(friendships).where(eq(friendships.id, requestId));
    return { ok: true };
  }

  /**
   * Removes an accepted friendship between the two users (either direction).
   * Idempotent — deleting a non-existent friendship is a no-op. Person reminders
   * targeting the removed friend simply stop firing (the sharing permission is
   * left untouched and can be revoked separately).
   */
  async removeFriend(userId: string, otherId: string): Promise<{ ok: true }> {
    await this.db
      .delete(friendships)
      .where(
        and(
          eq(friendships.status, 'accepted'),
          or(
            and(
              eq(friendships.requesterId, userId),
              eq(friendships.addresseeId, otherId),
            ),
            and(
              eq(friendships.requesterId, otherId),
              eq(friendships.addresseeId, userId),
            ),
          ),
        ),
      );
    return { ok: true };
  }

  private async findRequestForAddressee(userId: string, requestId: string) {
    const [request] = await this.db
      .select()
      .from(friendships)
      .where(
        and(
          eq(friendships.id, requestId),
          eq(friendships.addresseeId, userId),
        ),
      );
    if (!request) {
      throw new NotFoundException('Friend request not found.');
    }
    return request;
  }

  /** Returns accepted friends as flat summaries (the "other" user each time). */
  async listFriends(userId: string): Promise<FriendSummary[]> {
    const rows = await this.db
      .select()
      .from(friendships)
      .where(
        and(
          eq(friendships.status, 'accepted'),
          or(
            eq(friendships.requesterId, userId),
            eq(friendships.addresseeId, userId),
          ),
        ),
      );

    const otherIds = rows.map((row) =>
      row.requesterId === userId ? row.addresseeId : row.requesterId,
    );

    return this.loadSummaries(otherIds);
  }

  /** Returns pending requests split by direction relative to `userId`. */
  async listRequests(userId: string): Promise<FriendRequestSummary[]> {
    const rows = await this.db
      .select()
      .from(friendships)
      .where(
        and(
          eq(friendships.status, 'pending'),
          or(
            eq(friendships.requesterId, userId),
            eq(friendships.addresseeId, userId),
          ),
        ),
      );

    const otherIds = rows.map((row) =>
      row.requesterId === userId ? row.addresseeId : row.requesterId,
    );
    const summaries = await this.loadSummaries(otherIds);
    const byId = new Map(summaries.map((s) => [s.userId, s]));

    return rows
      .map((row) => {
        const otherId =
          row.requesterId === userId ? row.addresseeId : row.requesterId;
        const user = byId.get(otherId);
        if (!user) return null;
        return {
          id: row.id,
          status: row.status,
          direction:
            row.requesterId === userId
              ? ('outgoing' as const)
              : ('incoming' as const),
          user,
          createdAt: row.createdAt.toISOString(),
        };
      })
      .filter((r): r is FriendRequestSummary => r !== null);
  }

  /** True when `userId` and `otherId` are accepted friends. */
  async areFriends(userId: string, otherId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: friendships.id })
      .from(friendships)
      .where(
        and(
          eq(friendships.status, 'accepted'),
          or(
            and(
              eq(friendships.requesterId, userId),
              eq(friendships.addresseeId, otherId),
            ),
            and(
              eq(friendships.requesterId, otherId),
              eq(friendships.addresseeId, userId),
            ),
          ),
        ),
      );
    return Boolean(row);
  }

  async loadSummaries(userIds: string[]): Promise<FriendSummary[]> {
    if (userIds.length === 0) return [];
    const rows = await this.db
      .select({
        userId: users.id,
        fullName: users.fullName,
        email: users.email,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(inArray(users.id, userIds));
    return rows;
  }
}
