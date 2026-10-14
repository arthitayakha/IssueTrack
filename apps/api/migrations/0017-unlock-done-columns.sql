UPDATE board_columns SET is_locked = false WHERE LOWER(status) = 'done';
UPDATE issues SET is_locked = false WHERE column_id IN (SELECT id FROM board_columns WHERE LOWER(status) = 'done');
