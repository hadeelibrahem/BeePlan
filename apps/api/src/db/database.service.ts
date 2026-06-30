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
    await this.ensureRemindersTable();
    await this.ensureGoogleLoginApprovalsTable();
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

  private async ensureRemindersTable() {
    await this.getPool().query(`
      create table if not exists reminders (
        id uuid primary key default gen_random_uuid() not null,
        user_id uuid references users(id) on delete cascade,
        title varchar(255) not null,
        type varchar(30) not null default 'time',
        repeat varchar(20) not null default 'none',
        priority varchar(20) not null default 'medium',
        status varchar(20) not null default 'active',
        created_at timestamp default now() not null,
        updated_at timestamp default now() not null
      )
    `);

    // Older deployments may have created `reminders` with a stricter shape
    // (NOT NULL user_id, no auth-guard wiring exists yet to populate it) and
    // different column names. These statements bring any existing table up
    // to the current shape without dropping data.
    await this.getPool().query(`
      alter table reminders
        add column if not exists type varchar(30) default 'time' not null,
        add column if not exists repeat varchar(20) default 'none' not null,
        add column if not exists trigger_date_time timestamp,
        add column if not exists reminder_before integer,
        add column if not exists repeat_interval integer,
        add column if not exists repeat_days_of_week jsonb,
        add column if not exists repeat_end_date timestamp,
        add column if not exists notes text,
        add column if not exists location jsonb,
        add column if not exists context jsonb,
        add column if not exists checklist_items jsonb,
        add column if not exists updated_at timestamp default now() not null,
        alter column user_id drop not null,
        drop column if exists description,
        drop column if exists reminder_type,
        drop column if exists remind_at,
        drop column if exists task_id
    `);
  }

  private async ensureGoogleLoginApprovalsTable() {
    await this.getPool().query(`
      create table if not exists google_login_approvals (
        id uuid primary key default gen_random_uuid() not null,
        token_hash text not null unique,
        poll_token_hash text,
        google_id varchar(255) not null,
        email varchar(255) not null,
        full_name varchar(255) not null,
        avatar_url text,
        email_verified boolean default true not null,
        oauth_state text,
        decision varchar(20) default 'pending' not null,
        expires_at timestamp not null,
        used_at timestamp,
        session_claimed_at timestamp,
        created_at timestamp default now() not null
      )
    `);

    await this.getPool().query(`
      alter table google_login_approvals
        add column if not exists poll_token_hash text,
        add column if not exists session_claimed_at timestamp
    `);

    await this.getPool().query(`
      update google_login_approvals
        set poll_token_hash = token_hash
        where poll_token_hash is null
    `);

    await this.getPool().query(`
      alter table google_login_approvals
        alter column poll_token_hash set not null
    `);

    await this.getPool().query(`
      create unique index if not exists google_login_approvals_poll_token_hash_unique
        on google_login_approvals (poll_token_hash)
    `);

    await this.getPool().query(`
      create index if not exists google_login_approvals_email_created_at_idx
        on google_login_approvals (email, created_at desc)
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
