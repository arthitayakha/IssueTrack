ALTER TABLE board_columns DROP COLUMN IF EXISTS is_locked;
ALTER TABLE issues DROP COLUMN IF EXISTS is_locked;
ALTER TABLE issue_statuses DROP COLUMN IF EXISTS is_locked;
