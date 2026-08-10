import { PushNotificationsService } from './push-notifications.service';

describe('PushNotificationsService device registration', () => {
  it('updates and re-enables the existing user installation instead of inserting a duplicate', async () => {
    const registeredRow = {
      id: 'device-1',
      platform: 'android',
      enabled: true,
      lastSeenAt: new Date('2026-08-08T17:30:00.000Z'),
    };
    const returning = jest.fn().mockResolvedValue([registeredRow]);
    const updateWhere = jest.fn().mockReturnValue({ returning });
    const updateSet = jest.fn().mockReturnValue({ where: updateWhere });
    const update = jest.fn().mockReturnValue({ set: updateSet });
    const limit = jest.fn().mockResolvedValue([{ id: 'device-1' }]);
    const selectWhere = jest.fn().mockReturnValue({ limit });
    const selectFrom = jest.fn().mockReturnValue({ where: selectWhere });
    const select = jest.fn().mockReturnValue({ from: selectFrom });
    const insert = jest.fn();
    const service = new PushNotificationsService({
      db: { select, update, insert },
    } as never);

    const result = await service.register('user-1', {
      expoPushToken: 'ExponentPushToken[updated-token]',
      platform: 'android',
      installationId: 'android-installation-1',
      deviceName: 'BeePlan development device',
      appVersion: '1.0.0',
    });

    expect(insert).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      expoPushToken: 'ExponentPushToken[updated-token]',
      platform: 'android',
      installationId: 'android-installation-1',
      enabled: true,
    }));
    expect(result).toEqual(registeredRow);
  });
});
