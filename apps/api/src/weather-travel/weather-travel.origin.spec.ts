import { WeatherTravelService } from './weather-travel.service';

function query(rows: unknown[]) {
  const builder: any = {
    from: () => builder,
    where: () => builder,
    orderBy: () => builder,
    limit: () => Promise.resolve(rows),
  };
  return builder;
}

describe('WeatherTravelService origin resolution', () => {
  it('uses a valid legacy Home row and keeps unrelated names out of the Home path', async () => {
    const home = { id: 'home-1', name: 'home', category: null, address: null, latitude: '32.2366061', longitude: '35.2407483' };
    const db = { select: jest.fn().mockReturnValueOnce(query([home])).mockReturnValueOnce(query([])) };
    const service = Object.create(WeatherTravelService.prototype) as any;
    service.database = { db };
    service.commitments = { getOccurrencesForDate: jest.fn().mockResolvedValue([]) };

    const resolvedHome = await service.home('user-1');
    expect(resolvedHome).toMatchObject({ displayName: 'home', latitude: 32.2366061, longitude: 35.2407483 });
    const origin = await service.resolveOrigin('user-1', '2026-08-09', '10:00', { currentLocationFallbackEnabled: false, selectedOriginSavedPlaceId: null }, resolvedHome);
    expect(origin).toMatchObject({ source: 'home', coordinates: { latitude: 32.2366061, longitude: 35.2407483 } });
  });
});
