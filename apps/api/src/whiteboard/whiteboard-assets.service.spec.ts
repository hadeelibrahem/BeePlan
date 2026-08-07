import { BadRequestException, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { WhiteboardAssetsService } from './whiteboard-assets.service';

const board = { id: 'board-1' } as never;
const baseFile = (overrides: Partial<Express.Multer.File> = {}) => ({
  fieldname: 'file', originalname: 'diagram.png', encoding: '7bit', mimetype: 'image/png',
  size: 24, destination: '', filename: '', path: '', buffer: Buffer.from('89504e470d0a1a0a0000000d494844520000000a00000014', 'hex'), stream: null as never,
  ...overrides,
}) as Express.Multer.File;

function setup() {
  const assetsRepository = {
    create: jest.fn(async (values) => ({ ...values, createdAt: new Date(), updatedAt: null })),
    findByIdForBoard: jest.fn(),
    deleteById: jest.fn(),
  };
  const whiteboardRepository = {
    findOrCreateForUser: jest.fn(async () => board),
    findByUserId: jest.fn(async () => board),
  };
  return { service: new WhiteboardAssetsService(assetsRepository as never, whiteboardRepository as never), assetsRepository, whiteboardRepository };
}

describe('WhiteboardAssetsService', () => {
  it('uploads an authenticated image and returns metadata with dimensions', async () => {
    const { service, assetsRepository } = setup();
    const result = await service.upload('user-1', baseFile());
    expect(result.type).toBe('image');
    expect(result.mimeType).toBe('image/png');
    expect(result.width).toBe(10);
    expect(result.height).toBe(20);
    expect(assetsRepository.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', whiteboardId: 'board-1', type: 'image' }));
    assetsRepository.findByIdForBoard.mockResolvedValue({ id: result.id, storagePath: assetsRepository.create.mock.calls[0][0].storagePath });
    await service.remove('user-1', result.id);
  });

  it('accepts supported documents and rejects unsupported extensions', async () => {
    const { service, assetsRepository } = setup();
    const result = await service.upload('user-1', baseFile({ originalname: 'brief.pdf', mimetype: 'application/pdf' }));
    expect(result.type).toBe('file');
    assetsRepository.findByIdForBoard.mockResolvedValue({ id: result.id, storagePath: assetsRepository.create.mock.calls[0][0].storagePath });
    await service.remove('user-1', result.id);
    await expect(service.upload('user-1', baseFile({ originalname: 'run.exe', mimetype: 'application/octet-stream' }))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enforces image and document size limits', async () => {
    const { service } = setup();
    await expect(service.upload('user-1', baseFile({ size: 10 * 1024 * 1024 + 1 }))).rejects.toBeInstanceOf(PayloadTooLargeException);
    await expect(service.upload('user-1', baseFile({ originalname: 'brief.pdf', mimetype: 'application/pdf', size: 20 * 1024 * 1024 + 1 }))).rejects.toBeInstanceOf(PayloadTooLargeException);
  });

  it('does not expose assets owned by another user', async () => {
    const { service, assetsRepository, whiteboardRepository } = setup();
    assetsRepository.findByIdForBoard.mockResolvedValue(undefined);
    await expect(service.get('user-2', 'asset-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(whiteboardRepository.findByUserId).toHaveBeenCalledWith('user-2');
  });

  it('allows an accepted board viewer to read asset metadata', async () => {
    const assetsRepository = { findById: jest.fn().mockResolvedValue({ id: 'asset-1', whiteboardId: 'board-1', fileName: 'image.png', type: 'image', mimeType: 'image/png', size: 10, width: 1, height: 1, createdAt: new Date(), storagePath: 'safe/path' }) };
    const access = { require: jest.fn().mockResolvedValue({ role: 'viewer' }) };
    const service = new WhiteboardAssetsService(assetsRepository as never, {} as never, access as never);
    await expect(service.get('viewer-1', 'asset-1')).resolves.toMatchObject({ id: 'asset-1', url: '/whiteboard/assets/asset-1/file' });
    expect(access.require).toHaveBeenCalledWith('viewer-1', 'board-1', 'view');
  });

  it('cleans up storage when metadata insertion fails', async () => {
    const { service, assetsRepository } = setup();
    assetsRepository.create.mockRejectedValue(new Error('database unavailable'));
    await expect(service.upload('user-1', baseFile())).rejects.toThrow('database unavailable');
    expect(assetsRepository.create).toHaveBeenCalledTimes(1);
  });

  it('deletes the database record and stored object for an owned asset', async () => {
    const { service, assetsRepository } = setup();
    const uploaded = await service.upload('user-1', baseFile());
    assetsRepository.findByIdForBoard.mockResolvedValue({ id: uploaded.id, storagePath: assetsRepository.create.mock.calls[0][0].storagePath });
    await service.remove('user-1', uploaded.id);
    expect(assetsRepository.deleteById).toHaveBeenCalledWith(uploaded.id);
  });
});
