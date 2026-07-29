ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS scheduled_date varchar(10),
  ADD COLUMN IF NOT EXISTS scheduled_start_time varchar(5),
  ADD COLUMN IF NOT EXISTS scheduled_end_time varchar(5);

ALTER TABLE subtasks
  ADD COLUMN IF NOT EXISTS scheduled_date varchar(10),
  ADD COLUMN IF NOT EXISTS scheduled_start_time varchar(5),
  ADD COLUMN IF NOT EXISTS scheduled_end_time varchar(5);

CREATE INDEX IF NOT EXISTS idx_tasks_scheduled_date
  ON tasks (user_id, scheduled_date)
  WHERE scheduled_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subtasks_scheduled_date
  ON subtasks (scheduled_date)
  WHERE scheduled_date IS NOT NULL;
