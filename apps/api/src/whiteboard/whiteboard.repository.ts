import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { whiteboardMembers, whiteboards } from '../db/schema';
import type { WhiteboardCameraDto, UpdateWhiteboardDto } from './dto';

type WhiteboardRow = typeof whiteboards.$inferSelect;

@Injectable()
export class WhiteboardRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  async findByUserId(userId: string): Promise<WhiteboardRow | undefined> {
    const [board] = await this.db
      .select()
      .from(whiteboards)
      .where(eq(whiteboards.userId, userId))
      .limit(1);

    return board;
  }

  async findById(id: string): Promise<WhiteboardRow | undefined> {
    const [board] = await this.db.select().from(whiteboards).where(eq(whiteboards.id, id)).limit(1)
    return board
  }

  async findOwnedById(id: string, userId: string): Promise<WhiteboardRow | undefined> {
    return this.findByIdForUser(id, userId)
  }

  async findAllByUserId(userId: string, options: { archived?: boolean; search?: string; sort?: 'lastOpenedAt' | 'updatedAt' | 'name' | 'createdAt' } = {}) {
    const conditions = [eq(whiteboards.userId, userId)];
    if (options.archived !== undefined) conditions.push(eq(whiteboards.isArchived, options.archived));
    const rows = await this.db.select().from(whiteboards).where(and(...conditions)).orderBy(desc(options.sort === 'name' ? whiteboards.name : options.sort === 'createdAt' ? whiteboards.createdAt : options.sort === 'updatedAt' ? whiteboards.updatedAt : whiteboards.lastOpenedAt));
    const search = options.search?.trim().toLocaleLowerCase();
    return search ? rows.filter((row) => row.name.toLocaleLowerCase().includes(search)) : rows;
  }

  async findAllAccessibleByUserId(userId: string, options: { archived?: boolean; search?: string } = {}) {
    const conditions = [eq(whiteboardMembers.userId, userId), isNotNull(whiteboardMembers.acceptedAt)];
    if (options.archived !== undefined) conditions.push(eq(whiteboards.isArchived, options.archived));
    const rows = await this.db.select({ board: whiteboards, accessRole: whiteboardMembers.role }).from(whiteboardMembers).innerJoin(whiteboards, eq(whiteboards.id, whiteboardMembers.boardId)).where(and(...conditions)).orderBy(desc(whiteboards.lastOpenedAt));
    const search = options.search?.trim().toLocaleLowerCase();
    return search ? rows.filter((row) => row.board.name.toLocaleLowerCase().includes(search)) : rows;
  }

  async listAccessibleByUser(userId: string, options: { archived?: boolean; search?: string } = {}) {
    return this.findAllAccessibleByUserId(userId, options)
  }

  async findByIdForUser(id: string, userId: string) {
    const [board] = await this.db.select().from(whiteboards).where(and(eq(whiteboards.id, id), eq(whiteboards.userId, userId))).limit(1);
    return board;
  }

  async createBoard(userId: string, name = 'Untitled board') {
    const [board] = await this.db.insert(whiteboards).values({ userId, name: name.trim() || 'Untitled board', lastOpenedAt: new Date() }).returning();
    return board;
  }

  async duplicateForUser(source: WhiteboardRow, userId: string) {
    const [board] = await this.db.insert(whiteboards).values({
      userId,
      name: `Copy of ${source.name}`.slice(0, 255),
      snapshot: source.snapshot,
      assetReferences: source.assetReferences,
      cameraX: source.cameraX,
      cameraY: source.cameraY,
      cameraZoom: source.cameraZoom,
      isPinned: false,
      isArchived: false,
      lastOpenedAt: new Date(),
    }).returning();
    return board;
  }

  async updateByIdForUser(id: string, userId: string, changes: Record<string, unknown>) {
    const [board] = await this.db.update(whiteboards).set({ ...changes, updatedAt: new Date() }).where(and(eq(whiteboards.id, id), eq(whiteboards.userId, userId))).returning();
    return board;
  }

  async updateById(id: string, changes: Record<string, unknown>) {
    const [board] = await this.db.update(whiteboards).set({ ...changes, updatedAt: new Date() }).where(eq(whiteboards.id, id)).returning();
    return board;
  }

  async deleteByIdForUser(id: string, userId: string) {
    const [board] = await this.db.delete(whiteboards).where(and(eq(whiteboards.id, id), eq(whiteboards.userId, userId))).returning({ id: whiteboards.id });
    return board;
  }

  async createForUser(userId: string): Promise<WhiteboardRow | undefined> {
    await this.db
      .insert(whiteboards)
      .values({ userId })
      .onConflictDoNothing({ target: whiteboards.userId });

    return this.findByUserId(userId);
  }

  async findOrCreateForUser(userId: string): Promise<WhiteboardRow | undefined> {
    return (await this.findByUserId(userId)) ?? this.createForUser(userId);
  }

  async updateByUserId(
    userId: string,
    changes: Pick<UpdateWhiteboardDto, 'name' | 'snapshot'> & {
      camera?: WhiteboardCameraDto;
      assetReferences?: UpdateWhiteboardDto['assetReferences'];
    },
  ): Promise<WhiteboardRow | undefined> {
    const [board] = await this.db
      .update(whiteboards)
      .set({
        ...(changes.name !== undefined ? { name: changes.name.trim() } : {}),
        ...(changes.snapshot !== undefined
          ? { snapshot: changes.snapshot }
          : {}),
        ...(changes.assetReferences !== undefined
          ? { assetReferences: changes.assetReferences }
          : {}),
        ...(changes.camera
          ? {
              cameraX: changes.camera.x,
              cameraY: changes.camera.y,
              cameraZoom: changes.camera.zoom,
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(whiteboards.userId, userId))
      .returning();

    return board;
  }
}
