/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  isAwayFromHome,
  weatherTravelEligibility,
} from './weather-travel.service';
const destination = {
  displayName: 'University',
  latitude: 32.22,
  longitude: 35.26,
};
const item = {
  scheduledDate: '2099-01-01',
  scheduledStartTime: '12:00',
  weatherTravelEnabled: true,
  status: 'todo',
};
describe('weather travel eligibility', () => {
  it('accepts an active future-shaped scheduled item with destination', () =>
    expect(
      weatherTravelEligibility(item, { enabled: true }, destination),
    ).toBeNull());
  it.each([
    ['feature_disabled', { enabled: false }, item, destination],
    [
      'item_assistance_disabled',
      { enabled: true },
      { ...item, weatherTravelEnabled: false },
      destination,
    ],
    [
      'missing_schedule',
      { enabled: true },
      { ...item, scheduledDate: null },
      destination,
    ],
    ['missing_destination_coordinates', { enabled: true }, item, null],
    [
      'item_not_active',
      { enabled: true },
      { ...item, status: 'done' },
      destination,
    ],
    [
      'item_not_active',
      { enabled: true },
      { ...item, status: 'missed' },
      destination,
    ],
  ])('returns %s', (reason, prefs, candidate, location) =>
    expect(weatherTravelEligibility(candidate, prefs, location as any)).toBe(
      reason,
    ),
  );
  it('treats the Home radius boundary as at Home', () => {
    const home = { displayName: 'Home', latitude: 32.22, longitude: 35.26 };
    expect(isAwayFromHome(home, home, 100)).toBe(false);
    expect(isAwayFromHome({ ...destination, latitude: 32.23 }, home, 100)).toBe(
      true,
    );
  });
});
