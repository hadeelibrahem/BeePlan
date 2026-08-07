create table if not exists achievements (
  id uuid primary key default gen_random_uuid() not null,
  user_id uuid not null references users(id) on delete cascade,
  title varchar(255) not null,
  description text,
  reflection text,
  achievement_date date not null,
  category varchar(40) not null default 'Other',
  related_task_id uuid references tasks(id) on delete set null,
  created_at timestamp default now() not null,
  updated_at timestamp default now() not null
);
create index if not exists idx_achievements_user_date on achievements(user_id, achievement_date);
create index if not exists idx_achievements_user_category on achievements(user_id, category);
create table if not exists achievement_images (
  id uuid primary key default gen_random_uuid() not null,
  achievement_id uuid not null references achievements(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  file_name varchar(255) not null,
  storage_key text not null,
  mime_type varchar(120) not null,
  size_bytes integer not null,
  sort_order integer not null default 0,
  is_cover boolean not null default false,
  created_at timestamp default now() not null
);
create index if not exists idx_achievement_images_achievement on achievement_images(achievement_id);
