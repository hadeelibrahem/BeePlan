CREATE TABLE IF NOT EXISTS notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type varchar(50) NOT NULL,
  entity_type varchar(50) NOT NULL,
  entity_id varchar(255) NOT NULL,
  trigger_at timestamp NOT NULL,
  delivery_key varchar(500) NOT NULL UNIQUE,
  created_at timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_entity
  ON notification_deliveries (entity_type, entity_id);
