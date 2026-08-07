CREATE TABLE IF NOT EXISTS ai_task_manager_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  subtask_id uuid REFERENCES subtasks(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type varchar(50) NOT NULL,
  severity varchar(20) NOT NULL DEFAULT 'info',
  title varchar(255) NOT NULL,
  summary text NOT NULL,
  explanation text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]',
  confidence integer NOT NULL DEFAULT 80,
  recommended_action jsonb NOT NULL DEFAULT '{}',
  fingerprint varchar(255) NOT NULL UNIQUE,
  status varchar(20) NOT NULL DEFAULT 'unread',
  read_at timestamp, dismissed_at timestamp, snoozed_until timestamp,
  actioned_at timestamp, expires_at timestamp,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_tm_recipient_status ON ai_task_manager_notifications(recipient_user_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_tm_task ON ai_task_manager_notifications(task_id);
CREATE INDEX IF NOT EXISTS idx_ai_tm_created ON ai_task_manager_notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_tm_fingerprint ON ai_task_manager_notifications(fingerprint);
