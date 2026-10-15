INSERT INTO role_permissions (role_id, permission)
SELECT r.id, 'user.view'
FROM roles r
WHERE r.name = 'programmer'
ON CONFLICT DO NOTHING;
