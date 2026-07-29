import { PersonRemindersController } from './person-reminders.controller';

describe('PersonRemindersController nearby cache behavior', () => {
  it('discards conditional cache validators and evaluates every request', async () => {
    const checkNearby = jest.fn().mockResolvedValue([]);
    const controller = new PersonRemindersController({
      checkNearby,
    } as never);
    const request = {
      user: { id: '11111111-1111-1111-1111-111111111111' },
      headers: {
        'if-none-match': '"stale-etag"',
        'if-modified-since': 'Sat, 18 Jul 2026 10:00:00 GMT',
      },
    };
    const response = { removeHeader: jest.fn() };

    await expect(
      controller.checkNearby(request as never, response as never),
    ).resolves.toEqual([]);

    expect(request.headers).not.toHaveProperty('if-none-match');
    expect(request.headers).not.toHaveProperty('if-modified-since');
    expect(response.removeHeader).toHaveBeenCalledWith('ETag');
    expect(checkNearby).toHaveBeenCalledTimes(1);
    expect(checkNearby).toHaveBeenCalledWith(request.user.id);
  });
});
