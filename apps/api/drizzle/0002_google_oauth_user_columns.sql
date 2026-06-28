alter table users
  add column if not exists auth_provider varchar(40) default 'password' not null,
  add column if not exists google_id varchar(255),
  add column if not exists email_verified boolean default false not null;

create unique index if not exists users_google_id_unique
  on users (google_id)
  where google_id is not null;
