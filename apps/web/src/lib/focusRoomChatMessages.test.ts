import { describe, expect, it } from 'vitest';
import { mergeFocusRoomChatMessages } from './focusRoomChatMessages';

const message = (id: string, createdAt: string) => ({ id, createdAt, content: id });

describe('mergeFocusRoomChatMessages', () => {
  it('keeps realtime data when an older history response finishes later', () => {
    const realtime = message('live', '2026-08-28T10:01:00.000Z');
    expect(mergeFocusRoomChatMessages([realtime], [message('history', '2026-08-28T10:00:00.000Z')]))
      .toEqual([message('history', '2026-08-28T10:00:00.000Z'), realtime]);
  });

  it('deduplicates IDs and orders messages chronologically', () => {
    expect(mergeFocusRoomChatMessages(
      [message('later', '2026-08-28T10:02:00.000Z')],
      [message('same', '2026-08-28T10:01:00.000Z'), message('same', '2026-08-28T10:01:00.000Z')],
    )).toEqual([message('same', '2026-08-28T10:01:00.000Z'), message('later', '2026-08-28T10:02:00.000Z')]);
  });
});
