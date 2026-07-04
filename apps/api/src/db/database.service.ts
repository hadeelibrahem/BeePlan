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
    await this.ensureTasksTables();
    await this.ensureRemindersTable();
    await this.ensureGoogleLoginApprovalsTable();
    await this.ensureStandaloneNotesTable();
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
        add column if not exists is_orphaned boolean default false not null,
        alter column user_id drop not null,
        drop column if exists description,
        drop column if exists reminder_type,
        drop column if exists remind_at,
        drop column if exists task_id
    `);

    // Keep the orphaned flag in sync with reality on every boot. This never
    // deletes or reassigns rows - it only flips a boolean marker so orphaned
    // reminders (no owning user) are visible to admin tooling instead of
    // silently sitting in the table unexplained. See
    // scripts/list-orphaned-reminders.js for the reporting/reassignment tool.
    await this.getPool().query(`
      update reminders
      set is_orphaned = (user_id is null)
      where is_orphaned is distinct from (user_id is null)
    `);

    const { rows: orphanedCountRows } = await this.getPool().query<{
      count: string;
    }>('select count(*) from reminders where user_id is null');
    const orphanedCount = Number(orphanedCountRows[0]?.count ?? 0);
    if (orphanedCount > 0) {
      console.warn(
        `[DatabaseService] ${orphanedCount} reminder(s) have no owning user (user_id IS NULL). ` +
          'They are flagged via is_orphaned and hidden from all user-facing queries, but not deleted. ' +
          'Run `node apps/api/scripts/list-orphaned-reminders.js` to review or reassign them.',
      );
    }
  }

  private async ensureTasksTables() {
    await this.getPool().query(`
      create table if not exists tasks (
        id uuid primary key default gen_random_uuid() not null,
        user_id uuid not null references users(id) on delete cascade,
        title varchar(255) not null,
        description text,
        priority varchar(20) not null default 'medium',
        status varchar(20) not null default 'todo',
        progress integer not null default 0,
        due_date timestamp,
        due_time varchar(20),
        category_id uuid references categories(id) on delete set null,
        category varchar(120),
        notes text,
        estimated_time_minutes integer not null default 0,
        spent_time_minutes integer not null default 0,
        remaining_time_minutes integer not null default 0,
        reminder_enabled boolean not null default false,
        reminder_before_minutes integer,
        labels jsonb,
        attachments jsonb,
        is_favorite boolean not null default false,
        is_focus_task boolean not null default false,
        created_at timestamp default now() not null,
        updated_at timestamp default now() not null
      )
    `);

    await this.getPool().query(`
      alter table tasks
        add column if not exists progress integer not null default 0,
        add column if not exists due_time varchar(20),
        add column if not exists category varchar(120),
        add column if not exists notes text,
        add column if not exists estimated_time_minutes integer not null default 0,
        add column if not exists spent_time_minutes integer not null default 0,
        add column if not exists remaining_time_minutes integer not null default 0,
        add column if not exists reminder_enabled boolean not null default false,
        add column if not exists reminder_before_minutes integer,
        add column if not exists labels jsonb,
        add column if not exists attachments jsonb,
        add column if not exists is_favorite boolean not null default false,
        add column if not exists is_focus_task boolean not null default false,
        add column if not exists updated_at timestamp default now() not null,
        add column if not exists recurrence_root_id uuid references tasks(id) on delete set null
    `);

    await this.getPool().query(`
      create index if not exists tasks_recurrence_root_id_idx
        on tasks (recurrence_root_id)
    `);

    await this.getPool().query(`
      create table if not exists task_attachments (
        id uuid primary key default gen_random_uuid() not null,
        task_id uuid not null references tasks(id) on delete cascade,
        user_id uuid not null references users(id) on delete cascade,
        file_name varchar(255) not null,
        storage_key text not null,
        mime_type varchar(120) not null,
        size_bytes integer not null,
        created_at timestamp default now() not null
      )
    `);

    await this.getPool().query(`
      create index if not exists task_attachments_task_id_idx
        on task_attachments (task_id)
    `);

    await this.getPool().query(`
      create table if not exists subtasks (
        id uuid primary key default gen_random_uuid() not null,
        task_id uuid not null references tasks(id) on delete cascade,
        title varchar(255) not null,
        is_done boolean not null default false,
        order_index integer not null default 0,
        assignee varchar(80),
        due_date timestamp,
        status varchar(30) not null default 'todo',
        created_at timestamp default now() not null,
        updated_at timestamp default now() not null
      )
    `);

    await this.getPool().query(`
      alter table subtasks
        add column if not exists assignee varchar(80),
        add column if not exists due_date timestamp,
        add column if not exists status varchar(30) not null default 'todo',
        add column if not exists created_at timestamp default now() not null,
        add column if not exists updated_at timestamp default now() not null
    `);

    await this.getPool().query(`
      create table if not exists task_dependencies (
        task_id uuid not null references tasks(id) on delete cascade,
        dependency_task_id uuid not null references tasks(id) on delete cascade,
        created_at timestamp default now() not null,
        primary key (task_id, dependency_task_id)
      )
    `);

    await this.getPool().query(`
      create table if not exists task_recurrence_rules (
        id uuid primary key default gen_random_uuid() not null,
        task_id uuid not null unique references tasks(id) on delete cascade,
        frequency varchar(20) not null default 'Never',
        weekdays jsonb,
        monthly_mode varchar(30),
        custom_interval integer not null default 1,
        custom_unit varchar(20) not null default 'weeks',
        end_type varchar(20) not null default 'never',
        end_date date,
        occurrences integer,
        created_at timestamp default now() not null,
        updated_at timestamp default now() not null
      )
    `);

    await this.getPool().query(`
      create table if not exists task_activities (
        id uuid primary key default gen_random_uuid() not null,
        task_id uuid not null references tasks(id) on delete cascade,
        user_id uuid not null references users(id) on delete cascade,
        action varchar(80) not null,
        description text not null,
        metadata jsonb,
        created_at timestamp default now() not null
      )
    `);

    await this.getPool().query(`
      create index if not exists tasks_user_id_updated_at_idx
        on tasks (user_id, updated_at desc)
    `);

    // Powers the task filtering sidebar: priority ("High Priority" quick
    // filter), category (Categories panel + counts), is_focus_task ("Focus
    // Tasks" quick filter), and reminder_enabled ("Has Reminder" filter).
    await this.getPool().query(`
      create index if not exists idx_tasks_priority on tasks (priority)
    `);
    await this.getPool().query(`
      create index if not exists idx_tasks_category on tasks (category)
    `);
    await this.getPool().query(`
      create index if not exists idx_tasks_focus on tasks (is_focus_task)
    `);
    await this.getPool().query(`
      create index if not exists idx_tasks_reminder_enabled on tasks (reminder_enabled)
    `);

    await this.getPool().query(`
      create index if not exists subtasks_task_id_order_idx
        on subtasks (task_id, order_index asc)
    `);
  }

  private async ensureStandaloneNotesTable() {
    await this.getPool().query(`
      create table if not exists standalone_notes (
        id uuid primary key default gen_random_uuid() not null,
        user_id uuid not null references users(id) on delete cascade,
        title varchar(255) not null,
        content text,
        created_at timestamp default now() not null,
        updated_at timestamp default now() not null
      )
    `);

    await this.getPool().query(`
      create index if not exists standalone_notes_user_id_updated_at_idx
        on standalone_notes (user_id, updated_at desc)
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
        add column if not exists email_verified boolean default false not null,
        add column if not exists token_version integer default 0 not null
    `);

    await this.getPool().query(`
      create unique index if not exists users_google_id_unique
        on users (google_id)
        where google_id is not null
    `);
  }
}
