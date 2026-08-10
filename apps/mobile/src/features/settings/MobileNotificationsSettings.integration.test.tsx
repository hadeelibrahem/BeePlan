import { render, waitFor } from '@testing-library/react-native';
import { MobileNotificationsSettings } from './MobileNotificationsSettings';
import * as preferencesApi from '../../lib/notificationPreferencesApi';
import * as pushDevicesApi from '../../lib/pushDevicesApi';

jest.mock('../../lib/notificationPreferencesApi', () => ({
  getNotificationPreferences: jest.fn(),
  updateNotificationPreferences: jest.fn(),
}));
jest.mock('../../lib/pushDevicesApi', () => ({
  getDefaultAndroidPushChannelStatus: jest.fn(),
  registerCurrentDevice: jest.fn(),
  setPushDeviceEnabled: jest.fn(),
}));
jest.mock('../../components/layout', () => {
  return {
    SectionCard: ({ children }: { children: unknown }) => children,
  };
});
jest.mock('../../theme/useTheme', () => ({
  useTheme: () => ({ theme: { colors: {
    text: '#111111',
    secondaryText: '#555555',
    accent: '#fdef4b',
    accentText: '#111111',
  } } }),
}));

const preferences = {
  taskNotifications: true,
  calendarNotifications: true,
  focusNotifications: true,
  collaborationNotifications: true,
  aiNotifications: true,
  emailNotifications: false,
  pushNotifications: true,
};

describe('MobileNotificationsSettings module and status UI', () => {
  beforeEach(() => {
    jest.mocked(preferencesApi.getNotificationPreferences).mockResolvedValue(preferences);
    jest.mocked(pushDevicesApi.registerCurrentDevice).mockResolvedValue('registered');
    jest.mocked(pushDevicesApi.getDefaultAndroidPushChannelStatus).mockResolvedValue({
      exists: true,
      id: 'beeplan-default-v2',
      soundEnabled: true,
      vibrationEnabled: true,
      badgeEnabled: true,
      importance: 4,
    });
  });

  afterEach(() => jest.clearAllMocks());

  it('resolves at the SettingsScreen import path and shows permission, device, and push state', async () => {
    const screen = await render(<MobileNotificationsSettings accessToken="access-token" />);

    await waitFor(() => {
      expect(screen.getByText('Android permission: Granted')).toBeTruthy();
      expect(screen.getByText('Device: Registered · Push: Enabled')).toBeTruthy();
      expect(screen.getByText(/Android channel: Sound enabled/)).toBeTruthy();
    });
    expect(pushDevicesApi.registerCurrentDevice).toHaveBeenCalledWith('access-token', false);
  });

  it('shows a friendly retry action after registration failure', async () => {
    jest.mocked(pushDevicesApi.registerCurrentDevice).mockResolvedValue('failed');
    const screen = await render(<MobileNotificationsSettings accessToken="access-token" />);

    await waitFor(() => expect(screen.getByText('Retry device registration')).toBeTruthy());
    expect(screen.queryByText(/ExponentPushToken/)).toBeNull();
  });
});
