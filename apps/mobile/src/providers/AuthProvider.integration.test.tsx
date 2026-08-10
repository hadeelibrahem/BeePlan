import { Text } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { AuthProvider } from './AuthProvider';
import { registerCurrentDevice } from '../lib/pushDevicesApi';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock('expo-notifications/build/TokenEmitter', () => ({
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock('../lib/pushDevicesApi', () => ({
  registerCurrentDevice: jest.fn(),
  disableCurrentDevice: jest.fn(),
}));
jest.mock('../lib/authToken', () => ({ setAuthToken: jest.fn() }));
jest.mock('../lib/api', () => ({
  forgotPassword: jest.fn(),
  login: jest.fn(),
  logout: jest.fn(),
  register: jest.fn(),
  resetPassword: jest.fn(),
  verifyResetCode: jest.fn(),
}));
jest.mock('../services/auth.service', () => ({
  getGoogleApprovalStatus: jest.fn(),
  parseApprovalToken: jest.fn(() => ''),
  parseGoogleOAuthMessage: jest.fn(() => ''),
  parseGoogleOAuthUrl: jest.fn(() => null),
  startGoogleSignIn: jest.fn(),
}));

describe('AuthProvider automatic push registration', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('registers silently only after restoring an authenticated session', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(JSON.stringify({
      accessToken: 'restored-access-token',
      user: { id: 'user-1', email: 'user@example.com' },
    }));
    jest.mocked(registerCurrentDevice).mockResolvedValue('registered');

    await render(<AuthProvider><Text>Authenticated app</Text></AuthProvider>);

    await waitFor(() => expect(registerCurrentDevice).toHaveBeenCalledWith(
      'restored-access-token',
      false,
    ));
  });

  it('retries a transient token/backend registration failure without another render', async () => {
    jest.useFakeTimers();
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(JSON.stringify({
      accessToken: 'restored-access-token',
      user: { id: 'user-1', email: 'user@example.com' },
    }));
    jest.mocked(registerCurrentDevice)
      .mockResolvedValueOnce('failed')
      .mockResolvedValueOnce('registered');

    await render(<AuthProvider><Text>Authenticated app</Text></AuthProvider>);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(registerCurrentDevice).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(5_000);
      await Promise.resolve();
    });
    expect(registerCurrentDevice).toHaveBeenCalledTimes(2);
  });
});
