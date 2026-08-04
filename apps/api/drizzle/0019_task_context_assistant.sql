CREATE TABLE IF NOT EXISTS "task_assistant_preferences" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "enabled" boolean NOT NULL DEFAULT true, "preparation_checklists_enabled" boolean NOT NULL DEFAULT true,
  "travel_advice_enabled" boolean NOT NULL DEFAULT true, "weather_advice_enabled" boolean NOT NULL DEFAULT true,
  "document_advice_enabled" boolean NOT NULL DEFAULT true, "clothing_advice_enabled" boolean NOT NULL DEFAULT true,
  "umbrella_advice_enabled" boolean NOT NULL DEFAULT true, "hydration_advice_enabled" boolean NOT NULL DEFAULT true,
  "notification_mode" varchar(24) NOT NULL DEFAULT 'smart', "default_travel_mode" varchar(24) NOT NULL DEFAULT 'driving',
  "language" varchar(8) NOT NULL DEFAULT 'en', "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now()
);
INSERT INTO "task_assistant_preferences" ("user_id", "enabled", "travel_advice_enabled", "weather_advice_enabled", "default_travel_mode", "language", "created_at", "updated_at")
SELECT "user_id", "enabled", "enabled", "enabled", "default_travel_mode", CASE WHEN "language" IN ('en','ar') THEN "language" ELSE 'en' END, now(), now()
FROM "weather_travel_preferences" ON CONFLICT ("user_id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "task_assistant_contexts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "task_id" uuid NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE, "subtask_id" uuid REFERENCES "subtasks"("id") ON DELETE CASCADE,
  "primary_context" varchar(40) NOT NULL, "secondary_contexts" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "confidence" varchar(20) NOT NULL, "confidence_reason" text NOT NULL, "assumptions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "corrected_context" varchar(40), "schedule_version" varchar(160) NOT NULL, "generated_at" timestamp NOT NULL DEFAULT now(),
  "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_task_assistant_context_item" ON "task_assistant_contexts" ("user_id", "task_id");
CREATE INDEX IF NOT EXISTS "idx_task_assistant_context_task" ON "task_assistant_contexts" ("task_id");

CREATE TABLE IF NOT EXISTS "task_assistant_suggestions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "context_id" uuid NOT NULL REFERENCES "task_assistant_contexts"("id") ON DELETE CASCADE,
  "type" varchar(60) NOT NULL, "title" varchar(255) NOT NULL, "description" text NOT NULL, "reason" text NOT NULL,
  "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb, "evidence_type" varchar(40) NOT NULL, "status" varchar(24) NOT NULL DEFAULT 'pending',
  "fingerprint" varchar(128) NOT NULL, "due_at" timestamp, "notification_at" timestamp, "completed_at" timestamp, "dismissed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_task_assistant_suggestion_fingerprint" ON "task_assistant_suggestions" ("fingerprint");
CREATE INDEX IF NOT EXISTS "idx_task_assistant_suggestion_context" ON "task_assistant_suggestions" ("context_id");
CREATE INDEX IF NOT EXISTS "idx_task_assistant_suggestion_status" ON "task_assistant_suggestions" ("status");
