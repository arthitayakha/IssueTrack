-- 0037: register `log.view` / `log.export` for the /logs page (global
-- activity feed over `activity_logs`).
-- Idempotent on purpose — safe to run more than once.

INSERT INTO permissions (code, action, category) VALUES
  ('log.view',   'log.view',   'log'),
  ('log.export', 'log.export', 'log')
ON CONFLICT (code) DO NOTHING;

-- default grant: admin only (admins can tick them for roles/positions later
-- from the permission matrix and the position form, same as automation.*)
INSERT INTO role_permissions (role_id, permission)
SELECT r.id, p.code
FROM roles r
JOIN permissions p
  ON p.code IN ('log.view', 'log.export')
WHERE r.name = 'admin'
ON CONFLICT (role_id, permission) DO NOTHING;
