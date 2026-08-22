CREATE TABLE IF NOT EXISTS "error_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "fingerprint" varchar(128) NOT NULL,
  "title" varchar(255) NOT NULL,
  "error_class" varchar(160) NOT NULL,
  "normalized_message" text NOT NULL,
  "service" varchar(160) NOT NULL DEFAULT 'api',
  "operation" varchar(255), "route" varchar(500), "http_method" varchar(12), "http_status" integer,
  "environment" varchar(32) NOT NULL, "severity" varchar(16) NOT NULL DEFAULT 'medium', "status" varchar(20) NOT NULL DEFAULT 'new',
  "first_seen_at" timestamp NOT NULL DEFAULT now(), "last_seen_at" timestamp NOT NULL DEFAULT now(), "occurrence_count" integer NOT NULL DEFAULT 1,
  "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_error_groups_fingerprint" ON "error_groups" ("fingerprint");
CREATE INDEX IF NOT EXISTS "idx_error_groups_last_seen" ON "error_groups" ("last_seen_at");
CREATE INDEX IF NOT EXISTS "idx_error_groups_severity" ON "error_groups" ("severity");
CREATE INDEX IF NOT EXISTS "idx_error_groups_status" ON "error_groups" ("status");
CREATE INDEX IF NOT EXISTS "idx_error_groups_route" ON "error_groups" ("route");
CREATE TABLE IF NOT EXISTS "error_occurrences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "error_group_id" uuid NOT NULL REFERENCES "error_groups"("id") ON DELETE CASCADE,
  "occurred_at" timestamp NOT NULL DEFAULT now(), "request_id" varchar(128), "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "http_method" varchar(12), "route" varchar(500), "status_code" integer, "service" varchar(160) NOT NULL DEFAULT 'api', "operation" varchar(255), "environment" varchar(32) NOT NULL,
  "client_platform" varchar(40), "client_version" varchar(80), "sanitized_message" text NOT NULL, "sanitized_stack" text, "sanitized_context" jsonb
);
CREATE INDEX IF NOT EXISTS "idx_error_occurrences_group" ON "error_occurrences" ("error_group_id");
CREATE INDEX IF NOT EXISTS "idx_error_occurrences_occurred" ON "error_occurrences" ("occurred_at");
CREATE INDEX IF NOT EXISTS "idx_error_occurrences_user" ON "error_occurrences" ("user_id");
CREATE TABLE IF NOT EXISTS "error_group_users" (
  "error_group_id" uuid NOT NULL REFERENCES "error_groups"("id") ON DELETE CASCADE, "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "first_seen_at" timestamp NOT NULL DEFAULT now(), "last_seen_at" timestamp NOT NULL DEFAULT now(), "occurrence_count" integer NOT NULL DEFAULT 1,
  PRIMARY KEY ("error_group_id", "user_id")
);
CREATE INDEX IF NOT EXISTS "idx_error_group_users_user" ON "error_group_users" ("user_id");
