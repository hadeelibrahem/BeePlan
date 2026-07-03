-- Fix data privacy bug: reminders.user_id was nullable and never populated by the
-- API, so every reminder was invisible to per-user filtering only in theory --
-- in practice `findAll()` had no filter at all and returned every user's rows.
-- The rows below are pre-fix orphaned test data with no recoverable owner.
DELETE FROM reminders WHERE user_id IS NULL;

ALTER TABLE reminders
  ALTER COLUMN user_id SET NOT NULL;
