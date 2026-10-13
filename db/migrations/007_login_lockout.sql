-- Durable account lockout state for repeated failed password attempts.
-- The columns also exist in the production schema migration; IF NOT EXISTS
-- keeps this safe for workspaces created before that migration was applied.
ALTER TABLE IF EXISTS crm.users
  ADD COLUMN IF NOT EXISTS failed_login_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;

UPDATE crm.users
SET failed_login_attempts = 0
WHERE failed_login_attempts IS NULL;
