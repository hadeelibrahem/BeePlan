import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { recurringCommitments, savedLocations } from '../db/schema';
import type {
  CreateRecurringCommitmentDto,
  UpdateRecurringCommitmentDto,
} from './dto/recurring-commitment.dto';
import type {
  CommitmentBusyWindow,
  RecurringCommitment,
} from './entities/personal-context.types';

type CommitmentRow = typeof recurringCommitments.$inferSelect;

/**
 * CRUD for a user's recurring weekly commitments, plus the derivation of hard
 * busy windows for a given plan date that the AI planner enforces. Scoped to the
 * authenticated user.
 */
@Injectable()
export class RecurringCommitmentsService {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  async list(userId: string): Promise<RecurringCommitment[]> {
    const rows = await this.db
      .select({
        commitment: recurringCommitments,
        placeName: savedLocations.name,
      })
      .from(recurringCommitments)
      .leftJoin(
        savedLocations,
        eq(recurringCommitments.savedLocationId, savedLocations.id),
      )
      .where(eq(recurringCommitments.userId, userId));

    return rows
      .map((row) => toCommitment(row.commitment, row.placeName ?? null))
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  async create(
    userId: string,
    dto: CreateRecurringCommitmentDto,
  ): Promise<RecurringCommitment> {
    assertTimeOrder(dto.startTime, dto.endTime);
    if (dto.daysOfWeek.length === 0) {
      throw new BadRequestException('Select at least one day of the week.');
    }
    assertDateOrder(dto.startDate ?? null, dto.endDate ?? null);
    const placeName = await this.resolvePlaceName(userId, dto.savedLocationId);

    const [row] = await this.db
      .insert(recurringCommitments)
      .values({
        userId,
        title: dto.title.trim(),
        daysOfWeek: normalizeDays(dto.daysOfWeek),
        startTime: dto.startTime,
        endTime: dto.endTime,
        savedLocationId: dto.savedLocationId ?? null,
        repeatWeekly: dto.repeatWeekly ?? true,
        startDate: dto.startDate ?? null,
        endDate: dto.endDate ?? null,
        isActive: dto.isActive ?? true,
        notes: normalizeOptional(dto.notes),
      })
      .returning();

    return toCommitment(row, placeName);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateRecurringCommitmentDto,
  ): Promise<RecurringCommitment> {
    const [existing] = await this.db
      .select()
      .from(recurringCommitments)
      .where(
        and(
          eq(recurringCommitments.userId, userId),
          eq(recurringCommitments.id, id),
        ),
      )
      .limit(1);
    if (!existing) throw new NotFoundException('Commitment not found.');

    const startTime = dto.startTime ?? existing.startTime;
    const endTime = dto.endTime ?? existing.endTime;
    assertTimeOrder(startTime, endTime);

    const days = dto.daysOfWeek ?? (existing.daysOfWeek as number[]);
    if (Array.isArray(days) && days.length === 0) {
      throw new BadRequestException('Select at least one day of the week.');
    }

    const startDate =
      dto.startDate !== undefined ? dto.startDate : existing.startDate;
    const endDate = dto.endDate !== undefined ? dto.endDate : existing.endDate;
    assertDateOrder(startDate, endDate);

    // Validate a newly-set place belongs to the user (null clears the link).
    const nextPlaceId =
      dto.savedLocationId !== undefined
        ? dto.savedLocationId
        : existing.savedLocationId;
    const placeName = await this.resolvePlaceName(userId, nextPlaceId);

    const [row] = await this.db
      .update(recurringCommitments)
      .set({
        title: dto.title?.trim() ?? existing.title,
        daysOfWeek: normalizeDays(days),
        startTime,
        endTime,
        savedLocationId: nextPlaceId ?? null,
        repeatWeekly: dto.repeatWeekly ?? existing.repeatWeekly,
        startDate: startDate ?? null,
        endDate: endDate ?? null,
        isActive: dto.isActive ?? existing.isActive,
        notes:
          dto.notes !== undefined ? normalizeOptional(dto.notes) : existing.notes,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(recurringCommitments.userId, userId),
          eq(recurringCommitments.id, id),
        ),
      )
      .returning();

    return toCommitment(row, placeName);
  }

  async remove(userId: string, id: string): Promise<void> {
    const [existing] = await this.db
      .select({ id: recurringCommitments.id })
      .from(recurringCommitments)
      .where(
        and(
          eq(recurringCommitments.userId, userId),
          eq(recurringCommitments.id, id),
        ),
      )
      .limit(1);
    if (!existing) throw new NotFoundException('Commitment not found.');
    await this.db
      .delete(recurringCommitments)
      .where(eq(recurringCommitments.id, id));
  }

  /**
   * The hard busy intervals an active commitment contributes on `date`
   * (YYYY-MM-DD). Consumed by the planner's Rule Engine, which turns each into a
   * FixedBlock. Only active commitments whose weekday matches and whose date
   * bounds include `date` are returned.
   */
  async getBusyWindowsForDate(
    userId: string,
    date: string,
  ): Promise<CommitmentBusyWindow[]> {
    const commitments = await this.list(userId);
    return commitmentsToBusyWindows(commitments, date);
  }

  /** All active commitments (used to give the planner/AI awareness context). */
  async getActiveCommitments(userId: string): Promise<RecurringCommitment[]> {
    const all = await this.list(userId);
    return all.filter((commitment) => commitment.isActive);
  }

  private async resolvePlaceName(
    userId: string,
    savedLocationId: string | null | undefined,
  ): Promise<string | null> {
    if (!savedLocationId) return null;
    const [place] = await this.db
      .select({ name: savedLocations.name })
      .from(savedLocations)
      .where(
        and(
          eq(savedLocations.userId, userId),
          eq(savedLocations.id, savedLocationId),
        ),
      )
      .limit(1);
    if (!place) {
      throw new BadRequestException('savedLocationId does not reference one of your saved places.');
    }
    return place.name;
  }
}

// --- Pure helpers (also unit-tested) ---------------------------------------

/**
 * Whether a commitment produces a busy interval on the given calendar date.
 * Rules: active, weekday matches, and the date is inside [startDate, endDate].
 * When repeatWeekly is false the commitment applies only within the 7-day window
 * beginning at startDate (a single, non-recurring run); a false flag with no
 * startDate degrades to the bounded-weekly behavior.
 */
export function commitmentAppliesOn(
  commitment: Pick<
    RecurringCommitment,
    'isActive' | 'daysOfWeek' | 'startDate' | 'endDate' | 'repeatWeekly'
  >,
  date: string,
): boolean {
  if (!commitment.isActive) return false;
  const weekday = weekdayOf(date);
  if (weekday === null) return false;
  if (!commitment.daysOfWeek.includes(weekday)) return false;
  if (commitment.startDate && date < commitment.startDate) return false;
  if (commitment.endDate && date > commitment.endDate) return false;

  if (!commitment.repeatWeekly && commitment.startDate) {
    const start = new Date(`${commitment.startDate}T00:00:00`);
    const target = new Date(`${date}T00:00:00`);
    const diffDays = Math.round(
      (target.getTime() - start.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (diffDays < 0 || diffDays > 6) return false;
  }
  return true;
}

export function commitmentsToBusyWindows(
  commitments: RecurringCommitment[],
  date: string,
): CommitmentBusyWindow[] {
  return commitments
    .filter((commitment) => commitmentAppliesOn(commitment, date))
    .map((commitment) => ({
      commitmentId: commitment.id,
      title: commitment.title,
      start: commitment.startTime,
      end: commitment.endTime,
      placeName: commitment.savedLocationName,
    }));
}

/** Weekday (0=Sun..6=Sat) of a YYYY-MM-DD calendar date, or null if malformed. */
export function weekdayOf(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getDay();
}

function toCommitment(
  row: CommitmentRow,
  placeName: string | null,
): RecurringCommitment {
  return {
    id: row.id,
    title: row.title,
    daysOfWeek: normalizeDays(row.daysOfWeek as unknown),
    startTime: row.startTime,
    endTime: row.endTime,
    savedLocationId: row.savedLocationId ?? null,
    savedLocationName: placeName,
    repeatWeekly: row.repeatWeekly,
    startDate: row.startDate ?? null,
    endDate: row.endDate ?? null,
    isActive: row.isActive,
    notes: row.notes ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function normalizeDays(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const days = value
    .map((entry) => Number(entry))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  return Array.from(new Set(days)).sort((a, b) => a - b);
}

function normalizeOptional(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function assertTimeOrder(start: string, end: string): void {
  if (toMinutes(end) <= toMinutes(start)) {
    throw new BadRequestException('endTime must be after startTime.');
  }
}

function assertDateOrder(
  start: string | null,
  end: string | null,
): void {
  if (start && end && end < start) {
    throw new BadRequestException('endDate must be on or after startDate.');
  }
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
