ALTER TABLE "focus_room_invitations" ADD COLUMN "invited_email" varchar(255);
ALTER TABLE "focus_room_invitations" ADD COLUMN "invitation_type" varchar(16) DEFAULT 'email' NOT NULL;
CREATE INDEX "idx_focus_room_invited_email" ON "focus_room_invitations" ("room_id", "invited_email");
