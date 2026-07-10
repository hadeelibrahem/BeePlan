import { BadRequestException, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../../db/database.service';
import { plannerPreferences } from '../../db/schema';
import { isTime, toMinutes } from './planner.util';
import type { EnergyLevel, PlannerPreferences, TimeWindow } from './planner.types';

type PreferencesRow = typeof plannerPreferences.$inferSelect;

const NOTE_MAX_LENGTH = 1000;
const WORK_BLOCK_RANGE = { min: 15, max: 120 } as const;
const BREAK_RANGE = { min: 5, max: 30 } as const;
const BUFFER_RANGE = { min: 0, max: 60 } as const;
const MAX_DAILY_WORK_RANGE = { min: 60, max: 16 * 60 } as const;
const EMERGENCY_BUFFER_RANGE = { min: 0, max: 180 } as const;
const MAX_UNAVAILABLE_WINDOWS = 12;

export const DEFAULT_PLANNER_PREFERENCES: PlannerPreferences = {
  focusStartTime: '08:00',
  focusEndTime: '11:00',
  workBlockMinutes: 50,
  breakMinutes: 10,
  energy: { morning: 'high', afternoon: 'medium', evening: 'low', night: 'low' },
  scheduleHardTasksInFocus: true,
  finishStartedFirst: true,
  groupSimilarTasks: true,
  bufferBeforeMeetings: true,
  bufferMinutes: 15,
  maxDailyWorkMinutes: 480,
  emergencyBufferMinutes: 30,
  sleep: { start: '23:00', end: '07:00' },
  lunch: { start: '13:00', end: '13:45' },
  unavailableHours: [],
  note: '',
};

/**
 * Loads and persists per-user AI planning preferences. Falls back to sensible
 * defaults when the user has never saved any, so the planner always has a full
 * preferences object to work with.
 */
@Injectable()
export class PlannerPreferencesService {
  constructor(private readonly databaseService: DatabaseService) {}

  async getPreferences(userId: string): Promise<PlannerPreferences> {
    const [row] = await this.databaseService.db
      .select()
      .from(plannerPreferences)
      .where(eq(plannerPreferences.userId, userId))
      .limit(1);
    return row ? rowToPreferences(row) : { ...DEFAULT_PLANNER_PREFERENCES };
  }

  async savePreferences(userId: string, input: unknown): Promise<PlannerPreferences> {
    const preferences = normalizePreferences(input);
    const values = {
      userId,
      focusStartTime: preferences.focusStartTime,
      focusEndTime: preferences.focusEndTime,
      workBlockMinutes: preferences.workBlockMinutes,
      breakMinutes: preferences.breakMinutes,
      energyMorning: preferences.energy.morning,
      energyAfternoon: preferences.energy.afternoon,
      energyEvening: preferences.energy.evening,
      energyNight: preferences.energy.night,
      scheduleHardTasksInFocus: preferences.scheduleHardTasksInFocus,
      finishStartedFirst: preferences.finishStartedFirst,
      groupSimilarTasks: preferences.groupSimilarTasks,
      bufferBeforeMeetings: preferences.bufferBeforeMeetings,
      bufferMinutes: preferences.bufferMinutes,
      maxDailyWorkMinutes: preferences.maxDailyWorkMinutes,
      emergencyBufferMinutes: preferences.emergencyBufferMinutes,
      sleepStartTime: preferences.sleep.start,
      sleepEndTime: preferences.sleep.end,
      lunchStartTime: preferences.lunch.start,
      lunchEndTime: preferences.lunch.end,
      unavailableHours: preferences.unavailableHours,
      note: preferences.note,
      updatedAt: new Date(),
    };

    await this.databaseService.db
      .insert(plannerPreferences)
      .values(values)
      .onConflictDoUpdate({ target: plannerPreferences.userId, set: values });

    return preferences;
  }
}

function rowToPreferences(row: PreferencesRow): PlannerPreferences {
  return {
    focusStartTime: isTime(row.focusStartTime) ? row.focusStartTime : DEFAULT_PLANNER_PREFERENCES.focusStartTime,
    focusEndTime: isTime(row.focusEndTime) ? row.focusEndTime : DEFAULT_PLANNER_PREFERENCES.focusEndTime,
    workBlockMinutes: row.workBlockMinutes,
    breakMinutes: row.breakMinutes,
    energy: {
      morning: normalizeEnergy(row.energyMorning),
      afternoon: normalizeEnergy(row.energyAfternoon),
      evening: normalizeEnergy(row.energyEvening),
      night: normalizeEnergy(row.energyNight),
    },
    scheduleHardTasksInFocus: row.scheduleHardTasksInFocus,
    finishStartedFirst: row.finishStartedFirst,
    groupSimilarTasks: row.groupSimilarTasks,
    bufferBeforeMeetings: row.bufferBeforeMeetings,
    bufferMinutes: row.bufferMinutes,
    maxDailyWorkMinutes: row.maxDailyWorkMinutes ?? DEFAULT_PLANNER_PREFERENCES.maxDailyWorkMinutes,
    emergencyBufferMinutes: row.emergencyBufferMinutes ?? DEFAULT_PLANNER_PREFERENCES.emergencyBufferMinutes,
    sleep: readWindow(row.sleepStartTime, row.sleepEndTime, DEFAULT_PLANNER_PREFERENCES.sleep),
    lunch: readWindow(row.lunchStartTime, row.lunchEndTime, DEFAULT_PLANNER_PREFERENCES.lunch),
    unavailableHours: normalizeWindows(row.unavailableHours),
    note: row.note ?? '',
  };
}

/** A stored window falls back to the default when either bound is missing/invalid. */
function readWindow(start: unknown, end: unknown, fallback: TimeWindow): TimeWindow {
  return isTime(start as string) && isTime(end as string)
    ? { start: start as string, end: end as string }
    : { ...fallback };
}

/**
 * Coerce arbitrary input into a clean list of HH:mm windows. Silently drops
 * entries that are malformed or zero-length so bad data never breaks planning.
 */
function normalizeWindows(value: unknown): TimeWindow[] {
  if (!Array.isArray(value)) return [];
  const windows: TimeWindow[] = [];
  for (const entry of value) {
    if (windows.length >= MAX_UNAVAILABLE_WINDOWS) break;
    const row = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
    const start = row.start;
    const end = row.end;
    if (!isTime(start as string) || !isTime(end as string)) continue;
    if (toMinutes(end as string) <= toMinutes(start as string)) continue; // no midnight-crossing here
    windows.push({ start: start as string, end: end as string });
  }
  return windows;
}

/**
 * Validate + coerce arbitrary input into a full preferences object. Hard rules
 * (focus order, note length) throw; ranges are clamped to reasonable values.
 */
export function normalizePreferences(input: unknown): PlannerPreferences {
  const body = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const defaults = DEFAULT_PLANNER_PREFERENCES;

  const focusStartTime = readTime(body.focusStartTime, defaults.focusStartTime);
  const focusEndTime = readTime(body.focusEndTime, defaults.focusEndTime);
  if (toMinutes(focusStartTime) >= toMinutes(focusEndTime)) {
    throw new BadRequestException('focusStartTime must be before focusEndTime.');
  }

  const note = readString(body.note, defaults.note);
  if (note.length > NOTE_MAX_LENGTH) {
    throw new BadRequestException(`note must be at most ${NOTE_MAX_LENGTH} characters.`);
  }

  const energyInput = body.energy && typeof body.energy === 'object' ? (body.energy as Record<string, unknown>) : {};

  // Sleep may legitimately cross midnight (e.g. 23:00 → 07:00), so we don't
  // require start < end. Lunch is a same-day window and must be ordered. These
  // mirror the nested shape returned by getPreferences (like `energy`).
  const sleepInput = body.sleep && typeof body.sleep === 'object' ? (body.sleep as Record<string, unknown>) : {};
  const lunchInput = body.lunch && typeof body.lunch === 'object' ? (body.lunch as Record<string, unknown>) : {};
  const sleep = readWindow(sleepInput.start, sleepInput.end, defaults.sleep);
  const lunch = readWindow(lunchInput.start, lunchInput.end, defaults.lunch);
  if (toMinutes(lunch.start) >= toMinutes(lunch.end)) {
    throw new BadRequestException('lunch start must be before lunch end.');
  }

  return {
    focusStartTime,
    focusEndTime,
    workBlockMinutes: clampInt(body.workBlockMinutes, defaults.workBlockMinutes, WORK_BLOCK_RANGE),
    breakMinutes: clampInt(body.breakMinutes, defaults.breakMinutes, BREAK_RANGE),
    energy: {
      morning: normalizeEnergy(energyInput.morning, defaults.energy.morning),
      afternoon: normalizeEnergy(energyInput.afternoon, defaults.energy.afternoon),
      evening: normalizeEnergy(energyInput.evening, defaults.energy.evening),
      night: normalizeEnergy(energyInput.night, defaults.energy.night),
    },
    scheduleHardTasksInFocus: readBool(body.scheduleHardTasksInFocus, defaults.scheduleHardTasksInFocus),
    finishStartedFirst: readBool(body.finishStartedFirst, defaults.finishStartedFirst),
    groupSimilarTasks: readBool(body.groupSimilarTasks, defaults.groupSimilarTasks),
    bufferBeforeMeetings: readBool(body.bufferBeforeMeetings, defaults.bufferBeforeMeetings),
    bufferMinutes: clampInt(body.bufferMinutes, defaults.bufferMinutes, BUFFER_RANGE),
    maxDailyWorkMinutes: clampInt(body.maxDailyWorkMinutes, defaults.maxDailyWorkMinutes, MAX_DAILY_WORK_RANGE),
    emergencyBufferMinutes: clampInt(body.emergencyBufferMinutes, defaults.emergencyBufferMinutes, EMERGENCY_BUFFER_RANGE),
    sleep,
    lunch,
    unavailableHours: normalizeWindows(body.unavailableHours),
    note,
  };
}

function readTime(value: unknown, fallback: string): string {
  return typeof value === 'string' && isTime(value) ? value : fallback;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function readBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function clampInt(value: unknown, fallback: number, range: { min: number; max: number }): number {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(num)) return fallback;
  return Math.max(range.min, Math.min(range.max, Math.round(num)));
}

function normalizeEnergy(value: unknown, fallback: EnergyLevel = 'medium'): EnergyLevel {
  return value === 'high' || value === 'medium' || value === 'low' ? value : fallback;
}
