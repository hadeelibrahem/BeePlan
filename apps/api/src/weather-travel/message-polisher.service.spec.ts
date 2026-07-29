import { preservesFacts } from './message-polisher.service';
describe('weather message polishing safeguards', () => {
  const facts = {
    route: 35,
    departure: '13:10',
    rain: 70,
    fallbackUsed: false,
  };
  it('accepts output that preserves immutable numeric facts', () =>
    expect(
      preservesFacts('Trip 35 minutes. Leave 13:10. Rain chance 70%.', facts),
    ).toBe(true));
  it('rejects altered or omitted numeric facts', () =>
    expect(preservesFacts('Trip 30 minutes. Leave 13:15.', facts)).toBe(false));
});
