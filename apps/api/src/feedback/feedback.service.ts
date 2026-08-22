import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, ilike, inArray, sql } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { feedbackItems, feedbackVotes, users } from '../db/schema';
import { AdminAuditLogService } from '../admin/audit/admin-audit.service';
import { NotificationsService } from '../notifications/notifications.service';

export const feedbackCategories = ['idea', 'improvement', 'problem', 'other'] as const;
export const feedbackStatuses = ['submitted', 'reviewing', 'planned', 'in_development', 'released', 'declined'] as const;
export type FeedbackStatus = typeof feedbackStatuses[number];
const transitions: Record<FeedbackStatus, FeedbackStatus[]> = { submitted: ['reviewing', 'declined'], reviewing: ['planned', 'declined'], planned: ['in_development', 'declined'], in_development: ['released'], released: [], declined: ['reviewing'] };
const votes = (id: typeof feedbackItems.id) => sql<number>`(select count(*) from ${feedbackVotes} where ${feedbackVotes.feedbackId} = ${id})`;
const viewerVoted = (id: typeof feedbackItems.id, userId: string) => sql<boolean>`exists(select 1 from ${feedbackVotes} where ${feedbackVotes.feedbackId} = ${id} and ${feedbackVotes.userId} = ${userId})`;

@Injectable()
export class FeedbackService {
  constructor(private readonly database: DatabaseService, private readonly audit: AdminAuditLogService, private readonly notifications: NotificationsService) {}
  async submit(userId: string, input: { category: string; title: string; description: string }) {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const [{ total }] = await this.database.db.select({ total: sql<number>`count(*)` }).from(feedbackItems).where(and(eq(feedbackItems.authorUserId, userId), gte(feedbackItems.createdAt, since)));
    if (Number(total) >= 5) throw new ConflictException('Please wait before submitting more feedback.');
    const [item] = await this.database.db.insert(feedbackItems).values({ authorUserId: userId, category: input.category, title: input.title.trim(), description: input.description.trim() }).returning();
    return this.publicDetail(item.id, userId);
  }
  async list(userId: string, input: { search?: string; category?: string; status?: string; sort?: string; page: number; limit: number; mine?: boolean }) {
    const clauses: any[] = [eq(feedbackItems.visibility, 'public')];
    if (input.mine) clauses.push(eq(feedbackItems.authorUserId, userId));
    if (input.category) clauses.push(eq(feedbackItems.category, input.category)); if (input.status) clauses.push(eq(feedbackItems.status, input.status)); if (input.search?.trim()) clauses.push(ilike(feedbackItems.title, `%${input.search.trim()}%`));
    const where = and(...clauses); const voteCount = votes(feedbackItems.id);
    const order = input.sort === 'most_voted' ? desc(voteCount) : input.sort === 'recently_updated' ? desc(feedbackItems.updatedAt) : desc(feedbackItems.createdAt);
    const [{ total }] = await this.database.db.select({ total: sql<number>`count(*)` }).from(feedbackItems).where(where);
    const rows = await this.database.db.select({ item: feedbackItems, author: { id: users.id, fullName: users.fullName }, voteCount, voted: viewerVoted(feedbackItems.id, userId) }).from(feedbackItems).innerJoin(users, eq(feedbackItems.authorUserId, users.id)).where(where).orderBy(order).limit(input.limit).offset((input.page - 1) * input.limit);
    return { items: rows.map((row) => this.publicRow(row)), total: Number(total), page: input.page, limit: input.limit };
  }
  async publicDetail(id: string, viewerId: string) {
    const rows = await this.database.db.select({ item: feedbackItems, author: { id: users.id, fullName: users.fullName }, voteCount: votes(feedbackItems.id), voted: viewerVoted(feedbackItems.id, viewerId) }).from(feedbackItems).innerJoin(users, eq(feedbackItems.authorUserId, users.id)).where(and(eq(feedbackItems.id, id), eq(feedbackItems.visibility, 'public'))).limit(1);
    if (!rows[0]) throw new NotFoundException('Feedback item not found.'); return this.publicRow(rows[0]);
  }
  async vote(userId: string, id: string) { const item = await this.publicDetail(id, userId); if (item.voted) throw new ConflictException('You already voted for this feedback.'); await this.database.db.insert(feedbackVotes).values({ feedbackId: id, userId }).onConflictDoNothing(); return this.publicDetail(id, userId); }
  async removeVote(userId: string, id: string) { await this.database.db.delete(feedbackVotes).where(and(eq(feedbackVotes.feedbackId, id), eq(feedbackVotes.userId, userId))); return this.publicDetail(id, userId); }
  async adminList(input: { search?: string; category?: string; status?: string; visibility?: string; sort?: string; page: number; limit: number }) {
    const clauses: any[] = []; if (input.category) clauses.push(eq(feedbackItems.category, input.category)); if (input.status) clauses.push(eq(feedbackItems.status, input.status)); if (input.visibility) clauses.push(eq(feedbackItems.visibility, input.visibility)); if (input.search?.trim()) clauses.push(ilike(feedbackItems.title, `%${input.search.trim()}%`)); const where = clauses.length ? and(...clauses) : undefined; const voteCount = votes(feedbackItems.id); const order = input.sort === 'most_voted' ? desc(voteCount) : input.sort === 'recently_updated' ? desc(feedbackItems.updatedAt) : desc(feedbackItems.createdAt); const [{ total }] = await this.database.db.select({ total: sql<number>`count(*)` }).from(feedbackItems).where(where); const rows = await this.database.db.select({ item: feedbackItems, author: { id: users.id, fullName: users.fullName, email: users.email }, voteCount }).from(feedbackItems).innerJoin(users, eq(feedbackItems.authorUserId, users.id)).where(where).orderBy(order).limit(input.limit).offset((input.page - 1) * input.limit); const summary = await this.database.db.select({ status: feedbackItems.status, count: sql<number>`count(*)` }).from(feedbackItems).groupBy(feedbackItems.status); return { items: rows.map(({ item, author, voteCount }) => ({ ...this.serialize(item), author, voteCount: Number(voteCount) })), total: Number(total), page: input.page, limit: input.limit, summary: Object.fromEntries(summary.map((row) => [row.status, Number(row.count)])) };
  }
  async adminDetail(id: string) { const rows = await this.database.db.select({ item: feedbackItems, author: { id: users.id, fullName: users.fullName, email: users.email }, voteCount: votes(feedbackItems.id) }).from(feedbackItems).innerJoin(users, eq(feedbackItems.authorUserId, users.id)).where(eq(feedbackItems.id, id)).limit(1); if (!rows[0]) throw new NotFoundException('Feedback item not found.'); return { ...this.serialize(rows[0].item), author: rows[0].author, voteCount: Number(rows[0].voteCount), validNextStatuses: transitions[rows[0].item.status as FeedbackStatus] ?? [] }; }
  async changeStatus(actorId: string, id: string, status: FeedbackStatus) { const before = await this.adminDetail(id); if (!before.validNextStatuses.includes(status)) throw new BadRequestException(`Cannot move feedback from ${before.status} to ${status}.`); const now = new Date(); const [after] = await this.database.db.update(feedbackItems).set({ status, reviewedByAdminId: actorId, reviewedAt: now, releasedAt: status === 'released' ? now : undefined, updatedAt: now }).where(eq(feedbackItems.id, id)).returning(); await this.audit.write({ actorUserId: actorId, action: status === 'released' ? 'feedback.released' : 'feedback.status_changed', targetType: 'feedback', targetId: id, beforeState: { status: before.status }, afterState: { status } }); if (status === 'planned' || status === 'released') await this.notifications.createOnce({ userId: after.authorUserId, type: status === 'planned' ? 'feedback_planned' : 'feedback_released', title: status === 'planned' ? 'Your idea is planned' : 'Your idea is now available', body: status === 'planned' ? 'An idea you submitted is now planned for BeePlan.' : 'An idea you submitted has been released in BeePlan.', data: { feedbackId: id } }, { entityType: 'feedback_status', entityId: id, triggerAt: now, key: `${after.authorUserId}:feedback:${id}:${status}` }); if (status === 'released') { const voters = await this.database.db.select({ userId: feedbackVotes.userId }).from(feedbackVotes).where(eq(feedbackVotes.feedbackId, id)); await Promise.all(voters.filter((v) => v.userId !== after.authorUserId).map((v) => this.notifications.createOnce({ userId: v.userId, type: 'feedback_released', title: 'An idea you voted for is now available', body: 'A feature request you supported has been released in BeePlan.', data: { feedbackId: id } }, { entityType: 'feedback_release_vote', entityId: id, triggerAt: now, key: `${v.userId}:feedback-vote:${id}:released` }))); } return this.adminDetail(id); }
  private serialize(item: typeof feedbackItems.$inferSelect) { return { ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(), reviewedAt: item.reviewedAt?.toISOString() ?? null, releasedAt: item.releasedAt?.toISOString() ?? null }; }
  private publicRow(row: any) { return { ...this.serialize(row.item), author: { id: row.author.id, displayName: row.author.fullName }, voteCount: Number(row.voteCount), voted: Boolean(row.voted) }; }
}
