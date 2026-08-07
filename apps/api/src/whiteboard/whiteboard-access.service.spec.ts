import { WhiteboardAccessService } from './whiteboard-access.service';

function databaseFor(result: unknown) {
  const query = { limit: jest.fn().mockResolvedValue(result) };
  return { db: { select: jest.fn(() => ({ from: jest.fn(() => ({ innerJoin: jest.fn(() => ({ where: jest.fn(() => query) })) })) })) } };
}

describe('WhiteboardAccessService', () => {
  it.each([
    ['owner', 'view', true], ['owner', 'delete', true], ['editor', 'edit', true], ['editor', 'delete', false], ['viewer', 'view', true], ['viewer', 'edit', false],
  ])('%s %s permission is evaluated centrally', async (role, permission, allowed) => {
    const service = new WhiteboardAccessService(databaseFor([{ member: { role, acceptedAt: new Date() }, board: { id: 'board-1' } }]) as never)
    if (allowed) await expect(service.require('user-1', 'board-1', permission as never)).resolves.toMatchObject({ role })
    else await expect(service.require('user-1', 'board-1', permission as never)).rejects.toThrow()
  })

  it('returns a safe not-found result for inaccessible boards', async () => {
    const service = new WhiteboardAccessService(databaseFor([]) as never)
    await expect(service.require('user-1', 'private-board', 'view')).rejects.toThrow('Board not found')
  })
})
