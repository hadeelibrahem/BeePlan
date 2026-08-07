import { BadRequestException, Injectable, NotFoundException, Optional, PayloadTooLargeException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { basename, extname, join } from 'path';
import { WhiteboardAssetsRepository, type WhiteboardAssetRow } from './whiteboard-assets.repository';
import { WhiteboardRepository } from './whiteboard.repository';
import { WhiteboardAccessService } from './whiteboard-access.service';

const UPLOAD_ROOT = join(process.cwd(), 'apps', 'api', 'uploads', 'whiteboards');
const IMAGE_LIMIT = 10 * 1024 * 1024;
const DOCUMENT_LIMIT = 20 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain',
};

const MIME_BY_TYPE = new Set(Object.values(MIME_BY_EXTENSION));

@Injectable()
export class WhiteboardAssetsService {
  constructor(
    private readonly assetsRepository: WhiteboardAssetsRepository,
    private readonly whiteboardRepository: WhiteboardRepository,
    @Optional() private readonly whiteboardAccess?: WhiteboardAccessService,
  ) {}

  async upload(userId: string, file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('No file was uploaded.');

    const extension = extname(file.originalname).toLowerCase();
    const extensionMime = MIME_BY_EXTENSION[extension];
    const suppliedMime = file.mimetype === 'application/octet-stream' ? extensionMime : file.mimetype;
    if (!extensionMime || !suppliedMime || !MIME_BY_TYPE.has(suppliedMime) || suppliedMime !== extensionMime) {
      throw new BadRequestException('Unsupported file type. Allowed: PNG, JPEG, WEBP, GIF, PDF, DOCX, PPTX, XLSX, and TXT.');
    }

    const isImage = suppliedMime.startsWith('image/');
    const limit = isImage ? IMAGE_LIMIT : DOCUMENT_LIMIT;
    if (file.size > limit) {
      throw new PayloadTooLargeException(`File is too large. Maximum size is ${isImage ? '10MB' : '20MB'}.`);
    }

    const board = await this.whiteboardRepository.findOrCreateForUser(userId);
    if (!board) throw new NotFoundException('Whiteboard not found.');

    const assetId = randomUUID();
    const fileName = this.safeDisplayName(file.originalname, extension);
    const storagePath = join(userId, board.id, assetId, fileName);
    await this.writeStorageFile(storagePath, file.buffer);

    try {
      const dimensions = isImage ? readImageDimensions(file.buffer, suppliedMime) : null;
      const row = await this.assetsRepository.create({
        id: assetId,
        whiteboardId: board.id,
        userId,
        type: isImage ? 'image' : 'file',
        fileName,
        storagePath,
        mimeType: suppliedMime,
        size: file.size,
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
      });
      return this.toResponse(row);
    } catch (error) {
      await this.deleteStorageFile(storagePath);
      throw error;
    }
  }

  async get(userId: string, assetId: string) {
    const asset = await this.findViewable(userId, assetId);
    return this.toResponse(asset);
  }

  async getFile(userId: string, assetId: string) {
    const asset = await this.findViewable(userId, assetId);
    return { stream: createReadStream(this.resolveStoragePath(asset.storagePath)), fileName: asset.fileName, mimeType: asset.mimeType };
  }

  async remove(userId: string, assetId: string) {
    const asset = await this.findOwned(userId, assetId);
    await this.assetsRepository.deleteById(asset.id);
    await this.deleteStorageFile(asset.storagePath);
  }

  private async findOwned(userId: string, assetId: string) {
    const repository = this.assetsRepository as WhiteboardAssetsRepository & { findByIdForUser?: (ownerId: string, id: string) => Promise<WhiteboardAssetRow | undefined> };
    const asset = repository.findByIdForUser
      ? await repository.findByIdForUser(userId, assetId)
      : await this.findOwnedOnLegacyBoard(userId, assetId);
    if (!asset) throw new NotFoundException('Asset not found.');
    return asset;
  }

  private async findViewable(userId: string, assetId: string) {
    const repository = this.assetsRepository as WhiteboardAssetsRepository & { findById?: (id: string) => Promise<WhiteboardAssetRow | undefined> };
    if (!repository.findById) return this.findOwned(userId, assetId);
    const asset = await repository.findById(assetId);
    if (!asset) throw new NotFoundException('Asset not found.');
    if (this.whiteboardAccess) {
      await this.whiteboardAccess.require(userId, asset.whiteboardId, 'view');
      return asset;
    }
    return this.findOwned(userId, assetId);
  }

  private async findOwnedOnLegacyBoard(userId: string, assetId: string) {
    const board = await this.whiteboardRepository.findByUserId(userId);
    if (!board) return undefined;
    return this.assetsRepository.findByIdForBoard(userId, board.id, assetId);
  }

  private toResponse(asset: WhiteboardAssetRow) {
    return {
      id: asset.id,
      type: asset.type,
      fileName: asset.fileName,
      url: `/whiteboard/assets/${asset.id}/file`,
      mimeType: asset.mimeType,
      size: asset.size,
      width: asset.width,
      height: asset.height,
      createdAt: asset.createdAt.toISOString(),
    };
  }

  private safeDisplayName(originalName: string, extension: string) {
    const name = basename(originalName).replace(/[^a-zA-Z0-9._ -]/g, '_').replace(/\s+/g, ' ').trim();
    return (name || `whiteboard-asset${extension}`).slice(0, 255);
  }

  private resolveStoragePath(storagePath: string) {
    const root = join(UPLOAD_ROOT, storagePath);
    if (!root.startsWith(`${UPLOAD_ROOT}${process.platform === 'win32' ? '\\' : '/'}`)) throw new BadRequestException('Invalid storage path.');
    return root;
  }

  private async writeStorageFile(storagePath: string, buffer: Buffer) {
    const fullPath = this.resolveStoragePath(storagePath);
    await mkdir(join(fullPath, '..'), { recursive: true });
    await writeFile(fullPath, buffer);
  }

  private async deleteStorageFile(storagePath: string) {
    try { await unlink(this.resolveStoragePath(storagePath)); } catch { /* already removed */ }
  }
}

function readImageDimensions(buffer: Buffer, mimeType: string) {
  if (mimeType === 'image/png' && buffer.length >= 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (mimeType === 'image/gif' && buffer.length >= 10) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  if (mimeType === 'image/webp' && buffer.length >= 30 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const format = buffer.toString('ascii', 12, 16);
    if (format === 'VP8X') return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
  }
  if (mimeType === 'image/jpeg' && buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset++; continue; }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xc3 || marker >= 0xc5 && marker <= 0xc7 || marker >= 0xc9 && marker <= 0xcb || marker >= 0xcd && marker <= 0xcf) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      offset += 2 + length;
    }
  }
  return null;
}
