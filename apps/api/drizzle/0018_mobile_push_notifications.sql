ALTER TABLE user_notification_preferences
  ADD COLUMN IF NOT EXISTS push_notifications boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS user_push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expo_push_token varchar(255) NOT NULL UNIQUE,
  platform varchar(20) NOT NULL,
  installation_id varchar(255) NOT NULL,
  device_name varchar(255),
  app_version varchar(40),
  enabled boolean NOT NULL DEFAULT true,
  last_seen_at timestamp DEFAULT now() NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL,
  UNIQUE(user_id, installation_id)
);
CREATE INDEX IF NOT EXISTS idx_user_push_devices_user_enabled
  ON user_push_devices(user_id, enabled);

CREATE TABLE IF NOT EXISTS push_notification_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES user_push_devices(id) ON DELETE CASCADE,
  expo_push_token varchar(255) NOT NULL,
  title varchar(255) NOT NULL,
  body text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  priority varchar(12) NOT NULL DEFAULT 'normal',
  status varchar(20) NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamp DEFAULT now() NOT NULL,
  ticket_id varchar(255),
  last_error text,
  sent_at timestamp,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL,
  UNIQUE(notification_id, device_id)
);
CREATE INDEX IF NOT EXISTS idx_push_jobs_due
  ON push_notification_jobs(status, next_retry_at);
