CREATE TABLE IF NOT EXISTS "whiteboard_assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "whiteboard_id" uuid NOT NULL REFERENCES "whiteboards"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" varchar(16) NOT NULL,
  "file_name" varchar(255) NOT NULL,
  "storage_path" text NOT NULL,
  "mime_type" varchar(160) NOT NULL,
  "size" integer NOT NULL,
  "width" integer,
  "height" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp,
  CONSTRAINT "whiteboard_assets_type_check" CHECK ("type" IN ('image', 'file'))
);
CREATE INDEX IF NOT EXISTS "idx_whiteboard_assets_whiteboard_id" ON "whiteboard_assets" ("whiteboard_id");
CREATE INDEX IF NOT EXISTS "idx_whiteboard_assets_user_id" ON "whiteboard_assets" ("user_id");
