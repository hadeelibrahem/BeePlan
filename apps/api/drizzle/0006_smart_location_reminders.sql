ALTER TABLE "reminders"
  ADD COLUMN IF NOT EXISTS "smart_location_enabled" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "smart_place_category" varchar(80),
  ADD COLUMN IF NOT EXISTS "trigger_radius" integer DEFAULT 200 NOT NULL,
  ADD COLUMN IF NOT EXISTS "trigger_on_enter" boolean DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS "trigger_cooldown" integer DEFAULT 1440 NOT NULL,
  ADD COLUMN IF NOT EXISTS "last_triggered_at" timestamp;

