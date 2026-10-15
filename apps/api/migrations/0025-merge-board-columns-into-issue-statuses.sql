ALTER TABLE issue_statuses ADD COLUMN IF NOT EXISTS custom_name varchar(100);
ALTER TABLE issue_statuses ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

UPDATE issue_statuses s
SET custom_name = bc.custom_name,
    is_hidden = bc.is_hidden
FROM board_columns bc
WHERE bc.status_id = s.id;

ALTER TABLE issues DROP COLUMN IF EXISTS column_id;

DROP TABLE IF EXISTS board_columns;
