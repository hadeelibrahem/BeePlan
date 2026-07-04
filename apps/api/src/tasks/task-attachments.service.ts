import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { createReadStream } from 'fs';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import { DatabaseService } from '../db/database.service';
import { taskAttachments, tasks } from '../db/schema';

type AttachmentRow = typeof taskAttachments.$inferSelect;

/**
 * Stores uploaded task attachments on local disk under apps/api/uploads/.
 *
 * This is intentionally a DEV-LOCAL storage backend, isolated to its own
 * directory (gitignored, see repo .gitignore) and never exposed as a public
 * static path — files are only ever served back out through
 * `download()`/the authenticated `/tasks/:id/attachments/:attachmentId/download`
 * route, so ownership is checked on every read, not just on upload.
 *
 * To swap in real cloud storage later (Supabase Storage, S3, etc.), this is
 * the only file that needs to change: replace `saveFile`/`deleteFile`/
 * `readFile` with calls to the storage provider's SDK, and store whatever
 * key/URL it returns in `storageKey` instead of a local relative path. The
 * project already has SUPABASE_URL/SUPABASE_ANON_KEY plumbed into the web
 * and mobile apps' env files but no service-role key or bucket configured
 * yet, so Supabase Storage wasn't wired up automatically here.
 */
const UPLOAD_ROOT = join(process.cwd(), 'apps', 'api', 'uploads', 'tasks');

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
]);

export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

@Injectable()
export class TaskAttachmentsService {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  static isAllowedMimeType(mimeType: string): boolean {
    return ALLOWED_MIME_TYPES.has(mimeType);
  }

  private async getTaskForUser(userId: string, taskId: string) {
    const [task] = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));

    if (!task) {
      throw new NotFoundException('Task not found.');
    }

    return task;
  }

  private toEntity(row: AttachmentRow) {
    return {
      id: row.id,
      taskId: row.taskId,
      name: row.fileName,
      size: String(row.sizeBytes),
      type: row.mimeType,
      url: `/tasks/${row.taskId}/attachments/${row.id}/download`,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async list(userId: string, taskId: string) {
    await this.getTaskForUser(userId, taskId);
    const rows = await this.db
      .select()
      .from(taskAttachments)
      .where(eq(taskAttachments.taskId, taskId));

    return rows.map((row) => this.toEntity(row));
  }

  async upload(
    userId: string,
    taskId: string,
    file: Express.Multer.File | undefined,
  ) {
    await this.getTaskForUser(userId, taskId);

    if (!file) {
      throw new BadRequestException('No file was uploaded.');
    }

    if (!TaskAttachmentsService.isAllowedMimeType(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type "${file.mimetype}". Allowed: images, PDF, and common office documents.`,
      );
    }

    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      throw new BadRequestException('File is too large. Maximum size is 10MB.');
    }

    const storageKey = `${taskId}/${randomUUID()}${extname(file.originalname)}`;
    await this.saveFile(storageKey, file.buffer);

    const [row] = await this.db
      .insert(taskAttachments)
      .values({
        taskId,
        userId,
        fileName: file.originalname,
        storageKey,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      })
      .returning();

    return this.toEntity(row);
  }

  async remove(userId: string, taskId: string, attachmentId: string) {
    await this.getTaskForUser(userId, taskId);

    const [row] = await this.db
      .select()
      .from(taskAttachments)
      .where(
        and(
          eq(taskAttachments.id, attachmentId),
          eq(taskAttachments.taskId, taskId),
        ),
      );

    if (!row) {
      throw new NotFoundException('Attachment not found.');
    }

    await this.db
      .delete(taskAttachments)
      .where(eq(taskAttachments.id, attachmentId));
    await this.deleteFile(row.storageKey);
  }

  async getFileForDownload(
    userId: string,
    taskId: string,
    attachmentId: string,
  ) {
    await this.getTaskForUser(userId, taskId);

    const [row] = await this.db
      .select()
      .from(taskAttachments)
      .where(
        and(
          eq(taskAttachments.id, attachmentId),
          eq(taskAttachments.taskId, taskId),
        ),
      );

    if (!row) {
      throw new NotFoundException('Attachment not found.');
    }

    return {
      stream: createReadStream(join(UPLOAD_ROOT, row.storageKey)),
      fileName: row.fileName,
      mimeType: row.mimeType,
    };
  }

  private async saveFile(storageKey: string, buffer: Buffer) {
    const fullPath = join(UPLOAD_ROOT, storageKey);
    await mkdir(join(fullPath, '..'), { recursive: true });
    await writeFile(fullPath, buffer);
  }

  private async deleteFile(storageKey: string) {
    try {
      await unlink(join(UPLOAD_ROOT, storageKey));
    } catch {
      // File already gone / never written — deleting the DB row is what matters.
    }
  }
}
