ALTER TABLE "focus_room_commitment_participants" ADD COLUMN "focus_session_id" uuid REFERENCES "focus_sessions"("id") ON DELETE set null;
ALTER TABLE "focus_room_commitment_participants" ADD COLUMN "selected_task_id" uuid REFERENCES "tasks"("id") ON DELETE set null;
ALTER TABLE "focus_room_commitment_participants" ADD COLUMN "selected_subtask_id" uuid REFERENCES "subtasks"("id") ON DELETE set null;
CREATE UNIQUE INDEX "uq_focus_commitment_focus_session" ON "focus_room_commitment_participants" ("focus_session_id") WHERE "focus_session_id" IS NOT NULL;
ALTER TABLE "focus_rooms" ADD COLUMN "goal_target_minutes" integer;
ALTER TABLE "focus_room_invitations" ADD COLUMN "rejected_at" timestamp;
ALTER TABLE "focus_room_invitations" ADD COLUMN "revoked_at" timestamp;
