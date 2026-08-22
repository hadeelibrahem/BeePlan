import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DatabaseService } from '../db/database.service';
import { moderationActions, userReports, users } from '../db/schema';
import { AdminAuditLogService } from '../admin/audit/admin-audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { accountStatusUpdate } from '../admin/users/account-status';

const reportUser = { id: users.id, fullName: users.fullName, email: users.email, accountStatus: users.accountStatus };
type ModerationAction = 'warning' | 'suspend' | 'restore';

@Injectable()
export class ReportsService {
  constructor(private readonly database: DatabaseService, private readonly audit: AdminAuditLogService, private readonly notifications: NotificationsService) {}

  async submit(reporterUserId: string, input: { reportedUserId: string; category: string; reason: string; contextType?: string; contextId?: string }) {
    if (reporterUserId === input.reportedUserId) throw new ConflictException('You cannot report yourself.');
    const [target] = await this.database.db.select({ id: users.id }).from(users).where(eq(users.id, input.reportedUserId)).limit(1);
    if (!target) throw new NotFoundException('Reported user not found.');
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const sameContext = input.contextId ? eq(userReports.contextId, input.contextId) : isNull(userReports.contextId);
    const [duplicate] = await this.database.db.select({ id: userReports.id }).from(userReports).where(and(eq(userReports.reporterUserId, reporterUserId), eq(userReports.reportedUserId, input.reportedUserId), eq(userReports.category, input.category), sameContext, gte(userReports.createdAt, since))).limit(1);
    if (duplicate) throw new ConflictException('A similar report was already submitted recently.');
    const [report] = await this.database.db.insert(userReports).values({ reporterUserId, reportedUserId: input.reportedUserId, category: input.category, reason: input.reason.trim(), contextType: input.contextType, contextId: input.contextId }).returning();
    return { id: report.id, status: report.status, createdAt: report.createdAt.toISOString() };
  }

  async list(input: { status?: string; category?: string; page: number; limit: number }) {
    const where = input.status || input.category ? and(...[input.status ? eq(userReports.status, input.status) : undefined, input.category ? eq(userReports.category, input.category) : undefined].filter(Boolean) as any) : undefined;
    const [{ total }] = await this.database.db.select({ total: sql<number>`count(*)` }).from(userReports).where(where);
    const rows = await this.database.db.select({ report: userReports, reported: reportUser }).from(userReports).innerJoin(users, eq(userReports.reportedUserId, users.id)).where(where).orderBy(desc(userReports.createdAt)).limit(input.limit).offset((input.page - 1) * input.limit);
    return { items: rows.map(({ report, reported }) => ({ ...report, createdAt: report.createdAt.toISOString(), updatedAt: report.updatedAt.toISOString(), reported })), total: Number(total), page: input.page, limit: input.limit };
  }

  async detail(id: string) {
    const reporterUsers = alias(users, 'reporter_users'); const reportedUsers = alias(users, 'reported_users');
    const rows = await this.database.db.select({ report: userReports, reporter: { id: reporterUsers.id, fullName: reporterUsers.fullName, email: reporterUsers.email, accountStatus: reporterUsers.accountStatus }, reported: { id: reportedUsers.id, fullName: reportedUsers.fullName, email: reportedUsers.email, accountStatus: reportedUsers.accountStatus } }).from(userReports).innerJoin(reporterUsers, eq(userReports.reporterUserId, reporterUsers.id)).innerJoin(reportedUsers, eq(userReports.reportedUserId, reportedUsers.id)).where(eq(userReports.id, id)).limit(1);
    if (!rows[0]) throw new NotFoundException('Report not found.');
    const report = rows[0].report; const actorUsers = alias(users, 'moderation_actor_users');
    const actions = await this.database.db.select({ action: moderationActions, actor: { id: actorUsers.id, fullName: actorUsers.fullName, email: actorUsers.email } }).from(moderationActions).leftJoin(actorUsers, eq(moderationActions.actorAdminId, actorUsers.id)).where(eq(moderationActions.reportId, report.id)).orderBy(desc(moderationActions.createdAt));
    return { ...report, createdAt: report.createdAt.toISOString(), updatedAt: report.updatedAt.toISOString(), reporter: rows[0].reporter, reported: rows[0].reported, moderationActions: actions.map(({ action, actor }) => ({ ...action, createdAt: action.createdAt.toISOString(), actor: actor?.id ? actor : undefined })) };
  }

  async status(actorId: string, id: string, status: 'under_review' | 'dismissed') {
    const [before] = await this.database.db.select().from(userReports).where(eq(userReports.id, id)).limit(1); if (!before) throw new NotFoundException('Report not found.');
    const [after] = await this.database.db.update(userReports).set({ status, reviewedByAdminId: actorId, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(userReports.id, id)).returning();
    await this.audit.write({ actorUserId: actorId, action: status === 'under_review' ? 'report.marked_under_review' : 'report.dismissed', targetType: 'report', targetId: id, beforeState: { status: before.status }, afterState: { status: after.status } }); return after;
  }

  async moderate(actorId: string, id: string, action: ModerationAction, reason: string) {
    const result = await this.database.db.transaction(async (tx) => {
      const [report] = await tx.select().from(userReports).where(eq(userReports.id, id)).limit(1); if (!report) throw new NotFoundException('Report not found.');
      if (action === 'suspend' && report.reportedUserId === actorId) throw new ConflictException('CANNOT_SUSPEND_SELF');
      const [subject] = await tx.select().from(users).where(eq(users.id, report.reportedUserId)).limit(1); if (!subject) throw new NotFoundException('Reported user not found.');
      if (action === 'suspend' && subject.role === 'admin') throw new ConflictException('CANNOT_SUSPEND_ADMIN');
      if (action === 'restore' && subject.accountStatus !== 'suspended') throw new ConflictException('USER_NOT_SUSPENDED');
      const now = new Date();
      const [moderation] = await tx.insert(moderationActions).values({ reportId: id, subjectUserId: subject.id, actorAdminId: actorId, action, reason }).returning({ id: moderationActions.id });
      if (action === 'suspend') await tx.update(users).set(accountStatusUpdate(subject, 'suspended', reason, now)).where(eq(users.id, subject.id));
      if (action === 'restore') await tx.update(users).set(accountStatusUpdate(subject, 'active', reason, now)).where(eq(users.id, subject.id));
      const [updated] = await tx.update(userReports).set({ status: 'action_taken', reviewedByAdminId: actorId, reviewedAt: now, updatedAt: now }).where(eq(userReports.id, id)).returning();
      await this.audit.write({ actorUserId: actorId, action: action === 'warning' ? 'moderation.warning_issued' : action === 'suspend' ? 'moderation.user_suspended' : 'moderation.user_restored', targetType: 'report', targetId: id, beforeState: { status: report.status, accountStatus: subject.accountStatus }, afterState: { status: updated.status, action, accountStatus: action === 'suspend' ? 'suspended' : action === 'restore' ? 'active' : subject.accountStatus }, metadata: { subjectUserId: subject.id, reason: reason.trim() } }, tx as unknown as typeof this.database.db);
      return { updated, subjectId: subject.id, moderationId: moderation.id, now };
    });
    if (action === 'warning') await this.notifications.createOnce({ userId: result.subjectId, type: 'moderation_warning', title: 'Account warning', body: "Your account received a moderation warning. Please review BeePlan's community guidelines." }, { entityType: 'moderation_action', entityId: result.moderationId, triggerAt: result.now });
    if (action === 'restore') await this.notifications.createOnce({ userId: result.subjectId, type: 'moderation_restored', title: 'Account restored', body: 'Your BeePlan account access has been restored.' }, { entityType: 'moderation_action', entityId: result.moderationId, triggerAt: result.now });
    return result.updated;
  }
}
