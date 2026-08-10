/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import {
  savedLocations,
  subtasks,
  taskWeatherNotifications,
  tasks,
  userLocationSnapshots,
  users,
  weatherTravelPreferences,
} from '../db/schema';
import { RecurringCommitmentsService } from '../context/recurring-commitments.service';
import { haversineMeters } from '../social/proximity.util';
import { DepartureTimeEngine } from './departure-time.engine';
import { GeoapifyTravelProvider } from './geoapify-travel.provider';
import { OpenMeteoProvider } from './open-meteo.provider';
import { TaskTravelWeatherRecommendationEngine } from './recommendation.engine';
import { zonedDateTime } from './zoned-time';
import type {
  Destination,
  OriginSource,
  TravelMode,
  WeatherPoint,
} from './weather-travel.types';
import { WeatherTravelMessagePolisher } from './message-polisher.service';
import { isHomeOriginCandidate } from './home-origin';

const ACTIVE = ['todo', 'in_progress', 'blocked'];
const DEFAULTS = {
  enabled: false,
  defaultTravelMode: 'driving' as TravelMode,
  homeRadiusMeters: 100,
  preparationBufferMinutes: 10,
  parkingWalkingBufferMinutes: 0,
  uncertaintyBufferMinutes: 5,
  weatherLeadMinutes: 15,
  currentLocationFreshnessMinutes: 30,
  coldThresholdC: 12,
  veryColdThresholdC: 5,
  hotThresholdC: 28,
  extremeHeatThresholdC: 35,
  rainThresholdPercent: 50,
  rainAmountThresholdMm: 0.5,
  windThresholdKph: 35,
  uvThreshold: 6,
  visibilityThresholdMeters: 1000,
  advice: {
    coat: true,
    lightClothing: true,
    umbrella: true,
    hydration: true,
    uv: true,
    wind: true,
    severeWeather: true,
  },
  currentLocationFallbackEnabled: false,
  approximateTravelFallbackEnabled: true,
  aiPolishingEnabled: false,
  language: 'en',
  timezone: 'UTC',
  selectedOriginSavedPlaceId: null as string | null,
};

@Injectable()
export class WeatherTravelService {
  constructor(
    private readonly database: DatabaseService,
    private readonly commitments: RecurringCommitmentsService,
    private readonly weather: OpenMeteoProvider,
    private readonly routing: GeoapifyTravelProvider,
    private readonly departure: DepartureTimeEngine,
    private readonly recommendations: TaskTravelWeatherRecommendationEngine,
    private readonly polisher: WeatherTravelMessagePolisher,
  ) {}
  private get db() {
    return this.database.db;
  }

  async getPreferences(userId: string) {
    const [row, user] = await Promise.all([
      this.db
        .select()
        .from(weatherTravelPreferences)
        .where(eq(weatherTravelPreferences.userId, userId))
        .limit(1),
      this.db
        .select({ timezone: users.timezone })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1),
    ]);
    return row[0]
      ? preferenceEntity(row[0])
      : { ...DEFAULTS, timezone: user[0]?.timezone ?? 'UTC' };
  }

  async updatePreferences(userId: string, input: unknown) {
    const body = validatePreferences(input);
    const values = { ...body, userId, updatedAt: new Date() };
    await this.db
      .insert(weatherTravelPreferences)
      .values(values)
      .onConflictDoUpdate({
        target: weatherTravelPreferences.userId,
        set: values,
      });
    return this.getPreferences(userId);
  }

  async currentWeather(userId: string, query: Record<string, unknown>) {
    await this.assertUser(userId);
    const coordinates = coordinatesFrom(query);
    const timezone =
      stringValue(query.timezone) ||
      (await this.getPreferences(userId)).timezone;
    return this.weather.getCurrentWeather({ ...coordinates, timezone });
  }

  async forecast(userId: string, query: Record<string, unknown>) {
    await this.assertUser(userId);
    const coordinates = coordinatesFrom(query);
    const timezone =
      stringValue(query.timezone) ||
      (await this.getPreferences(userId)).timezone;
    const startTime = requiredIso(query.startTime);
    const endTime = requiredIso(query.endTime);
    return this.weather.getHourlyForecast({
      ...coordinates,
      timezone,
      startTime,
      endTime,
    });
  }

  async previewTask(
    userId: string,
    taskId: string,
    subtaskId?: string,
    assistantContext = false,
  ) {
    const [task] = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
      .limit(1);
    if (!task) throw new NotFoundException('Task not found.');
    let item: any = task;
    if (subtaskId) {
      const [subtask] = await this.db
        .select()
        .from(subtasks)
        .where(and(eq(subtasks.id, subtaskId), eq(subtasks.taskId, taskId)))
        .limit(1);
      if (!subtask) throw new NotFoundException('Subtask not found.');
      item = subtask;
    } else {
      const children = await this.db
        .select({ id: subtasks.id })
        .from(subtasks)
        .where(
          and(
            eq(subtasks.taskId, taskId),
            isNotNull(subtasks.scheduledDate),
            isNotNull(subtasks.scheduledStartTime),
          ),
        );
      if (children.length)
        return ineligible(task, 'scheduled_subtask_is_smallest_execution_unit');
    }
    return this.buildPreview(userId, task, item, subtaskId, assistantContext);
  }

  async schedule(userId: string, taskId: string, subtaskId?: string) {
    const preview = await this.previewTask(userId, taskId, subtaskId);
    if (!preview.eligibility.eligible)
      throw new BadRequestException(
        'reason' in preview.eligibility
          ? preview.eligibility.reason
          : 'Item is not eligible.',
      );
    const values = notificationValues(userId, taskId, subtaskId, preview);
    await this.db
      .update(taskWeatherNotifications)
      .set({
        status: 'invalidated',
        invalidatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(taskWeatherNotifications.userId, userId),
          subtaskId
            ? eq(taskWeatherNotifications.subtaskId, subtaskId)
            : eq(taskWeatherNotifications.taskId, taskId),
          inArray(taskWeatherNotifications.status, [
            'pending',
            'scheduled',
            'failed_retryable',
          ]),
          ne(taskWeatherNotifications.fingerprint, values.fingerprint),
        ),
      );
    const [record] = await this.db
      .insert(taskWeatherNotifications)
      .values(values)
      .onConflictDoNothing()
      .returning();
    return (
      record ??
      (
        await this.db
          .select()
          .from(taskWeatherNotifications)
          .where(eq(taskWeatherNotifications.fingerprint, values.fingerprint))
          .limit(1)
      )[0]
    );
  }

  async cancel(userId: string, taskId: string, subtaskId?: string) {
    await this.previewOwnership(userId, taskId, subtaskId);
    await this.db
      .update(taskWeatherNotifications)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(taskWeatherNotifications.userId, userId),
          subtaskId
            ? eq(taskWeatherNotifications.subtaskId, subtaskId)
            : eq(taskWeatherNotifications.taskId, taskId),
          inArray(taskWeatherNotifications.status, [
            'pending',
            'scheduled',
            'failed_retryable',
          ]),
        ),
      );
    return { cancelled: true };
  }

  async upcoming(userId: string) {
    return this.db
      .select()
      .from(taskWeatherNotifications)
      .where(
        and(
          eq(taskWeatherNotifications.userId, userId),
          inArray(taskWeatherNotifications.status, ['pending', 'scheduled']),
          gt(taskWeatherNotifications.notificationTime, new Date()),
        ),
      )
      .orderBy(taskWeatherNotifications.notificationTime);
  }

  async acknowledge(userId: string, id: string) {
    const [row] = await this.db
      .update(taskWeatherNotifications)
      .set({
        status: 'delivered',
        deliveredAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(taskWeatherNotifications.id, id),
          eq(taskWeatherNotifications.userId, userId),
          ne(taskWeatherNotifications.status, 'delivered'),
        ),
      )
      .returning();
    if (!row)
      throw new NotFoundException(
        'Notification not found or already delivered.',
      );
    return row;
  }

  async invalidateItem(userId: string, taskId: string, subtaskId?: string) {
    await this.db
      .update(taskWeatherNotifications)
      .set({
        status: 'invalidated',
        invalidatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(taskWeatherNotifications.userId, userId),
          subtaskId
            ? eq(taskWeatherNotifications.subtaskId, subtaskId)
            : eq(taskWeatherNotifications.taskId, taskId),
          inArray(taskWeatherNotifications.status, [
            'pending',
            'scheduled',
            'failed_retryable',
          ]),
        ),
      );
  }

  private async buildPreview(
    userId: string,
    task: any,
    item: any,
    subtaskId?: string,
    assistantContext = false,
  ) {
    const preferences = await this.getPreferences(userId);
    const destination = destinationFrom(item.destination);
    const eligibilityReason = eligibility(
      assistantContext ? { ...item, weatherTravelEnabled: true } : item,
      assistantContext ? { ...preferences, enabled: true } : preferences,
      destination,
    );
    if (eligibilityReason) return ineligible(item, eligibilityReason);
    const scheduledStart = zonedDateTime(
      item.scheduledDate,
      item.scheduledStartTime,
      preferences.timezone,
    );
    if (scheduledStart <= new Date())
      return ineligible(item, 'scheduled_time_is_not_future');
    const home = await this.home(userId);
    if (
      home &&
      !isAwayFromHome(destination!, home, preferences.homeRadiusMeters)
    )
      return ineligible(item, 'destination_is_at_home');
    const origin = await this.resolveOrigin(
      userId,
      item.scheduledDate,
      item.scheduledStartTime,
      preferences,
      home,
    );
    const mode = validMode(item.travelMode) ?? preferences.defaultTravelMode;
    const route = origin.coordinates
      ? await this.routing.estimateRoute({
          origin: origin.coordinates,
          destination: destination!,
          mode,
          departureTime: scheduledStart.toISOString(),
          allowFallback: preferences.approximateTravelFallbackEnabled,
        })
      : null;
    const routeUnavailableReason = origin.coordinates
      ? route
        ? undefined
        : 'provider_unavailable' as const
      : 'origin_unavailable' as const;
    const departure = route
      ? this.departure.calculate({
          scheduledDate: item.scheduledDate,
          scheduledStartTime: item.scheduledStartTime,
          timezone: preferences.timezone,
          routeDurationMinutes: route.durationMinutes,
          preparationBufferMinutes: preferences.preparationBufferMinutes,
          parkingWalkingBufferMinutes: preferences.parkingWalkingBufferMinutes,
          uncertaintyBufferMinutes: preferences.uncertaintyBufferMinutes,
        })
      : { scheduledStart, recommendedDeparture: null };
    let notificationTime = this.departure.notificationTime(
      departure.recommendedDeparture,
      scheduledStart,
      preferences.weatherLeadMinutes,
    );
    const now = new Date();
    if (notificationTime <= now) {
      const stillUseful =
        scheduledStart.getTime() - now.getTime() >= 10 * 60_000;
      if (!stillUseful) return ineligible(item, 'notification_window_too_late');
      notificationTime = new Date(now.getTime() + 5_000);
    }
    const forecastTarget = new Date(
      (departure.recommendedDeparture ?? scheduledStart).getTime() +
        (route?.durationMinutes ?? 0) * 60_000,
    );
    let destinationForecast: WeatherPoint | null = null;
    let originForecast: WeatherPoint | null = null;
    const warnings: string[] = [];
    if (routeUnavailableReason) warnings.push(`route_${routeUnavailableReason}`);
    try {
      const points = await this.weather.getHourlyForecast({
        ...destination!,
        timezone: preferences.timezone,
        startTime: new Date(forecastTarget.getTime() - 3_600_000).toISOString(),
        endTime: new Date(scheduledStart.getTime() + 3_600_000).toISOString(),
      });
      destinationForecast = nearestForecast(
        points,
        forecastTarget,
        preferences.timezone,
      );
    } catch {
      warnings.push('weather_unavailable');
    }
    if (origin.coordinates && departure.recommendedDeparture) {
      try {
        const points = await this.weather.getHourlyForecast({
          ...origin.coordinates,
          timezone: preferences.timezone,
          startTime: new Date(
            departure.recommendedDeparture.getTime() - 15 * 60_000,
          ).toISOString(),
          endTime: new Date(
            departure.recommendedDeparture.getTime() + 15 * 60_000,
          ).toISOString(),
        });
        originForecast = nearestForecast(
          points,
          departure.recommendedDeparture,
          preferences.timezone,
        );
      } catch {
        warnings.push('origin_weather_unavailable');
      }
    }
    const recommendation = this.recommendations.recommend({
      title: item.title,
      destinationName: destination!.displayName,
      scheduledStart,
      recommendedDeparture: departure.recommendedDeparture,
      route,
      routeUnavailableReason,
      forecast: destinationForecast,
      thresholds: thresholds(preferences),
      timezone: preferences.timezone,
      language: preferences.language,
      advice: preferences.advice,
    });
    const immutableFacts = Object.fromEntries(
      (
        recommendation.deterministicBody.match(/\d+(?::\d+)?(?:\.\d+)?/g) ?? []
      ).map((fact, index) => [`numericFact${index}`, fact]),
    );
    const polishedMessage = preferences.aiPolishingEnabled
      ? await this.polisher.polish({
          deterministicMessage: recommendation.deterministicBody,
          facts: immutableFacts,
          language: preferences.language,
        })
      : null;
    const scheduleVersion = `${item.updatedAt?.toISOString?.() ?? item.updatedAt}:${item.scheduledDate}:${item.scheduledStartTime}:${item.scheduledEndTime ?? ''}`;
    const fingerprint = hash(
      [
        userId,
        subtaskId ?? task.id,
        scheduleVersion,
        origin.source,
        coordinateHash(origin.coordinates),
        coordinateHash(destination!),
        mode,
        destinationForecast?.forecastTime ?? 'weather-pending',
        recommendation.recommendationTypes.join(','),
        recommendation.deterministicBody,
      ].join('|'),
    );
    return {
      item: {
        taskId: task.id,
        subtaskId: subtaskId ?? null,
        title: item.title,
        scheduledDate: item.scheduledDate,
        scheduledStartTime: item.scheduledStartTime,
        scheduledEndTime: item.scheduledEndTime,
      },
      eligibility: { eligible: true },
      origin,
      destination,
      route,
      routeUnavailableReason,
      scheduledTaskTime: scheduledStart.toISOString(),
      recommendedDepartureTime:
        departure.recommendedDeparture?.toISOString() ?? null,
      notificationTime: notificationTime.toISOString(),
      originForecast,
      destinationForecast,
      recommendations: recommendation,
      deterministicMessage: recommendation.deterministicBody,
      polishedMessage,
      warnings,
      travelFeasibilityConflicts: [],
      scheduleVersion,
      fingerprint,
      timezone: preferences.timezone,
    };
  }

  private async resolveOrigin(
    userId: string,
    date: string,
    startTime: string,
    preferences: any,
    home: Destination | null,
  ) {
    const previous = await this.previousLocation(userId, date, startTime);
    if (previous)
      return {
        source: 'previous_scheduled_location' as OriginSource,
        coordinates: previous,
        summary: { displayName: previous.displayName },
      };
    if (preferences.currentLocationFallbackEnabled) {
      const [snapshot] = await this.db
        .select()
        .from(userLocationSnapshots)
        .where(eq(userLocationSnapshots.userId, userId))
        .limit(1);
      if (
        snapshot &&
        Date.now() - snapshot.capturedAt.getTime() <=
          preferences.currentLocationFreshnessMinutes * 60_000
      )
        return {
          source: 'current_location' as OriginSource,
          coordinates: {
            latitude: Number(snapshot.latitude),
            longitude: Number(snapshot.longitude),
          },
          summary: { displayName: 'Recent current location' },
        };
    }
    if (home)
      return {
        source: 'home' as OriginSource,
        coordinates: home,
        summary: { displayName: home.displayName },
      };
    if (preferences.selectedOriginSavedPlaceId) {
      const place = await this.savedPlace(
        userId,
        preferences.selectedOriginSavedPlaceId,
      );
      if (place)
        return {
          source: 'selected_saved_place' as OriginSource,
          coordinates: place,
          summary: { displayName: place.displayName },
        };
    }
    return {
      source: 'unavailable' as OriginSource,
      coordinates: null,
      summary: null,
    };
  }

  private async previousLocation(
    userId: string,
    date: string,
    startTime: string,
  ): Promise<Destination | null> {
    const [previous] = await this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          eq(tasks.scheduledDate, date),
          lt(tasks.scheduledEndTime, startTime),
          isNotNull(tasks.destination),
          inArray(tasks.status, ACTIVE),
        ),
      )
      .orderBy(desc(tasks.scheduledEndTime))
      .limit(1);
    if (
      previous?.scheduledEndTime &&
      minutesBetween(previous.scheduledEndTime, startTime) <= 360
    )
      return destinationFrom(previous.destination);
    const occurrences = await this.commitments.getOccurrencesForDate(
      userId,
      date,
    );
    const candidate = occurrences
      .filter((item) => item.endTime <= startTime && item.savedLocationId)
      .sort((a, b) => b.endTime.localeCompare(a.endTime))[0];
    return candidate?.savedLocationId
      ? this.savedPlace(userId, candidate.savedLocationId)
      : null;
  }
  private home(userId: string) {
    return this.savedPlaceByCategory(userId, 'home');
  }
  private async savedPlaceByCategory(userId: string, category: string) {
    const normalizedCategory = category.trim().toLowerCase();
    const [row] = await this.db
      .select()
      .from(savedLocations)
      .where(
        and(
          eq(savedLocations.userId, userId),
          or(
            sql`lower(trim(${savedLocations.category})) = ${normalizedCategory}`,
            and(
              or(isNull(savedLocations.category), sql`trim(${savedLocations.category}) = ''`),
              sql`lower(trim(${savedLocations.name})) = ${normalizedCategory}`,
            ),
          ),
        ),
      )
      .limit(1);
    return row && isHomeOriginCandidate(row) ? placeDestination(row) : null;
  }
  private async savedPlace(userId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(savedLocations)
      .where(and(eq(savedLocations.userId, userId), eq(savedLocations.id, id)))
      .limit(1);
    return row ? placeDestination(row) : null;
  }
  private async previewOwnership(
    userId: string,
    taskId: string,
    subtaskId?: string,
  ) {
    const [row] = await this.db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
      .limit(1);
    if (!row) throw new NotFoundException('Task not found.');
    if (subtaskId) {
      const [sub] = await this.db
        .select({ id: subtasks.id })
        .from(subtasks)
        .where(and(eq(subtasks.id, subtaskId), eq(subtasks.taskId, taskId)))
        .limit(1);
      if (!sub) throw new NotFoundException('Subtask not found.');
    }
  }
  private async assertUser(userId: string) {
    const [row] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!row) throw new NotFoundException();
  }
}

export function weatherTravelEligibility(
  item: any,
  preferences: any,
  destination: Destination | null,
) {
  if (!preferences.enabled) return 'feature_disabled';
  if (!item.weatherTravelEnabled) return 'item_assistance_disabled';
  if (!item.scheduledDate || !item.scheduledStartTime)
    return 'missing_schedule';
  if (!destination) return 'missing_destination_coordinates';
  if (!ACTIVE.includes(item.status) || item.isDone) return 'item_not_active';
  return null;
}
const eligibility = weatherTravelEligibility;
export function isAwayFromHome(
  destination: Destination,
  home: Destination,
  radiusMeters: number,
) {
  return haversineMeters(home, destination) > radiusMeters;
}
function ineligible(item: any, reason: string) {
  return {
    item: { id: item.id, title: item.title },
    eligibility: { eligible: false, reason },
    warnings: [],
    travelFeasibilityConflicts: [],
  };
}
function destinationFrom(value: unknown): Destination | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as any;
  const latitude = Number(v.latitude),
    longitude = Number(v.longitude);
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    typeof v.displayName !== 'string' ||
    !v.displayName.trim()
  )
    return null;
  return {
    displayName: v.displayName.trim(),
    address: typeof v.address === 'string' ? v.address : null,
    savedPlaceId: typeof v.savedPlaceId === 'string' ? v.savedPlaceId : null,
    latitude,
    longitude,
  };
}
function placeDestination(row: any): Destination {
  return {
    displayName: row.name,
    address: row.address,
    savedPlaceId: row.id,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
  };
}
function validMode(value: unknown): TravelMode | null {
  return value === 'driving' || value === 'walking' || value === 'cycling'
    ? value
    : null;
}
function minutesBetween(a: string, b: string) {
  const m = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3));
  return m(b) - m(a);
}
function coordinateHash(value: any) {
  return value
    ? `${Number(value.latitude).toFixed(3)},${Number(value.longitude).toFixed(3)}`
    : 'unavailable';
}
function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
function nearestForecast(
  points: WeatherPoint[],
  target: Date,
  timezone: string,
) {
  return points.reduce<WeatherPoint | null>((best, point) => {
    const [date, time] = point.forecastTime.split('T');
    const instant = zonedDateTime(date, time.slice(0, 5), timezone);
    const distance = Math.abs(instant.getTime() - target.getTime());
    if (!best) return point;
    const [bd, bt] = best.forecastTime.split('T');
    return distance <
      Math.abs(
        zonedDateTime(bd, bt.slice(0, 5), timezone).getTime() -
          target.getTime(),
      )
      ? point
      : best;
  }, null);
}
function thresholds(p: any) {
  return {
    cold: Number(p.coldThresholdC),
    veryCold: Number(p.veryColdThresholdC),
    hot: Number(p.hotThresholdC),
    extremeHeat: Number(p.extremeHeatThresholdC),
    rainPercent: p.rainThresholdPercent,
    rainMm: Number(p.rainAmountThresholdMm),
    windKph: Number(p.windThresholdKph),
    uv: Number(p.uvThreshold),
    visibilityMeters: p.visibilityThresholdMeters,
  };
}
function preferenceEntity(row: any) {
  return {
    ...row,
    coldThresholdC: Number(row.coldThresholdC),
    veryColdThresholdC: Number(row.veryColdThresholdC),
    hotThresholdC: Number(row.hotThresholdC),
    extremeHeatThresholdC: Number(row.extremeHeatThresholdC),
    rainAmountThresholdMm: Number(row.rainAmountThresholdMm),
    windThresholdKph: Number(row.windThresholdKph),
    uvThreshold: Number(row.uvThreshold),
  };
}
function validatePreferences(input: unknown) {
  if (!input || typeof input !== 'object')
    throw new BadRequestException('Preferences are required.');
  const value = { ...DEFAULTS, ...(input as any) };
  if (!validMode(value.defaultTravelMode))
    throw new BadRequestException('Invalid travel mode.');
  try {
    new Intl.DateTimeFormat('en', { timeZone: value.timezone }).format();
  } catch {
    throw new BadRequestException('Invalid IANA timezone.');
  }
  for (const key of [
    'homeRadiusMeters',
    'preparationBufferMinutes',
    'parkingWalkingBufferMinutes',
    'uncertaintyBufferMinutes',
    'weatherLeadMinutes',
    'currentLocationFreshnessMinutes',
  ])
    if (!Number.isFinite(Number(value[key])) || Number(value[key]) < 0)
      throw new BadRequestException(`${key} is invalid.`);
  return value;
}
function coordinatesFrom(value: any) {
  const latitude = Number(value.latitude),
    longitude = Number(value.longitude);
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  )
    throw new BadRequestException('Invalid coordinates.');
  return { latitude, longitude };
}
function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}
function requiredIso(value: unknown) {
  const text = stringValue(value);
  if (!text || Number.isNaN(new Date(text).getTime()))
    throw new BadRequestException('Valid startTime and endTime are required.');
  return text;
}
function notificationValues(
  userId: string,
  taskId: string,
  subtaskId: string | undefined,
  p: any,
) {
  return {
    userId,
    taskId,
    subtaskId: subtaskId ?? null,
    fingerprint: p.fingerprint,
    scheduleVersion: p.scheduleVersion,
    originSource: p.origin.source,
    originSummary: p.origin.summary,
    destinationSummary: p.destination,
    scheduledTaskTime: new Date(p.scheduledTaskTime),
    distanceMeters: p.route?.distanceMeters ?? null,
    routeDurationMinutes: p.route?.durationMinutes ?? null,
    travelMode: p.route?.travelMode ?? 'driving',
    fallbackUsed: p.route?.fallbackUsed ?? false,
    recommendedDepartureTime: p.recommendedDepartureTime
      ? new Date(p.recommendedDepartureTime)
      : null,
    notificationTime: new Date(p.notificationTime),
    recommendationTypes: p.recommendations.recommendationTypes,
    deterministicMessage: p.deterministicMessage,
    polishedMessage: p.polishedMessage,
    weatherEvidence: p.destinationForecast,
    payload: p,
    status: 'pending',
  };
}
