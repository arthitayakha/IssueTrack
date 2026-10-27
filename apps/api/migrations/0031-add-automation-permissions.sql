-- 0031: register `automation.*` permissions for the rules API.
-- Idempotent on purpose — safe to run more than once.

INSERT INTO permissions (code, action, category) VALUES
  ('automation.view',   'automation.view',   'automation'),
  ('automation.update', 'automation.update', 'automation')
ON CONFLICT (code) DO NOTHING;

-- default grant: admin only (admins can tick them for other roles later
-- from the permission matrix, same as app.* in 0029)
INSERT INTO role_permissions (role_id, permission)
SELECT r.id, p.code
FROM roles r
JOIN permissions p
  ON p.code IN ('automation.view', 'automation.update')
WHERE r.name = 'admin'
ON CONFLICT (role_id, permission) DO NOTHING;
