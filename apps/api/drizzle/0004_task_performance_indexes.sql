-- Performance: tasks.findAll/findOne and virtually every task mutation filter
-- by (user_id, id) or user_id alone with no supporting index, and All Tasks /
-- dashboard filtering hits status and due_date. subtasks.task_id is looked up
-- once per task on every task read. None of these had an index.
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks (user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks (due_date);
CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON subtasks (task_id);

-- Note: task_dependencies.task_id is already covered by its composite primary
-- key (task_id, dependency_task_id) — a multi-column btree index can be used
-- for lookups on just its leading column, so no separate index is added here.
