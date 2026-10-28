-- 0036-merge-rule-conditions-into-rules.sql
-- Merge `rule_conditions` into the `rules` table as one JSONB array column,
-- mirroring `action_config`. Conditions were never edited per row (the API
-- always replaced the whole set), never joined on and never filtered in SQL,
-- so a separate table only cost a join and two dead columns.

BEGIN;

-- 1) the new home: an ordered array of { field, operator, value, position }
ALTER TABLE rules ADD COLUMN IF NOT EXISTS conditions jsonb NOT NULL DEFAULT '[]';

-- 2) move the data over (rules without conditions keep the empty array)
UPDATE rules r
SET conditions = COALESCE(
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'field', c.field,
        'operator', c.operator,
        'value', c.value,
        'position', c.position
      )
      ORDER BY c.position, c.id
    )
    FROM rule_conditions c
    WHERE c.rule_id = r.id
  ),
  '[]'::jsonb
);

-- 3) drop the dead grouping column: every save forced 'AND' and the engine
--    always AND-combines, so nothing ever read it
ALTER TABLE rules DROP COLUMN IF EXISTS condition_group;

-- 4) the table itself goes away (index idx_rule_conditions_rule with it)
DROP TABLE IF EXISTS rule_conditions;

COMMIT;
