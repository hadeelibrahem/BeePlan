/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await */
import { ConfigService } from '@nestjs/config';
import { OpenMeteoProvider } from './open-meteo.provider';
const response = {
  timezone: 'Asia/Hebron',
  hourly: {
    time: ['2026-07-29T14:00'],
    temperature_2m: [10],
    apparent_temperature: [8],
    relative_humidity_2m: [80],
    precipitation_probability: [70],
    precipitation: [1.2],
    rain: [1.2],
    weather_code: [61],
    visibility: [9000],
    wind_speed_10m: [20],
    wind_gusts_10m: [30],
    is_day: [1],
  },
  daily: { time: ['2026-07-29'], uv_index_max: [7] },
};
describe('OpenMeteoProvider', () => {
  afterEach(() => jest.restoreAllMocks());
  it('maps normalized hourly values and deduplicates an in-flight/cache request', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, json: async () => response } as any);
    const provider = new OpenMeteoProvider(
      new ConfigService({
        WEATHER_API_BASE_URL: 'https://api.open-meteo.com',
        WEATHER_CACHE_TTL_MINUTES: 20,
      }),
    );
    const input = {
      latitude: 32.2,
      longitude: 35.2,
      timezone: 'Asia/Hebron',
      startTime: '2026-07-29T11:00:00.000Z',
      endTime: '2026-07-29T13:00:00.000Z',
    };
    const [first, second] = await Promise.all([
      provider.getHourlyForecast(input),
      provider.getHourlyForecast(input),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first[0]).toMatchObject({
      provider: 'open-meteo',
      feelsLikeC: 8,
      precipitationProbabilityPercent: 70,
      precipitationMm: 1.2,
      windSpeedKph: 20,
      uvIndex: 7,
      stale: false,
    });
    expect(second).toEqual(first);
  });
  it('does not expose raw provider failures', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('secret provider detail'));
    const provider = new OpenMeteoProvider(
      new ConfigService({ WEATHER_REQUEST_TIMEOUT_MS: 10 }),
    );
    await expect(
      provider.getHourlyForecast({
        latitude: 32,
        longitude: 35,
        timezone: 'UTC',
        startTime: '2026-07-29T11:00:00Z',
        endTime: '2026-07-29T12:00:00Z',
      }),
    ).rejects.not.toThrow('secret provider detail');
  });
});
