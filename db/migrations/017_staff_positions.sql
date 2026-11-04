-- Add non-sales staff positions without changing existing lead ownership rules.
ALTER TABLE crm.users DROP CONSTRAINT IF EXISTS users_role_key_check;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'crm.users'::regclass AND conname = 'users_role_key_check') THEN
    ALTER TABLE crm.users ADD CONSTRAINT users_role_key_check CHECK (role_key IN ('super_admin', 'sales_manager', 'sales_agent', 'hr', 'project_manager'));
  END IF;
END $$;

ALTER TABLE crm.user_invites DROP CONSTRAINT IF EXISTS user_invites_role_key_check;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'crm.user_invites'::regclass AND conname = 'user_invites_role_key_check') THEN
    ALTER TABLE crm.user_invites ADD CONSTRAINT user_invites_role_key_check CHECK (role_key IN ('super_admin', 'sales_manager', 'sales_agent', 'hr', 'project_manager'));
  END IF;
END $$;

INSERT INTO crm.roles (workspace_id, key, name)
SELECT id, 'hr', 'HR' FROM crm.workspaces WHERE legacy_id = 'workspace_default'
ON CONFLICT (workspace_id, key) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO crm.roles (workspace_id, key, name)
SELECT id, 'project_manager', 'Project Manager' FROM crm.workspaces WHERE legacy_id = 'workspace_default'
ON CONFLICT (workspace_id, key) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO crm.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM crm.roles r CROSS JOIN crm.permissions p
WHERE r.key = 'hr' AND p.key IN ('dashboard', 'tasks', 'team-chat', 'my-account', 'change-password')
ON CONFLICT DO NOTHING;

INSERT INTO crm.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM crm.roles r CROSS JOIN crm.permissions p
WHERE r.key = 'project_manager' AND p.key IN ('dashboard', 'tasks', 'team-chat', 'reports', 'my-account', 'change-password')
ON CONFLICT DO NOTHING;
