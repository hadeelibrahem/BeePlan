import { TaskContextNotificationWorker } from './task-context-notification.worker';

describe('TaskContextNotificationWorker database outage resilience', () => {
  it('retries a transient transaction failure without terminating the worker', async () => {
    const transaction = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error('getaddrinfo ENOTFOUND pooler'), { code: 'ENOTFOUND' }))
      .mockResolvedValueOnce(undefined);
    const database = {
      db: { transaction },
      poolStats: () => ({ totalCount: 1, idleCount: 1, waitingCount: 0 }),
    };
    const worker = new TaskContextNotificationWorker(
      database as never,
      {} as never,
      {} as never,
    );

    await expect(worker.tick()).resolves.toBeUndefined();
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('stays available when all bounded attempts fail so the next cron tick can retry', async () => {
    const transaction = jest.fn().mockRejectedValue(
      Object.assign(new Error('Connection terminated unexpectedly'), { code: 'ECONNRESET' }),
    );
    const database = {
      db: { transaction },
      poolStats: () => ({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
    };
    const worker = new TaskContextNotificationWorker(
      database as never,
      {} as never,
      {} as never,
    );

    await expect(worker.tick()).resolves.toBeUndefined();
    await expect(worker.tick()).resolves.toBeUndefined();
    expect(transaction).toHaveBeenCalledTimes(4);
  });
});
