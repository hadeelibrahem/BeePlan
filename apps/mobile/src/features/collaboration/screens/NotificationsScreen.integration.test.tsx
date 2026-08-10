import { render, waitFor } from '@testing-library/react-native';
import { NotificationsScreen } from './NotificationsScreen';
import * as collaborationApi from '../api/collaboration.api';

jest.mock('../api/collaboration.api', () => ({
  acceptInvite: jest.fn(),
  declineInvite: jest.fn(),
  getMyInvitations: jest.fn(),
  getNotifications: jest.fn(),
  markAllNotificationsRead: jest.fn(),
  markNotificationRead: jest.fn(),
}));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: jest.fn() }) }));
jest.mock('../../../components/layout', () => ({
  BottomNavBar: () => null,
  MobileIcon: () => null,
  PrimaryButton: ({ children }: { children: unknown }) => children,
  ScreenLayout: ({ children }: { children: unknown }) => children,
}));
jest.mock('../../../theme/useTheme', () => ({
  useTheme: () => ({ theme: { colors: {
    text: '#111', secondaryText: '#555', textSubtle: '#777', accent: '#fdef4b', accentInk: '#111', accentSoft: '#fff8a0', card: '#fff', surfaceElevated: '#fff', border: '#ddd', placeholder: '#999', success: '#0a0', error: '#a00',
  } } }),
}));
jest.mock('../components/Avatar', () => ({ Avatar: () => null }));

describe('NotificationsScreen loading lifecycle', () => {
  beforeEach(() => {
    jest.mocked(collaborationApi.getMyInvitations).mockResolvedValue([]);
    jest.mocked(collaborationApi.getNotifications).mockResolvedValue({ items: [{ id: 'n1', title: 'New update', body: 'Hello', sentAt: new Date().toISOString(), isRead: false, type: 'task_assigned' } as never], hasMore: false, page: 1, pageSize: 20, total: 1 });
  });

  afterEach(() => jest.clearAllMocks());

  it('fetches once and keeps content after a parent rerender', async () => {
    const onUnreadCountChange = jest.fn();
    const screen = await render(<NotificationsScreen onBack={jest.fn()} onOpenNotification={jest.fn()} onUnreadCountChange={onUnreadCountChange} />);
    await waitFor(() => expect(screen.getByText('New update')).toBeTruthy());
    expect(collaborationApi.getNotifications).toHaveBeenCalledTimes(1);
    screen.rerender(<NotificationsScreen onBack={jest.fn()} onOpenNotification={jest.fn()} onUnreadCountChange={onUnreadCountChange} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(collaborationApi.getNotifications).toHaveBeenCalledTimes(1);
  });
});
