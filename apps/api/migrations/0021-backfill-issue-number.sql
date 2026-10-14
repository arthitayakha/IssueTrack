WITH numbered AS (
  SELECT
    id,
    to_char(created_at, 'DDMMYY') ||
    '-' ||
    LPAD(
      ROW_NUMBER() OVER (
        PARTITION BY to_char(created_at, 'DDMMYY')
        ORDER BY id
      )::text,
      3,
      '0'
    ) AS new_issue_number
  FROM issues
  WHERE issue_number IS NULL
)
UPDATE issues
SET issue_number = numbered.new_issue_number
FROM numbered
WHERE issues.id = numbered.id;
