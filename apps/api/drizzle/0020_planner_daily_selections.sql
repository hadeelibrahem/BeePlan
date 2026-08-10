CREATE TABLE IF NOT EXISTS "planner_daily_selections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "planner_date" varchar(10) NOT NULL,
  "task_id" uuid NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "subtask_id" uuid REFERENCES "subtasks"("id") ON DELETE CASCADE,
  "selection_source" varchar(20) DEFAULT 'user' NOT NULL,
  "selected_at" timestamp DEFAULT now() NOT NULL,
  "removed_at" timestamp,
  "planner_run_id" uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS "planner_daily_selections_unique" ON "planner_daily_selections" ("user_id", "planner_date", "task_id", "subtask_id");
CREATE INDEX IF NOT EXISTS "planner_daily_selections_user_date" ON "planner_daily_selections" ("user_id", "planner_date");
