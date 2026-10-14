ALTER TABLE issues ADD COLUMN IF NOT EXISTS issue_number_new VARCHAR(12) DEFAULT NULL;

WITH numbered AS (
  SELECT id,
         TO_CHAR(created_at, 'DDMMYY') AS ddmmyy,
         ROW_NUMBER() OVER (
           PARTITION BY DATE(created_at)
           ORDER BY created_at, id
         ) AS seq
  FROM issues
  WHERE deleted_at IS NULL
)
UPDATE issues i
SET issue_number_new = n.ddmmyy || '-' || LPAD(n.seq::text, 3, '0')
FROM numbered n
WHERE i.id = n.id;

ALTER TABLE issues DROP COLUMN IF EXISTS issue_number;
ALTER TABLE issues RENAME COLUMN issue_number_new TO issue_number;

DROP INDEX IF EXISTS idx_issues_issue_number;
CREATE INDEX IF NOT EXISTS idx_issues_issue_number ON issues(issue_number);
