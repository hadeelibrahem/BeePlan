ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" varchar(20) DEFAULT 'user' NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "account_status" varchar(20) DEFAULT 'active' NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "suspended_at" timestamp;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "suspension_reason" varchar(500);

CREATE TABLE IF NOT EXISTS "admin_audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "action" varchar(100) NOT NULL,
  "target_type" varchar(80) NOT NULL,
  "target_id" varchar(255) NOT NULL,
  "before_state" jsonb,
  "after_state" jsonb,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_admin_audit_logs_created_at" ON "admin_audit_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_admin_audit_logs_target" ON "admin_audit_logs" ("target_type", "target_id");
CREATE INDEX IF NOT EXISTS "idx_admin_audit_logs_actor" ON "admin_audit_logs" ("actor_user_id");
