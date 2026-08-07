/* eslint-disable prettier/prettier */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, ilike, inArray, sql } from 'drizzle-orm';
import { createReadStream } from 'fs';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../db/database.service';
import { achievements, achievementImages, focusSessions, subtasks, taskMembers, tasks } from '../db/schema';
import type { CreateAchievementDto, UpdateAchievementDto } from './dto/achievement.dto';
// eslint-disable-next-line prettier/prettier
import { isAllowedTaskAttachmentMimeType, resolveAttachmentMimeType } from '../tasks/utils/attachment-mime.util';

export const MAX_ACHIEVEMENT_IMAGE_SIZE = 10 * 1024 * 1024;
const UPLOAD_ROOT = join(process.cwd(), 'apps', 'api', 'uploads', 'achievements');
type Row = typeof achievements.$inferSelect;

@Injectable()
export class AchievementsService {
  constructor(private readonly database: DatabaseService) {}
  private get db() { return this.database.db; }
  private async own(userId: string, id: string) { const [row] = await this.db.select().from(achievements).where(and(eq(achievements.id, id), eq(achievements.userId, userId))); if (!row) throw new NotFoundException('Achievement not found.'); return row; }
  private async entity(row: Row) {
    const images = await this.db.select().from(achievementImages).where(eq(achievementImages.achievementId, row.id)).orderBy(asc(achievementImages.sortOrder), asc(achievementImages.createdAt));
    const task = row.relatedTaskId ? (await this.db.select().from(tasks).where(eq(tasks.id, row.relatedTaskId)))[0] : undefined;
    let stats: Record<string, number | string> | null = null;
    if (task) {
      const [done] = await this.db.select({ count: sql<number>`count(*)` }).from(subtasks).where(and(eq(subtasks.taskId, task.id), eq(subtasks.isDone, true)));
      const [focus] = await this.db.select({ sessions: sql<number>`count(*)`, minutes: sql<number>`coalesce(sum(${focusSessions.actualMinutes}), 0)` }).from(focusSessions).where(and(eq(focusSessions.taskId, task.id), eq(focusSessions.status, 'completed')));
      const [members] = await this.db.select({ count: sql<number>`count(*)` }).from(taskMembers).where(and(eq(taskMembers.taskId, task.id), eq(taskMembers.status, 'accepted')));
      stats = { completedTasks: Number(done?.count ?? 0) + (task.status === 'done' ? 1 : 0), focusSessions: Number(focus?.sessions ?? 0), focusedMinutes: Number(focus?.minutes ?? 0), collaborators: Number(members?.count ?? 0) };
    }
    return { id: row.id, title: row.title, description: row.description ?? '', reflection: row.reflection ?? '', achievementDate: row.achievementDate, category: row.category, relatedTaskId: row.relatedTaskId, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), images: images.map((i) => ({ id: i.id, fileName: i.fileName, url: `/achievements/${row.id}/images/${i.id}`, isCover: i.isCover, sortOrder: i.sortOrder })), stats };
  }
  async list(userId: string, filters: { search?: string; category?: string; year?: number }) { const clauses = [eq(achievements.userId, userId)]; if (filters.category && filters.category !== 'All') clauses.push(eq(achievements.category, filters.category)); if (filters.year) clauses.push(sql`extract(year from ${achievements.achievementDate}) = ${filters.year}`); if (filters.search?.trim()) clauses.push(ilike(achievements.title, `%${filters.search.trim()}%`)); const rows = await this.db.select().from(achievements).where(and(...clauses)).orderBy(desc(achievements.achievementDate)); return Promise.all(rows.map((r) => this.entity(r))); }
  async yearReview(userId: string, year: number) {
    if (!Number.isInteger(year) || year < 1) throw new BadRequestException('Invalid review year.');
    const [achievementRows, allDates] = await Promise.all([
      this.db.select().from(achievements).where(and(eq(achievements.userId, userId), sql`extract(year from ${achievements.achievementDate}) = ${year}`)).orderBy(asc(achievements.achievementDate)),
      this.db.select({ achievementDate: achievements.achievementDate }).from(achievements).where(eq(achievements.userId, userId)),
    ]);
    const achievementItems = await Promise.all(achievementRows.map((row) => this.entity(row)));
    const taskIds = achievementRows.flatMap((row) => row.relatedTaskId ? [row.relatedTaskId] : []);
    let completedLinkedTasks = 0; let focusSessionCount = 0; let focusedMinutes = 0;
    if (taskIds.length) {
      const linkedTasks = await this.db.select({ id: tasks.id, status: tasks.status }).from(tasks).where(and(eq(tasks.userId, userId), inArray(tasks.id, taskIds)));
      completedLinkedTasks = linkedTasks.filter((task) => task.status === 'done').length;
      const [focus] = await this.db.select({ sessions: sql<number>`count(*)`, minutes: sql<number>`coalesce(sum(${focusSessions.actualMinutes}), 0)` }).from(focusSessions).where(and(eq(focusSessions.userId, userId), inArray(focusSessions.taskId, taskIds), eq(focusSessions.status, 'completed')));
      focusSessionCount = Number(focus?.sessions ?? 0); focusedMinutes = Number(focus?.minutes ?? 0);
    }
    return { year, achievements: achievementItems, availableYears: [...new Set(allDates.map((row) => Number(String(row.achievementDate).slice(0, 4))))].sort((a, b) => a - b), stats: { achievements: achievementItems.length, memories: achievementItems.reduce((total, item) => total + item.images.length, 0), completedLinkedTasks, focusSessions: focusSessionCount, focusedMinutes } };
  }
  async get(userId: string, id: string) { return this.entity(await this.own(userId, id)); }
  async create(userId: string, dto: CreateAchievementDto) { if (dto.relatedTaskId) { const [task] = await this.db.select().from(tasks).where(and(eq(tasks.id, dto.relatedTaskId), eq(tasks.userId, userId))); if (!task) throw new NotFoundException('Related task not found.'); const [existing] = await this.db.select({ id: achievements.id }).from(achievements).where(and(eq(achievements.userId, userId), eq(achievements.relatedTaskId, dto.relatedTaskId))); if (existing) throw new BadRequestException('This task is already in the Achievement Museum.'); } const [row] = await this.db.insert(achievements).values({ userId, title: dto.title.trim(), achievementDate: dto.achievementDate, category: dto.category, description: dto.description?.trim() || null, reflection: dto.reflection?.trim() || null, relatedTaskId: dto.relatedTaskId ?? null }).returning(); return this.entity(row); }
  async update(userId: string, id: string, dto: UpdateAchievementDto) { await this.own(userId, id); const [row] = await this.db.update(achievements).set({ ...dto, description: dto.description?.trim(), reflection: dto.reflection?.trim(), title: dto.title?.trim(), updatedAt: new Date() }).where(and(eq(achievements.id, id), eq(achievements.userId, userId))).returning(); return this.entity(row); }
  async remove(userId: string, id: string) { await this.own(userId, id); const images = await this.db.select().from(achievementImages).where(eq(achievementImages.achievementId, id)); await this.db.delete(achievements).where(and(eq(achievements.id, id), eq(achievements.userId, userId))); await Promise.all(images.map((i) => unlink(join(UPLOAD_ROOT, i.storageKey)).catch(() => undefined))); }
  async uploadImage(userId: string, achievementId: string, file?: Express.Multer.File) { await this.own(userId, achievementId); if (!file) throw new BadRequestException('No image was uploaded.'); const mime = resolveAttachmentMimeType(file.mimetype, file.originalname); if (!mime.startsWith('image/') || !isAllowedTaskAttachmentMimeType(mime)) throw new BadRequestException('Only image files are allowed.'); const [last] = await this.db.select({ order: sql<number>`coalesce(max(${achievementImages.sortOrder}), -1)` }).from(achievementImages).where(eq(achievementImages.achievementId, achievementId)); const key = `${achievementId}/${randomUUID()}${extname(file.originalname)}`; await mkdir(join(UPLOAD_ROOT, achievementId), { recursive: true }); await writeFile(join(UPLOAD_ROOT, key), file.buffer); const [image] = await this.db.insert(achievementImages).values({ achievementId, userId, fileName: file.originalname, storageKey: key, mimeType: mime, sizeBytes: file.size, sortOrder: Number(last?.order ?? -1) + 1, isCover: Number(last?.order ?? -1) < 0 }).returning(); return { id: image.id, url: `/achievements/${achievementId}/images/${image.id}`, isCover: image.isCover, fileName: image.fileName }; }
  async setCover(userId: string, achievementId: string, imageId: string) { await this.own(userId, achievementId); const [image] = await this.db.select().from(achievementImages).where(and(eq(achievementImages.id, imageId), eq(achievementImages.achievementId, achievementId))); if (!image) throw new NotFoundException('Image not found.'); await this.db.update(achievementImages).set({ isCover: false }).where(eq(achievementImages.achievementId, achievementId)); await this.db.update(achievementImages).set({ isCover: true }).where(eq(achievementImages.id, imageId)); return this.get(userId, achievementId); }
  async removeImage(userId: string, achievementId: string, imageId: string) { await this.own(userId, achievementId); const [image] = await this.db.select().from(achievementImages).where(and(eq(achievementImages.id, imageId), eq(achievementImages.achievementId, achievementId))); if (!image) throw new NotFoundException('Image not found.'); await this.db.delete(achievementImages).where(eq(achievementImages.id, imageId)); if (image.isCover) { const [next] = await this.db.select().from(achievementImages).where(eq(achievementImages.achievementId, achievementId)).orderBy(asc(achievementImages.sortOrder)).limit(1); if (next) await this.db.update(achievementImages).set({ isCover: true }).where(eq(achievementImages.id, next.id)); } await unlink(join(UPLOAD_ROOT, image.storageKey)).catch(() => undefined); }
  async getImage(userId: string, achievementId: string, imageId: string) { await this.own(userId, achievementId); const [image] = await this.db.select().from(achievementImages).where(and(eq(achievementImages.id, imageId), eq(achievementImages.achievementId, achievementId))); if (!image) throw new NotFoundException('Image not found.'); return { stream: createReadStream(join(UPLOAD_ROOT, image.storageKey)), mimeType: image.mimeType }; }
}
