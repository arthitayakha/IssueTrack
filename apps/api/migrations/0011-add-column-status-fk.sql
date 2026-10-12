ALTER TABLE board_columns ADD COLUMN IF NOT EXISTS status_id INTEGER;

UPDATE board_columns c
SET status_id = s.id
FROM issue_statuses s
WHERE LOWER(s.name) = LOWER(c.status);

DELETE FROM board_columns WHERE status_id IS NULL;

ALTER TABLE board_columns
  ADD CONSTRAINT fk_column_status
  FOREIGN KEY (status_id) REFERENCES issue_statuses(id);

ALTER TABLE board_columns ALTER COLUMN status_id SET NOT NULL;
ALTER TABLE board_columns DROP COLUMN status;
