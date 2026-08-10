import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { copyFile, mkdir, unlink } from 'fs/promises';
import { basename, join } from 'path';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../db/database.service';
import { whiteboardAssets, whiteboards } from '../db/schema';
import { WhiteboardRepository } from './whiteboard.repository';
import { WhiteboardAssetsRepository } from './whiteboard-assets.repository';
import type { CreateWhiteboardDto, UpdateWhiteboardBoardDto, UpdateWhiteboardDto } from './dto';

@Injectable()
export class WhiteboardService {
  constructor(
    private readonly whiteboardRepository: WhiteboardRepository,
    private readonly whiteboardAssetsRepository?: WhiteboardAssetsRepository,
    private readonly databaseService?: DatabaseService,
  ) {}

  async getCurrentUserBoard(userId: string) {
    const board = await this.whiteboardRepository.findOrCreateForUser(userId);
    if (!board) {
      throw new InternalServerErrorException('Whiteboard could not be loaded.');
    }

    return this.toResponse(board);
  }

  async updateCurrentUserBoard(userId: string, dto: UpdateWhiteboardDto) {
    await this.getCurrentUserBoard(userId);
    const board = await this.whiteboardRepository.updateByUserId(userId, dto);
    if (!board) {
      throw new InternalServerErrorException('Whiteboard could not be saved.');
    }

    return this.toResponse(board);
  }

  async listBoards(userId: string, options: { archived?: boolean; search?: string; sort?: 'lastOpenedAt' | 'updatedAt' | 'name' | 'createdAt' } = {}) {
    const boards = await this.whiteboardRepository.findAllAccessibleByUserId(userId, options);
    return boards.map(({ board, accessRole }) => this.toSummary(board, accessRole));
  }

  async getBoard(_userId: string, id: string, accessRole = 'owner') {
    const board = await this.whiteboardRepository.findById(id);
    if (!board) throw new NotFoundException('Board not found');
    return this.toResponse(board, accessRole);
  }

  async createBoard(userId: string, dto: CreateWhiteboardDto) {
    const board = await this.whiteboardRepository.createBoard(userId, dto.name);
    if (!board) throw new InternalServerErrorException('Board could not be created.');
    return this.toResponse(board);
  }

  async duplicateBoard(userId: string, id: string) {
    if (!this.whiteboardAssetsRepository || !this.databaseService) throw new InternalServerErrorException('Board duplication is unavailable.');
    const source = await this.whiteboardRepository.findByIdForUser(id, userId);
    if (!source) throw new NotFoundException('Board not found');
    const references = (source.assetReferences ?? {}) as Record<string, { beeplanAssetId?: string; stableResolverUrl?: string }>;
    const sourceAssetIds = [...new Set(Object.values(references).map((reference) => reference.beeplanAssetId).filter((value): value is string => Boolean(value)))];
    const sourceAssets = await this.whiteboardAssetsRepository.listForBoard(userId, source.id);
    const assetsById = new Map(sourceAssets.map((asset) => [asset.id, asset]));
    const copiedPaths: string[] = [];
    const boardId = randomUUID();
    const remapped: Record<string, { beeplanAssetId: string; stableResolverUrl: string }> = {};
    const copiedAssets: (typeof whiteboardAssets.$inferInsert)[] = [];

    try {
      for (const [tldrawAssetId, reference] of Object.entries(references)) {
        if (!reference.beeplanAssetId) throw new BadRequestException('Whiteboard asset reference is missing an asset ID.');
        const sourceAsset = assetsById.get(reference.beeplanAssetId);
        if (!sourceAsset || !sourceAsset.storagePath.startsWith(`${userId}${process.platform === 'win32' ? '\\' : '/'}`)) throw new NotFoundException('Whiteboard asset not found.');
        const newAssetId = randomUUID();
        const fileName = basename(sourceAsset.fileName);
        const storagePath = join(userId, boardId, newAssetId, fileName);
        await this.copyStoredFile(sourceAsset.storagePath, storagePath);
        copiedPaths.push(storagePath);
        copiedAssets.push({ id: newAssetId, whiteboardId: boardId, userId, type: sourceAsset.type, fileName: sourceAsset.fileName, storagePath, mimeType: sourceAsset.mimeType, size: sourceAsset.size, width: sourceAsset.width, height: sourceAsset.height });
        remapped[tldrawAssetId] = { beeplanAssetId: newAssetId, stableResolverUrl: this.replaceAssetId(reference.stableResolverUrl, reference.beeplanAssetId, newAssetId) };
      }

      const board = await this.databaseService.db.transaction(async (tx) => {
        const [created] = await tx.insert(whiteboards).values({ id: boardId, userId, name: `Copy of ${source.name}`.slice(0, 255), snapshot: source.snapshot, assetReferences: remapped, cameraX: source.cameraX, cameraY: source.cameraY, cameraZoom: source.cameraZoom, isPinned: false, isArchived: false, lastOpenedAt: new Date() }).returning();
        if (copiedAssets.length) await tx.insert(whiteboardAssets).values(copiedAssets);
        return created;
      });
      if (!board) throw new InternalServerErrorException('Board could not be duplicated.');
      return this.toResponse(board);
    } catch (error) {
      await Promise.all(copiedPaths.map((path) => this.removeStoredFile(path)));
      throw error;
    }
  }

  private async copyStoredFile(sourcePath: string, targetPath: string) {
    const root = join(process.cwd(), 'apps', 'api', 'uploads', 'whiteboards');
    const source = join(root, sourcePath); const target = join(root, targetPath);
    if (!source.startsWith(`${root}${process.platform === 'win32' ? '\\' : '/'}`) || !target.startsWith(`${root}${process.platform === 'win32' ? '\\' : '/'}`)) throw new BadRequestException('Invalid whiteboard storage path.');
    await mkdir(join(target, '..'), { recursive: true });
    await copyFile(source, target);
  }

  private async removeStoredFile(storagePath: string) {
    try { const root = join(process.cwd(), 'apps', 'api', 'uploads', 'whiteboards'); await unlink(join(root, storagePath)); } catch { /* rollback cleanup is best effort */ }
  }

  private replaceAssetId(url: string | undefined, sourceId: string, targetId: string) {
    return typeof url === 'string' && url.includes(sourceId) ? url.replaceAll(sourceId, targetId) : `/whiteboard/assets/${targetId}/file`;
  }

  async updateBoard(_userId: string, id: string, dto: UpdateWhiteboardBoardDto, _accessRole = 'owner') {
    const current = await this.whiteboardRepository.findById(id);
    if (!current) throw new NotFoundException('Board not found');
    const board = await this.whiteboardRepository.updateById(id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.snapshot !== undefined ? { snapshot: dto.snapshot } : {}),
      ...(dto.assetReferences !== undefined ? { assetReferences: dto.assetReferences } : {}),
      ...(dto.camera ? { cameraX: dto.camera.x, cameraY: dto.camera.y, cameraZoom: dto.camera.zoom } : {}),
      ...(dto.isPinned !== undefined ? { isPinned: dto.isPinned } : {}),
    });
    if (!board) throw new InternalServerErrorException('Board could not be saved.');
    return this.toResponse(board);
  }

  async openBoard(_userId: string, id: string, _accessRole = 'owner') {
    const board = await this.whiteboardRepository.updateById(id, { lastOpenedAt: new Date() });
    if (!board) throw new NotFoundException('Board not found');
    return this.toResponse(board);
  }

  async setArchived(userId: string, id: string, archived: boolean) {
    const board = await this.whiteboardRepository.updateByIdForUser(id, userId, { isArchived: archived });
    if (!board) throw new NotFoundException('Board not found');
    return this.toSummary(board);
  }

  async setPinned(userId: string, id: string, pinned: boolean) {
    const board = await this.whiteboardRepository.updateByIdForUser(id, userId, { isPinned: pinned });
    if (!board) throw new NotFoundException('Board not found');
    return this.toSummary(board);
  }

  async deleteBoard(userId: string, id: string) {
    const deleted = await this.whiteboardRepository.deleteByIdForUser(id, userId);
    if (!deleted) throw new NotFoundException('Board not found');
  }

  private toSummary(board: Awaited<ReturnType<WhiteboardRepository['findByIdForUser']>>, accessRole = 'owner') {
    if (!board) throw new InternalServerErrorException('Board could not be loaded.');
    return { id: board.id, name: board.name, previewUrl: board.previewUrl ?? null, isPinned: accessRole === 'owner' && board.isPinned, isArchived: board.isArchived, lastOpenedAt: board.lastOpenedAt?.toISOString() ?? null, createdAt: board.createdAt.toISOString(), updatedAt: board.updatedAt.toISOString(), accessRole, isShared: accessRole !== 'owner', memberCount: undefined };
  }

  private toResponse(board: Awaited<ReturnType<WhiteboardRepository['findByUserId']>>, accessRole = 'owner') {
    if (!board) {
      throw new InternalServerErrorException('Whiteboard could not be loaded.');
    }

    return {
      id: board.id,
      name: board.name,
      snapshot: board.snapshot ?? null,
      assetReferences: board.assetReferences ?? {},
      camera: {
        x: board.cameraX,
        y: board.cameraY,
        zoom: board.cameraZoom,
      },
      createdAt: board.createdAt.toISOString(),
      updatedAt: board.updatedAt.toISOString(),
      previewUrl: board.previewUrl ?? null,
      isPinned: board.isPinned,
      isArchived: board.isArchived,
      lastOpenedAt: board.lastOpenedAt?.toISOString() ?? null,
      accessRole,
      isShared: accessRole !== 'owner',
    };
  }
}
