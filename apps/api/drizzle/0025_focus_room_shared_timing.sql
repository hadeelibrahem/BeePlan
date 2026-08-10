ALTER TABLE "focus_room_commitment_sessions" ADD COLUMN "paused_at" timestamp;
ALTER TABLE "focus_room_commitment_sessions" ADD COLUMN "accumulated_paused_seconds" integer DEFAULT 0 NOT NULL;
