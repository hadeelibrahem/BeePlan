import { ApiRequestError } from '../lib/apiClient';
import {
  isProximityMonitorRunning,
  setProximityMonitorAuth,
  startProximityMonitor,
  stopProximityMonitor,
} from './proximityMonitor';
import { checkNearby, updateLocationSnapshot } from '../features/social/api/social.api';
import { getCurrentSnapshot, requestForegroundLocationPermission } from '../lib/location';

jest.mock('../lib/apiClient', () => {
  class ApiRequestError extends Error {
    kind: string;
    status?: number;
    constructor(message: string, errorKind: string, status?: number) {
      super(message);
      this.name = 'ApiRequestError';
      this.kind = errorKind;
      this.status = status;
    }
  }
  return { ApiRequestError };
});
jest.mock('../features/social/api/social.api', () => ({
  checkNearby: jest.fn(),
  updateLocationSnapshot: jest.fn(),
}));
jest.mock('../lib/location', () => ({
  getCurrentSnapshot: jest.fn(),
  requestForegroundLocationPermission: jest.fn(),
}));
jest.mock('../lib/notifications', () => ({ showPersonNearbyNotification: jest.fn() }));

const location = { latitude: 31.9, longitude: 35.2, accuracy: 10 };

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('proximityMonitor authentication lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    stopProximityMonitor();
    setProximityMonitorAuth({ hydrated: false, userId: null, accessToken: null });
    jest.mocked(requestForegroundLocationPermission).mockResolvedValue(true);
    jest.mocked(getCurrentSnapshot).mockResolvedValue(location);
    jest.mocked(updateLocationSnapshot).mockResolvedValue(undefined);
    jest.mocked(checkNearby).mockResolvedValue([]);
  });

  afterEach(() => {
    stopProximityMonitor();
    jest.useRealTimers();
  });

  it('runs normally for a hydrated authenticated session', async () => {
    setProximityMonitorAuth({ hydrated: true, userId: 'user-a', accessToken: 'token-a' });
    await expect(startProximityMonitor(60_000)).resolves.toBe(true);
    await flush();
    expect(updateLocationSnapshot).toHaveBeenCalledWith(location);
    expect(checkNearby).toHaveBeenCalledTimes(1);
  });

  it('does not request location or APIs before auth hydration', async () => {
    await expect(startProximityMonitor()).resolves.toBe(false);
    await flush();
    expect(requestForegroundLocationPermission).not.toHaveBeenCalled();
    expect(updateLocationSnapshot).not.toHaveBeenCalled();
  });

  it('stops immediately when the session is cleared', async () => {
    setProximityMonitorAuth({ hydrated: true, userId: 'user-a', accessToken: 'token-a' });
    await startProximityMonitor(1_000);
    await flush();
    setProximityMonitorAuth({ hydrated: true, userId: null, accessToken: null });
    expect(isProximityMonitorRunning()).toBe(false);
    jest.advanceTimersByTime(5_000);
    await flush();
    expect(checkNearby).toHaveBeenCalledTimes(1);
  });

  it('silently stops after an expected session-expired response', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.mocked(updateLocationSnapshot).mockRejectedValue(new ApiRequestError('Please sign in to continue.', 'http', 401));
    setProximityMonitorAuth({ hydrated: true, userId: 'user-a', accessToken: 'token-a' });
    await startProximityMonitor(1_000);
    await flush();
    expect(isProximityMonitorRunning()).toBe(false);
    jest.advanceTimersByTime(5_000);
    await flush();
    expect(updateLocationSnapshot).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('prevents a stale prior-session tick from continuing after auth replacement', async () => {
    let resolveLocation: ((value: typeof location) => void) | undefined;
    jest.mocked(getCurrentSnapshot).mockImplementation(() => new Promise(resolve => { resolveLocation = resolve; }));
    setProximityMonitorAuth({ hydrated: true, userId: 'user-a', accessToken: 'token-a' });
    await startProximityMonitor();
    setProximityMonitorAuth({ hydrated: true, userId: 'user-b', accessToken: 'token-b' });
    resolveLocation!(location);
    await flush();
    expect(updateLocationSnapshot).not.toHaveBeenCalled();
    expect(checkNearby).not.toHaveBeenCalled();
  });
});
