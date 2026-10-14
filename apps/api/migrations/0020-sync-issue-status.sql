-- One-time cleanup: sync issues.status_id with the status of their current column.
-- Fixes data drift caused by IssuesService.move() updating column_id without
-- status_id, which left cards "stuck" on a status after being dragged away.
UPDATE issues i
SET status_id = c.status_id
FROM board_columns c
WHERE c.id = i.column_id
  AND i.status_id IS DISTINCT FROM c.status_id;
