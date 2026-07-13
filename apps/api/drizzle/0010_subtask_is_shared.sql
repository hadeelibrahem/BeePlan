-- Explicit shared/personal distinction for subtasks. A subtask is "shared"
-- (team-wide, visible to every collaborator) when is_shared is true, "personal"
-- when it has an assignee_user_id, and "unassigned" otherwise. Never inferred
-- from the title.
ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS is_shared boolean NOT NULL DEFAULT false;
