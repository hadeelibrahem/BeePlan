/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { weatherCondition } from './weather-code';
import type {
  Coordinates,
  WeatherPoint,
  WeatherProvider,
} from './weather-travel.types';

type CacheEntry = { expires: number; value: WeatherPoint[] };
const HOURLY =
  'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,rain,weather_code,visibility,wind_speed_10m,wind_gusts_10m,is_day';

@Injectable()
export class OpenMeteoProvider implements WeatherProvider {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<WeatherPoint[]>>();
  private failures = 0;
  private cooldownUntil = 0;
  constructor(private readonly config: ConfigService) {}

  async getCurrentWeather(input: Coordinates & { timezone: string }) {
    const now = new Date();
    const values = await this.getHourlyForecast({
      ...input,
      startTime: now.toISOString(),
      endTime: new Date(now.getTime() + 3_600_000).toISOString(),
    });
    if (!values[0])
      throw new ServiceUnavailableException(
        'Weather is temporarily unavailable.',
      );
    return values[0];
  }

  async getHourlyForecast(
    input: Coordinates & {
      startTime: string;
      endTime: string;
      timezone: string;
    },
  ) {
    validateCoordinates(input);
    const hour = input.startTime.slice(0, 13);
    const key = `${input.latitude.toFixed(3)}:${input.longitude.toFixed(3)}:${hour}:open-meteo:${HOURLY}`;
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now())
      return cached.value.map((point) => ({ ...point, stale: false }));
    const active = this.inflight.get(key);
    if (active) return active;
    if (Date.now() < this.cooldownUntil)
      throw new ServiceUnavailableException(
        'Weather provider is cooling down.',
      );
    const request = this.fetchForecast(input).finally(() =>
      this.inflight.delete(key),
    );
    this.inflight.set(key, request);
    return request;
  }

  private async fetchForecast(
    input: Coordinates & {
      startTime: string;
      endTime: string;
      timezone: string;
    },
  ): Promise<WeatherPoint[]> {
    const base =
      this.config.get<string>('WEATHER_API_BASE_URL') ??
      'https://api.open-meteo.com';
    const url = new URL('/v1/forecast', base);
    url.searchParams.set('latitude', String(input.latitude));
    url.searchParams.set('longitude', String(input.longitude));
    url.searchParams.set('hourly', HOURLY);
    url.searchParams.set('daily', 'uv_index_max');
    url.searchParams.set('timezone', input.timezone);
    url.searchParams.set('start_date', input.startTime.slice(0, 10));
    url.searchParams.set('end_date', input.endTime.slice(0, 10));
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(
            this.config.get<number>('WEATHER_REQUEST_TIMEOUT_MS') ?? 8000,
          ),
        });
        if (!response.ok) throw new Error(`weather_http_${response.status}`);
        const body = await response.json();
        const fetched = new Date();
        const ttl =
          (this.config.get<number>('WEATHER_CACHE_TTL_MINUTES') ?? 20) * 60_000;
        const expires = new Date(fetched.getTime() + ttl);
        const values: WeatherPoint[] = (body.hourly?.time ?? []).map(
          (time: string, index: number) => ({
            provider: 'open-meteo',
            latitude: input.latitude,
            longitude: input.longitude,
            timezone: body.timezone ?? input.timezone,
            forecastTime: time,
            temperatureC: number(body.hourly.temperature_2m[index]),
            feelsLikeC: number(body.hourly.apparent_temperature[index]),
            weatherCode: number(body.hourly.weather_code[index]),
            condition: weatherCondition(
              number(body.hourly.weather_code[index]),
            ),
            precipitationProbabilityPercent: number(
              body.hourly.precipitation_probability[index],
            ),
            precipitationMm: number(body.hourly.precipitation[index]),
            windSpeedKph: number(body.hourly.wind_speed_10m[index]),
            windGustKph: number(body.hourly.wind_gusts_10m[index]),
            humidityPercent: number(body.hourly.relative_humidity_2m[index]),
            uvIndex: dailyUv(body, time),
            visibilityMeters: number(body.hourly.visibility[index]),
            isDay: Boolean(body.hourly.is_day[index]),
            fetchedAt: fetched.toISOString(),
            expiresAt: expires.toISOString(),
            stale: false,
          }),
        );
        this.failures = 0;
        const cacheKey = `${input.latitude.toFixed(3)}:${input.longitude.toFixed(3)}:${input.startTime.slice(0, 13)}:open-meteo:${HOURLY}`;
        this.cache.set(cacheKey, { expires: expires.getTime(), value: values });
        return values;
      } catch (error) {
        lastError = error;
        if (attempt === 0)
          await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    this.failures++;
    if (this.failures >= 3) this.cooldownUntil = Date.now() + 60_000;
    throw new ServiceUnavailableException(
      `Weather provider unavailable (${errorCode(lastError)}).`,
    );
  }
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function dailyUv(body: any, time: string): number | null {
  const index = body.daily?.time?.indexOf(time.slice(0, 10));
  return index >= 0 ? number(body.daily.uv_index_max[index]) : null;
}
function errorCode(error: unknown) {
  return error instanceof Error && error.name === 'TimeoutError'
    ? 'timeout'
    : 'provider_error';
}
function validateCoordinates(value: Coordinates) {
  if (
    !Number.isFinite(value.latitude) ||
    value.latitude < -90 ||
    value.latitude > 90 ||
    !Number.isFinite(value.longitude) ||
    value.longitude < -180 ||
    value.longitude > 180
  )
    throw new ServiceUnavailableException('Invalid coordinates.');
}
