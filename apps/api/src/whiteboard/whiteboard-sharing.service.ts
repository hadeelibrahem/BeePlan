import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { and, eq, isNull, or } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import {
  users,
  whiteboardInvitations,
  whiteboardMembers,
  whiteboards,
} from '../db/schema';
import { WhiteboardAccessService } from './whiteboard-access.service';
import type {
  CreateWhiteboardInvitationDto,
  UpdateWhiteboardMemberDto,
} from './dto/whiteboard-sharing.dto';
import { FriendsService } from '../social/friends.service';

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

@Injectable()
export class WhiteboardSharingService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: WhiteboardAccessService,
    private readonly friends: FriendsService,
  ) {}

  async listMembers(userId: string, boardId: string) {
    await this.access.require(userId, boardId, 'view');
    return this.database.db
      .select({
        id: whiteboardMembers.id,
        userId: whiteboardMembers.userId,
        role: whiteboardMembers.role,
        acceptedAt: whiteboardMembers.acceptedAt,
        createdAt: whiteboardMembers.createdAt,
        fullName: users.fullName,
        email: users.email,
        avatarUrl: users.avatarUrl,
      })
      .from(whiteboardMembers)
      .innerJoin(users, eq(users.id, whiteboardMembers.userId))
      .where(eq(whiteboardMembers.boardId, boardId));
  }

  async listInviteCandidates(userId: string, boardId: string, query = '') {
    await this.access.require(userId, boardId, 'manageMembers');
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery.length > 64)
      throw new BadRequestException('Search query is too long.');
    const friends = await this.friends.listFriends(userId);
    const [members, pending] = await Promise.all([
      this.database.db
        .select({ userId: whiteboardMembers.userId })
        .from(whiteboardMembers)
        .where(eq(whiteboardMembers.boardId, boardId)),
      this.database.db
        .select({ userId: whiteboardInvitations.invitedUserId })
        .from(whiteboardInvitations)
        .where(
          and(
            eq(whiteboardInvitations.boardId, boardId),
            eq(whiteboardInvitations.status, 'pending'),
          ),
        ),
    ]);
    const excluded = new Set([
      ...members.map((row) => row.userId),
      ...pending
        .map((row) => row.userId)
        .filter((id): id is string => Boolean(id)),
    ]);
    return friends
      .filter(
        (friend) =>
          !excluded.has(friend.userId) &&
          (!normalizedQuery ||
            friend.username.toLowerCase().includes(normalizedQuery) ||
            friend.fullName.toLowerCase().includes(normalizedQuery)),
      )
      .slice(0, 20);
  }

  async invite(
    userId: string,
    boardId: string,
    dto: CreateWhiteboardInvitationDto,
  ) {
    await this.access.require(userId, boardId, 'manageMembers');
    if (!dto.username && !dto.inviteeUserId && !dto.email)
      throw new BadRequestException('friend_not_found');
    let target:
      | {
          id: string;
          email: string;
          username: string;
          fullName: string;
          avatarUrl: string | null;
        }
      | undefined;
    if (dto.inviteeUserId) {
      const friend = (await this.friends.listFriends(userId)).find(
        (item) => item.userId === dto.inviteeUserId,
      );
      if (!friend) throw new BadRequestException('not_friends');
      const [row] = await this.database.db
        .select({
          id: users.id,
          email: users.email,
          username: users.username,
          fullName: users.fullName,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .where(eq(users.id, friend.userId))
        .limit(1);
      target = row;
    } else {
      const email = dto.email ? normalizeEmail(dto.email) : undefined;
      const [row] = await this.database.db
        .select({
          id: users.id,
          email: users.email,
          username: users.username,
          fullName: users.fullName,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .where(
          dto.username
            ? eq(users.usernameNormalized, dto.username.trim().toLowerCase())
            : eq(users.email, email!),
        )
        .limit(1);
      target = row;
      if (!target || !(await this.friends.areFriends(userId, target.id)))
        throw new BadRequestException('not_friends');
    }
    if (!target) throw new BadRequestException('friend_not_found');
    if (target.id === userId) throw new BadRequestException('friend_not_found');
    const email = normalizeEmail(target.email);
    const [member] = await this.database.db
      .select()
      .from(whiteboardMembers)
      .where(
        and(
          eq(whiteboardMembers.boardId, boardId),
          eq(whiteboardMembers.userId, target.id),
          isNull(whiteboardMembers.acceptedAt),
        ),
      )
      .limit(1);
    const [accepted] = await this.database.db
      .select()
      .from(whiteboardMembers)
      .where(
        and(
          eq(whiteboardMembers.boardId, boardId),
          eq(whiteboardMembers.userId, target.id),
        ),
      )
      .limit(1);
    if (accepted?.acceptedAt || member)
      throw new ConflictException(
        'User is already a member or has a pending invitation.',
      );
    const [active] = await this.database.db
      .select()
      .from(whiteboardInvitations)
      .where(
        and(
          eq(whiteboardInvitations.boardId, boardId),
          eq(whiteboardInvitations.status, 'pending'),
          or(
            eq(whiteboardInvitations.emailNormalized, email),
            eq(whiteboardInvitations.invitedUserId, target.id),
          ),
        ),
      )
      .limit(1);
    if (active)
      throw new ConflictException('An invitation is already pending.');
    const token = randomBytes(32).toString('hex');
    const [invitation] = await this.database.db
      .insert(whiteboardInvitations)
      .values({
        boardId,
        emailNormalized: email,
        invitedUserId: target.id,
        role: dto.role,
        invitedBy: userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
      .returning();
    return {
      id: invitation.id,
      boardId,
      invitee: {
        id: target.id,
        username: target.username,
        displayName: target.fullName,
        avatarUrl: target.avatarUrl,
      },
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt.toISOString(),
      token,
    };
  }

  async listInvitations(userId: string, boardId: string) {
    await this.access.require(userId, boardId, 'manageMembers');
    return this.database.db
      .select({
        id: whiteboardInvitations.id,
        email: whiteboardInvitations.emailNormalized,
        role: whiteboardInvitations.role,
        status: whiteboardInvitations.status,
        expiresAt: whiteboardInvitations.expiresAt,
        createdAt: whiteboardInvitations.createdAt,
        inviteeUserId: whiteboardInvitations.invitedUserId,
        username: users.username,
        displayName: users.fullName,
        avatarUrl: users.avatarUrl,
      })
      .from(whiteboardInvitations)
      .leftJoin(users, eq(users.id, whiteboardInvitations.invitedUserId))
      .where(eq(whiteboardInvitations.boardId, boardId));
  }

  async revoke(userId: string, boardId: string, invitationId: string) {
    await this.access.require(userId, boardId, 'manageMembers');
    const [row] = await this.database.db
      .update(whiteboardInvitations)
      .set({ status: 'revoked', revokedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(whiteboardInvitations.id, invitationId),
          eq(whiteboardInvitations.boardId, boardId),
          eq(whiteboardInvitations.status, 'pending'),
        ),
      )
      .returning({ id: whiteboardInvitations.id });
    if (!row) throw new NotFoundException('Invitation not found.');
  }

  async accept(userId: string, token: string) {
    const [account] = await this.database.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const [invitation] = await this.database.db
      .select()
      .from(whiteboardInvitations)
      .where(
        token.length === 36
          ? eq(whiteboardInvitations.id, token)
          : eq(whiteboardInvitations.tokenHash, hashToken(token)),
      )
      .limit(1);
    if (
      !invitation ||
      invitation.status !== 'pending' ||
      invitation.expiresAt < new Date()
    )
      throw new NotFoundException('Invitation not found.');
    if (
      invitation.invitedUserId
        ? invitation.invitedUserId !== userId
        : !account || account.email.toLowerCase() !== invitation.emailNormalized
    )
      throw new BadRequestException(
        'This invitation belongs to another account.',
      );
    await this.database.db.transaction(async (tx) => {
      await tx
        .insert(whiteboardMembers)
        .values({
          boardId: invitation.boardId,
          userId,
          role: invitation.role,
          invitedBy: invitation.invitedBy,
          acceptedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [whiteboardMembers.boardId, whiteboardMembers.userId],
          set: {
            role: invitation.role,
            acceptedAt: new Date(),
            updatedAt: new Date(),
          },
        });
      await tx
        .update(whiteboardInvitations)
        .set({
          status: 'accepted',
          acceptedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(whiteboardInvitations.id, invitation.id));
    });
    return {
      boardId: invitation.boardId,
      role: invitation.role,
      status: 'accepted',
    };
  }

  async listForUser(userId: string) {
    const [account] = await this.database.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!account) return [];
    return this.database.db
      .select({
        id: whiteboardInvitations.id,
        boardId: whiteboardInvitations.boardId,
        boardName: whiteboards.name,
        role: whiteboardInvitations.role,
        status: whiteboardInvitations.status,
        expiresAt: whiteboardInvitations.expiresAt,
        createdAt: whiteboardInvitations.createdAt,
        inviterUsername: users.username,
        inviterDisplayName: users.fullName,
        inviterAvatarUrl: users.avatarUrl,
      })
      .from(whiteboardInvitations)
      .innerJoin(whiteboards, eq(whiteboards.id, whiteboardInvitations.boardId))
      .innerJoin(users, eq(users.id, whiteboardInvitations.invitedBy))
      .where(
        and(
          or(
            eq(
              whiteboardInvitations.emailNormalized,
              account.email.toLowerCase(),
            ),
            eq(whiteboardInvitations.invitedUserId, userId),
          ),
          eq(whiteboardInvitations.status, 'pending'),
        ),
      );
  }

  async decline(userId: string, token: string) {
    const [account] = await this.database.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const [invitation] = await this.database.db
      .select()
      .from(whiteboardInvitations)
      .where(
        token.length === 36
          ? eq(whiteboardInvitations.id, token)
          : eq(whiteboardInvitations.tokenHash, hashToken(token)),
      )
      .limit(1);
    if (
      !invitation ||
      !account ||
      (invitation.invitedUserId
        ? invitation.invitedUserId !== userId
        : account.email.toLowerCase() !== invitation.emailNormalized)
    )
      throw new NotFoundException('Invitation not found.');
    if (invitation.status === 'pending')
      await this.database.db
        .update(whiteboardInvitations)
        .set({
          status: 'revoked',
          revokedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(whiteboardInvitations.id, invitation.id));
    return { status: 'declined' };
  }

  async updateMember(
    userId: string,
    boardId: string,
    memberId: string,
    dto: UpdateWhiteboardMemberDto,
  ) {
    await this.access.require(userId, boardId, 'manageMembers');
    const [member] = await this.database.db
      .update(whiteboardMembers)
      .set({ role: dto.role, updatedAt: new Date() })
      .where(
        and(
          eq(whiteboardMembers.id, memberId),
          eq(whiteboardMembers.boardId, boardId),
          eq(whiteboardMembers.role, 'editor'),
        ),
      )
      .returning({ id: whiteboardMembers.id, role: whiteboardMembers.role });
    if (!member) throw new NotFoundException('Member not found.');
    return member;
  }
  async removeMember(userId: string, boardId: string, memberId: string) {
    await this.access.require(userId, boardId, 'manageMembers');
    const [member] = await this.database.db
      .select()
      .from(whiteboardMembers)
      .where(
        and(
          eq(whiteboardMembers.id, memberId),
          eq(whiteboardMembers.boardId, boardId),
        ),
      )
      .limit(1);
    if (!member || member.userId === userId || member.role === 'owner')
      throw new BadRequestException('The owner cannot be removed.');
    await this.database.db
      .delete(whiteboardMembers)
      .where(eq(whiteboardMembers.id, memberId));
  }
  async leave(userId: string, boardId: string) {
    const membership = await this.access.require(userId, boardId, 'view');
    if (membership.role === 'owner')
      throw new BadRequestException('The owner cannot leave the board.');
    await this.database.db
      .delete(whiteboardMembers)
      .where(
        and(
          eq(whiteboardMembers.boardId, boardId),
          eq(whiteboardMembers.userId, userId),
        ),
      );
  }
}
