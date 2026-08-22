import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql, eq, count } from 'drizzle-orm';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseService } from '../../db/database.service';
import { pushNotificationJobs } from '../../db/schema';
import {
  RuntimeTelemetryRegistry,
  runtimeTelemetry,
} from './runtime-telemetry.registry';

export type HealthStatus =
  | 'healthy'
  | 'degraded'
  | 'unavailable'
  | 'unknown'
  | 'unconfigured';
export type HealthCriticality = 'critical' | 'important' | 'optional';
export type HealthService = {
  id: string;
  name: string;
  category: string;
  criticality: HealthCriticality;
  status: HealthStatus;
  message: string;
  lastCheckedAt: string;
  lastSuccessAt?: string | null;
  latencyMs?: number | null;
  metadata?: Record<string, string | number | boolean | null>;
};

export function overallHealth(
  services: HealthService[],
): 'operational' | 'degraded' | 'major_outage' | 'unknown' {
  if (
    services.some(
      (service) =>
        service.criticality === 'critical' && service.status === 'unavailable',
    )
  )
    return 'major_outage';
  if (
    services.some(
      (service) =>
        (service.status === 'degraded' ||
          service.status === 'unavailable' ||
          service.status === 'unknown') &&
        service.criticality !== 'optional',
    )
  )
    return 'degraded';
  if (
    services.some(
      (service) =>
        service.criticality !== 'optional' && service.status === 'unknown',
    )
  )
    return 'unknown';
  return 'operational';
}

const nowIso = () => new Date().toISOString();
const service = (
  input: Omit<HealthService, 'lastCheckedAt'>,
): HealthService => ({ ...input, lastCheckedAt: nowIso() });

@Injectable()
export class SystemHealthService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly config: ConfigService,
    private readonly telemetry: RuntimeTelemetryRegistry = runtimeTelemetry,
  ) {}

  private async migrationStatus() {
    try {
      const journalPath = [
        join(process.cwd(), 'drizzle/meta/_journal.json'),
        join(process.cwd(), 'apps/api/drizzle/meta/_journal.json'),
      ].find(existsSync);
      if (!journalPath)
        return {
          status: 'unknown' as const,
          message: 'Migration journal is unavailable.',
          metadata: undefined,
        };
      const expected = JSON.parse(readFileSync(journalPath, 'utf8'))?.entries
        ?.length;
      if (!Number.isInteger(expected))
        return {
          status: 'unknown' as const,
          message: 'Migration journal could not be verified.',
          metadata: undefined,
        };
      const result = await this.databaseService.db.execute(
        sql`select count(*)::int as count from drizzle.__drizzle_migrations`,
      );
      const applied = Number(
        (result.rows[0] as { count?: number } | undefined)?.count,
      );
      if (!Number.isFinite(applied))
        return {
          status: 'unknown' as const,
          message: 'Applied migration state could not be verified.',
          metadata: undefined,
        };
      return applied >= expected
        ? {
            status: 'healthy' as const,
            message: 'Database migrations are up to date.',
            metadata: {
              appliedMigrations: applied,
              expectedMigrations: expected,
            },
          }
        : {
            status: 'degraded' as const,
            message: 'Database migration state requires attention.',
            metadata: {
              appliedMigrations: applied,
              expectedMigrations: expected,
            },
          };
    } catch {
      return {
        status: 'unknown' as const,
        message: 'Database migration state could not be verified.',
        metadata: undefined,
      };
    }
  }

  async getHealth() {
    const checkedAt = nowIso();
    const services: HealthService[] = [];
    const dbStarted = Date.now();
    try {
      await this.databaseService.db.execute(sql`select 1`);
      services.push(
        service({
          id: 'database',
          name: 'Database',
          category: 'Core Services',
          criticality: 'critical',
          status: 'healthy',
          message: 'Database connection is responding.',
          latencyMs: Date.now() - dbStarted,
        }),
      );
    } catch {
      services.push(
        service({
          id: 'database',
          name: 'Database',
          category: 'Core Services',
          criticality: 'critical',
          status: 'unavailable',
          message: 'Database connection is unavailable.',
          latencyMs: Date.now() - dbStarted,
        }),
      );
    }
    const schema = await this.migrationStatus();
    services.push(
      service({
        id: 'api',
        name: 'BeePlan API',
        category: 'Core Services',
        criticality: 'critical',
        status: 'healthy',
        message: 'API process is running.',
        metadata: {
          environment: this.config.get<string>('NODE_ENV') ?? 'development',
          uptimeSeconds: Math.floor(process.uptime()),
        },
      }),
    );

    let pending = 0;
    let failed = 0;
    try {
      const rows = await this.databaseService.db
        .select({ status: pushNotificationJobs.status, total: count() })
        .from(pushNotificationJobs)
        .groupBy(pushNotificationJobs.status);
      for (const row of rows) {
        if (row.status === 'pending') pending = Number(row.total);
        if (row.status === 'failed') failed = Number(row.total);
      }
    } catch {
      failed = -1;
    }
    services.push(
      service({
        id: 'push',
        name: 'Push Notifications',
        category: 'Product Services',
        criticality: 'important',
        status: failed < 0 ? 'unknown' : failed > 0 ? 'degraded' : 'healthy',
        message:
          failed < 0
            ? 'Push queue status is unavailable.'
            : failed > 0
              ? `${failed} failed notification jobs require attention.`
              : 'No failed notification jobs.',
        metadata:
          failed < 0 ? undefined : { pendingJobs: pending, failedJobs: failed },
      }),
    );

    const aiConfigured = Boolean(
      this.config.get<string>('QWEN_API_KEY') &&
      this.config.get<string>('QWEN_BASE_URL') &&
      this.config.get<string>('QWEN_MODEL'),
    );
    services.push(
      service({
        id: 'ai',
        name: 'Qwen AI',
        category: 'Product Services',
        criticality: 'optional',
        status: !aiConfigured
          ? 'unconfigured'
          : !this.telemetry.provider('qwen')?.lastSuccessAt &&
              !this.telemetry.provider('qwen')?.lastFailureAt
            ? 'unknown'
            : this.telemetry.provider('qwen')?.consecutiveFailures
              ? 'degraded'
              : 'healthy',
        message: aiConfigured
          ? this.telemetry.provider('qwen')?.consecutiveFailures
            ? 'Recent provider failures detected.'
            : this.telemetry.provider('qwen')?.lastSuccessAt
              ? 'Recent provider call succeeded.'
              : 'Configured; no provider call has been recorded.'
          : 'AI provider is not configured.',
      }),
    );
    const emailConfigured = Boolean(
      this.config.get<string>('RESEND_API_KEY') &&
      this.config.get<string>('EMAIL_FROM'),
    );
    services.push(
      service({
        id: 'email',
        name: 'Email Delivery',
        category: 'Product Services',
        criticality: 'optional',
        status: !emailConfigured
          ? 'unconfigured'
          : !this.telemetry.provider('email')?.lastSuccessAt &&
              !this.telemetry.provider('email')?.lastFailureAt
            ? 'unknown'
            : this.telemetry.provider('email')?.consecutiveFailures
              ? 'degraded'
              : 'healthy',
        message: emailConfigured
          ? this.telemetry.provider('email')?.consecutiveFailures
            ? 'Recent provider delivery failures detected.'
            : this.telemetry.provider('email')?.lastSuccessAt
              ? 'Recent delivery submission succeeded.'
              : 'Configured; no delivery submission has been recorded.'
          : 'Email provider is not configured.',
      }),
    );
    for (const worker of [
      ['notification-scheduler', 'Notification Scheduler'],
      ['task-context-worker', 'Task Context Notification Worker'],
      ['weather-travel-worker', 'Weather/Travel Worker'],
      ['challenge-worker', 'Community Challenges Worker'],
    ])
      services.push(
        service({
          id: worker[0],
          name: worker[1],
          category: 'Background Workers',
          criticality: 'important',
          status: !this.telemetry.worker(worker[0])
            ? 'unknown'
            : this.telemetry.worker(worker[0])?.consecutiveFailures
              ? 'degraded'
              : 'healthy',
          message: !this.telemetry.worker(worker[0])
            ? 'No worker execution has been recorded since this process started.'
            : this.telemetry.worker(worker[0])?.consecutiveFailures
              ? 'Recent worker failures detected.'
              : 'Recent worker execution succeeded.',
        }),
      );
    services.push(
      service({
        id: 'database-schema',
        name: 'Database Schema',
        category: 'Core Services',
        criticality: 'critical',
        status: schema.status,
        message: schema.message,
        metadata: schema.metadata,
      }),
    );
    const healthy = services.filter((item) => item.status === 'healthy').length;
    const degraded = services.filter(
      (item) => item.status === 'degraded',
    ).length;
    const unavailable = services.filter(
      (item) => item.status === 'unavailable',
    ).length;
    const unknown = services.filter(
      (item) => item.status === 'unknown' || item.status === 'unconfigured',
    ).length;
    return {
      overallStatus: overallHealth(services),
      checkedAt,
      summary: {
        healthy,
        degraded,
        unavailable,
        unknown,
        lastCheckedAt: checkedAt,
      },
      services,
      workers: services.filter(
        (item) => item.category === 'Background Workers',
      ),
      recentIssues:
        failed > 0
          ? [
              {
                title: 'Push notification failures',
                message: `${failed} failed notification jobs require attention.`,
                status: 'degraded',
                targetUrl: '/admin/dashboard',
              },
            ]
          : [],
    };
  }
}
