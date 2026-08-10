import {
  BEEPLAN_DEFAULT_ANDROID_CHANNEL_ID,
  registerPushDevice,
  type PushRegistrationDependencies,
} from './pushDevicesApi';

const PUSH_TOKEN = 'ExponentPushToken[development-device-token]';

function permission(granted: boolean, canAskAgain = true) {
  return {
    granted,
    canAskAgain,
    expires: 'never',
    status: granted ? 'granted' : 'denied',
  };
}

function createDependencies(overrides: Partial<PushRegistrationDependencies> = {}) {
  return {
    platform: 'android',
    projectId: '0139b386-b626-4906-903d-b3a0338d42cf',
    getPermission: jest.fn().mockResolvedValue(permission(true)),
    requestPermission: jest.fn().mockResolvedValue(permission(true)),
    createAndroidChannel: jest.fn().mockResolvedValue(null),
    getExpoToken: jest.fn().mockResolvedValue({ data: PUSH_TOKEN, type: 'expo' }),
    getInstallationId: jest.fn().mockResolvedValue('android-installation-1'),
    register: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as PushRegistrationDependencies;
}

describe('automatic push device registration', () => {
  afterEach(() => jest.restoreAllMocks());

  it('registers an authenticated Android device when permission is already granted', async () => {
    const dependencies = createDependencies();

    await expect(registerPushDevice('access-token', false, dependencies)).resolves.toBe('registered');

    expect(dependencies.requestPermission).not.toHaveBeenCalled();
    expect(dependencies.getExpoToken).toHaveBeenCalledWith({ projectId: dependencies.projectId });
    expect(dependencies.createAndroidChannel).toHaveBeenCalledWith(
      BEEPLAN_DEFAULT_ANDROID_CHANNEL_ID,
      expect.objectContaining({
        name: 'BeePlan alerts',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      }),
    );
    expect(dependencies.createAndroidChannel).toHaveBeenCalledWith(
      'tasks',
      expect.objectContaining({ name: 'Tasks', sound: 'default' }),
    );
    expect(dependencies.register).toHaveBeenCalledWith('access-token', expect.objectContaining({
      expoPushToken: PUSH_TOKEN,
      platform: 'android',
      installationId: 'android-installation-1',
    }));
  });

  it('uses the stable installation identity for idempotent restart registration', async () => {
    const dependencies = createDependencies();

    await registerPushDevice('access-token', false, dependencies);
    await registerPushDevice('access-token', false, dependencies);

    expect(dependencies.register).toHaveBeenCalledTimes(2);
    expect(dependencies.register).toHaveBeenNthCalledWith(
      1,
      'access-token',
      expect.objectContaining({ installationId: 'android-installation-1' }),
    );
    expect(dependencies.register).toHaveBeenNthCalledWith(
      2,
      'access-token',
      expect.objectContaining({ installationId: 'android-installation-1' }),
    );
  });

  it('does not prompt or register during startup when permission is denied', async () => {
    const dependencies = createDependencies({
      getPermission: jest.fn().mockResolvedValue(permission(false)),
    });

    await expect(registerPushDevice('access-token', false, dependencies)).resolves.toBe('denied');

    expect(dependencies.requestPermission).not.toHaveBeenCalled();
    expect(dependencies.getExpoToken).not.toHaveBeenCalled();
    expect(dependencies.register).not.toHaveBeenCalled();
  });

  it('registers when permission is granted after the app returns to the foreground', async () => {
    const getPermission = jest.fn()
      .mockResolvedValueOnce(permission(false))
      .mockResolvedValueOnce(permission(true));
    const dependencies = createDependencies({ getPermission });

    await expect(registerPushDevice('access-token', false, dependencies)).resolves.toBe('denied');
    await expect(registerPushDevice('access-token', false, dependencies)).resolves.toBe('registered');

    expect(dependencies.register).toHaveBeenCalledTimes(1);
  });

  it('keeps token retrieval failures retryable', async () => {
    const dependencies = createDependencies({
      getExpoToken: jest.fn().mockRejectedValue(new Error('token unavailable')),
    });

    await expect(registerPushDevice('access-token', false, dependencies)).resolves.toBe('failed');
    expect(dependencies.register).not.toHaveBeenCalled();
  });

  it('keeps backend registration failures retryable and never logs the full token', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const dependencies = createDependencies({
      register: jest.fn().mockRejectedValue(new Error('backend unavailable')),
    });

    await expect(registerPushDevice('access-token', false, dependencies)).resolves.toBe('failed');

    expect(JSON.stringify(log.mock.calls)).not.toContain(PUSH_TOKEN);
  });

  it('uses the newly authenticated user token after logout and login', async () => {
    const dependencies = createDependencies();

    await registerPushDevice('first-user-token', false, dependencies);
    await registerPushDevice('second-user-token', false, dependencies);

    expect(dependencies.register).toHaveBeenNthCalledWith(1, 'first-user-token', expect.any(Object));
    expect(dependencies.register).toHaveBeenNthCalledWith(2, 'second-user-token', expect.any(Object));
  });
});
