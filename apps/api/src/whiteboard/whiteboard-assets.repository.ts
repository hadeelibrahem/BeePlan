import { Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { whiteboardAssets } from '../db/schema';

export type WhiteboardAssetRow = typeof whiteboardAssets.$inferSelect;

@Injectable()
export class WhiteboardAssetsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  async create(values: typeof whiteboardAssets.$inferInsert) {
    const [asset] = await this.db.insert(whiteboardAssets).values(values).returning();
    return asset;
  }

  async listForBoard(userId: string, whiteboardId: string) {
    return this.db
      .select()
      .from(whiteboardAssets)
      .where(and(eq(whiteboardAssets.userId, userId), eq(whiteboardAssets.whiteboardId, whiteboardId)))
      .orderBy(desc(whiteboardAssets.createdAt));
  }

  async findByIdForBoard(userId: string, whiteboardId: string, assetId: string) {
    const [asset] = await this.db
      .select()
      .from(whiteboardAssets)
      .where(and(
        eq(whiteboardAssets.id, assetId),
        eq(whiteboardAssets.userId, userId),
        eq(whiteboardAssets.whiteboardId, whiteboardId),
      ))
      .limit(1);
    return asset;
  }

  async findByIdForUser(userId: string, assetId: string) {
    const [asset] = await this.db.select().from(whiteboardAssets).where(and(eq(whiteboardAssets.id, assetId), eq(whiteboardAssets.userId, userId))).limit(1);
    return asset;
  }

  async findById(assetId: string) {
    const [asset] = await this.db.select().from(whiteboardAssets).where(eq(whiteboardAssets.id, assetId)).limit(1)
    return asset;
  }

  async deleteById(assetId: string) {
    const [asset] = await this.db.delete(whiteboardAssets).where(eq(whiteboardAssets.id, assetId)).returning();
    return asset;
  }
}
