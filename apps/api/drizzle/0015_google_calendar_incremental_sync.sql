alter table google_calendars
  add column if not exists next_sync_token text,
  add column if not exists last_successful_sync_at timestamp,
  add column if not exists last_full_sync_at timestamp,
  add column if not exists sync_status varchar(20) not null default 'idle',
  add column if not exists last_sync_error text,
  add column if not exists sync_lease_until timestamp;

update google_calendars set sync_lease_until = to_timestamp(0)
where sync_lease_until is null;
