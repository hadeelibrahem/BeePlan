ALTER TABLE "whiteboards" DROP CONSTRAINT IF EXISTS "whiteboards_user_id_unique";
ALTER TABLE "whiteboards" ADD COLUMN IF NOT EXISTS "preview_url" text;
ALTER TABLE "whiteboards" ADD COLUMN IF NOT EXISTS "is_pinned" boolean NOT NULL DEFAULT false;
ALTER TABLE "whiteboards" ADD COLUMN IF NOT EXISTS "is_archived" boolean NOT NULL DEFAULT false;
ALTER TABLE "whiteboards" ADD COLUMN IF NOT EXISTS "last_opened_at" timestamp;
UPDATE "whiteboards" SET "last_opened_at" = COALESCE("updated_at", now()) WHERE "last_opened_at" IS NULL;
CREATE INDEX IF NOT EXISTS "idx_whiteboards_user_updated" ON "whiteboards" ("user_id", "updated_at");
