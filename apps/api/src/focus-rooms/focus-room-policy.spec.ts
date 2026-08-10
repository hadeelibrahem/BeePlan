import {
  actualMinutes,
  isSharedSessionLocked,
  isSharedSessionTerminal,
  outcomesForCollectiveEnd,
  shouldCollectivelyEnd,
} from './focus-room-policy';
describe('Focus Room collective policy', () => {
  it('locks permanently once the shared session leaves the lobby', () => {
    expect(isSharedSessionLocked('lobby')).toBe(false);
    expect(isSharedSessionLocked('active')).toBe(true);
    expect(isSharedSessionLocked('completed')).toBe(true);
    expect(isSharedSessionLocked('ended_early')).toBe(true);
  });
  it('treats completion and collective termination as terminal', () => {
    expect(isSharedSessionTerminal('active')).toBe(false);
    expect(isSharedSessionTerminal('completed')).toBe(true);
    expect(isSharedSessionTerminal('ended_early')).toBe(true);
  });
  it('keeps Casual Room members running when one leaves', () =>
    expect(shouldCollectivelyEnd('casual', true, true, false, false)).toBe(
      false,
    ));
  it('ends an active Commitment Room on intentional leave', () =>
    expect(shouldCollectivelyEnd('commitment', true, true, true, false)).toBe(
      true,
    ));
  it('waits through reconnect grace and respects another active device', () => {
    expect(shouldCollectivelyEnd('commitment', true, false, false, false)).toBe(
      false,
    );
    expect(shouldCollectivelyEnd('commitment', true, false, true, true)).toBe(
      false,
    );
    expect(shouldCollectivelyEnd('commitment', true, false, false, true)).toBe(
      true,
    );
  });
  it('assigns neutral outcomes', () =>
    expect(outcomesForCollectiveEnd(['a', 'b'], 'b')).toEqual({
      a: 'ended_due_to_other_member',
      b: 'collective_end_trigger',
    }));
  it('preserves actual time', () =>
    expect(
      actualMinutes(
        new Date('2026-01-01T00:00:00Z'),
        new Date('2026-01-01T00:22:59Z'),
        50,
      ),
    ).toBe(22));
});
