let mockNativeListener: ((event: { requestId: string; packageName: string; justification: string }) => void) | undefined;
const mockRemove = jest.fn();
const mockGetPending = jest.fn();
const mockDeliver = jest.fn();
const mockRequestAccess = jest.fn();

;(globalThis as typeof globalThis & { __DEV__: boolean }).__DEV__ = true;

jest.mock('../../../modules/beeplan-focus-blocker', () => ({
  subscribeToEvents: jest.fn((_name, listener) => { mockNativeListener = listener; return { remove: mockRemove }; }),
  getPendingAppGuardRequest: (...args: unknown[]) => mockGetPending(...args),
  deliverAppGuardRequestResult: (...args: unknown[]) => mockDeliver(...args),
  isAppGuardResultDeliveryAvailable: () => true,
  setAppGuardRestrictionSources: jest.fn(),
}));
jest.mock('./api', () => ({ mobileAppGuardApi: { requestAccess: (...args: unknown[]) => mockRequestAccess(...args) } }));

import { onAppGuardAppStateChanged, registerJustificationFlow } from './restrictionEnforcement';

const pending = { requestId: 'native-request-1', packageName: 'com.example.blocked', justification: 'Needed for an urgent task.' };
async function flush() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }

describe('App Guard native request handoff', () => {
  beforeEach(() => {
    onAppGuardAppStateChanged('active');
    mockNativeListener = undefined;
    mockRemove.mockClear(); mockGetPending.mockReset(); mockDeliver.mockReset(); mockRequestAccess.mockReset();
    mockGetPending.mockResolvedValue(null);
    mockRequestAccess.mockResolvedValue({ decision: 'deny', reason: 'Stay focused.' });
    mockDeliver.mockResolvedValue(true);
  });

  it('keeps the listener active independently of app state and removes only when its root owner cleans up', async () => {
    const subscription = registerJustificationFlow('user-1');
    expect(mockNativeListener).toBeDefined();
    expect(mockRemove).not.toHaveBeenCalled();
    subscription.remove();
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it('drains a request retained by native before listener registration', async () => {
    mockGetPending.mockResolvedValue(pending);
    registerJustificationFlow('user-1');
    await flush();
    expect(mockRequestAccess).toHaveBeenCalledWith(pending.packageName, pending.justification, pending.requestId);
    expect(mockDeliver).toHaveBeenCalledWith(pending.requestId, 'deny', 'Stay focused.', null, 'user-1');
  });

  it('processes an event and its pending-drain duplicate only once', async () => {
    mockGetPending.mockResolvedValue(pending);
    registerJustificationFlow('user-1');
    mockNativeListener!(pending);
    await flush();
    expect(mockRequestAccess).toHaveBeenCalledTimes(1);
    expect(mockDeliver).toHaveBeenCalledTimes(1);
  });

  it('defers the JS fallback while backgrounded and reconciles the same native request when active', async () => {
    registerJustificationFlow('user-1');
    onAppGuardAppStateChanged('background');
    mockNativeListener!(pending);
    await flush();
    expect(mockRequestAccess).not.toHaveBeenCalled();

    mockGetPending.mockResolvedValue(pending);
    onAppGuardAppStateChanged('active');
    await flush();
    expect(mockRequestAccess).toHaveBeenCalledWith(pending.packageName, pending.justification, pending.requestId);
    expect(mockDeliver).toHaveBeenCalledWith(pending.requestId, 'deny', 'Stay focused.', null, 'user-1');
  });
});
