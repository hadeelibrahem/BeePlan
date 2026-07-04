import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { standaloneNotes } from '../db/schema';
import type { CreateNoteDto, UpdateNoteDto } from './dto/note.dto';

type NoteRow = typeof standaloneNotes.$inferSelect;

@Injectable()
export class NotesService {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  private toEntity(row: NoteRow) {
    return {
      id: row.id,
      title: row.title,
      content: row.content ?? '',
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async findAll(userId: string) {
    const rows = await this.db
      .select()
      .from(standaloneNotes)
      .where(eq(standaloneNotes.userId, userId))
      .orderBy(desc(standaloneNotes.updatedAt));

    return rows.map((row) => this.toEntity(row));
  }

  async findOne(userId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(standaloneNotes)
      .where(
        and(eq(standaloneNotes.id, id), eq(standaloneNotes.userId, userId)),
      );

    if (!row) {
      throw new NotFoundException('Note not found.');
    }

    return this.toEntity(row);
  }

  async create(userId: string, dto: CreateNoteDto) {
    const [row] = await this.db
      .insert(standaloneNotes)
      .values({
        userId,
        title: dto.title.trim(),
        content: dto.content?.trim() || null,
      })
      .returning();

    return this.toEntity(row);
  }

  async update(userId: string, id: string, dto: UpdateNoteDto) {
    await this.findOne(userId, id);

    const [row] = await this.db
      .update(standaloneNotes)
      .set({
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.content !== undefined
          ? { content: dto.content.trim() || null }
          : {}),
        updatedAt: new Date(),
      })
      .where(
        and(eq(standaloneNotes.id, id), eq(standaloneNotes.userId, userId)),
      )
      .returning();

    return this.toEntity(row);
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.db
      .delete(standaloneNotes)
      .where(
        and(eq(standaloneNotes.id, id), eq(standaloneNotes.userId, userId)),
      );
  }
}
