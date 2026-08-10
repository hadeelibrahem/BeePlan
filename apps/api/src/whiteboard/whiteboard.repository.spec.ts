import { WhiteboardRepository } from './whiteboard.repository';

describe('WhiteboardRepository', () => {
  it('handles concurrent first-load creation through the unique user constraint', async () => {
    const board = {
      id: 'board-a',
      userId: 'user-a',
      name: 'Personal Whiteboard',
      snapshot: null,
      cameraX: 0,
      cameraY: 0,
      cameraZoom: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const selectQuery = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValue([board]),
    };
    const insertQuery = {
      values: jest.fn().mockReturnThis(),
      onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
    };
    const database = {
      db: {
        select: jest.fn(() => selectQuery),
        insert: jest.fn(() => insertQuery),
      },
    };
    const repository = new WhiteboardRepository(database as never);

    const boards = await Promise.all([
      repository.findOrCreateForUser('user-a'),
      repository.findOrCreateForUser('user-a'),
    ]);

    expect(boards[0]?.id).toBe('board-a');
    expect(boards[1]?.id).toBe('board-a');
    expect(insertQuery.onConflictDoNothing).toHaveBeenCalledTimes(2);
  });
});
