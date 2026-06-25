import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private pool?: Pool;

  constructor(private readonly configService: ConfigService) {}

  get db() {
    return drizzle(this.getPool(), { schema });
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }

  async healthCheck() {
    const startedAt = Date.now();
    const result = await this.getPool().query<{ connected: number }>(
      'select 1 as connected',
    );

    return {
      ok: result.rows[0]?.connected === 1,
      latencyMs: Date.now() - startedAt,
    };
  }

  private getPool() {
    if (this.pool) {
      return this.pool;
    }

    const databaseUrl = this.configService.get<string>('DATABASE_URL');

    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not configured');
    }

    const dbSsl = this.configService.get<boolean>('DB_SSL') ?? false;
    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: dbSsl ? { rejectUnauthorized: false } : undefined,
    });

    return this.pool;
  }
}
