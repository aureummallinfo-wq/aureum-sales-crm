-- Shared, expiring API request budgets. Keys are SHA-256 hashes, not raw IPs
-- or session tokens. Apply before deploying the request-protection runtime.
CREATE TABLE IF NOT EXISTS crm.request_rate_limits (
  key_hash text PRIMARY KEY,
  request_count integer NOT NULL CHECK (request_count > 0),
  window_ends timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS request_rate_limits_expiry_idx ON crm.request_rate_limits (window_ends);
