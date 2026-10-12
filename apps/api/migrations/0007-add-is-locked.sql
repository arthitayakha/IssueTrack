ALTER TABLE board_columns ADD COLUMN IF NOT EXISTS is_locked boolean DEFAULT false;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS is_locked boolean DEFAULT false;

UPDATE board_columns SET is_locked = true WHERE LOWER(status) = 'done';
