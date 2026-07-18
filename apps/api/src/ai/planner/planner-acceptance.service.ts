import { BadRequestException, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../../db/database.service';
import { plannerAcceptedPlans } from '../../db/schema';
import type { DailyPlan } from './planner.types';

export type PlanAcceptance = {
  date: string;
  plan: DailyPlan;
  acceptedAt: string;
};

/**
 * Persists the plan a user has explicitly accepted for a given day, so
 * "Accept Plan" survives navigation/reload instead of living only in
 * component state.
 */
@Injectable()
export class PlannerAcceptanceService {
  constructor(private readonly databaseService: DatabaseService) {}

  async getAcceptance(
    userId: string,
    date: string,
  ): Promise<PlanAcceptance | null> {
    const [row] = await this.databaseService.db
      .select()
      .from(plannerAcceptedPlans)
      .where(
        and(
          eq(plannerAcceptedPlans.userId, userId),
          eq(plannerAcceptedPlans.date, date),
        ),
      )
      .limit(1);

    if (!row) return null;

    return {
      date: row.date,
      plan: row.plan as DailyPlan,
      acceptedAt: row.acceptedAt.toISOString(),
    };
  }

  async acceptPlan(userId: string, input: unknown): Promise<PlanAcceptance> {
    const body =
      input && typeof input === 'object'
        ? (input as Record<string, unknown>)
        : {};
    const plan = body.plan;

    if (!plan || typeof plan !== 'object') {
      throw new BadRequestException('plan is required.');
    }

    const date = (plan as Record<string, unknown>).date;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('plan.date must be a YYYY-MM-DD string.');
    }

    const acceptedAt = new Date();
    const values = {
      userId,
      date,
      plan,
      acceptedAt,
      updatedAt: acceptedAt,
    };

    await this.databaseService.db
      .insert(plannerAcceptedPlans)
      .values(values)
      .onConflictDoUpdate({
        target: [plannerAcceptedPlans.userId, plannerAcceptedPlans.date],
        set: values,
      });

    return {
      date,
      plan: plan as DailyPlan,
      acceptedAt: acceptedAt.toISOString(),
    };
  }
}
