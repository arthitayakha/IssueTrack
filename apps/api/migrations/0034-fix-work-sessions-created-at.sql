-- 0034: work_sessions.created_at was `timetz` (time-of-day only — no date),
-- so timer history could never render a real timestamp. Convert it, preferring
-- the session's own started_at when available.
-- Idempotent on purpose — safe to run more than once.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_sessions' AND column_name = 'created_at'
      AND data_type = 'time with time zone'
  ) THEN
    ALTER TABLE work_sessions
      ALTER COLUMN created_at TYPE TIMESTAMPTZ
        USING (COALESCE(started_at, (CURRENT_DATE::timestamp + created_at::time)::timestamptz)),
      ALTER COLUMN created_at SET DEFAULT now();
  END IF;
END $$;
