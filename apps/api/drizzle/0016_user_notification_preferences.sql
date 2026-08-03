create table if not exists user_notification_preferences (
  id uuid primary key default gen_random_uuid() not null,
  user_id uuid not null unique references users(id) on delete cascade,
  task_notifications boolean not null default true,
  calendar_notifications boolean not null default true,
  focus_notifications boolean not null default true,
  collaboration_notifications boolean not null default true,
  ai_notifications boolean not null default true,
  email_notifications boolean not null default false,
  created_at timestamp default now() not null,
  updated_at timestamp default now() not null
);
