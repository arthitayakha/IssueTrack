CREATE TABLE IF NOT EXISTS boards (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE board_columns ADD COLUMN IF NOT EXISTS board_id INTEGER REFERENCES boards(id);
ALTER TABLE board_columns ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;

UPDATE board_columns SET position = sub.row_num
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) - 1 AS row_num
  FROM board_columns
) sub
WHERE board_columns.id = sub.id;
