import { GoogleCalendarService } from './google-calendar.service';

describe('GoogleCalendarService background failure boundaries', () => {
  function serviceWithDatabaseFailure() {
    const database = {
      get db(): never {
        throw new Error('timeout exceeded when trying to connect');
      },
      poolStats: () => ({ totalCount: 10, idleCount: 0, waitingCount: 1 }),
    };
    return new GoogleCalendarService(
      database as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  it('contains enqueue failures so fire-and-forget task writes remain successful', async () => {
    await expect(
      serviceWithDatabaseFailure().enqueueTaskSync('user-1', 'task-1'),
    ).resolves.toBeUndefined();
  });

  it('contains connection-scan failures in the scheduled account sync', async () => {
    await expect(
      serviceWithDatabaseFailure().syncConnectedAccounts(),
    ).resolves.toBeUndefined();
  });
});
