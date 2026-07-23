import { formatMinutes } from './TasksDashboardScreen';

describe('mobile action dashboard helpers', () => {
  it('formats longer tomorrow workloads readably', () => {
    expect(formatMinutes(660)).toBe('11h');
    expect(formatMinutes(90)).toBe('1h 30m');
  });
});
