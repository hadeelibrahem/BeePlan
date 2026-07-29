/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await */
import { ConfigService } from '@nestjs/config';
import { GeoapifyTravelProvider } from './geoapify-travel.provider';
describe('GeoapifyTravelProvider', () => {
  afterEach(() => jest.restoreAllMocks());
  it('maps a real provider route and builds /v1/routing from the base URL', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{ properties: { distance: 12000, time: 2100 } }],
      }),
    } as any);
    const provider = new GeoapifyTravelProvider(
      new ConfigService({
        GEOAPIFY_API_KEY: 'secret',
        GEOAPIFY_ROUTING_BASE_URL: 'https://api.geoapify.com',
      }),
    );
    const result = await provider.estimateRoute({
      origin: { latitude: 32, longitude: 35 },
      destination: { latitude: 32.1, longitude: 35.1 },
      mode: 'driving',
      departureTime: '',
      allowFallback: true,
    });
    expect(String((fetch as jest.Mock).mock.calls[0][0])).toContain(
      '/v1/routing',
    );
    expect(result).toMatchObject({
      distanceMeters: 12000,
      durationMinutes: 35,
      fallbackUsed: false,
      confidence: 'high',
    });
  });
  it('labels deterministic fallback low confidence and respects disabled fallback', async () => {
    const provider = new GeoapifyTravelProvider(new ConfigService({}));
    await expect(
      provider.estimateRoute({
        origin: { latitude: 32, longitude: 35 },
        destination: { latitude: 32.1, longitude: 35.1 },
        mode: 'walking',
        departureTime: '',
        allowFallback: true,
      }),
    ).resolves.toMatchObject({ fallbackUsed: true, confidence: 'low' });
    await expect(
      provider.estimateRoute({
        origin: { latitude: 32, longitude: 35 },
        destination: { latitude: 32.1, longitude: 35.1 },
        mode: 'cycling',
        departureTime: '',
        allowFallback: false,
      }),
    ).resolves.toBeNull();
  });
});
