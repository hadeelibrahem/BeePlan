import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

@Injectable()
export class DatabaseService implements OnModuleDestroy, OnModuleInit {
  private pool?: Pool;

  constructor(private readonly configService: ConfigService) {}

  get db() {
    return drizzle(this.getPool(), { schema });
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }

  async onModuleInit() {
    await this.ensureUsersAuthColumns();
    await this.ensurePasswordResetCodesTable();
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

  private async ensurePasswordResetCodesTable() {
    await this.getPool().query(`
      create table if not exists password_reset_codes (
        id uuid primary key default gen_random_uuid() not null,
        user_id uuid not null references users(id) on delete cascade,
        code_hash text not null,
        expires_at timestamp not null,
        used_at timestamp,
        created_at timestamp default now() not null
      )
    `);
  }

  private async ensureUsersAuthColumns() {
    await this.getPool().query(`
      alter table users
        add column if not exists auth_provider varchar(40) default 'password' not null,
        add column if not exists google_id varchar(255),
        add column if not exists email_verified boolean default false not null
    `);

    await this.getPool().query(`
      create unique index if not exists users_google_id_unique
        on users (google_id)
        where google_id is not null
    `);
  }
}
