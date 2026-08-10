import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, desc, eq, inArray, isNotNull, isNull, lte, or } from 'drizzle-orm';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../db/database.service';
import { tasks, timeCapsuleAttachments, timeCapsules } from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';

export const ATTACHMENT_LIMITS = { image: 15 * 1024 * 1024, audio: 25 * 1024 * 1024, file: 25 * 1024 * 1024, video: 100 * 1024 * 1024 } as const;
const ALLOWED = new Set(['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','audio/mp4','audio/m4a','audio/aac','audio/wav','audio/x-wav','video/mp4','video/quicktime','video/webm']);
type Capsule = typeof timeCapsules.$inferSelect;

@Injectable()
export class TimeCapsulesService {
  private readonly root = join(process.cwd(), 'uploads', 'time-capsules');
  constructor(private readonly database: DatabaseService, private readonly notifications: NotificationsService) {}
  private get db() { return this.database.db; }

  async create(userId: string, body: Record<string, unknown>) {
    const title = String(body.title ?? '').trim();
    const message = String(body.message ?? '').trim();
    const unlockType = String(body.unlockType ?? '');
    if (!title || title.length > 255 || !message || message.length > 50000) throw new BadRequestException('A title and message are required.');
    if (unlockType !== 'date') throw new BadRequestException('Time Capsules now open on a specific date only.');
    let unlockAt: Date | null = null, linkedTaskId: string | null = null, linkedProjectId: string | null = null;
    if (unlockType === 'date') {
      unlockAt = new Date(String(body.unlockAt ?? ''));
      if (!Number.isFinite(unlockAt.getTime()) || unlockAt.getTime() <= Date.now()) throw new BadRequestException('Unlock date must be in the future.');
    } else {
      const id = String(unlockType === 'task_completion' ? body.linkedTaskId ?? '' : body.linkedProjectId ?? '');
      const [task] = await this.db.select({ id: tasks.id, status: tasks.status }).from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
      if (!task) throw new BadRequestException('The selected task or project is unavailable.');
      if (task.status === 'done') throw new BadRequestException('Choose an unfinished task or project.');
      if (unlockType === 'task_completion') linkedTaskId = id; else linkedProjectId = id;
    }
    const [row] = await this.db.insert(timeCapsules).values({ userId, title, message, unlockType, unlockAt, linkedTaskId, linkedProjectId }).returning();
    return this.detail(row, []);
  }

  async updateDraft(userId: string, id: string, body: Record<string, unknown>) {
    const existing = await this.owned(userId, id);
    if (existing.sealedAt) throw new ConflictException('A sealed capsule cannot be edited.');
    const title = body.title === undefined ? existing.title : String(body.title).trim();
    const message = body.message === undefined ? existing.message : String(body.message).trim();
    const unlockType = body.unlockType === undefined ? existing.unlockType : String(body.unlockType);
    if (!title || title.length > 255 || !message || message.length > 50000) throw new BadRequestException('A title and message are required.');
    if (unlockType !== 'date') throw new BadRequestException('Time Capsules now open on a specific date only.');
    let unlockAt: Date | null = null, linkedTaskId: string | null = null, linkedProjectId: string | null = null;
    if (unlockType === 'date') {
      unlockAt = new Date(String(body.unlockAt ?? existing.unlockAt ?? ''));
      if (!Number.isFinite(unlockAt.getTime()) || unlockAt.getTime() <= Date.now()) throw new BadRequestException('Unlock date must be in the future.');
    } else {
      const idValue = String(unlockType === 'task_completion' ? body.linkedTaskId ?? existing.linkedTaskId ?? '' : body.linkedProjectId ?? existing.linkedProjectId ?? '');
      const [task] = await this.db.select({ id: tasks.id, status: tasks.status }).from(tasks).where(and(eq(tasks.id, idValue), eq(tasks.userId, userId)));
      if (!task || task.status === 'done') throw new BadRequestException('Choose an unfinished task or project.');
      if (unlockType === 'task_completion') linkedTaskId = idValue; else linkedProjectId = idValue;
    }
    const [updated] = await this.db.update(timeCapsules).set({ title, message, unlockType, unlockAt, linkedTaskId, linkedProjectId, updatedAt: new Date() }).where(and(eq(timeCapsules.id, id), eq(timeCapsules.userId, userId), isNull(timeCapsules.sealedAt))).returning();
    if (!updated) throw new ConflictException('A sealed capsule cannot be edited.');
    const attachments = await this.db.select().from(timeCapsuleAttachments).where(eq(timeCapsuleAttachments.capsuleId, id));
    return this.detail(updated, attachments);
  }

  async list(userId: string, status?: string) {
    await this.reconcile(userId);
    const conditions = [eq(timeCapsules.userId, userId)];
    if (status === 'draft') conditions.push(isNull(timeCapsules.sealedAt));
    else if (status && ['locked','ready','opened','cancelled'].includes(status)) conditions.push(eq(timeCapsules.status, status));
    const rows = await this.db.select().from(timeCapsules).where(and(...conditions)).orderBy(desc(timeCapsules.createdAt));
    const ids = rows.map(r => r.id);
    const attachments = ids.length ? await this.db.select({ capsuleId: timeCapsuleAttachments.capsuleId }).from(timeCapsuleAttachments).where(inArray(timeCapsuleAttachments.capsuleId, ids)) : [];
    const counts = new Map<string, number>(); attachments.forEach(a => counts.set(a.capsuleId, (counts.get(a.capsuleId) ?? 0) + 1));
    return rows.map(row => this.safe(row, counts.get(row.id) ?? 0));
  }

  async get(userId: string, id: string) {
    await this.reconcile(userId);
    const row = await this.owned(userId, id);
    const attachments = await this.db.select().from(timeCapsuleAttachments).where(and(eq(timeCapsuleAttachments.capsuleId, id), eq(timeCapsuleAttachments.userId, userId)));
    return row.status === 'locked' && row.sealedAt ? this.safe(row, attachments.length) : this.detail(row, attachments);
  }

  async seal(userId: string, id: string) {
    const row = await this.owned(userId, id);
    if (row.sealedAt) throw new ConflictException('This capsule is already sealed.');
    const [sealed] = await this.db.update(timeCapsules).set({ sealedAt: new Date(), updatedAt: new Date() }).where(and(eq(timeCapsules.id, id), eq(timeCapsules.userId, userId))).returning();
    return this.safe(sealed, await this.count(id));
  }

  async open(userId: string, id: string) {
    await this.reconcile(userId);
    const row = await this.owned(userId, id);
    if (row.status === 'locked') throw new ConflictException('This capsule is still locked.');
    if (row.status === 'cancelled') throw new ConflictException('This capsule was cancelled.');
    const [opened] = row.status === 'ready' ? await this.db.update(timeCapsules).set({ status: 'opened', openedAt: new Date(), updatedAt: new Date() }).where(and(eq(timeCapsules.id, id), eq(timeCapsules.status, 'ready'))).returning() : [row];
    const attachments = await this.db.select().from(timeCapsuleAttachments).where(and(eq(timeCapsuleAttachments.capsuleId, id), eq(timeCapsuleAttachments.userId, userId)));
    return this.detail(opened ?? row, attachments);
  }

  async addAttachment(userId: string, id: string, file: Express.Multer.File, duration?: number) {
    const capsule = await this.owned(userId, id);
    if (capsule.sealedAt) throw new ConflictException('Attachments cannot be changed after sealing.');
    if (!file) throw new BadRequestException('Upload failed. Please try again.');
    if (!ALLOWED.has(file.mimetype)) throw new BadRequestException(file.mimetype.startsWith('video/') ? 'This video format is not supported. Use MP4, MOV, or WebM.' : 'This file type is not supported.');
    const type = file.mimetype.startsWith('image/') ? 'image' : file.mimetype.startsWith('video/') ? 'video' : file.mimetype.startsWith('audio/') ? 'audio' : 'file';
    if (file.size > ATTACHMENT_LIMITS[type]) throw new BadRequestException(`${type[0].toUpperCase()}${type.slice(1)} exceeds the ${ATTACHMENT_LIMITS[type] / 1024 / 1024} MB limit.`);
    const safeName = basename(file.originalname).replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 255) || 'attachment';
    const key = join(userId, id, `${randomUUID()}-${safeName}`); const path = join(this.root, key);
    await mkdir(join(this.root, userId, id), { recursive: true }); await writeFile(path, file.buffer);
    try {
      const [row] = await this.db.insert(timeCapsuleAttachments).values({ capsuleId: id, userId, type, fileName: safeName, mimeType: file.mimetype, sizeBytes: file.size, storageKey: key, durationSeconds: type === 'audio' && duration ? Math.max(0, Math.round(duration)) : null }).returning();
      return row;
    } catch (error) { await rm(path, { force: true }); throw error; }
  }

  async removeAttachment(userId: string, capsuleId: string, attachmentId: string) {
    const capsule = await this.owned(userId, capsuleId); if (capsule.sealedAt) throw new ConflictException('Attachments cannot be changed after sealing.');
    const [row] = await this.db.delete(timeCapsuleAttachments).where(and(eq(timeCapsuleAttachments.id, attachmentId), eq(timeCapsuleAttachments.capsuleId, capsuleId), eq(timeCapsuleAttachments.userId, userId))).returning();
    if (!row) throw new NotFoundException('Attachment not found.'); await rm(join(this.root, row.storageKey), { force: true });
  }

  async attachment(userId: string, capsuleId: string, attachmentId: string) {
    const capsule = await this.owned(userId, capsuleId); if (!['ready','opened'].includes(capsule.status)) throw new NotFoundException('Attachment not found.');
    const [row] = await this.db.select().from(timeCapsuleAttachments).where(and(eq(timeCapsuleAttachments.id, attachmentId), eq(timeCapsuleAttachments.capsuleId, capsuleId), eq(timeCapsuleAttachments.userId, userId)));
    if (!row) throw new NotFoundException('Attachment not found.'); return { row, buffer: await readFile(join(this.root, row.storageKey)) };
  }

  async remove(userId: string, id: string) {
    await this.owned(userId, id); await this.db.delete(timeCapsules).where(and(eq(timeCapsules.id, id), eq(timeCapsules.userId, userId))); await rm(join(this.root, userId, id), { recursive: true, force: true });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async scheduledReconcile() { await this.reconcile(); }
  async reconcile(userId?: string) {
    const conditions = [eq(timeCapsules.status, 'locked'), isNotNull(timeCapsules.sealedAt), or(and(eq(timeCapsules.unlockType, 'date'), lte(timeCapsules.unlockAt, new Date())), and(eq(timeCapsules.unlockType, 'task_completion'), eq(tasks.status, 'done')), and(eq(timeCapsules.unlockType, 'project_completion'), eq(tasks.status, 'done')))];
    if (userId) conditions.push(eq(timeCapsules.userId, userId));
    const candidates = await this.db.select({ capsule: timeCapsules, linkedTitle: tasks.title }).from(timeCapsules).leftJoin(tasks, or(eq(tasks.id, timeCapsules.linkedTaskId), eq(tasks.id, timeCapsules.linkedProjectId))).where(and(...conditions));
    for (const candidate of candidates) {
      const now = new Date(); const [ready] = await this.db.update(timeCapsules).set({ status: 'ready', updatedAt: now }).where(and(eq(timeCapsules.id, candidate.capsule.id), eq(timeCapsules.status, 'locked'))).returning();
      if (!ready) continue;
      try { await this.notifications.createOnce({ userId: ready.userId, type: 'time_capsule_ready', title: 'A message from your past is waiting 💌', body: candidate.linkedTitle ? `Congratulations 🎉 You completed ${candidate.linkedTitle}. A Time Capsule is waiting for you.` : `Your Time Capsule “${ready.title}” is ready to open.`, data: { capsuleId: ready.id, route: `/time-capsules/${ready.id}` } }, { entityType: 'time_capsule', entityId: ready.id, triggerAt: now, key: `time-capsule-ready:${ready.id}` }); await this.db.update(timeCapsules).set({ notificationSentAt: now }).where(eq(timeCapsules.id, ready.id)); } catch { /* unlock is authoritative even if delivery fails */ }
    }
    return candidates.length;
  }

  private async owned(userId: string, id: string) { const [row] = await this.db.select().from(timeCapsules).where(and(eq(timeCapsules.id, id), eq(timeCapsules.userId, userId))); if (!row) throw new NotFoundException('Time Capsule not found.'); return row; }
  private async count(id: string) { const rows = await this.db.select({ id: timeCapsuleAttachments.id }).from(timeCapsuleAttachments).where(eq(timeCapsuleAttachments.capsuleId, id)); return rows.length; }
  private safe(row: Capsule, attachmentCount: number) { const { message: _message, ...metadata } = row; return { ...metadata, attachmentCount, isDraft: !row.sealedAt, message: undefined }; }
  private detail(row: Capsule, attachments: Array<typeof timeCapsuleAttachments.$inferSelect>) { return { ...row, attachmentCount: attachments.length, attachments: attachments.map(({ storageKey: _key, userId: _user, ...a }) => ({ ...a, url: `/time-capsules/${row.id}/attachments/${a.id}/content` })) }; }
}
