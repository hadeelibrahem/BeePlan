import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateWhiteboardDto } from './dto';
import { WhiteboardService } from './whiteboard.service';

function row(id: string, userId: string) {
  return {
    id,
    userId,
    name: 'Personal Whiteboard',
    snapshot: null,
    cameraX: 0,
    cameraY: 0,
    cameraZoom: 1,
    createdAt: new Date('2026-08-04T00:00:00.000Z'),
    updatedAt: new Date('2026-08-04T00:00:00.000Z'),
  };
}

describe('WhiteboardService', () => {
  it.each(['owner', 'editor', 'viewer'] as const)('loads the complete board by board id for an accepted %s member', async (accessRole) => {
    const board = row('shared-board', 'owner-user');
    const repository = {
      findById: jest.fn().mockResolvedValue(board),
    };
    const service = new WhiteboardService(repository as never);

    const response = await service.getBoard('member-user', board.id, accessRole);

    expect(repository.findById).toHaveBeenCalledWith(board.id);
    expect(response).toMatchObject({ id: board.id, snapshot: null, assetReferences: {}, accessRole });
    expect(response.camera).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('creates one board per user and returns it repeatedly', async () => {
    const boards = new Map([['user-a', row('board-a', 'user-a')]]);
    const repository = {
      findOrCreateForUser: jest.fn(async (userId: string) => boards.get(userId)),
      updateByUserId: jest.fn(),
    };
    const service = new WhiteboardService(repository as never);

    const first = await service.getCurrentUserBoard('user-a');
    const second = await service.getCurrentUserBoard('user-a');

    expect(first.id).toBe('board-a');
    expect(second.id).toBe(first.id);
    expect(repository.findOrCreateForUser).toHaveBeenCalledTimes(2);
  });

  it('keeps users isolated when updating the current user board', async () => {
    const userA = row('board-a', 'user-a');
    const userB = row('board-b', 'user-b');
    const repository = {
      findOrCreateForUser: jest.fn(async (userId: string) => (userId === 'user-a' ? userA : userB)),
      updateByUserId: jest.fn(async (userId: string, changes: { name?: string }) => ({
        ...(userId === 'user-a' ? userA : userB),
        name: changes.name ?? (userId === 'user-a' ? userA.name : userB.name),
      })),
    };
    const service = new WhiteboardService(repository as never);

    const updated = await service.updateCurrentUserBoard('user-a', { name: 'A only' });

    expect(updated.id).toBe('board-a');
    expect(repository.updateByUserId).toHaveBeenCalledWith('user-a', { name: 'A only' });
    expect(userB.name).toBe('Personal Whiteboard');
  });
});

describe('UpdateWhiteboardDto', () => {
  function errors(payload: unknown) {
    return validateSync(
      plainToInstance(UpdateWhiteboardDto, payload),
      { whitelist: true, forbidNonWhitelisted: true },
    );
  }

  it('rejects invalid camera values and ownership fields', () => {
    expect(errors({ camera: { x: Number.NaN, y: 0, zoom: 1 } })).not.toHaveLength(0);
    expect(errors({ camera: { x: 0, y: 0, zoom: 100 } })).not.toHaveLength(0);
    expect(errors({ userId: 'another-user' })).not.toHaveLength(0);
  });

  it('accepts a bounded camera and JSON snapshot', () => {
    expect(errors({ camera: { x: 10, y: -20, zoom: 1.25 }, snapshot: { document: {}, session: {} } })).toHaveLength(0);
  });
});
