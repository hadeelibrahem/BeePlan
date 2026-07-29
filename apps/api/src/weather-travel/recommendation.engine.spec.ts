import { TaskTravelWeatherRecommendationEngine } from './recommendation.engine';
import type { WeatherPoint } from './weather-travel.types';

const weather = (overrides: Partial<WeatherPoint> = {}): WeatherPoint => ({
  provider: 'open-meteo',
  latitude: 32,
  longitude: 35,
  timezone: 'Asia/Hebron',
  forecastTime: '2026-07-29T14:00',
  temperatureC: 9,
  feelsLikeC: 8,
  weatherCode: 61,
  condition: 'light rain',
  precipitationProbabilityPercent: 70,
  precipitationMm: 1,
  windSpeedKph: 10,
  windGustKph: 15,
  humidityPercent: 80,
  uvIndex: 2,
  visibilityMeters: 10000,
  isDay: true,
  fetchedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 1000).toISOString(),
  stale: false,
  ...overrides,
});
const thresholds = {
  cold: 12,
  veryCold: 5,
  hot: 28,
  extremeHeat: 35,
  rainPercent: 50,
  rainMm: 0.5,
  windKph: 35,
  uv: 6,
  visibilityMeters: 1000,
};
describe('TaskTravelWeatherRecommendationEngine', () => {
  const engine = new TaskTravelWeatherRecommendationEngine();
  it('combines cold and rain into one deterministic message', () => {
    const result = engine.recommend({
      title: 'presentation',
      destinationName: 'University',
      scheduledStart: new Date('2026-07-29T11:00:00Z'),
      recommendedDeparture: new Date('2026-07-29T10:10:00Z'),
      route: {
        distanceMeters: 10000,
        durationMinutes: 35,
        travelMode: 'driving',
        provider: 'geoapify',
        routeCalculatedAt: '',
        expiresAt: '',
        confidence: 'high',
        fallbackUsed: false,
      },
      forecast: weather(),
      thresholds,
      timezone: 'Asia/Hebron',
      language: 'en',
    });
    expect(result.recommendationTypes).toEqual(
      expect.arrayContaining(['cold_clothing', 'umbrella']),
    );
    expect(result.deterministicBody).toContain('35 minutes');
    expect(result.deterministicBody).toContain('70%');
  });
  it('does not invent weather when forecast is unavailable', () => {
    const result = engine.recommend({
      title: 'appointment',
      destinationName: 'Clinic',
      scheduledStart: new Date('2026-07-29T11:00:00Z'),
      recommendedDeparture: null,
      route: null,
      forecast: null,
      thresholds,
      timezone: 'Asia/Hebron',
      language: 'en',
    });
    expect(result.recommendationTypes).toEqual([]);
    expect(result.deterministicBody).toContain('Travel timing is unavailable');
    expect(result.deterministicBody).not.toContain('forecast');
  });
  it('marks thunderstorms severe without moving the task', () => {
    const result = engine.recommend({
      title: 'class',
      destinationName: 'Campus',
      scheduledStart: new Date(),
      recommendedDeparture: null,
      route: null,
      forecast: weather({ weatherCode: 95 }),
      thresholds,
      timezone: 'UTC',
      language: 'en',
    });
    expect(result.severity).toBe('high');
    expect(result.recommendationTypes).toContain('severe_weather');
  });
});
