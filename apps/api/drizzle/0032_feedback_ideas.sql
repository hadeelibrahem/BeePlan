create table if not exists feedback_items (
  id uuid primary key default gen_random_uuid() not null,
  author_user_id uuid not null references users(id) on delete cascade,
  category varchar(24) not null, title varchar(160) not null, description varchar(4000) not null,
  status varchar(24) not null default 'submitted', visibility varchar(16) not null default 'public',
  reviewed_by_admin_id uuid references users(id), reviewed_at timestamp, released_at timestamp,
  created_at timestamp not null default now(), updated_at timestamp not null default now()
);
create index if not exists idx_feedback_items_status on feedback_items(status);
create index if not exists idx_feedback_items_category on feedback_items(category);
create index if not exists idx_feedback_items_visibility on feedback_items(visibility);
create index if not exists idx_feedback_items_created on feedback_items(created_at);
create table if not exists feedback_votes (
  feedback_id uuid not null references feedback_items(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamp not null default now(), primary key(feedback_id, user_id)
);
create index if not exists idx_feedback_votes_feedback on feedback_votes(feedback_id);
