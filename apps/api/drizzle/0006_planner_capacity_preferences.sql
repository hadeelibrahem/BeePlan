-- Daily-capacity planner controls: maximum real work minutes per day, the
-- emergency slack the planner always leaves unscheduled, protected sleep and
-- lunch windows, and arbitrary user-defined unavailable windows. These are
-- also applied automatically on boot by DatabaseService.ensurePlannerPreferencesTable.
ALTER TABLE planner_preferences
  ADD COLUMN IF NOT EXISTS max_daily_work_minutes integer NOT NULL DEFAULT 480,
  ADD COLUMN IF NOT EXISTS emergency_buffer_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS sleep_start_time varchar(5) NOT NULL DEFAULT '23:00',
  ADD COLUMN IF NOT EXISTS sleep_end_time varchar(5) NOT NULL DEFAULT '07:00',
  ADD COLUMN IF NOT EXISTS lunch_start_time varchar(5) NOT NULL DEFAULT '13:00',
  ADD COLUMN IF NOT EXISTS lunch_end_time varchar(5) NOT NULL DEFAULT '13:45',
  ADD COLUMN IF NOT EXISTS unavailable_hours jsonb NOT NULL DEFAULT '[]'::jsonb;
