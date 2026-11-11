-- SUPERSEDED by TypeScript migration
--   apps/api/src/migrations/1826000000000-DropBoardColumnsAndIssueColumnId.ts
-- This file was NEVER applied (see docs/triggers-and-actions.md §12) and its last two
-- statements now duplicate what that tracked migration does — DROP COLUMN issues.column_id
-- then DROP TABLE board_columns. The merge above would also fail: issue_statuses has no
-- `custom_name` column (no entity/DTO maps one), and issue_statuses.is_hidden already
-- exists with the same value the board_columns rows carry (all false), so there is
-- nothing left to copy. Kept for history — do not apply it.

ALTER TABLE issue_statuses ADD COLUMN IF NOT EXISTS custom_name varchar(100);
ALTER TABLE issue_statuses ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

UPDATE issue_statuses s
SET custom_name = bc.custom_name,
    is_hidden = bc.is_hidden
FROM board_columns bc
WHERE bc.status_id = s.id;

ALTER TABLE issues DROP COLUMN IF EXISTS column_id;

DROP TABLE IF EXISTS board_columns;
