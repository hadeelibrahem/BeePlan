import {
  BEEPLAN_DEFAULT_ANDROID_CHANNEL_ID,
  channelFor,
  createExpoPushMessage,
  PushNotificationsService,
} from './push-notifications.service';

function selectRows(rows: unknown[]) {
  const chain: Record<string, jest.Mock> = {};
  chain.from = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.limit = jest.fn().mockResolvedValue(rows);
  return chain;
}

function updateChain() {
  const where = jest.fn().mockResolvedValue(undefined);
  const set = jest.fn(() => ({ where }));
  return { update: jest.fn(() => ({ set })), set, where };
}

describe('PushNotificationsService queue reliability', () => {
  afterEach(() => jest.restoreAllMocks());

  it('routes Task Assistant through the sound-enabled Android channel', () => {
    expect(channelFor('task_assistant')).toBe(BEEPLAN_DEFAULT_ANDROID_CHANNEL_ID);
    expect(channelFor('ai_task_manager')).toBe('ai');
    expect(createExpoPushMessage({
      expoPushToken: 'ExponentPushToken[masked]',
      title: 'Prepare',
      body: 'Check meeting link and equipment',
      priority: 'high',
      payload: {},
    } as never)).toMatchObject({
      sound: 'default',
      channelId: BEEPLAN_DEFAULT_ANDROID_CHANNEL_ID,
    });
  });

  it('contains transient database scan failures and retries on the next tick', async () => {
    const database = {
      get db(): never { throw Object.assign(new Error('getaddrinfo ENOTFOUND pooler'), { code: 'ENOTFOUND' }); },
      poolStats: () => ({ totalCount: 0, idleCount: 0, waitingCount: 1 }),
    };
    const service = new PushNotificationsService(database as never);

    await expect(service.processQueue()).resolves.toBeUndefined();
  });

  it('skips the Expo receipt request when no sent jobs have tickets', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const db = { select: jest.fn(() => selectRows([])) };
    const service = new PushNotificationsService({ db } as never);

    await (service as unknown as { processReceipts(): Promise<void> }).processReceipts();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('marks an accepted Expo receipt delivered', async () => {
    const job = {
      id: 'job-1',
      deviceId: 'device-1',
      ticketId: 'ticket-1',
    };
    const updates = updateChain();
    const db = {
      select: jest.fn(() => selectRows([job])),
      update: updates.update,
    };
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: { 'ticket-1': { status: 'ok' } },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const service = new PushNotificationsService({ db } as never);

    await (service as unknown as { processReceipts(): Promise<void> }).processReceipts();

    expect(updates.set).toHaveBeenCalledWith(expect.objectContaining({
      status: 'delivered',
      lastError: null,
    }));
  });

  it('does not disable a healthy device for project-level InvalidCredentials', async () => {
    const updates = updateChain();
    const service = new PushNotificationsService({ db: { update: updates.update } } as never);
    const job = { id: 'job-1', deviceId: 'device-1', attemptCount: 0 };

    await (service as unknown as {
      handleTicket(currentJob: unknown, ticket: unknown): Promise<void>;
    }).handleTicket(job, {
      status: 'error',
      message: 'Unable to authenticate with FCM',
      details: { error: 'InvalidCredentials' },
    });

    expect(updates.update).toHaveBeenCalledTimes(1);
    expect(updates.set).toHaveBeenCalledWith(expect.objectContaining({
      status: 'pending',
      attemptCount: 1,
    }));
  });
});
