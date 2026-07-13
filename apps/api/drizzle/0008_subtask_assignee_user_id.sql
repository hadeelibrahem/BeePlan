-- Structured assignee link for subtasks, used by the AI Collaboration
-- Planner apply step (and available for manual assignment going forward).
ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS assignee_user_id uuid REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_subtasks_assignee_user_id ON subtasks (assignee_user_id);
