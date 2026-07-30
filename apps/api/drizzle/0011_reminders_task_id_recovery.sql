-- Restores the nullable task link that older startup compatibility code
-- removed. This preserves every existing reminder row.
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "task_id" uuid;--> statement-breakpoint

-- Normalize any prior FK on this column to the schema's intended delete
-- behavior. Dropping/recreating the constraint never changes reminder data.
DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN unnest(c.conkey) AS key(attnum) ON true
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key.attnum
    WHERE c.conrelid = 'reminders'::regclass
      AND c.contype = 'f'
      AND a.attname = 'task_id'
  LOOP
    EXECUTE format('ALTER TABLE reminders DROP CONSTRAINT %I', constraint_name);
  END LOOP;

  ALTER TABLE "reminders"
    ADD CONSTRAINT "reminders_task_id_tasks_id_fk"
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_reminders_task_id" ON "reminders" USING btree ("task_id");
