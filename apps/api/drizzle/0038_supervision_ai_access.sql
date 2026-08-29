CREATE TABLE IF NOT EXISTS "supervision_access_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "relationship_id" uuid NOT NULL REFERENCES "supervision_relationships"("id") ON DELETE cascade,
  "supervised_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "rule_id" uuid NOT NULL REFERENCES "supervision_rules"("id") ON DELETE cascade,
  "package_name" varchar(255) NOT NULL, "decision" varchar(24) NOT NULL,
  "category" varchar(24) NOT NULL DEFAULT 'unclear', "confidence" real NOT NULL DEFAULT 0,
  "reason" varchar(500) NOT NULL, "duration_minutes" integer, "decision_source" varchar(24) NOT NULL,
  "expires_at" timestamp, "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_supervision_access_user_created" ON "supervision_access_requests" ("supervised_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_supervision_access_relationship" ON "supervision_access_requests" ("relationship_id", "created_at");
