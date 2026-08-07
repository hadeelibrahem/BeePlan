CREATE TABLE IF NOT EXISTS "whiteboard_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "board_id" uuid NOT NULL REFERENCES "whiteboards"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" varchar(10) NOT NULL DEFAULT 'owner',
  "invited_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "accepted_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "whiteboard_member_role_check" CHECK ("role" IN ('owner','editor','viewer'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_whiteboard_members_board_user" ON "whiteboard_members" ("board_id", "user_id");
CREATE INDEX IF NOT EXISTS "idx_whiteboard_members_user" ON "whiteboard_members" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_whiteboard_members_board" ON "whiteboard_members" ("board_id");

CREATE TABLE IF NOT EXISTS "whiteboard_invitations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "board_id" uuid NOT NULL REFERENCES "whiteboards"("id") ON DELETE CASCADE,
  "email_normalized" varchar(255) NOT NULL,
  "invited_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "role" varchar(10) NOT NULL,
  "invited_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL UNIQUE,
  "status" varchar(10) NOT NULL DEFAULT 'pending',
  "expires_at" timestamp NOT NULL,
  "accepted_at" timestamp,
  "revoked_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "whiteboard_invitation_role_check" CHECK ("role" IN ('editor','viewer')),
  CONSTRAINT "whiteboard_invitation_status_check" CHECK ("status" IN ('pending','accepted','revoked','expired'))
);
CREATE INDEX IF NOT EXISTS "idx_whiteboard_invitations_board" ON "whiteboard_invitations" ("board_id");
CREATE INDEX IF NOT EXISTS "idx_whiteboard_invitations_email" ON "whiteboard_invitations" ("email_normalized");

INSERT INTO "whiteboard_members" ("board_id", "user_id", "role", "invited_by", "accepted_at")
SELECT "id", "user_id", 'owner', "user_id", now() FROM "whiteboards"
WHERE NOT EXISTS (SELECT 1 FROM "whiteboard_members" m WHERE m."board_id" = "whiteboards"."id" AND m."user_id" = "whiteboards"."user_id");
