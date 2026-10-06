CREATE TABLE IF NOT EXISTS position_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS position_template_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id INTEGER REFERENCES position_templates(id) ON DELETE CASCADE,
  permission VARCHAR(100) NOT NULL,
  UNIQUE(template_id, permission)
);

INSERT INTO position_templates (name, is_active) VALUES
  ('customer', true),
  ('staff', true),
  ('manager', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO position_template_permissions (template_id, permission)
SELECT t.id, p.permission
FROM position_templates t
JOIN (
  SELECT 'customer' AS template_name, unnest(ARRAY[
    'auth.login',
    'auth.logout',
    'dashboard.own.view',
    'issue.create',
    'issue.own.view',
    'issue.detail.view',
    'issue.own.update',
    'comment.view',
    'comment.create',
    'comment.own.update',
    'category.view',
    'board.view'
  ]) AS permission
  UNION ALL
  SELECT 'staff', unnest(ARRAY[
    'auth.login',
    'auth.logout',
    'dashboard.own.view',
    'issue.create',
    'issue.all.view',
    'issue.assigned.view',
    'issue.detail.view',
    'issue.own.update',
    'comment.view',
    'comment.create',
    'comment.own.update',
    'category.view',
    'board.view'
  ])
  UNION ALL
  SELECT 'manager', unnest(ARRAY[
    'auth.login',
    'auth.logout',
    'dashboard.own.view',
    'dashboard.overview.view',
    'issue.create',
    'issue.all.view',
    'issue.assigned.view',
    'issue.detail.view',
    'issue.own.update',
    'issue.all.update',
    'issue.assign',
    'issue.reassign',
    'issue.status.update',
    'issue.delete',
    'comment.view',
    'comment.create',
    'comment.own.update',
    'comment.own.delete',
    'comment.all.delete',
    'category.view',
    'board.view',
    'board.create',
    'board.update',
    'board.delete',
    'board.column.create',
    'board.column.update',
    'board.column.delete',
    'report.view',
    'report.export'
  ])
) p ON p.template_name = t.name
ON CONFLICT (template_id, permission) DO NOTHING;
