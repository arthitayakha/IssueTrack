-- 0030: drop `rules.description` and `rules.priority`.
-- The wizard no longer collects a rule name/description/priority: the name is
-- derived from the summary sentence, and ordering will fall back to id/time
-- once the engine exists.
-- Idempotent on purpose — safe to run more than once.

ALTER TABLE rules DROP COLUMN IF EXISTS description;
ALTER TABLE rules DROP COLUMN IF EXISTS priority;
