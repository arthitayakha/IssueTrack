ALTER TABLE issues ADD COLUMN IF NOT EXISTS issue_number VARCHAR(10) DEFAULT NULL;

WITH numbered AS (
  SELECT id,
         TO_CHAR(created_at, 'YY') AS yr,
         ROW_NUMBER() OVER (
           PARTITION BY EXTRACT(YEAR FROM created_at)
           ORDER BY created_at, id
         ) AS seq
  FROM issues
  WHERE deleted_at IS NULL
)
UPDATE issues i
SET issue_number = n.yr || '-' || LPAD(n.seq::text, 3, '0')
FROM numbered n
WHERE i.id = n.id;

CREATE INDEX IF NOT EXISTS idx_issues_issue_number ON issues(issue_number);
