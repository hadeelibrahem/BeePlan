import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { and, desc, eq, gt, inArray, isNull, isNotNull, or, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { TaskAccessService } from '../collaboration/task-access.service';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../db/database.service';
import {
  focusRoomActivityEvents,
  focusRoomCommitmentParticipants,
  focusRoomCommitmentSessions,
  focusRoomInvitations,
  focusRoomMembers,
  focusRooms,
  focusSessions,
  users,
} from '../db/schema';
import type {
  CreateCommitmentDto,
  CreateFocusRoomDto,
  JoinFocusRoomDto,
  TerminateCommitmentDto,
} from './focus-rooms.dto';
import { FocusRoomEventsService } from './focus-room-events.service';
import {
  isSharedSessionLocked,
  isSharedSessionTerminal,
} from './focus-room-policy';

const ACTIVE = ['active', 'break'];
@Injectable()
export class FocusRoomsService implements OnModuleDestroy {
  private readonly logger = new Logger(FocusRoomsService.name);
  private readonly connections = new Map<string, Map<string, Set<string>>>();
  private readonly graceTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly completionTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  constructor(
    private readonly database: DatabaseService,
    private readonly events: FocusRoomEventsService,
    private readonly taskAccess: TaskAccessService,
    private readonly config: ConfigService,
  ) {}
  private get db() {
    return this.database.db;
  }

  onModuleDestroy() {
    for (const timer of this.completionTimers.values()) clearTimeout(timer);
    for (const timer of this.graceTimers.values()) clearTimeout(timer);
    this.completionTimers.clear();
    this.graceTimers.clear();
    this.connections.clear();
  }

  async discover(userId: string) {
    const now = new Date();
    const rooms = await this.db
      .select()
      .from(focusRooms)
      .where(
        and(
          or(
            eq(focusRooms.visibility, 'public'),
            eq(focusRooms.ownerUserId, userId),
          ),
          or(isNull(focusRooms.expiresAt), gt(focusRooms.expiresAt, now)),
          sql`not exists (
            select 1 from focus_room_commitment_sessions session
            where session.room_id = ${focusRooms.id}
              and session.status in ('active', 'break', 'completed', 'ended_early')
          )`,
        ),
      )
      .orderBy(desc(focusRooms.createdAt))
      .limit(100);
    return Promise.all(rooms.map((room) => this.snapshot(room.id, userId)));
  }
  async createInvite(
    userId: string,
    roomId: string,
    type: 'email' | 'link',
    email?: string,
    expiresInHours = 24,
  ) {
    const room = await this.room(roomId);
    await this.requireOpenLobby(roomId);
    const actor = await this.requireMember(roomId, userId);
    if (room.ownerUserId !== userId && actor.role !== 'moderator')
      throw new ForbiddenException(
        'Only the room owner or a moderator may invite participants.',
      );
    const normalizedEmail = email?.trim().toLowerCase();
    if (type === 'email' && !normalizedEmail)
      throw new BadRequestException('Email address is required.');
    if (type === 'link' && normalizedEmail)
      throw new BadRequestException(
        'Invite links do not accept an email address.',
      );
    let invitedUserId: string | null = null;
    if (type === 'email') {
      const invited = await this.db.query.users.findFirst({
        columns: { id: true, email: true },
        where: sql`lower(${users.email}) = ${normalizedEmail}`,
      });
      if (!invited)
        throw new BadRequestException(
          'No BeePlan account was found for this email.',
        );
      if (invited.id === userId)
        throw new BadRequestException('You cannot invite yourself.');
      invitedUserId = invited.id;
      const duplicate = await this.db.query.focusRoomInvitations.findFirst({
        where: and(
          eq(focusRoomInvitations.roomId, roomId),
          eq(focusRoomInvitations.invitedEmail, normalizedEmail!),
          isNull(focusRoomInvitations.acceptedAt),
          isNull(focusRoomInvitations.rejectedAt),
          isNull(focusRoomInvitations.revokedAt),
          gt(focusRoomInvitations.expiresAt, new Date()),
        ),
      });
      if (duplicate)
        throw new BadRequestException(
          'An active invitation already exists for this email.',
        );
    }
    const [invite] = await this.db
      .insert(focusRoomInvitations)
      .values({
        roomId,
        invitedUserId,
        invitedEmail: normalizedEmail ?? null,
        invitationType: type,
        inviteCode: randomUUID(),
        expiresAt: new Date(Date.now() + expiresInHours * 60 * 60_000),
      })
      .returning();
    if (type !== 'email' || !normalizedEmail)
      return { ...invite, emailDelivery: 'not_applicable' };
    const inviter = await this.db.query.users.findFirst({
      columns: { fullName: true },
      where: eq(users.id, userId),
    });
    const emailDelivery = await this.sendInvitationEmail({
      to: normalizedEmail,
      inviterName: inviter?.fullName ?? 'A BeePlan user',
      roomTitle: room.title,
      roomMode: room.mode,
      roomId: room.id,
      inviteCode: invite.inviteCode!,
      expiresAt: invite.expiresAt,
    });
    return { ...invite, emailDelivery };
  }
  private async sendInvitationEmail(input: {
    to: string;
    inviterName: string;
    roomTitle: string;
    roomMode: string;
    roomId: string;
    inviteCode: string;
    expiresAt: Date;
  }) {
    const apiKey = this.config.get<string>('RESEND_API_KEY'),
      from = this.config.get<string>('EMAIL_FROM');
    if (!apiKey || !from) return 'not_configured';
    try {
      const appUrl =
        this.config.get<string>('WEB_URL') ?? 'https://beeplan.app';
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [input.to],
          subject: `${input.inviterName} invited you to ${input.roomTitle}`,
          text: `${input.inviterName} invited you to the ${input.roomMode} Focus Room “${input.roomTitle}”. Accept: ${appUrl}/focus/rooms/${input.roomId}?invite=${encodeURIComponent(input.inviteCode)}. Expires ${input.expiresAt.toISOString()}.`,
        }),
      });
      if (!response.ok) throw new Error(`Resend status ${response.status}`);
      return 'sent';
    } catch (error) {
      this.logger.warn(
        `Focus Room invitation email failed for invite ${input.inviteCode.slice(0, 8)}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return 'failed';
    }
  }
  async roomInvitations(userId: string, roomId: string) {
    const room = await this.room(roomId);
    const member = await this.requireMember(roomId, userId);
    if (room.ownerUserId !== userId && member.role !== 'moderator')
      throw new ForbiddenException();
    const now = new Date();
    const rows = await this.db
      .select()
      .from(focusRoomInvitations)
      .where(eq(focusRoomInvitations.roomId, roomId))
      .orderBy(desc(focusRoomInvitations.createdAt));
    return rows.map((invite) => ({
      id: invite.id,
      type: invite.invitationType,
      label:
        invite.invitationType === 'email' ? invite.invitedEmail : 'Invite link',
      inviteCode:
        invite.invitationType === 'link' && !invite.revokedAt
          ? invite.inviteCode
          : null,
      status: invite.revokedAt
        ? 'revoked'
        : invite.rejectedAt
          ? 'rejected'
          : invite.acceptedAt
            ? 'accepted'
            : invite.expiresAt <= now
              ? 'expired'
              : 'pending',
      sentAt: invite.createdAt,
      expiresAt: invite.expiresAt,
    }));
  }
  async invitations(userId: string) {
    return this.db
      .select({ invitation: focusRoomInvitations, roomTitle: focusRooms.title })
      .from(focusRoomInvitations)
      .innerJoin(focusRooms, eq(focusRooms.id, focusRoomInvitations.roomId))
      .where(
        and(
          eq(focusRoomInvitations.invitedUserId, userId),
          isNull(focusRoomInvitations.acceptedAt),
          isNull(focusRoomInvitations.rejectedAt),
          isNull(focusRoomInvitations.revokedAt),
          gt(focusRoomInvitations.expiresAt, new Date()),
        ),
      );
  }
  async decideInvite(userId: string, inviteId: string, decision: string) {
    const invite = await this.db.query.focusRoomInvitations.findFirst({
      where: eq(focusRoomInvitations.id, inviteId),
    });
    if (!invite || invite.invitedUserId !== userId)
      throw new ForbiddenException();
    if (decision === 'accept') await this.requireOpenLobby(invite.roomId);
    await this.db
      .update(focusRoomInvitations)
      .set(
        decision === 'accept'
          ? { acceptedAt: new Date() }
          : { rejectedAt: new Date() },
      )
      .where(
        and(
          eq(focusRoomInvitations.id, inviteId),
          isNull(focusRoomInvitations.revokedAt),
        ),
      );
    return decision === 'accept'
      ? this.join(userId, invite.roomId, {
          inviteCode: invite.inviteCode ?? undefined,
        })
      : { accepted: false };
  }
  async revokeInvite(userId: string, inviteId: string) {
    const invite = await this.db.query.focusRoomInvitations.findFirst({
      where: eq(focusRoomInvitations.id, inviteId),
    });
    if (!invite) throw new NotFoundException();
    const room = await this.room(invite.roomId);
    if (room.ownerUserId !== userId) throw new ForbiddenException();
    await this.db
      .update(focusRoomInvitations)
      .set({ revokedAt: new Date() })
      .where(eq(focusRoomInvitations.id, inviteId));
    return { revoked: true };
  }
  async updateGoal(userId: string, roomId: string, goalTargetMinutes?: number) {
    const room = await this.room(roomId);
    await this.requireOpenLobby(roomId);
    if (room.ownerUserId !== userId) throw new ForbiddenException();
    await this.db
      .update(focusRooms)
      .set({
        goalTargetMinutes: goalTargetMinutes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(focusRooms.id, roomId));
    return this.snapshot(roomId, userId);
  }
  async create(userId: string, dto: CreateFocusRoomDto) {
    const [room] = await this.db
      .insert(focusRooms)
      .values({ ...dto, mode: 'commitment', ownerUserId: userId })
      .returning();
    await this.db.insert(focusRoomMembers).values({
      roomId: room.id,
      userId,
      role: 'owner',
      showTaskTitle: room.taskTitleVisibilityDefault,
    });
    await this.record(room.id, userId, 'member_joined', {});
    return this.snapshot(room.id, userId);
  }
  async join(userId: string, roomId: string, dto: JoinFocusRoomDto) {
    const room = await this.room(roomId);
    await this.requireOpenLobby(roomId);
    if (room.visibility !== 'public' && room.ownerUserId !== userId) {
      const invite = await this.db.query.focusRoomInvitations.findFirst({
        where: and(
          eq(focusRoomInvitations.roomId, roomId),
          or(
            eq(focusRoomInvitations.invitedUserId, userId),
            dto.inviteCode
              ? eq(focusRoomInvitations.inviteCode, dto.inviteCode)
              : sql`false`,
          ),
          gt(focusRoomInvitations.expiresAt, new Date()),
        ),
      });
      if (!invite || invite.rejectedAt || invite.revokedAt)
        throw new ForbiddenException('A valid room invitation is required.');
    }
    const active = await this.db
      .select({ userId: focusRoomMembers.userId })
      .from(focusRoomMembers)
      .where(
        and(
          eq(focusRoomMembers.roomId, roomId),
          isNull(focusRoomMembers.leftAt),
        ),
      );
    if (
      room.maxMembers &&
      active.length >= room.maxMembers &&
      !active.some((m) => m.userId === userId)
    )
      throw new BadRequestException('This room is full.');
    await this.db
      .insert(focusRoomMembers)
      .values({
        roomId,
        userId,
        anonymous: dto.anonymous ?? false,
        showTaskTitle: dto.showTaskTitle ?? room.taskTitleVisibilityDefault,
        showTimer: dto.showTimer ?? true,
        showStatistics: dto.showStatistics ?? true,
      })
      .onConflictDoUpdate({
        target: [focusRoomMembers.roomId, focusRoomMembers.userId],
        set: {
          leftAt: null,
          state: 'preparing',
          anonymous: dto.anonymous ?? false,
          showTaskTitle: dto.showTaskTitle ?? room.taskTitleVisibilityDefault,
        },
      });
    const lobby = await this.activeOrLatestCommitment(roomId);
    if (lobby?.status === 'lobby')
      await this.db
        .insert(focusRoomCommitmentParticipants)
        .values({ sessionId: lobby.id, userId })
        .onConflictDoNothing();
    await this.record(roomId, userId, 'member_joined', {});
    return this.snapshot(roomId, userId);
  }
  async leave(
    userId: string,
    roomId: string,
    command?: TerminateCommitmentDto,
  ) {
    const active = await this.activeCommitment(roomId);
    if (active && ACTIVE.includes(active.status)) {
      if (!command)
        throw new BadRequestException(
          'Confirm ending the session for everyone.',
        );
      return this.terminate(userId, active.id, command);
    }
    await this.requireMember(roomId, userId);
    await this.db
      .update(focusRoomMembers)
      .set({ leftAt: new Date(), state: 'offline' })
      .where(
        and(
          eq(focusRoomMembers.roomId, roomId),
          eq(focusRoomMembers.userId, userId),
        ),
      );
    await this.record(roomId, userId, 'member_left', {});
    if (active?.status === 'lobby')
      await this.db
        .delete(focusRoomCommitmentParticipants)
        .where(
          and(
            eq(focusRoomCommitmentParticipants.sessionId, active.id),
            eq(focusRoomCommitmentParticipants.userId, userId),
          ),
        );
    return { collectiveEnd: false };
  }
  async createCommitment(
    userId: string,
    roomId: string,
    dto: CreateCommitmentDto,
  ) {
    const room = await this.room(roomId);
    if (room.mode !== 'commitment')
      throw new BadRequestException(
        'Only Commitment Rooms use shared sessions.',
      );
    const member = await this.requireMember(roomId, userId);
    if (!['owner', 'moderator'].includes(member.role))
      throw new ForbiddenException(
        'Only an owner or moderator may prepare a session.',
      );
    if (await this.activeOrLatestCommitment(roomId))
      throw new BadRequestException(
        'A shared session can only be created once. Create a new session instead.',
      );
    const members = await this.db
      .select()
      .from(focusRoomMembers)
      .where(
        and(
          eq(focusRoomMembers.roomId, roomId),
          isNull(focusRoomMembers.leftAt),
        ),
      );
    return this.db.transaction(async (tx) => {
      const [session] = await tx
        .insert(focusRoomCommitmentSessions)
        .values({
          roomId,
          createdBy: userId,
          durationMinutes: dto.durationMinutes,
          goalLabel: dto.goalLabel?.trim() || null,
          breakMinutes: dto.breakMinutes,
          reconnectGraceSeconds: dto.reconnectGraceSeconds ?? 60,
        })
        .returning();
      if (members.length)
        await tx
          .insert(focusRoomCommitmentParticipants)
          .values(
            members.map((m) => ({ sessionId: session.id, userId: m.userId })),
          );
      return session;
    });
  }
  async accept(userId: string, sessionId: string, accepted: boolean) {
    if (!accepted)
      throw new BadRequestException(
        'Explicit agreement acceptance is required.',
      );
    const session = await this.session(sessionId);
    this.requireLobbySession(session.status);
    const [participant] = await this.db
      .update(focusRoomCommitmentParticipants)
      .set({ acceptedAgreementAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(focusRoomCommitmentParticipants.sessionId, sessionId),
          eq(focusRoomCommitmentParticipants.userId, userId),
        ),
      )
      .returning();
    if (!participant)
      throw new ForbiddenException('You are not a committed participant.');
    await this.record(session.roomId, userId, 'member_ready', {
      accepted: true,
    });
    return participant;
  }
  async ready(userId: string, sessionId: string) {
    const session = await this.session(sessionId);
    this.requireLobbySession(session.status);
    const participant =
      await this.db.query.focusRoomCommitmentParticipants.findFirst({
        where: and(
          eq(focusRoomCommitmentParticipants.sessionId, sessionId),
          eq(focusRoomCommitmentParticipants.userId, userId),
        ),
      });
    if (!participant?.acceptedAgreementAt)
      throw new BadRequestException('Accept the commitment agreement first.');
    await this.db
      .update(focusRoomCommitmentParticipants)
      .set({ readyAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(focusRoomCommitmentParticipants.sessionId, sessionId),
          eq(focusRoomCommitmentParticipants.userId, userId),
        ),
      );
    await this.db
      .update(focusRoomMembers)
      .set({ state: 'ready' })
      .where(
        and(
          eq(focusRoomMembers.roomId, session.roomId),
          eq(focusRoomMembers.userId, userId),
        ),
      );
    await this.record(session.roomId, userId, 'member_ready', {});
    const participants = await this.db
      .select()
      .from(focusRoomCommitmentParticipants)
      .where(eq(focusRoomCommitmentParticipants.sessionId, sessionId));
    return this.snapshot(session.roomId, userId);
  }
  async prepareParticipant(
    userId: string,
    sessionId: string,
    taskId?: string,
    subtaskId?: string,
  ) {
    const session = await this.session(sessionId);
    this.requireLobbySession(session.status);
    await this.requireMember(session.roomId, userId);
    if (subtaskId && !taskId)
      throw new BadRequestException('A subtask requires its parent task.');
    if (taskId) await this.taskAccess.require(userId, taskId, 'editor');
    const [participant] = await this.db
      .update(focusRoomCommitmentParticipants)
      .set({
        selectedTaskId: taskId ?? null,
        selectedSubtaskId: subtaskId ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(focusRoomCommitmentParticipants.sessionId, sessionId),
          eq(focusRoomCommitmentParticipants.userId, userId),
        ),
      )
      .returning();
    if (!participant)
      throw new ForbiddenException('You are not a committed participant.');
    return participant;
  }
  async start(userId: string, sessionId: string) {
    const session = await this.session(sessionId);
    const member = await this.requireMember(session.roomId, userId);
    if (member.role !== 'owner')
      throw new ForbiddenException();
    if (ACTIVE.includes(session.status)) return this.snapshot(session.roomId, userId);
    if (isSharedSessionTerminal(session.status)) throw new ConflictException('This commitment has already ended.');
    const participants = await this.db
      .select()
      .from(focusRoomCommitmentParticipants)
      .where(eq(focusRoomCommitmentParticipants.sessionId, sessionId));
    if (
      !participants.length ||
      participants.some((p) => !p.acceptedAgreementAt || !p.readyAt)
    )
      throw new BadRequestException(
        'Every participant must accept and be ready.',
      );
    const startedAt = new Date(),
      expectedEndAt = new Date(
        startedAt.getTime() + session.durationMinutes * 60_000,
      );
    await this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select id from focus_room_commitment_sessions where id = ${sessionId} for update`,
      );
      const current = await tx.query.focusRoomCommitmentSessions.findFirst({
        where: eq(focusRoomCommitmentSessions.id, sessionId),
      });
      if (!current || current.status !== 'lobby')
        throw new BadRequestException(
          'This commitment is no longer startable.',
        );
      for (const participant of participants) {
        const existing = await tx.query.focusSessions.findFirst({
          where: and(
            eq(focusSessions.userId, participant.userId),
            inArray(focusSessions.status, ['active', 'paused']),
          ),
        });
        let focusSessionId = existing?.id;
        if (focusSessionId) {
          await tx
            .update(focusSessions)
            .set({ commitmentSessionId: sessionId, endsAt: expectedEndAt })
            .where(eq(focusSessions.id, focusSessionId));
        } else {
          const [created] = await tx
            .insert(focusSessions)
            .values({
              userId: participant.userId,
              taskId: participant.selectedTaskId,
              subtaskId: participant.selectedSubtaskId,
              startedAt,
              endsAt: expectedEndAt,
              plannedMinutes: session.durationMinutes,
              status: 'active',
              sessionType: 'pomodoro',
              commitmentSessionId: sessionId,
            })
            .returning({ id: focusSessions.id });
          focusSessionId = created.id;
        }
        await tx
          .update(focusRoomCommitmentParticipants)
          .set({ focusSessionId, updatedAt: startedAt })
          .where(
            and(
              eq(focusRoomCommitmentParticipants.sessionId, sessionId),
              eq(focusRoomCommitmentParticipants.userId, participant.userId),
            ),
          );
      }
      await tx
        .update(focusRoomCommitmentSessions)
        .set({
          status: 'active',
          startedAt,
          expectedEndAt,
          updatedAt: startedAt,
        })
        .where(
          and(
            eq(focusRoomCommitmentSessions.id, sessionId),
            eq(focusRoomCommitmentSessions.status, 'lobby'),
          ),
        );
      await tx
        .update(focusRoomMembers)
        .set({ state: 'focusing' })
        .where(
          and(
            eq(focusRoomMembers.roomId, session.roomId),
            isNull(focusRoomMembers.leftAt),
          ),
        );
      await tx
        .update(focusRoomInvitations)
        .set({ revokedAt: startedAt })
        .where(
          and(
            eq(focusRoomInvitations.roomId, session.roomId),
            isNull(focusRoomInvitations.acceptedAt),
            isNull(focusRoomInvitations.rejectedAt),
            isNull(focusRoomInvitations.revokedAt),
          ),
        );
    });
    await this.record(session.roomId, userId, 'commitment_started', {
      commitmentSessionId: sessionId,
      startedAt: startedAt.toISOString(),
      expectedEndAt: expectedEndAt.toISOString(),
    });
    this.scheduleCompletion(session.id, expectedEndAt);
    return this.snapshot(session.roomId, userId);
  }
  async terminateFromFocus(
    userId: string,
    commitmentSessionId: string,
    reason: 'participant_cancelled_focus' | 'participant_left_early',
  ) {
    const session = await this.session(commitmentSessionId);
    if (!ACTIVE.includes(session.status)) return;
    if (
      session.expectedEndAt &&
      session.expectedEndAt.getTime() <= Date.now()
    ) {
      await this.reconcilePersistedState();
      return;
    }
    await this.terminate(userId, commitmentSessionId, {
      commandId: randomUUID(),
      reason,
    });
  }
  async pause(userId: string, sessionId: string) {
    const session = await this.session(sessionId);
    const member = await this.requireMember(session.roomId, userId);
    if (!['owner', 'moderator'].includes(member.role)) await this.requireCommittedParticipant(sessionId, userId);
    const pausedAt = new Date();
    const result = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select id from focus_room_commitment_sessions where id = ${sessionId} for update`);
      const current = await tx.query.focusRoomCommitmentSessions.findFirst({ where: eq(focusRoomCommitmentSessions.id, sessionId) });
      if (!current || !ACTIVE.includes(current.status)) throw new BadRequestException('This session is no longer active.');
      if (current.pausedAt) return current;
      const [updated] = await tx.update(focusRoomCommitmentSessions).set({ pausedAt, updatedAt: pausedAt }).where(and(eq(focusRoomCommitmentSessions.id, sessionId), inArray(focusRoomCommitmentSessions.status, ACTIVE), isNull(focusRoomCommitmentSessions.pausedAt))).returning();
      if (!updated) throw new BadRequestException('This session is no longer active.');
      await tx.update(focusSessions).set({ status: 'paused' }).where(and(eq(focusSessions.commitmentSessionId, sessionId), eq(focusSessions.status, 'active')));
      return updated;
    });
    this.clearRuntimeState(session.roomId, sessionId);
    this.events.publish({ id: `paused:${sessionId}:${result.updatedAt.toISOString()}`, roomId: session.roomId, type: 'commitment_paused', occurredAt: pausedAt.toISOString(), payload: { commitmentSessionId: sessionId, pausedAt: pausedAt.toISOString() } });
    return this.snapshot(session.roomId, userId);
  }
  async resume(userId: string, sessionId: string) {
    const session = await this.session(sessionId);
    const member = await this.requireMember(session.roomId, userId);
    if (!['owner', 'moderator'].includes(member.role)) await this.requireCommittedParticipant(sessionId, userId);
    const resumedAt = new Date();
    const result = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select id from focus_room_commitment_sessions where id = ${sessionId} for update`);
      const current = await tx.query.focusRoomCommitmentSessions.findFirst({ where: eq(focusRoomCommitmentSessions.id, sessionId) });
      if (!current || !ACTIVE.includes(current.status)) throw new BadRequestException('This session is no longer active.');
      if (!current.pausedAt) return current;
      const pauseSeconds = Math.max(0, Math.floor((resumedAt.getTime() - current.pausedAt.getTime()) / 1000));
      const expectedEndAt = current.expectedEndAt ? new Date(current.expectedEndAt.getTime() + pauseSeconds * 1000) : null;
      const [updated] = await tx.update(focusRoomCommitmentSessions).set({ pausedAt: null, expectedEndAt, accumulatedPausedSeconds: current.accumulatedPausedSeconds + pauseSeconds, updatedAt: resumedAt }).where(and(eq(focusRoomCommitmentSessions.id, sessionId), inArray(focusRoomCommitmentSessions.status, ACTIVE), isNotNull(focusRoomCommitmentSessions.pausedAt))).returning();
      if (!updated) throw new BadRequestException('This session is no longer paused.');
      await tx.update(focusSessions).set({ status: 'active', endsAt: expectedEndAt }).where(and(eq(focusSessions.commitmentSessionId, sessionId), eq(focusSessions.status, 'paused')));
      return updated;
    });
    if (result.expectedEndAt) this.scheduleCompletion(sessionId, result.expectedEndAt);
    this.events.publish({ id: `resumed:${sessionId}:${result.updatedAt.toISOString()}`, roomId: session.roomId, type: 'commitment_resumed', occurredAt: resumedAt.toISOString(), payload: { commitmentSessionId: sessionId, expectedEndAt: result.expectedEndAt?.toISOString() } });
    return this.snapshot(session.roomId, userId);
  }
  async extend(userId: string, sessionId: string, minutes: number) {
    const session = await this.session(sessionId);
    const member = await this.requireMember(session.roomId, userId);
    if (!['owner', 'moderator'].includes(member.role)) throw new ForbiddenException('Only the owner or moderator may add time.');
    const now = new Date();
    const result = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select id from focus_room_commitment_sessions where id = ${sessionId} for update`);
      const current = await tx.query.focusRoomCommitmentSessions.findFirst({ where: eq(focusRoomCommitmentSessions.id, sessionId) });
      if (!current || !ACTIVE.includes(current.status) || !current.expectedEndAt) throw new BadRequestException('This session is no longer extendable.');
      const expectedEndAt = new Date(current.expectedEndAt.getTime() + minutes * 60_000);
      const [updated] = await tx.update(focusRoomCommitmentSessions).set({ expectedEndAt, updatedAt: now }).where(and(eq(focusRoomCommitmentSessions.id, sessionId), inArray(focusRoomCommitmentSessions.status, ACTIVE))).returning();
      if (!updated) throw new BadRequestException('This session is no longer extendable.');
      await tx.update(focusSessions).set({ endsAt: expectedEndAt }).where(and(eq(focusSessions.commitmentSessionId, sessionId), inArray(focusSessions.status, ['active', 'paused'])));
      return updated;
    });
    if (!result.pausedAt && result.expectedEndAt) this.scheduleCompletion(sessionId, result.expectedEndAt);
    this.events.publish({ id: `extended:${sessionId}:${result.updatedAt.toISOString()}`, roomId: session.roomId, type: 'commitment_extended', occurredAt: now.toISOString(), payload: { commitmentSessionId: sessionId, expectedEndAt: result.expectedEndAt!.toISOString(), minutes } });
    return this.snapshot(session.roomId, userId);
  }
  async reconcilePersistedState() {
    const now = new Date();
    const expired = await this.db
      .select()
      .from(focusRoomCommitmentSessions)
      .where(
        and(
          inArray(focusRoomCommitmentSessions.status, ACTIVE),
          isNull(focusRoomCommitmentSessions.pausedAt),
          sql`${focusRoomCommitmentSessions.expectedEndAt} <= ${now}`,
        ),
      )
      .limit(100);
    for (const candidate of expired) {
      const completed = await this.db.transaction(async (tx) => {
        const lock = await tx.execute(
          sql`select pg_try_advisory_xact_lock(hashtext(${candidate.id})) as locked`,
        );
        if (!(lock.rows[0] as { locked?: boolean } | undefined)?.locked)
          return false;
        const current = await tx.query.focusRoomCommitmentSessions.findFirst({
          where: eq(focusRoomCommitmentSessions.id, candidate.id),
        });
        if (
          !current ||
          !ACTIVE.includes(current.status) ||
          !current.expectedEndAt ||
          current.expectedEndAt > now ||
          current.pausedAt
        )
          return false;
        await tx
          .update(focusRoomCommitmentSessions)
          .set({
            status: 'completed',
            endedAt: current.expectedEndAt,
            endReason: 'completed_normally',
            reconciliationStatus: 'complete',
            terminationVersion: current.terminationVersion + 1,
            updatedAt: now,
          })
          .where(
            and(
              eq(focusRoomCommitmentSessions.id, current.id),
              inArray(focusRoomCommitmentSessions.status, ACTIVE),
            ),
          );
        await tx
          .update(focusRoomCommitmentParticipants)
          .set({
            outcome: 'completed',
            focusedDurationMinutes: current.durationMinutes,
            reconnectDeadlineAt: null,
            updatedAt: now,
          })
          .where(eq(focusRoomCommitmentParticipants.sessionId, current.id));
        await tx
          .update(focusSessions)
          .set({
            status: 'completed',
            endedAt: current.expectedEndAt,
            actualMinutes: current.durationMinutes,
            completionReason: 'completed_normally',
          })
          .where(
            and(
              eq(focusSessions.commitmentSessionId, current.id),
              inArray(focusSessions.status, ['active', 'paused']),
            ),
          );
        await tx
          .update(focusRoomMembers)
          .set({ state: 'finished' })
          .where(
            and(
              eq(focusRoomMembers.roomId, current.roomId),
              isNull(focusRoomMembers.leftAt),
            ),
          );
        await tx.insert(focusRoomActivityEvents).values({
          roomId: current.roomId,
          eventType: 'commitment_completed',
          metadata: {
            commitmentSessionId: current.id,
            eventVersion: current.terminationVersion + 1,
          },
        });
        return true;
      });
      if (completed)
        this.clearRuntimeState(candidate.roomId, candidate.id);
      if (completed)
        this.events.publish({
          id: `completed:${candidate.id}:${candidate.terminationVersion + 1}`,
          roomId: candidate.roomId,
          type: 'commitment_completed',
          occurredAt: now.toISOString(),
          payload: {
            commitmentSessionId: candidate.id,
            eventVersion: candidate.terminationVersion + 1,
          },
        });
    }
    const timedOut = await this.db
      .select()
      .from(focusRoomCommitmentParticipants)
      .innerJoin(
        focusRoomCommitmentSessions,
        eq(
          focusRoomCommitmentParticipants.sessionId,
          focusRoomCommitmentSessions.id,
        ),
      )
      .where(
        and(
          inArray(focusRoomCommitmentSessions.status, ACTIVE),
          sql`${focusRoomCommitmentParticipants.reconnectDeadlineAt} <= ${now}`,
        ),
      )
      .limit(100);
    for (const row of timedOut)
      await this.terminate(
        row.focus_room_commitment_participants.userId,
        row.focus_room_commitment_sessions.id,
        { commandId: randomUUID(), reason: 'participant_disconnect_timeout' },
      ).catch(() => undefined);
  }
  async terminate(
    userId: string,
    sessionId: string,
    dto: TerminateCommitmentDto,
  ) {
    const session = await this.session(sessionId);
    const member = await this.requireMember(session.roomId, userId);
    const participant =
      await this.db.query.focusRoomCommitmentParticipants.findFirst({
        where: and(
          eq(focusRoomCommitmentParticipants.sessionId, sessionId),
          eq(focusRoomCommitmentParticipants.userId, userId),
        ),
      });
    if (
      !participant?.acceptedAgreementAt &&
      !['owner', 'moderator'].includes(member.role)
    )
      throw new ForbiddenException(
        'Only an active participant or moderator may end this session.',
      );
    if (
      dto.reason === 'owner_ended_session' &&
      !['owner', 'moderator'].includes(member.role)
    )
      throw new ForbiddenException();
    const endedAt = new Date();
    const result = await this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select id from focus_room_commitment_sessions where id = ${sessionId} for update`,
      );
      const current = await tx.query.focusRoomCommitmentSessions.findFirst({
        where: eq(focusRoomCommitmentSessions.id, sessionId),
      });
      if (!current) throw new NotFoundException();
      if (!ACTIVE.includes(current.status))
        return { session: current, changed: false };
      const pausedSeconds = current.accumulatedPausedSeconds + (current.pausedAt ? Math.floor((endedAt.getTime() - current.pausedAt.getTime()) / 1000) : 0);
      const elapsedMinutes = Math.max(
        0,
        Math.floor(
          (endedAt.getTime() -
            (current.startedAt?.getTime() ?? endedAt.getTime())) /
            60_000,
        ) - Math.floor(pausedSeconds / 60),
      );
      const [ended] = await tx
        .update(focusRoomCommitmentSessions)
        .set({
          status: 'ended_early',
          endedAt,
          endedByUserId: userId,
          endReason: dto.reason,
          terminationCommandId: dto.commandId,
          terminationVersion: current.terminationVersion + 1,
          reconciliationStatus: 'pending',
          updatedAt: endedAt,
        })
        .where(
          and(
            eq(focusRoomCommitmentSessions.id, sessionId),
            inArray(focusRoomCommitmentSessions.status, ACTIVE),
          ),
        )
        .returning();
      if (!ended) return { session: current, changed: false };
      await tx
        .update(focusRoomCommitmentParticipants)
        .set({
          outcome: 'ended_due_to_other_member',
          focusedDurationMinutes: elapsedMinutes,
          leftAt: endedAt,
          reconnectDeadlineAt: null,
          updatedAt: endedAt,
        })
        .where(eq(focusRoomCommitmentParticipants.sessionId, sessionId));
      await tx
        .update(focusRoomCommitmentParticipants)
        .set({ outcome: 'collective_end_trigger' })
        .where(
          and(
            eq(focusRoomCommitmentParticipants.sessionId, sessionId),
            eq(focusRoomCommitmentParticipants.userId, userId),
          ),
        );
      const linked = await tx
        .select()
        .from(focusSessions)
        .where(
          and(
            eq(focusSessions.commitmentSessionId, sessionId),
            inArray(focusSessions.status, ['active', 'paused']),
          ),
        );
      for (const focus of linked) {
        const actualMinutes = Math.max(
          0,
          Math.min(
            focus.plannedMinutes,
            Math.floor(
              (endedAt.getTime() - focus.startedAt.getTime()) / 60_000 - pausedSeconds / 60,
            ),
          ),
        );
        await tx
          .update(focusSessions)
          .set({
            status: 'cancelled',
            endedAt,
            actualMinutes,
            completionReason: 'commitment_collective_end',
          })
          .where(
            and(
              eq(focusSessions.id, focus.id),
              inArray(focusSessions.status, ['active', 'paused']),
            ),
          );
      }
      await tx
        .update(focusRoomMembers)
        .set({ state: 'finished' })
        .where(
          and(
            eq(focusRoomMembers.roomId, current.roomId),
            isNull(focusRoomMembers.leftAt),
          ),
        );
      await tx.insert(focusRoomActivityEvents).values({
        roomId: current.roomId,
        userId,
        eventType: 'commitment_ended_early',
        metadata: {
          commitmentSessionId: sessionId,
          reason: dto.reason,
          commandId: dto.commandId,
          elapsedMinutes,
        },
      });
      await tx
        .update(focusRoomCommitmentSessions)
        .set({ reconciliationStatus: 'complete' })
        .where(eq(focusRoomCommitmentSessions.id, sessionId));
      return { session: ended, changed: true };
    });
    if (!result.changed) return this.snapshot(session.roomId, userId);
    this.clearRuntimeState(session.roomId, sessionId);
    const endedSession = result.session;
    const trigger = await this.displayName(session.roomId, userId);
    const participants = await this.db
      .select()
      .from(focusRoomCommitmentParticipants)
      .where(eq(focusRoomCommitmentParticipants.sessionId, sessionId));
    this.events.publish({
      id: dto.commandId,
      roomId: session.roomId,
      type: 'commitment_ended_early',
      occurredAt: (endedSession.endedAt ?? endedAt).toISOString(),
      payload: {
        roomId: session.roomId,
        commitmentSessionId: sessionId,
        endedAt: (endedSession.endedAt ?? endedAt).toISOString(),
        endedByUserId: endedSession.endedByUserId,
        endedByDisplayName: trigger,
        reason: endedSession.endReason,
        elapsedSeconds: Math.max(
          0,
          Math.floor(
            ((endedSession.endedAt ?? endedAt).getTime() -
              (endedSession.startedAt?.getTime() ?? endedAt.getTime())) /
              1000,
          ),
        ),
        plannedDurationSeconds: endedSession.durationMinutes * 60,
        participantOutcomes: participants.map((p) => ({
          userId: p.userId,
          outcome: p.outcome,
          focusedDurationMinutes: p.focusedDurationMinutes,
        })),
        eventVersion: endedSession.terminationVersion,
      },
    });
    return this.snapshot(session.roomId, userId);
  }
  async connect(roomId: string, userId: string, connectionId: string) {
    this.logger.log(`presence connect participant=${userId} room=${roomId} connection=${connectionId}`);
    await this.requireMember(roomId, userId);
    const session = await this.activeOrLatestCommitment(roomId);
    if (session && isSharedSessionTerminal(session.status))
      throw new BadRequestException(
        'This shared session has ended. Create a new session to focus again.',
      );
    const usersForRoom: Map<string, Set<string>> = this.connections.get(
      roomId,
    ) ?? new Map<string, Set<string>>();
    const sockets: Set<string> = usersForRoom.get(userId) ?? new Set<string>();
    sockets.add(connectionId);
    usersForRoom.set(userId, sockets);
    this.connections.set(roomId, usersForRoom);
    const key = `${roomId}:${userId}`;
    const timer = this.graceTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.graceTimers.delete(key);
    }
    if (session && ACTIVE.includes(session.status)) {
      await this.db
        .update(focusRoomCommitmentParticipants)
        .set({ reconnectDeadlineAt: null, recoveredDisconnect: true })
        .where(
          and(
            eq(focusRoomCommitmentParticipants.sessionId, session.id),
            eq(focusRoomCommitmentParticipants.userId, userId),
          ),
        );
      await this.db
        .update(focusRoomMembers)
        .set({ state: 'focusing' })
        .where(
          and(
            eq(focusRoomMembers.roomId, roomId),
            eq(focusRoomMembers.userId, userId),
          ),
        );
    }
  }
  async disconnect(roomId: string, userId: string, connectionId: string) {
    this.logger.log(`presence disconnect participant=${userId} room=${roomId} connection=${connectionId}`);
    const sockets = this.connections.get(roomId)?.get(userId);
    sockets?.delete(connectionId);
    if (sockets?.size) return;
    const session = await this.activeCommitment(roomId);
    if (!session) return;
    const deadline = new Date(
      Date.now() + session.reconnectGraceSeconds * 1000,
    );
    await this.db
      .update(focusRoomCommitmentParticipants)
      .set({ reconnectDeadlineAt: deadline })
      .where(
        and(
          eq(focusRoomCommitmentParticipants.sessionId, session.id),
          eq(focusRoomCommitmentParticipants.userId, userId),
        ),
      );
    await this.db
      .update(focusRoomMembers)
      .set({ state: 'reconnecting' })
      .where(
        and(
          eq(focusRoomMembers.roomId, roomId),
          eq(focusRoomMembers.userId, userId),
        ),
      );
    await this.record(roomId, userId, 'member_reconnecting', {
      deadline: deadline.toISOString(),
    });
    const key = `${roomId}:${userId}`;
    this.graceTimers.set(key, setTimeout(() => void this.revalidateDisconnect(roomId, userId, session.id, deadline), session.reconnectGraceSeconds * 1000));
  }
  private async revalidateDisconnect(roomId: string, userId: string, sessionId: string, deadline: Date) {
    const live = this.connections.get(roomId)?.get(userId);
    if (live?.size) { this.logger.log(`disconnect timeout rejected stale active_connection participant=${userId} room=${roomId}`); return; }
    const [participant] = await this.db.select({ reconnectDeadlineAt: focusRoomCommitmentParticipants.reconnectDeadlineAt })
      .from(focusRoomCommitmentParticipants)
      .where(and(eq(focusRoomCommitmentParticipants.sessionId, sessionId), eq(focusRoomCommitmentParticipants.userId, userId)));
    if (!participant?.reconnectDeadlineAt || participant.reconnectDeadlineAt.getTime() > Date.now() || participant.reconnectDeadlineAt.getTime() !== deadline.getTime()) { this.logger.log(`disconnect timeout rejected stale deadline participant=${userId} session=${sessionId}`); return; }
    const current = await this.activeCommitment(roomId);
    if (!current || current.id !== sessionId || !ACTIVE.includes(current.status)) { this.logger.log(`disconnect timeout rejected stale session participant=${userId} session=${sessionId}`); return; }
    this.logger.warn(`disconnect timeout accepted participant=${userId} session=${sessionId}`);
    await this.terminate(userId, sessionId, { commandId: randomUUID(), reason: 'participant_disconnect_timeout' }).catch(() => undefined);
  }
  stream(roomId: string, userId: string) {
    return this.requireMember(roomId, userId).then(() =>
      this.events.stream(roomId),
    );
  }
  async roomStatistics(roomId: string) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const members = await this.db
      .select()
      .from(focusRoomMembers)
      .where(
        and(
          eq(focusRoomMembers.roomId, roomId),
          isNull(focusRoomMembers.leftAt),
        ),
      );
    const rows = await this.db
      .select({
        actualMinutes: focusSessions.actualMinutes,
        status: focusSessions.status,
      })
      .from(focusSessions)
      .innerJoin(
        focusRoomCommitmentParticipants,
        eq(focusRoomCommitmentParticipants.focusSessionId, focusSessions.id),
      )
      .innerJoin(
        focusRoomCommitmentSessions,
        eq(
          focusRoomCommitmentSessions.id,
          focusRoomCommitmentParticipants.sessionId,
        ),
      )
      .where(
        and(
          eq(focusRoomCommitmentSessions.roomId, roomId),
          sql`${focusSessions.startedAt} >= ${start}`,
        ),
      );
    const completed = rows.filter((row) => row.status === 'completed');
    return {
      focusingNow: members.filter((member) => member.state === 'focusing')
        .length,
      onBreak: members.filter((member) => member.state === 'break').length,
      totalActualFocusMinutesToday: rows.reduce(
        (sum, row) => sum + (row.actualMinutes ?? 0),
        0,
      ),
      completedSessionsToday: completed.length,
      longestCompletedSessionMinutesToday: Math.max(
        0,
        ...completed.map((row) => row.actualMinutes ?? 0),
      ),
    };
  }
  async snapshot(roomId: string, userId: string) {
    await this.authorizeView(roomId, userId);
    const room = await this.room(roomId);
    const members = await this.db
      .select({
        userId: focusRoomMembers.userId,
        role: focusRoomMembers.role,
        state: focusRoomMembers.state,
        anonymous: focusRoomMembers.anonymous,
        showTaskTitle: focusRoomMembers.showTaskTitle,
        showTimer: focusRoomMembers.showTimer,
        showStatistics: focusRoomMembers.showStatistics,
        name: users.fullName,
      })
      .from(focusRoomMembers)
      .innerJoin(users, eq(users.id, focusRoomMembers.userId))
      .where(
        and(
          eq(focusRoomMembers.roomId, roomId),
          isNull(focusRoomMembers.leftAt),
        ),
      );
    const commitment = await this.activeOrLatestCommitment(roomId);
    const commitmentParticipants = commitment
      ? await this.db
          .select()
          .from(focusRoomCommitmentParticipants)
          .where(eq(focusRoomCommitmentParticipants.sessionId, commitment.id))
      : [];
    const participantByUser = new Map(
      commitmentParticipants.map((participant) => [
        participant.userId,
        participant,
      ]),
    );
    const events = await this.db
      .select()
      .from(focusRoomActivityEvents)
      .where(eq(focusRoomActivityEvents.roomId, roomId))
      .orderBy(desc(focusRoomActivityEvents.createdAt))
      .limit(50);
    const statistics = await this.roomStatistics(roomId);
    return {
      ...room,
      statistics,
      goalProgressMinutes: Math.min(
        room.goalTargetMinutes ?? Number.MAX_SAFE_INTEGER,
        statistics.totalActualFocusMinutesToday,
      ),
      currentUserId: userId,
      isCurrentUserMember: members.some((member) => member.userId === userId),
      canManageInvitations:
        (!commitment || commitment.status === 'lobby') &&
        (room.ownerUserId === userId ||
          members.some(
            (member) =>
              member.userId === userId && member.role === 'moderator',
          )),
      members: members.map((m) => ({
        ...m,
        displayName: m.anonymous ? 'Anonymous Bee' : m.name,
        name: undefined,
        acceptedAgreement: Boolean(
          participantByUser.get(m.userId)?.acceptedAgreementAt,
        ),
        ready: Boolean(participantByUser.get(m.userId)?.readyAt),
        focusedDurationMinutes:
          participantByUser.get(m.userId)?.focusedDurationMinutes ?? null,
      })),
      commitment,
      events,
    };
  }
  private async room(id: string) {
    const room = await this.db.query.focusRooms.findFirst({
      where: eq(focusRooms.id, id),
    });
    if (!room) throw new NotFoundException('Focus Room not found.');
    return room;
  }
  private async session(id: string) {
    const row = await this.db.query.focusRoomCommitmentSessions.findFirst({
      where: eq(focusRoomCommitmentSessions.id, id),
    });
    if (!row) throw new NotFoundException('Commitment session not found.');
    return row;
  }
  private activeCommitment(roomId: string) {
    return this.db.query.focusRoomCommitmentSessions.findFirst({
      where: and(
        eq(focusRoomCommitmentSessions.roomId, roomId),
        inArray(focusRoomCommitmentSessions.status, ['lobby', ...ACTIVE]),
      ),
      orderBy: [desc(focusRoomCommitmentSessions.createdAt)],
    });
  }
  private activeOrLatestCommitment(roomId: string) {
    return this.db.query.focusRoomCommitmentSessions.findFirst({
      where: eq(focusRoomCommitmentSessions.roomId, roomId),
      orderBy: [desc(focusRoomCommitmentSessions.createdAt)],
    });
  }
  private async requireOpenLobby(roomId: string) {
    const session = await this.activeOrLatestCommitment(roomId);
    if (session && isSharedSessionLocked(session.status))
      throw new BadRequestException(
        'This shared session is locked or has ended. Create a new session instead.',
      );
  }
  private requireLobbySession(status: string) {
    if (isSharedSessionLocked(status))
      throw new BadRequestException(
        'Session settings and readiness are locked after focus begins.',
      );
  }
  private scheduleCompletion(sessionId: string, expectedEndAt: Date) {
    const existing = this.completionTimers.get(sessionId);
    if (existing) clearTimeout(existing);
    this.completionTimers.set(
      sessionId,
      setTimeout(() => {
        this.completionTimers.delete(sessionId);
        void this.reconcilePersistedState();
      }, Math.max(0, expectedEndAt.getTime() - Date.now())),
    );
  }
  private clearRuntimeState(roomId: string, sessionId: string) {
    const completion = this.completionTimers.get(sessionId);
    if (completion) clearTimeout(completion);
    this.completionTimers.delete(sessionId);
    this.connections.delete(roomId);
    for (const [key, timer] of this.graceTimers) {
      if (!key.startsWith(`${roomId}:`)) continue;
      clearTimeout(timer);
      this.graceTimers.delete(key);
    }
  }
  private async requireMember(roomId: string, userId: string) {
    const member = await this.db.query.focusRoomMembers.findFirst({
      where: and(
        eq(focusRoomMembers.roomId, roomId),
        eq(focusRoomMembers.userId, userId),
        isNull(focusRoomMembers.leftAt),
      ),
    });
    if (!member)
      throw new ForbiddenException('Active room membership is required.');
    return member;
  }
  private async requireCommittedParticipant(sessionId: string, userId: string) {
    const participant = await this.db.query.focusRoomCommitmentParticipants.findFirst({ where: and(eq(focusRoomCommitmentParticipants.sessionId, sessionId), eq(focusRoomCommitmentParticipants.userId, userId)) });
    if (!participant?.acceptedAgreementAt) throw new ForbiddenException('You are not a committed participant.');
    return participant;
  }
  private async authorizeView(roomId: string, userId: string) {
    const room = await this.room(roomId);
    if (room.visibility === 'public' || room.ownerUserId === userId) return;
    await this.requireMember(roomId, userId);
  }
  private async displayName(roomId: string, userId: string) {
    const row = await this.db
      .select({ anonymous: focusRoomMembers.anonymous, name: users.fullName })
      .from(focusRoomMembers)
      .innerJoin(users, eq(users.id, focusRoomMembers.userId))
      .where(
        and(
          eq(focusRoomMembers.roomId, roomId),
          eq(focusRoomMembers.userId, userId),
        ),
      )
      .limit(1);
    return row[0]?.anonymous
      ? 'Anonymous Bee'
      : (row[0]?.name ?? 'A participant');
  }
  private async record(
    roomId: string,
    userId: string | null,
    type: string,
    metadata: Record<string, unknown>,
  ) {
    const [event] = await this.db
      .insert(focusRoomActivityEvents)
      .values({ roomId, userId, eventType: type, metadata })
      .returning();
    this.events.publish({
      id: event.id,
      roomId,
      type,
      occurredAt: event.createdAt.toISOString(),
      payload: metadata,
    });
  }
}
