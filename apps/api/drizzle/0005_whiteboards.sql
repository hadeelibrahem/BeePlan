CREATE TABLE IF NOT EXISTS "whiteboards" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(255) DEFAULT 'Personal Whiteboard' NOT NULL,
  "snapshot" jsonb,
  "camera_x" real DEFAULT 0 NOT NULL,
  "camera_y" real DEFAULT 0 NOT NULL,
  "camera_zoom" real DEFAULT 1 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "whiteboards_user_id_unique" UNIQUE("user_id")
);
