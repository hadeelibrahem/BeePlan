-- Legacy/unused table cleanup. All drops are explicit and child-first.
-- Google Calendar tables are intentionally excluded.
DROP TABLE IF EXISTS "habit_logs";
DROP TABLE IF EXISTS "exams";
DROP TABLE IF EXISTS "assignments";
DROP TABLE IF EXISTS "study_sessions";
DROP TABLE IF EXISTS "shopping_items";
DROP TABLE IF EXISTS "goal_tasks";
DROP TABLE IF EXISTS "group_members";
DROP TABLE IF EXISTS "shared_tasks";
DROP TABLE IF EXISTS "habits";
DROP TABLE IF EXISTS "courses";
DROP TABLE IF EXISTS "shopping_lists";
DROP TABLE IF EXISTS "goals";
DROP TABLE IF EXISTS "groups";
DROP TABLE IF EXISTS "device_tokens";
DROP TABLE IF EXISTS "daily_user_stats";
