-- 0029: create `apps` master table, link issues to it, register `app.*` permissions.
-- Idempotent on purpose — safe to run more than once.

CREATE TABLE IF NOT EXISTS apps (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  is_visible  BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE issues
  ADD COLUMN IF NOT EXISTS app_id INTEGER REFERENCES apps(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_issues_app_id ON issues (app_id);

-- permission codes (the permission matrix reads from `permissions`, so insert here)
INSERT INTO permissions (code, action, category) VALUES
  ('app.view',   'app.view',   'app'),
  ('app.create', 'app.create', 'app'),
  ('app.update', 'app.update', 'app'),
  ('app.delete', 'app.delete', 'app')
ON CONFLICT (code) DO NOTHING;

-- default grant: admin only (programmer/customer intentionally omitted so the
-- API does not auto-regrant them on startup — admins can tick them per position)
INSERT INTO role_permissions (role_id, permission)
SELECT r.id, p.code
FROM roles r
JOIN permissions p
  ON p.code IN ('app.view', 'app.create', 'app.update', 'app.delete')
WHERE r.name = 'admin'
ON CONFLICT (role_id, permission) DO NOTHING;
