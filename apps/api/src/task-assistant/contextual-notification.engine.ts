import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import type { TaskAssistantPreferences } from './task-assistant.types';
import type { TimelineDraft } from './context-timeline.engine';

export const NOTIFICATION_POLICY = {
  smart: 3,
  minimal: 2,
  important_only: 3,
} as const;
export type ContextNotificationDraft = {
  notificationType: string;
  title: string;
  body: string;
  scheduledAt: Date;
  priority: string;
  fingerprint: string;
};

type WeatherTravelEvidence = {
  item?: { title?: string };
  route?: { durationMinutes?: number; fallbackUsed?: boolean } | null;
  recommendedDepartureTime?: string | null;
  notificationTime?: string;
  scheduledTaskTime?: string;
  recommendations?: {
    recommendationTypes?: string[];
    weatherEvidence?: {
      feelsLikeC?: number;
      precipitationProbabilityPercent?: number;
    } | null;
  };
  deterministicMessage?: string;
};

@Injectable()
export class ContextualNotificationEngine {
  generate(
    userId: string,
    taskId: string,
    scheduleVersion: string,
    stages: TimelineDraft[],
    preferences: TaskAssistantPreferences,
    weatherTravel?: WeatherTravelEvidence | null,
  ): ContextNotificationDraft[] {
    if (
      preferences.enabled === false ||
      !preferences.contextualNotificationsEnabled ||
      !preferences.proactiveAssistanceEnabled
    )
      return [];
    const eligible = stages
      .filter(
        (stage): stage is TimelineDraft & { scheduledAt: Date } =>
          stage.status === 'pending' && Boolean(stage.scheduledAt),
      )
      .filter(
        (stage) =>
          (preferences.departureRemindersEnabled !== false || stage.stageType !== 'departure') &&
          (preferences.notificationMode !== 'important_only' ||
            ['critical', 'high'].includes(stage.priority)),
      )
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

    const weather = weatherTravel && weatherTravel.notificationTime
      ? weatherTravel
      : null;
    const recommendationTypes = filterWeatherTypes(
      weather?.recommendations?.recommendationTypes ?? [],
      preferences,
    );
    const hasWeatherAdvice = preferences.weatherAdviceEnabled !== false && recommendationTypes.length > 0;
    const hasTravelAdvice = preferences.travelAdviceEnabled !== false && Boolean(weather?.route);
    const hasDeparture = preferences.departureRemindersEnabled !== false && Boolean(weather?.recommendedDepartureTime);
    const weatherEventAt = weather?.notificationTime ? new Date(weather.notificationTime) : null;
    const weatherEvent = hasWeatherAdvice || hasTravelAdvice || hasDeparture;

    const drafts = eligible.filter((stage) => {
      if (weatherEvent && hasDeparture && stage.stageType === 'departure') return false;
      return true;
    });

    if (weather && weatherEvent && weatherEventAt && !Number.isNaN(weatherEventAt.getTime())) {
      const body = buildWeatherTravelBody(
        weather,
        recommendationTypes,
        hasWeatherAdvice,
        hasTravelAdvice,
        hasDeparture,
      );
      if (body) {
        drafts.push({
          stageType: 'departure',
          title: body,
          description: body,
          scheduledAt: weatherEventAt,
          dueAt: weatherEventAt,
          priority: recommendationTypes.includes('severe_weather') ? 'critical' : hasDeparture ? 'high' : 'medium',
          triggerReason: 'Unified Task Assistant weather, travel, and departure decision.',
          status: 'pending',
          fingerprint: createHash('sha256').update(`${userId}|${taskId}|${scheduleVersion}|weather_travel|${weatherEventAt.toISOString()}`).digest('hex'),
        });
      }
    }

    return drafts
      .filter((stage) =>
        preferences.notificationMode !== 'important_only' ||
        ['critical', 'high'].includes(stage.priority),
      )
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
      .slice(0, NOTIFICATION_POLICY[preferences.notificationMode])
      .map((stage) => ({
      notificationType: stage.stageType,
      title: 'Task Assistant',
      body: stage.title,
      scheduledAt: stage.scheduledAt,
      priority: stage.priority,
      fingerprint: createHash('sha256')
        .update(
          `${userId}|${taskId}|${scheduleVersion}|${stage.stageType}|${stage.scheduledAt.toISOString()}`,
        )
        .digest('hex'),
      }));
  }
}

function buildWeatherTravelBody(
  weather: WeatherTravelEvidence,
  recommendationTypes: string[],
  includeWeather: boolean,
  includeTravel: boolean,
  includeDeparture: boolean,
) {
  if (!includeWeather && !includeTravel && !includeDeparture) return null;
  if (includeWeather && includeTravel && weather.deterministicMessage)
    return includeDeparture
      ? `${weather.deterministicMessage} This is your Task Assistant departure reminder.`
      : weather.deterministicMessage;
  const title = weather.item?.title ?? 'your task';
  const parts: string[] = [];
  if (includeDeparture) parts.push(`Leave in time for ${title}.`);
  if (includeTravel && weather.route?.durationMinutes)
    parts.push(`Travel takes about ${weather.route.durationMinutes} minutes${weather.route.fallbackUsed ? ' approximately' : ''}.`);
  if (includeWeather) {
    const evidence = weather.recommendations?.weatherEvidence;
    const rain = evidence?.precipitationProbabilityPercent;
    parts.push(`Weather advice: ${recommendationTypesLabel(recommendationTypes)}${rain ? ` with a ${Math.round(rain)}% chance of rain` : ''}.`);
  }
  return parts.join(' ');
}

function filterWeatherTypes(
  types: string[],
  preferences: TaskAssistantPreferences,
) {
  return types.filter((type) => {
    if (['cold_clothing', 'very_cold_clothing', 'hot_clothing'].includes(type))
      return preferences.clothingAdviceEnabled !== false;
    if (['umbrella', 'rain_protection'].includes(type))
      return preferences.umbrellaAdviceEnabled !== false;
    if (['hydration', 'extreme_heat'].includes(type))
      return preferences.hydrationAdviceEnabled !== false;
    return true;
  });
}

function recommendationTypesLabel(types: string[]) {
  const labels: Record<string, string> = {
    umbrella: 'take an umbrella',
    rain_protection: 'take rain protection',
    cold_clothing: 'take a coat',
    very_cold_clothing: 'take warm layers',
    hot_clothing: 'wear light clothing',
    extreme_heat: 'prepare for extreme heat and take water',
    hydration: 'take water',
    strong_wind: 'prepare for strong wind',
    low_visibility: 'allow extra care for low visibility',
    severe_weather: 'take care because severe weather is expected',
    uv_protection: 'use sun protection',
  };
  return [...new Set(types)].map((type) => labels[type] ?? type.replaceAll('_', ' ')).join(', ');
}
