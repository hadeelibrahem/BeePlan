-- AI Collaboration Planner provenance on subtasks, used by the apply endpoint
-- to identify and replace its own prior output instead of appending
-- duplicates, and to compute semantic-identity dedup at apply time.
ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS source varchar(40);
ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS source_plan_id uuid;
ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS source_proposal_id varchar(64);
ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS semantic_type varchar(30);
ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS subject_keys jsonb;
ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS shared_session_group_id varchar(64);
CREATE INDEX IF NOT EXISTS idx_subtasks_task_source ON subtasks (task_id, source);
