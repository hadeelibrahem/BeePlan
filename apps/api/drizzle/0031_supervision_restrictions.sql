ALTER TABLE "supervision_devices"
  ADD COLUMN IF NOT EXISTS "app_management_enabled" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "selection_configured" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "selected_app_count" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "categories_configured" boolean DEFAULT false NOT NULL;

ALTER TABLE "supervision_rules"
  ADD COLUMN IF NOT EXISTS "restriction_mode" varchar(24) DEFAULT 'time' NOT NULL,
  ADD COLUMN IF NOT EXISTS "completion_trigger" varchar(24) DEFAULT 'time_expired' NOT NULL,
  ADD COLUMN IF NOT EXISTS "app_selection" jsonb DEFAULT '{}'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS "completed_at" timestamp;

CREATE TABLE IF NOT EXISTS "supervision_managed_apps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "device_id" uuid NOT NULL REFERENCES "supervision_devices"("id") ON DELETE cascade,
  "platform_app_identifier" varchar(255) NOT NULL,
  "display_name" varchar(255) NOT NULL,
  "icon_reference" text,
  "enabled_for_guardian_management" boolean DEFAULT false NOT NULL,
  "last_seen_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_supervision_managed_app_device_identifier" ON "supervision_managed_apps" ("device_id", "platform_app_identifier");
CREATE INDEX IF NOT EXISTS "idx_supervision_managed_apps_device_enabled" ON "supervision_managed_apps" ("device_id", "enabled_for_guardian_management");
