/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { haversineMeters } from '../social/proximity.util';
import type { RouteEstimate, TravelTimeProvider } from './weather-travel.types';

@Injectable()
export class GeoapifyTravelProvider implements TravelTimeProvider {
  private readonly cache = new Map<string, RouteEstimate>();
  constructor(private readonly config: ConfigService) {}
  async estimateRoute(
    input: Parameters<TravelTimeProvider['estimateRoute']>[0],
  ): Promise<RouteEstimate | null> {
    const key = `${input.origin.latitude.toFixed(4)},${input.origin.longitude.toFixed(4)}:${input.destination.latitude.toFixed(4)},${input.destination.longitude.toFixed(4)}:${input.mode}`;
    const cached = this.cache.get(key);
    if (cached && new Date(cached.expiresAt).getTime() > Date.now())
      return cached;
    const apiKey = this.config.get<string>('GEOAPIFY_API_KEY');
    if (apiKey) {
      try {
        const url = new URL(
          '/v1/routing',
          this.config.get<string>('GEOAPIFY_ROUTING_BASE_URL') ??
            'https://api.geoapify.com',
        );
        url.searchParams.set(
          'waypoints',
          `${input.origin.latitude},${input.origin.longitude}|${input.destination.latitude},${input.destination.longitude}`,
        );
        url.searchParams.set(
          'mode',
          ({ driving: 'drive', walking: 'walk', cycling: 'bicycle' } as const)[
            input.mode
          ],
        );
        url.searchParams.set('apiKey', apiKey);
        const response = await fetch(url, {
          signal: AbortSignal.timeout(
            this.config.get<number>('ROUTING_REQUEST_TIMEOUT_MS') ?? 8000,
          ),
        });
        if (!response.ok) throw new Error('routing_failed');
        const body = await response.json();
        const properties = body.features?.[0]?.properties;
        if (!properties?.distance || !properties?.time)
          throw new Error('routing_empty');
        const result = resultOf(
          Number(properties.distance),
          Math.ceil(Number(properties.time) / 60),
          input.mode,
          'geoapify',
          false,
          'high',
        );
        this.cache.set(key, result);
        return result;
      } catch {
        /* explicit fallback below */
      }
    }
    if (!input.allowFallback) return null;
    const distance = haversineMeters(input.origin, input.destination);
    const speedKph = { driving: 35, walking: 4.5, cycling: 15 }[input.mode];
    const minutes = Math.ceil((distance / 1000 / speedKph) * 60 * 1.2 + 5);
    return resultOf(
      Math.round(distance),
      minutes,
      input.mode,
      'deterministic_fallback',
      true,
      'low',
    );
  }
}
function resultOf(
  distanceMeters: number,
  durationMinutes: number,
  travelMode: any,
  provider: string,
  fallbackUsed: boolean,
  confidence: any,
): RouteEstimate {
  const now = new Date();
  return {
    distanceMeters,
    durationMinutes,
    travelMode,
    provider,
    fallbackUsed,
    confidence,
    routeCalculatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 20 * 60_000).toISOString(),
  };
}
