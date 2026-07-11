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
import {
  TaskAccessService,
  type TaskRole,
} from '../collaboration/task-access.service';
import { DatabaseService } from '../db/database.service';
import { subtaskAttachments, subtasks } from '../db/schema';
import { MAX_ATTACHMENT_SIZE_BYTES } from './task-attachments.service';
import {
  isAllowedTaskAttachmentMimeType,
  resolveAttachmentMimeType,
} from './utils/attachment-mime.util';

type AttachmentRow = typeof subtaskAttachments.$inferSelect;

/**
 * Per-subtask file attachments. Mirrors {@link TaskAttachmentsService} exactly
 * — same dev-local disk backend, same authenticated preview/download routes,
 * same production caveats (see that file's header comment). Files live under a
 * `subtasks/` sibling directory so the two never collide.
 */
const UPLOAD_ROOT = join(process.cwd(), 'apps', 'api', 'uploads', 'subtasks');

@Injectable()
export class SubtaskAttachmentsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly access: TaskAccessService,
  ) {}

  private get db() {
    return this.databaseService.db;
  }

  private async getSubtaskForUser(
    userId: string,
    taskId: string,
    subtaskId: string,
    minRole: TaskRole = 'viewer',
  ) {
    // Task-level authorization (owner or accepted member of the required role).
    await this.access.require(userId, taskId, minRole);

    const [row] = await this.db
      .select({ id: subtasks.id })
      .from(subtasks)
      .where(
        and(eq(subtasks.id, subtaskId), eq(subtasks.taskId, taskId)),
      );

    if (!row) {
      throw new NotFoundException('Subtask not found.');
    }

    return row;
  }

  private toEntity(row: AttachmentRow) {
    const base = `/tasks/${row.taskId}/subtasks/${row.subtaskId}/attachments/${row.id}`;
    const previewUrl = `${base}/preview`;
    const downloadUrl = `${base}/download`;
    return {
      id: row.id,
      subtaskId: row.subtaskId,
      taskId: row.taskId,
      fileName: row.fileName,
      fileUrl: previewUrl,
      previewUrl,
      downloadUrl,
      storagePath: row.storageKey,
      fileType: row.mimeType,
      fileSize: row.sizeBytes,
      uploadedAt: row.createdAt.toISOString(),
      name: row.fileName,
      size: String(row.sizeBytes),
      type: row.mimeType,
      url: previewUrl,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async list(userId: string, taskId: string, subtaskId: string) {
    await this.getSubtaskForUser(userId, taskId, subtaskId);
    const rows = await this.db
      .select()
      .from(subtaskAttachments)
      .where(eq(subtaskAttachments.subtaskId, subtaskId));

    return rows.map((row) => this.toEntity(row));
  }

  async upload(
    userId: string,
    taskId: string,
    subtaskId: string,
    file: Express.Multer.File | undefined,
  ) {
    await this.getSubtaskForUser(userId, taskId, subtaskId, 'editor');

    if (!file) {
      throw new BadRequestException('No file was uploaded.');
    }

    const mimeType = resolveAttachmentMimeType(file.mimetype, file.originalname);

    if (!isAllowedTaskAttachmentMimeType(mimeType)) {
      throw new BadRequestException(
        `Unsupported file type "${file.mimetype}". Allowed: images, PDF, text, media, and common office documents.`,
      );
    }

    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      throw new BadRequestException('File is too large. Maximum size is 10MB.');
    }

    const storageKey = `${subtaskId}/${randomUUID()}${extname(file.originalname)}`;
    await this.saveFile(storageKey, file.buffer);

    const [row] = await this.db
      .insert(subtaskAttachments)
      .values({
        subtaskId,
        taskId,
        userId,
        fileName: file.originalname,
        storageKey,
        mimeType,
        sizeBytes: file.size,
      })
      .returning();

    return this.toEntity(row);
  }

  async remove(
    userId: string,
    taskId: string,
    subtaskId: string,
    attachmentId: string,
  ) {
    await this.getSubtaskForUser(userId, taskId, subtaskId, 'editor');

    const [row] = await this.db
      .select()
      .from(subtaskAttachments)
      .where(
        and(
          eq(subtaskAttachments.id, attachmentId),
          eq(subtaskAttachments.subtaskId, subtaskId),
        ),
      );

    if (!row) {
      throw new NotFoundException('Attachment not found.');
    }

    await this.db
      .delete(subtaskAttachments)
      .where(eq(subtaskAttachments.id, attachmentId));
    await this.deleteFile(row.storageKey);
  }

  async getFile(
    userId: string,
    taskId: string,
    subtaskId: string,
    attachmentId: string,
  ) {
    await this.getSubtaskForUser(userId, taskId, subtaskId);

    const [row] = await this.db
      .select()
      .from(subtaskAttachments)
      .where(
        and(
          eq(subtaskAttachments.id, attachmentId),
          eq(subtaskAttachments.subtaskId, subtaskId),
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
