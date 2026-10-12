ALTER TABLE issues ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS deleted_by INT DEFAULT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_issues_deleted_by'
  ) THEN
    ALTER TABLE issues
      ADD CONSTRAINT fk_issues_deleted_by
      FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_issues_deleted_at ON issues(deleted_at);
