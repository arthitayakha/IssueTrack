CREATE TABLE IF NOT EXISTS issue_labels (
  issue_id INTEGER NOT NULL,
  label_id  INTEGER NOT NULL,
  PRIMARY KEY (issue_id, label_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_issue_labels_issue'
  ) THEN
    ALTER TABLE issue_labels
      ADD CONSTRAINT fk_issue_labels_issue
      FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_issue_labels_label'
  ) THEN
    ALTER TABLE issue_labels
      ADD CONSTRAINT fk_issue_labels_label
      FOREIGN KEY (label_id) REFERENCES labels(id) ON DELETE CASCADE;
  END IF;
END $$;
