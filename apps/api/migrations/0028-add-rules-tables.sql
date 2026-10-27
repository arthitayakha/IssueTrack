-- 0028: create `rules` and `rule_conditions` tables for the automation rule engine.
-- Design reference: docs/triggers-and-actions.md §5
-- Idempotent on purpose — safe to run more than once.

CREATE TABLE IF NOT EXISTS rules (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(150) NOT NULL,
  trigger_key     VARCHAR(64)  NOT NULL,      -- "issue.moved"
  template_key    VARCHAR(64),                -- "moved_to"
  category        VARCHAR(64),                -- "card_move"
  action_key      VARCHAR(64)  NOT NULL,      -- "issue.lock"
  action_config   JSONB        NOT NULL DEFAULT '{}',
  condition_group VARCHAR(4)   DEFAULT 'AND',
  is_active       BOOLEAN      DEFAULT false,
  stop_on_error   BOOLEAN      DEFAULT false,
  created_by      INT          REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ  DEFAULT now(),
  updated_at      TIMESTAMPTZ  DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rule_conditions (
  id              SERIAL PRIMARY KEY,
  rule_id         INT NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
  field           VARCHAR(64)  NOT NULL,      -- "to_status"
  operator        VARCHAR(16)  NOT NULL,      -- "="
  value           TEXT,
  value_type      VARCHAR(16)  DEFAULT 'text',
  condition_group VARCHAR(4)   DEFAULT 'AND',
  position        INT          DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_rules_trigger        ON rules (trigger_key);
CREATE INDEX IF NOT EXISTS idx_rule_conditions_rule ON rule_conditions (rule_id, position);
