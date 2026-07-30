import { travelFeasibilityConflict } from './travel-feasibility';
const route = {
  distanceMeters: 10000,
  durationMinutes: 30,
  travelMode: 'driving' as const,
  provider: 'geoapify',
  routeCalculatedAt: '',
  expiresAt: '',
  confidence: 'high' as const,
  fallbackUsed: false,
};
describe('planner travel feasibility', () => {
  it('rejects distant back-to-back tasks with structured details', () =>
    expect(
      travelFeasibilityConflict(
        { id: 'a', title: 'Home work', endTime: '13:00' },
        { id: 'b', title: 'University', startTime: '13:10' },
        route,
      ),
    ).toMatchObject({
      type: 'travel_feasibility_conflict',
      requiredTravelDurationMinutes: 30,
      availableGapMinutes: 10,
      requiredDeparture: '12:40',
    }));
  it('allows a gap large enough for travel', () =>
    expect(
      travelFeasibilityConflict(
        { id: 'a', title: 'A', endTime: '13:00' },
        { id: 'b', title: 'B', startTime: '13:30' },
        route,
      ),
    ).toBeNull());
});
