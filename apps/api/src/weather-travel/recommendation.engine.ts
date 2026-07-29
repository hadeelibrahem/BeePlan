import { Injectable } from '@nestjs/common';
import { localTimeLabel } from './zoned-time';
import type {
  RecommendationType,
  RouteEstimate,
  WeatherPoint,
} from './weather-travel.types';

export type Thresholds = {
  cold: number;
  veryCold: number;
  hot: number;
  extremeHeat: number;
  rainPercent: number;
  rainMm: number;
  windKph: number;
  uv: number;
  visibilityMeters: number;
};
@Injectable()
export class TaskTravelWeatherRecommendationEngine {
  recommend(input: {
    title: string;
    destinationName: string;
    scheduledStart: Date;
    recommendedDeparture: Date | null;
    route: RouteEstimate | null;
    forecast: WeatherPoint | null;
    thresholds: Thresholds;
    timezone: string;
    language: string;
    advice?: Record<string, boolean>;
  }) {
    const types: RecommendationType[] = [];
    const w = input.forecast;
    const t = input.thresholds;
    if (w) {
      if (w.feelsLikeC <= t.veryCold) types.push('very_cold_clothing');
      else if (w.feelsLikeC <= t.cold) types.push('cold_clothing');
      if (w.feelsLikeC >= t.extremeHeat)
        types.push('extreme_heat', 'hydration');
      else if (w.feelsLikeC >= t.hot) types.push('hot_clothing', 'hydration');
      if (
        w.precipitationProbabilityPercent >= t.rainPercent ||
        w.precipitationMm >= t.rainMm
      )
        types.push('umbrella', 'rain_protection');
      if (w.windSpeedKph >= t.windKph) types.push('strong_wind');
      if ((w.uvIndex ?? 0) >= t.uv) types.push('uv_protection');
      if (w.visibilityMeters < t.visibilityMeters) types.push('low_visibility');
      if ([95, 96, 99].includes(w.weatherCode)) types.unshift('severe_weather');
    }
    const unique = [...new Set(types)].filter((type) =>
      adviceEnabled(type, input.advice),
    );
    const start = localTimeLabel(
      input.scheduledStart,
      input.timezone,
      input.language,
    );
    const departure = input.recommendedDeparture
      ? localTimeLabel(
          input.recommendedDeparture,
          input.timezone,
          input.language,
        )
      : null;
    const routeText = input.route
      ? `${input.route.fallbackUsed ? 'approximately ' : 'about '}${input.route.durationMinutes} minutes`
      : null;
    const weatherText = weatherSentence(w, unique);
    const body =
      input.language === 'ar'
        ? arabicBody(input.title, start, departure, routeText, weatherText)
        : `Your ${input.title} starts at ${start}.${routeText && departure ? ` The trip takes ${routeText}, so leave around ${departure}.` : ' Travel timing is unavailable.'}${weatherText ? ` ${weatherText}` : ''}`;
    return {
      recommendationTypes: unique,
      severity: unique.includes('severe_weather')
        ? 'high'
        : unique.length
          ? 'medium'
          : 'info',
      deterministicReason: unique.join(','),
      deterministicTitle: `Travel & weather: ${input.title}`,
      deterministicBody: body,
      weatherEvidence: w,
      validUntil:
        w?.expiresAt ??
        input.route?.expiresAt ??
        new Date(input.scheduledStart.getTime()).toISOString(),
    };
  }
}
function adviceEnabled(
  type: RecommendationType,
  advice?: Record<string, boolean>,
) {
  if (!advice) return true;
  const key: Partial<Record<RecommendationType, string>> = {
    cold_clothing: 'coat',
    very_cold_clothing: 'coat',
    hot_clothing: 'lightClothing',
    extreme_heat: 'lightClothing',
    umbrella: 'umbrella',
    rain_protection: 'umbrella',
    hydration: 'hydration',
    uv_protection: 'uv',
    strong_wind: 'wind',
    severe_weather: 'severeWeather',
  };
  return !key[type] || advice[key[type]] !== false;
}
function weatherSentence(w: WeatherPoint | null, types: RecommendationType[]) {
  if (!w) return '';
  const advice: string[] = [];
  if (types.includes('very_cold_clothing')) advice.push('take a warm coat');
  else if (types.includes('cold_clothing')) advice.push('take a coat');
  if (types.includes('umbrella')) advice.push('take an umbrella');
  if (types.includes('hydration')) advice.push('take water');
  if (types.includes('uv_protection')) advice.push('use sun protection');
  if (types.includes('strong_wind')) advice.push('prepare for strong wind');
  if (types.includes('low_visibility'))
    advice.push('allow extra care for low visibility');
  return `The forecast near your destination may feel like ${Math.round(w.feelsLikeC)}°C${w.precipitationProbabilityPercent ? ` with a ${Math.round(w.precipitationProbabilityPercent)}% chance of rain` : ''}${advice.length ? `—${advice.join(', ')}` : ''}.`;
}
function arabicBody(
  title: string,
  start: string,
  departure: string | null,
  route: string | null,
  weather: string,
) {
  return `موعد ${title} الساعة ${start}.${route && departure ? ` الطريق ${route}، فالأفضل أن تغادر حوالي ${departure}.` : ' وقت السفر غير متاح.'}${weather ? ` ${weather}` : ''}`;
}
