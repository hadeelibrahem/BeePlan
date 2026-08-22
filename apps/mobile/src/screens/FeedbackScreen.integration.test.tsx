import { fireEvent, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { renderWithProviders } from '../test/renderWithProviders';
import FeedbackScreen from './FeedbackScreen';
import FeedbackDetailScreen from './FeedbackDetailScreen';
import { feedbackApi, type FeedbackItem } from '../features/feedback/feedbackApi';

jest.mock('../features/feedback/feedbackApi', () => ({
  feedbackApi: { list: jest.fn(), detail: jest.fn(), submit: jest.fn(), vote: jest.fn() },
  feedbackStatusLabel: (status: string) => ({ submitted: 'Submitted', reviewing: 'Reviewing', planned: 'Planned', in_development: 'In Development', released: 'Released', declined: 'Declined' }[status]),
}));

const item = (id: string, overrides: Partial<FeedbackItem> = {}): FeedbackItem => ({ id, category: 'idea', title: `Idea ${id}`, description: `Description ${id}`, status: 'submitted', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', releasedAt: null, voteCount: 2, voted: false, author: { id: 'author', displayName: 'Ada' }, ...overrides });
const list = feedbackApi.list as jest.Mock;
const vote = feedbackApi.vote as jest.Mock;

describe('Mobile Feedback screen', () => {
  beforeEach(() => jest.clearAllMocks());
  it('renders page one, opens detail, and does not navigate when voting', async () => {
    list.mockResolvedValue({ items: [item('one')], total: 1 }); vote.mockResolvedValue(item('one', { voted: true, voteCount: 3 })); const onOpen = jest.fn();
    const view = await renderWithProviders(<FeedbackScreen accessToken="token" onOpen={onOpen} onBack={jest.fn()} />);
    expect(await view.findByText('Idea one')).toBeTruthy(); fireEvent.press(view.getByLabelText('Vote')); expect(onOpen).not.toHaveBeenCalled(); await waitFor(() => expect(vote).toHaveBeenCalledWith('token', 'one', false)); fireEvent.press(view.getByText('Idea one')); expect(onOpen).toHaveBeenCalledWith('one');
  });
  it('appends page two and keeps page one visible', async () => {
    list.mockImplementation((_token, _sort, page) => Promise.resolve(page === 1 ? { items: [item('one')], total: 2 } : { items: [item('one'), item('two')], total: 2 }));
    const view = await renderWithProviders(<FeedbackScreen accessToken="token" onOpen={jest.fn()} onBack={jest.fn()} />); expect(await view.findByText('Idea one')).toBeTruthy(); fireEvent.press(view.getByText('Load more')); await waitFor(() => expect(view.getByText('Idea two')).toBeTruthy()); expect(view.getByText('Idea one')).toBeTruthy(); expect(list).toHaveBeenCalledWith('token', 'most_voted', 2);
  });
  it('shows empty and safe error states', async () => {
    list.mockResolvedValueOnce({ items: [], total: 0 }); const empty = await renderWithProviders(<FeedbackScreen accessToken="token" onOpen={jest.fn()} onBack={jest.fn()} />); expect(await empty.findByText('No ideas yet')).toBeTruthy();
    list.mockRejectedValueOnce(new Error('network')); const failed = await renderWithProviders(<FeedbackScreen accessToken="token" onOpen={jest.fn()} onBack={jest.fn()} />); expect(await failed.findByText('Unable to load feedback right now.')).toBeTruthy();
  });
  it('opens Share Idea and prevents invalid submission', async () => {
    list.mockResolvedValue({ items: [], total: 0 }); const view = await renderWithProviders(<FeedbackScreen accessToken="token" onOpen={jest.fn()} onBack={jest.fn()} />); await view.findByText('Share an idea'); fireEvent.press(view.getByRole('button', { name: 'Share an idea' })); expect(await view.findByPlaceholderText('Title')).toBeTruthy(); expect(view.getByPlaceholderText('Description')).toBeTruthy(); expect(feedbackApi.submit).not.toHaveBeenCalled();
  });
  it('mounts a dynamically bounded keyboard-safe sheet with a scroll body and contained footer', async () => {
    list.mockResolvedValue({ items: [], total: 0 });
    const view = await renderWithProviders(<FeedbackScreen accessToken="token" onOpen={jest.fn()} onBack={jest.fn()} />);
    fireEvent.press(await view.findByRole('button', { name: 'Share an idea' }));

    const root = await view.findByTestId('keyboard-safe-root');
    const sheet = view.getByTestId('keyboard-safe-form');
    const body = view.getByTestId('keyboard-safe-scroll-body');
    const footer = view.getByTestId('keyboard-safe-footer');
    const actions = view.getByTestId('share-idea-actions');
    fireEvent(root, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 800 } } });

    await waitFor(() => expect(StyleSheet.flatten(sheet.props.style).maxHeight).toBe(780));
    expect(StyleSheet.flatten(body.props.style).flexShrink).toBe(1);
    expect(body.props.contentContainerStyle.paddingHorizontal).toBe(20);
    expect(StyleSheet.flatten(footer.props.style).paddingHorizontal).toBe(20);
    expect(body.parent).toBe(sheet);
    expect(footer.parent).toBe(sheet);
    expect(actions.parent).toBe(footer);

    const description = view.getByPlaceholderText('Description');
    expect(typeof description.props.onFocus).toBe('function');
    fireEvent(description, 'focus');
  });
  it('preserves valid Share Idea submission', async () => {
    list.mockResolvedValue({ items: [], total: 0 });
    (feedbackApi.submit as jest.Mock).mockResolvedValue(item('created'));
    const view = await renderWithProviders(<FeedbackScreen accessToken="token" onOpen={jest.fn()} onBack={jest.fn()} />);
    fireEvent.press(await view.findByRole('button', { name: 'Share an idea' }));
    const titleInput = await view.findByPlaceholderText('Title');
    fireEvent.changeText(titleInput, 'Shared focus');
    await waitFor(() => expect(view.getByPlaceholderText('Title').props.value).toBe('Shared focus'));
    fireEvent.changeText(view.getByPlaceholderText('Description'), 'Focus together with classmates');
    await waitFor(() => expect(view.getByPlaceholderText('Description').props.value).toBe('Focus together with classmates'));
    const submitButton = view.getByRole('button', { name: 'Submit idea' });
    await waitFor(() => expect(submitButton.props.accessibilityState?.disabled).not.toBe(true));
    fireEvent.press(submitButton);
    await waitFor(() => expect(feedbackApi.submit).toHaveBeenCalledWith('token', {
      title: 'Shared focus',
      description: 'Focus together with classmates',
      category: 'idea',
    }));
  });
});

describe('Mobile Feedback detail', () => {
  beforeEach(() => jest.clearAllMocks());
  it('renders public feedback metadata and supports voting', async () => {
    const detail = item('one', { status: 'released', releasedAt: '2026-01-03T00:00:00Z' }); (feedbackApi.detail as jest.Mock).mockResolvedValue(detail); vote.mockResolvedValue({ ...detail, voted: true }); const view = await renderWithProviders(<FeedbackDetailScreen accessToken="token" id="one" onBack={jest.fn()} />); expect(await view.findByText('Idea one')).toBeTruthy(); expect(view.getByText('Description one')).toBeTruthy(); expect(view.getByText(/Ada/)).toBeTruthy(); fireEvent.press(view.getByText(/Vote/)); await waitFor(() => expect(vote).toHaveBeenCalledWith('token', 'one', false));
  });
  it('shows a safe unavailable state', async () => { (feedbackApi.detail as jest.Mock).mockRejectedValue(new Error('missing')); const view = await renderWithProviders(<FeedbackDetailScreen accessToken="token" id="missing" onBack={jest.fn()} />); expect(await view.findByText('Feedback item not found.')).toBeTruthy(); });
});
