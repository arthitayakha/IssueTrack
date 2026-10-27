-- 0032: create `rule_runs` — every time a rule's conditions pass and it is executed.
-- rule_id is nullable with ON DELETE SET NULL so history survives rule deletion;
-- rule_name keeps a snapshot for display.
-- Idempotent on purpose — safe to run more than once.

CREATE TABLE IF NOT EXISTS rule_runs (
  id           SERIAL PRIMARY KEY,
  rule_id      INT          REFERENCES rules(id) ON DELETE SET NULL,
  rule_name    VARCHAR(150),
  trigger_key  VARCHAR(64)  NOT NULL,
  issue_id     INT          REFERENCES issues(id) ON DELETE SET NULL,
  status       VARCHAR(16)  NOT NULL,   -- applied | skipped | failed
  action_key   VARCHAR(64),
  detail       TEXT,                    -- JSON: error message / skip reason
  duration_ms  INT          DEFAULT 0,
  created_at   TIMESTAMPTZ  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rule_runs_rule  ON rule_runs (rule_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rule_runs_time  ON rule_runs (created_at DESC);
