import { BadRequestException, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../../db/database.service';
import { plannerPreferences } from '../../db/schema';
import { isTime, toMinutes } from './planner.util';
import type { EnergyLevel, PlannerPreferences } from './planner.types';

type PreferencesRow = typeof plannerPreferences.$inferSelect;

const NOTE_MAX_LENGTH = 1000;
const WORK_BLOCK_RANGE = { min: 15, max: 120 } as const;
const BREAK_RANGE = { min: 5, max: 30 } as const;
const BUFFER_RANGE = { min: 0, max: 60 } as const;

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
    note: row.note ?? '',
  };
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
