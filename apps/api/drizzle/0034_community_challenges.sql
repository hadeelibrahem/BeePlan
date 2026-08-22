ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "completed_at" timestamp;
CREATE INDEX IF NOT EXISTS "idx_tasks_completed_at" ON "tasks" ("completed_at");

CREATE TABLE IF NOT EXISTS "challenges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" varchar(160) NOT NULL,
  "description" varchar(2000) DEFAULT '' NOT NULL,
  "type" varchar(32) NOT NULL,
  "target_value" integer NOT NULL,
  "status" varchar(20) DEFAULT 'draft' NOT NULL,
  "start_at" timestamp NOT NULL,
  "end_at" timestamp NOT NULL,
  "reward_type" varchar(32),
  "reward_value" integer,
  "badge_key" varchar(120),
  "created_by_admin_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "published_at" timestamp,
  "cancelled_at" timestamp,
  CONSTRAINT "challenges_type_check" CHECK ("type" IN ('focus_minutes', 'focus_sessions', 'tasks_completed')),
  CONSTRAINT "challenges_status_check" CHECK ("status" IN ('draft', 'scheduled', 'active', 'completed', 'cancelled')),
  CONSTRAINT "challenges_target_positive_check" CHECK ("target_value" > 0),
  CONSTRAINT "challenges_window_check" CHECK ("end_at" > "start_at"),
  CONSTRAINT "challenges_reward_empty_check" CHECK ("reward_type" IS NULL AND "reward_value" IS NULL AND "badge_key" IS NULL)
);
CREATE INDEX IF NOT EXISTS "idx_challenges_status_window" ON "challenges" ("status", "start_at", "end_at");

CREATE TABLE IF NOT EXISTS "user_challenge_progress" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "challenge_id" uuid NOT NULL REFERENCES "challenges"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "progress_value" integer DEFAULT 0 NOT NULL,
  "completed_at" timestamp,
  "reward_granted_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "uq_user_challenge_progress_challenge_user" UNIQUE("challenge_id", "user_id")
);
CREATE INDEX IF NOT EXISTS "idx_user_challenge_progress_challenge" ON "user_challenge_progress" ("challenge_id");
