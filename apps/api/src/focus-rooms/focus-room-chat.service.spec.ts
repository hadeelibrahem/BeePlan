import { focusCoachDecision } from './focus-room-chat.service';
import { FocusRoomChatService } from './focus-room-chat.service';

describe('Focus Coach intervention policy', () => {
  it('does not intervene for one casual message or normal task discussion', () => {
    expect(focusCoachDecision({ content: 'thanks!', enabled: true, distractingMessageCount: 0, lastInterventionAt: null }).shouldRespond).toBe(false);
    expect(focusCoachDecision({ content: 'I finished the first task; can you review step two?', enabled: true, distractingMessageCount: 0, lastInterventionAt: null }).shouldRespond).toBe(false);
  });
  it('reports the threshold decision at the third consecutive distraction', () => {
    const first = focusCoachDecision({ content: 'movie night', enabled: true, distractingMessageCount: 0, lastInterventionAt: null });
    const second = focusCoachDecision({ content: 'movie night', enabled: true, distractingMessageCount: first.nextDistractingMessageCount, lastInterventionAt: null });
    const third = focusCoachDecision({ content: 'movie night', enabled: true, distractingMessageCount: second.nextDistractingMessageCount, lastInterventionAt: null });
    expect([first.nextDistractingMessageCount, second.nextDistractingMessageCount, third.nextDistractingMessageCount]).toEqual([1, 2, 3]);
    expect(third.reason).toBe('threshold_reached');
    expect(third.shouldRespond).toBe(true);
  });
  it('intervenes only after sustained distracting chat and respects cooldown', () => {
    expect(focusCoachDecision({ content: 'That movie was great', enabled: true, distractingMessageCount: 2, lastInterventionAt: null }).shouldRespond).toBe(true);
    expect(focusCoachDecision({ content: 'That movie was great', enabled: true, distractingMessageCount: 2, lastInterventionAt: new Date(10_000), now: 20_000 }).shouldRespond).toBe(false);
  });
  it('counts sustained Arabic off-topic conversation while preserving Arabic focus discussion', () => {
    expect(focusCoachDecision({ content: 'شو طابخين اليوم', enabled: true, distractingMessageCount: 2, lastInterventionAt: null }).shouldRespond).toBe(true);
    expect(focusCoachDecision({ content: 'راجعت خطوة من المشروع', enabled: true, distractingMessageCount: 2, lastInterventionAt: null }).shouldRespond).toBe(false);
  });
  it('allows an explicit request while respecting the owner setting', () => {
    expect(focusCoachDecision({ content: '@bee can you help break down this task?', enabled: true, distractingMessageCount: 0, lastInterventionAt: null }).shouldRespond).toBe(true);
    expect(focusCoachDecision({ content: '@bee can you help?', enabled: false, distractingMessageCount: 0, lastInterventionAt: null }).shouldRespond).toBe(false);
  });
});

describe('Focus Room chat authorization', () => {
  it('rejects history and sends from a user without active room membership', async () => {
    const database = { db: { query: { focusRoomMembers: { findFirst: jest.fn().mockResolvedValue(null) } } } };
    const chat = new FocusRoomChatService(database as never, { publish: jest.fn() } as never, {} as never);
    await expect(chat.history('room-id', 'non-member')).rejects.toThrow('Active room membership is required.');
    await expect(chat.send('room-id', 'non-member', 'forged AI message')).rejects.toThrow('Active room membership is required.');
  });
});
