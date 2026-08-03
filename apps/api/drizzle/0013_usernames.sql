ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username varchar(20),
  ADD COLUMN IF NOT EXISTS username_normalized varchar(20);

DO $$
DECLARE
  user_row RECORD;
  base_name text;
  candidate text;
  suffix integer;
BEGIN
  FOR user_row IN SELECT id, full_name FROM users WHERE username_normalized IS NULL LOOP
    base_name := lower(regexp_replace(coalesce(user_row.full_name, 'user'), '[^a-zA-Z0-9_]', '', 'g'));
    base_name := trim(both '_' from base_name);
    IF length(base_name) < 3 THEN base_name := 'user'; END IF;
    base_name := left(base_name, 20);
    candidate := base_name;
    suffix := 0;
    WHILE EXISTS (SELECT 1 FROM users WHERE username_normalized = candidate) OR candidate IN ('admin','administrator','support','beeplan','help','root','system','security','official','moderator','moderation','api','www','null') LOOP
      suffix := suffix + 1;
      candidate := left(base_name, 20 - length(suffix::text)) || suffix::text;
    END LOOP;
    UPDATE users SET username = candidate, username_normalized = candidate WHERE id = user_row.id;
  END LOOP;
END $$;

ALTER TABLE users
  ALTER COLUMN username SET NOT NULL,
  ALTER COLUMN username_normalized SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_normalized_unique
  ON users (username_normalized);
