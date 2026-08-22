-- Private, human-readable room entry codes. Backfill one code at a time so
-- existing rooms are never assigned duplicates before the unique index exists.
ALTER TABLE "focus_rooms" ADD COLUMN IF NOT EXISTS "join_code" varchar(16);

DO $$
DECLARE
  room record;
  candidate varchar(16);
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
  FOR room IN SELECT id FROM "focus_rooms" WHERE "join_code" IS NULL LOOP
    LOOP
      SELECT 'BEE-' || string_agg(
        substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1),
        ''
      ) INTO candidate
      FROM generate_series(1, 4);
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM "focus_rooms" WHERE "join_code" = candidate
      );
    END LOOP;
    UPDATE "focus_rooms" SET "join_code" = candidate WHERE id = room.id;
  END LOOP;
END $$;

ALTER TABLE "focus_rooms" ALTER COLUMN "join_code" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "uq_focus_rooms_join_code" ON "focus_rooms" ("join_code");
