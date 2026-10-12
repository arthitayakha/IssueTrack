-- Fix column positions and clean up duplicates

-- Step 1: Reassign issues from duplicate columns to the kept column (lowest id)
UPDATE issues SET board_id = kept.id
FROM (
  SELECT MIN(id) AS id, LOWER(status) AS status_key
  FROM board_columns
  GROUP BY LOWER(status)
) kept
WHERE issues.board_id IN (
  SELECT id FROM board_columns
  WHERE LOWER(status) = kept.status_key
  AND id != kept.id
);

-- Step 2: Remove duplicate columns (keep the one with the lowest id for each status)
DELETE FROM board_columns
WHERE id NOT IN (
  SELECT MIN(id)
  FROM board_columns
  GROUP BY LOWER(status)
);

-- Step 3: Update positions based on status name
UPDATE board_columns SET position = 1 WHERE LOWER(status) = 'backlog';
UPDATE board_columns SET position = 2 WHERE LOWER(status) = 'todo';
UPDATE board_columns SET position = 3 WHERE LOWER(status) = 'doing';
UPDATE board_columns SET position = 4 WHERE LOWER(status) = 'review';
UPDATE board_columns SET position = 5 WHERE LOWER(status) = 'done';

-- Step 4: Add Review column if it doesn't exist
INSERT INTO board_columns (status, custom_name, is_hidden, position, board_id)
SELECT 'Review', NULL, false, 4, 1
WHERE NOT EXISTS (
  SELECT 1 FROM board_columns WHERE LOWER(status) = 'review'
);

-- Step 5: Add unique constraint on status (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_board_columns_status_unique
ON board_columns (LOWER(status));
