INSERT INTO role_permissions (role_id, permission)
SELECT r.id, 'issue.trash.view'
FROM roles r
WHERE r.name = 'programmer'
ON CONFLICT (role_id, permission) DO NOTHING;

INSERT INTO role_permissions (role_id, permission)
SELECT r.id, 'issue.restore'
FROM roles r
WHERE r.name = 'programmer'
ON CONFLICT (role_id, permission) DO NOTHING;

INSERT INTO position_permissions (position_id, permission)
SELECT p.id, 'issue.trash.view'
FROM positions p
JOIN roles r ON p.role_id = r.id
WHERE r.name = 'programmer'
ON CONFLICT (position_id, permission) DO NOTHING;

INSERT INTO position_permissions (position_id, permission)
SELECT p.id, 'issue.restore'
FROM positions p
JOIN roles r ON p.role_id = r.id
WHERE r.name = 'programmer'
ON CONFLICT (position_id, permission) DO NOTHING;
