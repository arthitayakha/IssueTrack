CREATE SEQUENCE IF NOT EXISTS work_sessions_id_seq;

SELECT setval('work_sessions_id_seq', COALESCE((SELECT MAX(id) FROM work_sessions), 1), true);

ALTER TABLE work_sessions
  ALTER COLUMN id SET DEFAULT nextval('work_sessions_id_seq');
