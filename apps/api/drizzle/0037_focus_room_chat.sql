ALTER TABLE "focus_rooms"
  ADD COLUMN IF NOT EXISTS "ai_focus_coach_enabled" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "ai_focus_coach_mode" varchar(20) NOT NULL DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS "last_focus_coach_intervention_at" timestamp,
  ADD COLUMN IF NOT EXISTS "distracting_message_count" integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "focus_room_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "room_id" uuid NOT NULL REFERENCES "focus_rooms"("id") ON DELETE CASCADE,
  "sender_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "sender_type" varchar(16) NOT NULL DEFAULT 'user',
  "content" varchar(2000) NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_focus_room_messages_history" ON "focus_room_messages" ("room_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_focus_room_messages_sender" ON "focus_room_messages" ("sender_user_id");
