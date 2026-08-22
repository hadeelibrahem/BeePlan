-- Legacy focus rooms may predate the membership invariant. Ensure every owner
-- is an active owner participant without touching any non-owner membership.
INSERT INTO "focus_room_members" ("room_id", "user_id", "role", "state", "left_at")
SELECT "id", "owner_user_id", 'owner', 'preparing', NULL
FROM "focus_rooms"
ON CONFLICT ("room_id", "user_id") DO UPDATE
SET "role" = 'owner', "left_at" = NULL;
