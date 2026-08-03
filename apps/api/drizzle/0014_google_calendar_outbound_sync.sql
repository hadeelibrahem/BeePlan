-- Outbound Google Calendar ownership, entity mappings, and durable retry queue.
alter table google_calendar_connections
  add column if not exists sync_tasks boolean not null default true,
  add column if not exists sync_focus_sessions boolean not null default true,
  add column if not exists sync_reminders boolean not null default false,
  add column if not exists sync_calendar_blocks boolean not null default true;

alter table google_calendar_events
  add column if not exists connection_id uuid references google_calendar_connections(id) on delete cascade,
  add column if not exists google_calendar_external_id varchar(255),
  add column if not exists google_event_id varchar(512),
  add column if not exists ownership varchar(24) not null default 'google_imported',
  add column if not exists beeplan_entity_type varchar(24),
  add column if not exists beeplan_entity_id varchar(255),
  add column if not exists last_google_updated_at timestamp;

create unique index if not exists uq_google_events_user_entity
  on google_calendar_events(user_id, beeplan_entity_type, beeplan_entity_id);

create table if not exists google_calendar_sync_jobs (
  id uuid primary key default gen_random_uuid() not null,
  user_id uuid not null references users(id) on delete cascade,
  connection_id uuid not null references google_calendar_connections(id) on delete cascade,
  operation varchar(16) not null,
  entity_type varchar(24) not null,
  entity_id varchar(255) not null,
  attempt_count integer not null default 0,
  next_retry_at timestamp default now() not null,
  last_error text,
  status varchar(16) not null default 'pending',
  created_at timestamp default now() not null,
  updated_at timestamp default now() not null
);

create index if not exists idx_google_calendar_sync_jobs_due
  on google_calendar_sync_jobs(status, next_retry_at);
