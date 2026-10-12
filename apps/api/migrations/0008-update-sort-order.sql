WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id ASC) AS new_sort_order
  FROM issue_statuses
)
UPDATE issue_statuses
SET sort_order = ordered.new_sort_order
FROM ordered
WHERE issue_statuses.id = ordered.id;
