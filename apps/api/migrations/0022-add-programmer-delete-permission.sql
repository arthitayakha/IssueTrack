INSERT INTO role_permissions (role_id, permission)
SELECT r.id, 'issue.delete'
FROM roles r
WHERE r.name = 'programmer'
ON CONFLICT (role_id, permission) DO NOTHING;

INSERT INTO position_permissions (position_id, permission)
SELECT p.id, 'issue.delete'
FROM positions p
JOIN roles r ON p.role_id = r.id
WHERE r.name = 'programmer'
ON CONFLICT (position_id, permission) DO NOTHING;
