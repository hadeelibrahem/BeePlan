ALTER TABLE "whiteboards"
  ADD COLUMN IF NOT EXISTS "asset_references" jsonb NOT NULL DEFAULT '{}'::jsonb;
