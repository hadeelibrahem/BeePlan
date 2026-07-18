import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { taskMembers, tasks, users } from '../db/schema';
import { FriendsService } from '../social/friends.service';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  InviteMemberDto,
  RemoveMemberDto,
  TransferOwnershipDto,
  UpdateMemberRoleDto,
} from './dto/collaboration.dto';
import { TaskAccessService, type TaskRole } from './task-access.service';
import { TaskActivityService } from './task-activity.service';

type MemberRow = typeof taskMembers.$inferSelect;

export type MemberEntity = {
  id: string | null; // null for the implicit owner (no task_members row)
  userId: string;
  role: TaskRole;
  status: 'accepted' | 'pending' | 'declined';
  isOwner: boolean;
  invitedAt?: string;
  acceptedAt?: string;
  joinedAt?: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    avatarUrl?: string;
  };
};

@Injectable()
export class TaskMembersService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly access: TaskAccessService,
    private readonly friends: FriendsService,
    private readonly notifications: NotificationsService,
    private readonly activity: TaskActivityService,
  ) {}

  private get db() {
    return this.databaseService.db;
  }

  /** Owner-only: invite an accepted friend as editor/viewer. */
  async invite(inviterId: string, taskId: string, dto: InviteMemberDto) {
    const { task } = await this.access.require(inviterId, taskId, 'owner');
    const role = dto.role ?? 'viewer';

    if (dto.userId === inviterId || dto.userId === task.userId) {
      throw new BadRequestException(
        'You are already the owner of this task.',
      );
    }

    // Friends-only collaboration: only accepted friends can be invited.
    const isFriend = await this.friends.areFriends(inviterId, dto.userId);
    if (!isFriend) {
      throw new BadRequestException(
        'You can only invite people you are friends with.',
      );
    }

    const invitee = await this.getUserOrThrow(dto.userId);

    const [existing] = await this.db
      .select()
      .from(taskMembers)
      .where(
        and(
          eq(taskMembers.taskId, taskId),
          eq(taskMembers.userId, dto.userId),
        ),
      );

    if (existing) {
      if (existing.status === 'accepted') {
        throw new ConflictException('This person is already a member.');
      }
      if (existing.status === 'pending') {
        throw new ConflictException(
          'This person already has a pending invite.',
        );
      }
      // Previously declined — revive as a fresh pending invite.
      const [revived] = await this.db
        .update(taskMembers)
        .set({
          role,
          status: 'pending',
          invitedById: inviterId,
          invitedAt: new Date(),
          acceptedAt: null,
          joinedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(taskMembers.id, existing.id))
        .returning();
      await this.afterInvite(inviterId, task, revived, invitee);
      return this.toEntity(revived, invitee, task.userId);
    }

    const [row] = await this.db
      .insert(taskMembers)
      .values({
        taskId,
        userId: dto.userId,
        role,
        status: 'pending',
        invitedById: inviterId,
      })
      .returning();

    await this.afterInvite(inviterId, task, row, invitee);
    return this.toEntity(row, invitee, task.userId);
  }

  private async afterInvite(
    inviterId: string,
    task: typeof tasks.$inferSelect,
    member: MemberRow,
    invitee: { id: string; fullName: string },
  ) {
    const inviter = await this.getUserOrThrow(inviterId);
    await this.notifications.create({
      userId: member.userId,
      type: 'task_invite',
      actorId: inviterId,
      taskId: task.id,
      title: 'New collaboration invite',
      body: `${inviter.fullName} invited you to collaborate on "${task.title}".`,
      data: { memberId: member.id, role: member.role },
    });
    await this.activity.log(
      inviterId,
      task.id,
      'member_invited',
      `${inviter.fullName} invited ${invitee.fullName}`,
      { memberUserId: member.userId, role: member.role },
    );
  }

  /** Invitee accepts their own pending invite. */
  async accept(userId: string, taskId: string) {
    const member = await this.getPendingInvite(userId, taskId);
    const [row] = await this.db
      .update(taskMembers)
      .set({
        status: 'accepted',
        acceptedAt: new Date(),
        joinedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(taskMembers.id, member.id))
      .returning();

    const [task] = await this.db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId));
    const user = await this.getUserOrThrow(userId);

    // Notify the owner and every existing member that someone joined.
    const recipients = await this.access.getRecipientIds(taskId);
    await this.notifications.createMany(
      recipients.map((recipientId) => ({
        userId: recipientId,
        type: 'member_joined' as const,
        actorId: userId,
        taskId,
        title: 'New collaborator',
        body: `${user.fullName} joined "${task?.title ?? 'a task'}".`,
      })),
      userId,
    );
    await this.activity.log(
      userId,
      taskId,
      'member_joined',
      `${user.fullName} joined the task`,
    );
    return this.toEntity(row, user, task?.userId ?? '');
  }

  /** Invitee declines their own pending invite. */
  async decline(userId: string, taskId: string) {
    const member = await this.getPendingInvite(userId, taskId);
    const [row] = await this.db
      .update(taskMembers)
      .set({ status: 'declined', updatedAt: new Date() })
      .where(eq(taskMembers.id, member.id))
      .returning();

    const [task] = await this.db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId));
    const user = await this.getUserOrThrow(userId);
    if (task && member.invitedById) {
      await this.notifications.create({
        userId: member.invitedById,
        type: 'invite_declined',
        actorId: userId,
        taskId,
        title: 'Invite declined',
        body: `${user.fullName} declined to collaborate on "${task.title}".`,
      });
    }
    return this.toEntity(row, user, task?.userId ?? '');
  }

  /** Any member (incl. owner) can list the roster. */
  async listMembers(userId: string, taskId: string): Promise<MemberEntity[]> {
    const { task } = await this.access.require(userId, taskId, 'viewer');

    const memberRows = await this.db
      .select()
      .from(taskMembers)
      .where(eq(taskMembers.taskId, taskId))
      .orderBy(desc(taskMembers.createdAt));

    const userIds = [
      ...new Set([task.userId, ...memberRows.map((row) => row.userId)]),
    ];
    const profileById = await this.loadProfiles(userIds);

    const ownerProfile = profileById.get(task.userId);
    const ownerEntity: MemberEntity[] = ownerProfile
      ? [
          {
            id: null,
            userId: task.userId,
            role: 'owner',
            status: 'accepted',
            isOwner: true,
            user: ownerProfile,
          },
        ]
      : [];

    const memberEntities = memberRows
      // The owner never appears twice — a stale owner-row from a past transfer
      // is hidden in favour of the authoritative tasks.userId owner entry.
      .filter((row) => row.userId !== task.userId)
      .map((row) => {
        const profile = profileById.get(row.userId);
        return profile ? this.toEntity(row, profile, task.userId) : null;
      })
      .filter((entity): entity is MemberEntity => entity !== null);

    return [...ownerEntity, ...memberEntities];
  }

  /** Owner-only: change an accepted/pending member's role (never to owner). */
  async updateRole(
    ownerId: string,
    taskId: string,
    dto: UpdateMemberRoleDto,
  ) {
    const { task } = await this.access.require(ownerId, taskId, 'owner');
    if (dto.userId === task.userId) {
      throw new BadRequestException(
        "The owner's role cannot be changed. Transfer ownership instead.",
      );
    }
    const member = await this.getMemberOrThrow(taskId, dto.userId);
    const [row] = await this.db
      .update(taskMembers)
      .set({ role: dto.role, updatedAt: new Date() })
      .where(eq(taskMembers.id, member.id))
      .returning();

    const [actor, profile] = await Promise.all([
      this.getUserOrThrow(ownerId),
      this.getUserOrThrow(dto.userId),
    ]);
    await this.notifications.create({
      userId: dto.userId,
      type: 'member_role_changed',
      actorId: ownerId,
      taskId,
      title: 'Role updated',
      body: `${actor.fullName} changed your role on "${task.title}" to ${dto.role}.`,
      data: { role: dto.role },
    });
    await this.activity.log(
      ownerId,
      taskId,
      'role_changed',
      `${actor.fullName} changed ${profile.fullName}'s role to ${dto.role}`,
      { memberUserId: dto.userId, role: dto.role },
    );
    return this.toEntity(row, profile, task.userId);
  }

  /** Owner-only: remove a member. The owner can never be removed. */
  async removeMember(ownerId: string, taskId: string, dto: RemoveMemberDto) {
    const { task } = await this.access.require(ownerId, taskId, 'owner');
    if (dto.userId === task.userId) {
      throw new BadRequestException(
        'The owner cannot be removed. Transfer ownership first.',
      );
    }
    const member = await this.getMemberOrThrow(taskId, dto.userId);
    await this.db.delete(taskMembers).where(eq(taskMembers.id, member.id));

    const [actor, profile] = await Promise.all([
      this.getUserOrThrow(ownerId),
      this.getUserOrThrow(dto.userId),
    ]);
    await this.notifications.create({
      userId: dto.userId,
      type: 'member_removed',
      actorId: ownerId,
      taskId,
      title: 'Removed from task',
      body: `${actor.fullName} removed you from "${task.title}".`,
    });
    await this.activity.log(
      ownerId,
      taskId,
      'member_removed',
      `${actor.fullName} removed ${profile.fullName}`,
      { memberUserId: dto.userId },
    );
    return { success: true };
  }

  /**
   * Owner-only: transfer ownership to an accepted member. The recipient becomes
   * the authoritative owner via `tasks.userId`; the previous owner is demoted to
   * an accepted editor member so they keep access.
   */
  async transferOwnership(
    ownerId: string,
    taskId: string,
    dto: TransferOwnershipDto,
  ) {
    const { task } = await this.access.require(ownerId, taskId, 'owner');
    if (dto.userId === ownerId) {
      throw new BadRequestException('You already own this task.');
    }
    const target = await this.getMemberOrThrow(taskId, dto.userId);
    if (target.status !== 'accepted') {
      throw new BadRequestException(
        'You can only transfer ownership to a member who has joined.',
      );
    }

    await this.db.transaction(async (tx) => {
      // Promote the recipient: make tasks.userId point at them, and drop their
      // now-redundant member row (owner is implicit via tasks.userId).
      await tx
        .update(tasks)
        .set({ userId: dto.userId, updatedAt: new Date() })
        .where(eq(tasks.id, taskId));
      await tx.delete(taskMembers).where(eq(taskMembers.id, target.id));

      // Demote the previous owner to an accepted editor (upsert on the unique
      // (task_id, user_id) index).
      await tx
        .insert(taskMembers)
        .values({
          taskId,
          userId: ownerId,
          role: 'editor',
          status: 'accepted',
          invitedById: dto.userId,
          acceptedAt: new Date(),
          joinedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [taskMembers.taskId, taskMembers.userId],
          set: {
            role: 'editor',
            status: 'accepted',
            updatedAt: new Date(),
          },
        });
    });

    const [actor, newOwner] = await Promise.all([
      this.getUserOrThrow(ownerId),
      this.getUserOrThrow(dto.userId),
    ]);
    const recipients = await this.access.getRecipientIds(taskId);
    await this.notifications.createMany(
      recipients.map((recipientId) => ({
        userId: recipientId,
        type: 'ownership_transferred' as const,
        actorId: ownerId,
        taskId,
        title: 'Ownership transferred',
        body: `${actor.fullName} made ${newOwner.fullName} the owner of "${task.title}".`,
      })),
      ownerId,
    );
    await this.activity.log(
      ownerId,
      taskId,
      'ownership_transferred',
      `${actor.fullName} transferred ownership to ${newOwner.fullName}`,
      { newOwnerId: dto.userId },
    );
    return { success: true };
  }

  /** Pending invites addressed to the caller, across all tasks. */
  async listMyInvitations(userId: string) {
    const rows = await this.db
      .select()
      .from(taskMembers)
      .where(
        and(
          eq(taskMembers.userId, userId),
          eq(taskMembers.status, 'pending'),
        ),
      )
      .orderBy(desc(taskMembers.invitedAt));

    if (!rows.length) return [];

    const taskIds = [...new Set(rows.map((row) => row.taskId))];
    const inviterIds = [
      ...new Set(rows.map((row) => row.invitedById).filter(Boolean) as string[]),
    ];

    const [taskRows, inviterProfiles] = await Promise.all([
      this.db
        .select({ id: tasks.id, title: tasks.title, ownerId: tasks.userId })
        .from(tasks)
        .where(inArray(tasks.id, taskIds)),
      this.loadProfiles(inviterIds),
    ]);
    const taskById = new Map(taskRows.map((row) => [row.id, row]));

    return rows.map((row) => ({
      id: row.id,
      taskId: row.taskId,
      taskTitle: taskById.get(row.taskId)?.title ?? 'Untitled task',
      role: row.role,
      invitedAt: row.invitedAt.toISOString(),
      invitedBy: row.invitedById
        ? inviterProfiles.get(row.invitedById) ?? null
        : null,
    }));
  }

  private async getPendingInvite(userId: string, taskId: string) {
    const [member] = await this.db
      .select()
      .from(taskMembers)
      .where(
        and(
          eq(taskMembers.taskId, taskId),
          eq(taskMembers.userId, userId),
        ),
      );
    if (!member) {
      throw new NotFoundException('Invitation not found.');
    }
    if (member.status !== 'pending') {
      throw new BadRequestException('This invitation is no longer pending.');
    }
    return member;
  }

  private async getMemberOrThrow(taskId: string, userId: string) {
    const [member] = await this.db
      .select()
      .from(taskMembers)
      .where(
        and(
          eq(taskMembers.taskId, taskId),
          eq(taskMembers.userId, userId),
        ),
      );
    if (!member) {
      throw new NotFoundException('Member not found.');
    }
    return member;
  }

  private async getUserOrThrow(userId: string) {
    const [user] = await this.db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(eq(users.id, userId));
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    return user;
  }

  private async loadProfiles(
    userIds: string[],
  ): Promise<
    Map<
      string,
      { id: string; fullName: string; email: string; avatarUrl?: string }
    >
  > {
    if (!userIds.length) return new Map();
    const rows = await this.db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(inArray(users.id, userIds));
    return new Map(
      rows.map((row) => [
        row.id,
        {
          id: row.id,
          fullName: row.fullName,
          email: row.email,
          avatarUrl: row.avatarUrl ?? undefined,
        },
      ]),
    );
  }

  private toEntity(
    row: MemberRow,
    profile: {
      id: string;
      fullName: string;
      email: string;
      avatarUrl?: string | null;
    },
    ownerId: string,
  ): MemberEntity {
    return {
      id: row.id,
      userId: row.userId,
      role: (row.role as TaskRole) ?? 'viewer',
      status: row.status as MemberEntity['status'],
      isOwner: row.userId === ownerId,
      invitedAt: row.invitedAt?.toISOString(),
      acceptedAt: row.acceptedAt?.toISOString() ?? undefined,
      joinedAt: row.joinedAt?.toISOString() ?? undefined,
      user: {
        id: profile.id,
        fullName: profile.fullName,
        email: profile.email,
        avatarUrl: profile.avatarUrl ?? undefined,
      },
    };
  }
}
