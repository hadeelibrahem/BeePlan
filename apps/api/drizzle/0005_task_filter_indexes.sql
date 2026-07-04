-- Supports the new Tasks filtering system: priority ("High Priority" quick
-- filter), category (Categories sidebar + counts), is_focus_task ("Focus
-- Tasks" quick filter), and reminder_enabled ("Has Reminder" filter). These
-- are also applied automatically on boot by DatabaseService.ensureTasksTables.
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks (priority);
CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks (category);
CREATE INDEX IF NOT EXISTS idx_tasks_focus ON tasks (is_focus_task);
CREATE INDEX IF NOT EXISTS idx_tasks_reminder_enabled ON tasks (reminder_enabled);
