CREATE TABLE "time_capsules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" varchar(255) NOT NULL,
  "message" text NOT NULL,
  "unlock_type" varchar(32) NOT NULL,
  "unlock_at" timestamp,
  "linked_task_id" uuid REFERENCES "tasks"("id") ON DELETE SET NULL,
  "linked_project_id" uuid REFERENCES "tasks"("id") ON DELETE SET NULL,
  "status" varchar(20) DEFAULT 'locked' NOT NULL,
  "sealed_at" timestamp,
  "opened_at" timestamp,
  "notification_sent_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "time_capsules_unlock_type_check" CHECK ("unlock_type" IN ('date','task_completion','project_completion')),
  CONSTRAINT "time_capsules_status_check" CHECK ("status" IN ('locked','ready','opened','cancelled')),
  CONSTRAINT "time_capsules_condition_check" CHECK (
    ("unlock_type"='date' AND "unlock_at" IS NOT NULL AND "linked_task_id" IS NULL AND "linked_project_id" IS NULL) OR
    ("unlock_type"='task_completion' AND "linked_task_id" IS NOT NULL AND "unlock_at" IS NULL AND "linked_project_id" IS NULL) OR
    ("unlock_type"='project_completion' AND "linked_project_id" IS NOT NULL AND "unlock_at" IS NULL AND "linked_task_id" IS NULL)
  )
);
CREATE INDEX "idx_time_capsules_user" ON "time_capsules" ("user_id");
CREATE INDEX "idx_time_capsules_status" ON "time_capsules" ("status");
CREATE INDEX "idx_time_capsules_unlock_at" ON "time_capsules" ("unlock_at");
CREATE INDEX "idx_time_capsules_linked_task" ON "time_capsules" ("linked_task_id");
CREATE INDEX "idx_time_capsules_linked_project" ON "time_capsules" ("linked_project_id");
CREATE TABLE "time_capsule_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "capsule_id" uuid NOT NULL REFERENCES "time_capsules"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" varchar(16) NOT NULL,
  "file_name" varchar(255) NOT NULL,
  "mime_type" varchar(120) NOT NULL,
  "size_bytes" integer NOT NULL,
  "storage_key" text NOT NULL,
  "duration_seconds" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "time_capsule_attachment_type_check" CHECK ("type" IN ('image','file','audio'))
);
CREATE INDEX "idx_time_capsule_attachments_capsule" ON "time_capsule_attachments" ("capsule_id");
