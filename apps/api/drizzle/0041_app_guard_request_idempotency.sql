ALTER TABLE "app_guard_access_decisions" ADD COLUMN IF NOT EXISTS "client_request_id" uuid;
CREATE UNIQUE INDEX IF NOT EXISTS "uq_app_guard_user_client_request" ON "app_guard_access_decisions" ("user_id", "client_request_id");
