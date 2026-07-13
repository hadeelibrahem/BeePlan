-- Hot relation and summary lookups used by task details, attachments,
-- collaboration activity, reminders, and the dashboard.
CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id ON task_attachments (task_id);
CREATE INDEX IF NOT EXISTS idx_task_activities_task_created ON task_activities (task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reminders_user_status ON reminders (user_id, status);
CREATE INDEX IF NOT EXISTS idx_reminders_task_id ON reminders (task_id);

-- Accepted/pending member lists almost always filter task/user and status
-- together. The existing single-column indexes cannot serve these as well.
CREATE INDEX IF NOT EXISTS idx_task_members_task_status ON task_members (task_id, status);
CREATE INDEX IF NOT EXISTS idx_task_members_user_status ON task_members (user_id, status);
