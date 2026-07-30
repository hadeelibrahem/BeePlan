ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "destination" jsonb;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "weather_travel_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "travel_mode" varchar(24);
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "travel_origin_preference" jsonb;
ALTER TABLE "subtasks" ADD COLUMN IF NOT EXISTS "destination" jsonb;
ALTER TABLE "subtasks" ADD COLUMN IF NOT EXISTS "weather_travel_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "subtasks" ADD COLUMN IF NOT EXISTS "travel_mode" varchar(24);
ALTER TABLE "subtasks" ADD COLUMN IF NOT EXISTS "travel_origin_preference" jsonb;

CREATE TABLE IF NOT EXISTS "weather_travel_preferences" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "enabled" boolean NOT NULL DEFAULT false,
  "default_travel_mode" varchar(24) NOT NULL DEFAULT 'driving',
  "home_radius_meters" integer NOT NULL DEFAULT 100,
  "preparation_buffer_minutes" integer NOT NULL DEFAULT 10,
  "parking_walking_buffer_minutes" integer NOT NULL DEFAULT 0,
  "uncertainty_buffer_minutes" integer NOT NULL DEFAULT 5,
  "weather_lead_minutes" integer NOT NULL DEFAULT 15,
  "current_location_freshness_minutes" integer NOT NULL DEFAULT 30,
  "cold_threshold_c" numeric(5,2) NOT NULL DEFAULT 12,
  "very_cold_threshold_c" numeric(5,2) NOT NULL DEFAULT 5,
  "hot_threshold_c" numeric(5,2) NOT NULL DEFAULT 28,
  "extreme_heat_threshold_c" numeric(5,2) NOT NULL DEFAULT 35,
  "rain_threshold_percent" integer NOT NULL DEFAULT 50,
  "rain_amount_threshold_mm" numeric(6,2) NOT NULL DEFAULT 0.5,
  "wind_threshold_kph" numeric(6,2) NOT NULL DEFAULT 35,
  "uv_threshold" numeric(5,2) NOT NULL DEFAULT 6,
  "visibility_threshold_meters" integer NOT NULL DEFAULT 1000,
  "advice" jsonb NOT NULL DEFAULT '{"coat":true,"lightClothing":true,"umbrella":true,"hydration":true,"uv":true,"wind":true,"severeWeather":true}'::jsonb,
  "current_location_fallback_enabled" boolean NOT NULL DEFAULT false,
  "approximate_travel_fallback_enabled" boolean NOT NULL DEFAULT true,
  "ai_polishing_enabled" boolean NOT NULL DEFAULT false,
  "language" varchar(8) NOT NULL DEFAULT 'en',
  "timezone" varchar(100) NOT NULL DEFAULT 'UTC',
  "selected_origin_saved_place_id" uuid REFERENCES "saved_locations"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "task_weather_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "task_id" uuid REFERENCES "tasks"("id") ON DELETE CASCADE,
  "subtask_id" uuid REFERENCES "subtasks"("id") ON DELETE CASCADE,
  "fingerprint" varchar(128) NOT NULL,
  "schedule_version" varchar(160) NOT NULL,
  "origin_source" varchar(40) NOT NULL,
  "origin_summary" jsonb,
  "destination_summary" jsonb NOT NULL,
  "scheduled_task_time" timestamp NOT NULL,
  "distance_meters" integer,
  "route_duration_minutes" integer,
  "travel_mode" varchar(24) NOT NULL,
  "fallback_used" boolean NOT NULL DEFAULT false,
  "recommended_departure_time" timestamp,
  "notification_time" timestamp NOT NULL,
  "recommendation_types" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "deterministic_message" text NOT NULL,
  "polished_message" text,
  "weather_evidence" jsonb,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" varchar(24) NOT NULL DEFAULT 'pending',
  "retry_count" integer NOT NULL DEFAULT 0,
  "last_error_code" varchar(80),
  "delivered_at" timestamp,
  "cancelled_at" timestamp,
  "invalidated_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "task_weather_notification_item_check" CHECK (("task_id" IS NOT NULL) OR ("subtask_id" IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_task_weather_notifications_fingerprint" ON "task_weather_notifications" ("fingerprint");
CREATE INDEX IF NOT EXISTS "idx_task_weather_notifications_upcoming" ON "task_weather_notifications" ("status", "notification_time");
CREATE INDEX IF NOT EXISTS "idx_task_weather_notifications_user" ON "task_weather_notifications" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_task_weather_notifications_task" ON "task_weather_notifications" ("task_id");
CREATE INDEX IF NOT EXISTS "idx_task_weather_notifications_subtask" ON "task_weather_notifications" ("subtask_id");
