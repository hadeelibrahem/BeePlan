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
    await this.ensureRecurrenceSuggestionDismissalsTable();
    await this.ensureRemindersTable();
    await this.ensureGoogleLoginApprovalsTable();
    await this.ensureStandaloneNotesTable();
    await this.ensurePlannerPreferencesTable();
    await this.ensurePlannerAcceptedPlansTable();
    await this.ensureFocusSessionsTable();
    await this.ensureSocialTables();
    await this.ensureNotificationsTable();
    await this.ensureCollaborationTables();
    await this.ensureAiRecommendationsTable();
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
        add column if not exists person jsonb,
        add column if not exists smart_location_enabled boolean default false not null,
        add column if not exists smart_place_category varchar(80),
        add column if not exists trigger_radius integer default 200 not null,
        add column if not exists trigger_on_enter boolean default true not null,
        add column if not exists trigger_cooldown integer default 1440 not null,
        add column if not exists last_triggered_at timestamp,
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
        add column if not exists updated_at timestamp default now() not null,
        add column if not exists description text,
        add column if not exists priority varchar(20) not null default 'medium',
        add column if not exists start_date timestamp,
        add column if not exists estimated_duration_minutes integer,
        add column if not exists actual_duration_minutes integer,
        add column if not exists estimated_duration_source varchar(10) not null default 'user',
        add column if not exists reminder_enabled boolean not null default false,
        add column if not exists reminder_minutes_before_due integer,
        add column if not exists reminder_time timestamp,
        add column if not exists reminder_sent_at timestamp,
        add column if not exists reminder_status varchar(20) not null default 'none',
        add column if not exists notes text,
        add column if not exists tags jsonb,
        add column if not exists completed_at timestamp,
        add column if not exists assignee_user_id uuid references users(id) on delete set null,
        add column if not exists source varchar(40),
        add column if not exists source_plan_id uuid,
        add column if not exists source_proposal_id varchar(64),
        add column if not exists semantic_type varchar(30),
        add column if not exists subject_keys jsonb,
        add column if not exists shared_session_group_id varchar(64),
        add column if not exists is_shared boolean not null default false
    `);

    await this.getPool().query(`
      create index if not exists idx_subtasks_assignee_user_id
        on subtasks (assignee_user_id)
    `);
    await this.getPool().query(`
      create index if not exists idx_subtasks_task_source
        on subtasks (task_id, source)
    `);

    await this.getPool().query(`
      create table if not exists subtask_dependencies (
        subtask_id uuid not null references subtasks(id) on delete cascade,
        depends_on_subtask_id uuid not null references subtasks(id) on delete cascade,
        created_at timestamp default now() not null,
        primary key (subtask_id, depends_on_subtask_id)
      )
    `);

    await this.getPool().query(`
      create table if not exists subtask_attachments (
        id uuid primary key default gen_random_uuid() not null,
        subtask_id uuid not null references subtasks(id) on delete cascade,
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
      create index if not exists idx_subtask_attachments_subtask_id
        on subtask_attachments (subtask_id)
    `);

    await this.getPool().query(`
      create index if not exists idx_subtasks_status on subtasks (status)
    `);
    await this.getPool().query(`
      create index if not exists idx_subtasks_due_date on subtasks (due_date)
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

  private async ensureRecurrenceSuggestionDismissalsTable() {
    await this.getPool().query(`
      create table if not exists task_recurrence_suggestion_dismissals (
        id uuid primary key default gen_random_uuid() not null,
        user_id uuid not null references users(id) on delete cascade,
        suggestion_id varchar(80) not null,
        task_title varchar(255),
        dismissed_at timestamp default now() not null
      )
    `);

    await this.getPool().query(`
      create unique index if not exists task_recurrence_suggestion_dismissals_unique
        on task_recurrence_suggestion_dismissals (user_id, suggestion_id)
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

  private async ensurePlannerPreferencesTable() {
    await this.getPool().query(`
      create table if not exists planner_preferences (
        id uuid primary key default gen_random_uuid() not null,
        user_id uuid not null unique references users(id) on delete cascade,
        focus_start_time varchar(5) not null default '08:00',
        focus_end_time varchar(5) not null default '11:00',
        work_block_minutes integer not null default 50,
        break_minutes integer not null default 10,
        energy_morning varchar(10) not null default 'high',
        energy_afternoon varchar(10) not null default 'medium',
        energy_evening varchar(10) not null default 'low',
        energy_night varchar(10) not null default 'low',
        schedule_hard_tasks_in_focus boolean not null default true,
        finish_started_first boolean not null default true,
        group_similar_tasks boolean not null default true,
        buffer_before_meetings boolean not null default true,
        buffer_minutes integer not null default 15,
        note varchar(1000),
        created_at timestamp default now() not null,
        updated_at timestamp default now() not null
      )
    `);

    // Daily-capacity controls added after the table's first release. Existing
    // rows get sensible defaults so the planner always has a full preferences
    // object to work with (see migration 0006_planner_capacity_preferences).
    await this.getPool().query(`
      alter table planner_preferences
        add column if not exists max_daily_work_minutes integer not null default 480,
        add column if not exists emergency_buffer_minutes integer not null default 30,
        add column if not exists sleep_start_time varchar(5) not null default '23:00',
        add column if not exists sleep_end_time varchar(5) not null default '07:00',
        add column if not exists lunch_start_time varchar(5) not null default '13:00',
        add column if not exists lunch_end_time varchar(5) not null default '13:45',
        add column if not exists unavailable_hours jsonb not null default '[]'::jsonb
    `);
  }

  private async ensurePlannerAcceptedPlansTable() {
    await this.getPool().query(`
      create table if not exists planner_accepted_plans (
        id uuid primary key default gen_random_uuid() not null,
        user_id uuid not null references users(id) on delete cascade,
        date varchar(10) not null,
        plan jsonb not null,
        accepted_at timestamp default now() not null,
        created_at timestamp default now() not null,
        updated_at timestamp default now() not null
      )
    `);

    await this.getPool().query(`
      create unique index if not exists planner_accepted_plans_user_date_idx
        on planner_accepted_plans (user_id, date)
    `);
  }

  private async ensureFocusSessionsTable() {
    await this.getPool().query(`
      create table if not exists focus_sessions (
        id uuid primary key default gen_random_uuid() not null,
        user_id uuid not null references users(id) on delete cascade,
        task_id uuid references tasks(id) on delete set null,
        started_at timestamp default now() not null,
        ended_at timestamp,
        planned_minutes integer not null default 25,
        actual_minutes integer,
        status varchar(20) not null default 'active',
        session_type varchar(20) not null default 'pomodoro',
        notes text,
        created_at timestamp default now() not null
      )
    `);

    await this.getPool().query(`
      create index if not exists idx_focus_sessions_user_id
        on focus_sessions (user_id)
    `);
    await this.getPool().query(`
      create index if not exists idx_focus_sessions_started_at
        on focus_sessions (started_at)
    `);
    await this.getPool().query(`
      create index if not exists idx_focus_sessions_task_id
        on focus_sessions (task_id)
    `);
  }

  private async ensureSocialTables() {
    await this.getPool().query(`
      create table if not exists friendships (
        id uuid primary key default gen_random_uuid() not null,
        requester_id uuid not null references users(id) on delete cascade,
        addressee_id uuid not null references users(id) on delete cascade,
        status varchar(20) not null default 'pending',
        created_at timestamp default now() not null,
        updated_at timestamp default now() not null,
        unique (requester_id, addressee_id)
      )
    `);

    await this.getPool().query(`
      create index if not exists idx_friendships_requester
        on friendships (requester_id)
    `);
    await this.getPool().query(`
      create index if not exists idx_friendships_addressee
        on friendships (addressee_id)
    `);

    await this.getPool().query(`
      create table if not exists location_sharing_permissions (
        id uuid primary key default gen_random_uuid() not null,
        owner_id uuid not null references users(id) on delete cascade,
        viewer_id uuid not null references users(id) on delete cascade,
        mode varchar(20) not null default 'proximity',
        status varchar(20) not null default 'pending',
        expires_at timestamp,
        responded_at timestamp,
        created_at timestamp default now() not null,
        updated_at timestamp default now() not null
      )
    `);

    await this.getPool().query(`
      create index if not exists idx_location_sharing_owner
        on location_sharing_permissions (owner_id)
    `);
    await this.getPool().query(`
      create index if not exists idx_location_sharing_viewer
        on location_sharing_permissions (viewer_id)
    `);

    await this.getPool().query(`
      create table if not exists user_location_snapshots (
        id uuid primary key default gen_random_uuid() not null,
        user_id uuid not null unique references users(id) on delete cascade,
        latitude decimal(10, 7) not null,
        longitude decimal(10, 7) not null,
        accuracy_meters integer,
        captured_at timestamp default now() not null,
        updated_at timestamp default now() not null
      )
    `);
  }

  // In-app notifications (invites, comments, mentions, task changes). The
  // table is defined in schema.ts but was never created by an ensure method,
  // so collaboration features would fail without this. Kept separate from the
  // reminder-notification pipeline, which only writes rows here.
  private async ensureNotificationsTable() {
    await this.getPool().query(`
      create table if not exists notifications (
        id uuid primary key default gen_random_uuid() not null,
        user_id uuid not null references users(id) on delete cascade,
        reminder_id uuid references reminders(id) on delete set null,
        title varchar(255) not null,
        body text not null,
        notification_type varchar(50) not null,
        is_read boolean not null default false,
        sent_at timestamp default now() not null
      )
    `);

    // Newer collaboration notifications carry a task reference and an optional
    // action payload (e.g. { taskId, commentId, memberId }) so the client can
    // deep-link and render Accept/Decline affordances.
    await this.getPool().query(`
      alter table notifications
        add column if not exists task_id uuid references tasks(id) on delete cascade,
        add column if not exists actor_id uuid references users(id) on delete set null,
        add column if not exists data jsonb
    `);

    await this.getPool().query(`
      create index if not exists idx_notifications_user_unread
        on notifications (user_id, is_read)
    `);
    await this.getPool().query(`
      create index if not exists idx_notifications_sent_at
        on notifications (sent_at)
    `);
  }

  // Shared-task collaboration: owner/creator split, member links (which double
  // as invitations), comments + mentions, and per-user personal preferences.
  private async ensureCollaborationTables() {
    // Owner/creator split on tasks. `creator_id` is backfilled to the current
    // owner so existing personal tasks report a sensible creator.
    await this.getPool().query(`
      alter table tasks
        add column if not exists creator_id uuid references users(id) on delete set null
    `);
    await this.getPool().query(`
      update tasks set creator_id = user_id where creator_id is null
    `);

    // Task reminders + shared/personal audience.
    await this.getPool().query(`
      alter table reminders
        add column if not exists task_id uuid references tasks(id) on delete cascade,
        add column if not exists audience varchar(20) not null default 'personal'
    `);

    await this.getPool().query(`
      create table if not exists task_members (
        id uuid primary key default gen_random_uuid() not null,
        task_id uuid not null references tasks(id) on delete cascade,
        user_id uuid not null references users(id) on delete cascade,
        role varchar(20) not null default 'viewer',
        status varchar(20) not null default 'pending',
        invited_by_id uuid references users(id) on delete set null,
        invited_at timestamp default now() not null,
        accepted_at timestamp,
        joined_at timestamp,
        created_at timestamp default now() not null,
        updated_at timestamp default now() not null
      )
    `);
    await this.getPool().query(`
      create unique index if not exists uq_task_members_task_user
        on task_members (task_id, user_id)
    `);
    await this.getPool().query(`
      create index if not exists idx_task_members_task on task_members (task_id)
    `);
    await this.getPool().query(`
      create index if not exists idx_task_members_user on task_members (user_id)
    `);
    await this.getPool().query(`
      create index if not exists idx_task_members_status on task_members (status)
    `);

    await this.getPool().query(`
      create table if not exists task_comments (
        id uuid primary key default gen_random_uuid() not null,
        task_id uuid not null references tasks(id) on delete cascade,
        user_id uuid not null references users(id) on delete cascade,
        message text not null,
        edited_at timestamp,
        deleted_at timestamp,
        created_at timestamp default now() not null,
        updated_at timestamp default now() not null
      )
    `);
    await this.getPool().query(`
      create index if not exists idx_task_comments_task on task_comments (task_id)
    `);
    await this.getPool().query(`
      create index if not exists idx_task_comments_created on task_comments (created_at)
    `);

    await this.getPool().query(`
      create table if not exists task_comment_mentions (
        id uuid primary key default gen_random_uuid() not null,
        comment_id uuid not null references task_comments(id) on delete cascade,
        mentioned_user_id uuid not null references users(id) on delete cascade,
        created_at timestamp default now() not null
      )
    `);
    await this.getPool().query(`
      create unique index if not exists uq_task_comment_mentions
        on task_comment_mentions (comment_id, mentioned_user_id)
    `);
    await this.getPool().query(`
      create index if not exists idx_task_comment_mentions_user
        on task_comment_mentions (mentioned_user_id)
    `);

    await this.getPool().query(`
      create table if not exists personal_task_preferences (
        id uuid primary key default gen_random_uuid() not null,
        task_id uuid not null references tasks(id) on delete cascade,
        user_id uuid not null references users(id) on delete cascade,
        is_pinned boolean not null default false,
        is_favorite boolean not null default false,
        is_focus_queued boolean not null default false,
        personal_reminder_minutes_before integer,
        notifications_muted boolean not null default false,
        created_at timestamp default now() not null,
        updated_at timestamp default now() not null
      )
    `);
    await this.getPool().query(`
      create unique index if not exists uq_personal_task_prefs
        on personal_task_preferences (task_id, user_id)
    `);
    await this.getPool().query(`
      create index if not exists idx_personal_task_prefs_user
        on personal_task_preferences (user_id)
    `);
  }

  // The standing AI project manager's recommendation cards (ahead-of-pace,
  // inactive member, deadline risk, workload imbalance). One row per
  // detected situation; the partial unique index on (task_id, dedupe_key)
  // stops re-detection from spamming duplicates of an already-pending card.
  private async ensureAiRecommendationsTable() {
    await this.getPool().query(`
      create table if not exists ai_recommendations (
        id uuid primary key default gen_random_uuid() not null,
        task_id uuid not null references tasks(id) on delete cascade,
        kind varchar(40) not null,
        status varchar(20) not null default 'pending',
        target_user_id uuid references users(id) on delete set null,
        title varchar(255) not null,
        message text not null,
        reason text not null,
        payload jsonb not null default '{}',
        dedupe_key varchar(160) not null,
        created_at timestamp default now() not null,
        resolved_at timestamp,
        resolved_by_user_id uuid references users(id) on delete set null
      )
    `);
    await this.getPool().query(`
      create unique index if not exists idx_ai_reco_dedupe
        on ai_recommendations (task_id, dedupe_key)
        where status = 'pending'
    `);
    await this.getPool().query(`
      create index if not exists idx_ai_reco_task
        on ai_recommendations (task_id, created_at)
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
