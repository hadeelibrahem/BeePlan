/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable prettier/prettier */
import { WhiteboardTaskCardsService } from './whiteboard-task-cards.service';

describe('WhiteboardTaskCardsService', () => {
  it('returns only the safe summary for a referenced task card', async () => {
    const access = { require: jest.fn().mockResolvedValue({ board: { snapshot: { document: { store: { 'shape:1': { typeName: 'shape', type: 'beeplan-task', props: { taskId: 'task-1' } } } } } } }) };
    const task = {
      id: 'task-1',
      title: 'Prepare demo',
      priority: 'high',
      status: 'todo',
      dueDate: new Date('2026-08-10T00:00:00.000Z'),
      description: 'private',
      notes: 'private',
    };
    const db = {
      select: jest.fn()
        .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: async () => [task] }) }) })
        .mockReturnValueOnce({ from: () => ({ where: async () => [{ isDone: true, status: 'done' }, { isDone: false, status: 'todo' }] }) }),
    };
    const service = new WhiteboardTaskCardsService({ db } as never, access as never);

    await expect(service.get('viewer-1', 'board-1', 'task-1')).resolves.toEqual({
      taskId: 'task-1', title: 'Prepare demo', priority: 'high', status: 'todo', dueDate: '2026-08-10T00:00:00.000Z',
      progress: { completed: 1, total: 2, percentage: 50 },
    });
  });

  it('does not expose a task that is not referenced by the board snapshot', async () => {
    const access = { require: jest.fn().mockResolvedValue({ board: { snapshot: { document: { store: {} } } } }) };
    const service = new WhiteboardTaskCardsService({ db: { select: jest.fn() } } as never, access as never);
    await expect(service.get('viewer-1', 'board-1', 'task-1')).rejects.toThrow('Task card not found.');
  });
});
