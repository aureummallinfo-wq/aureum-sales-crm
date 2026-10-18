-- Customer relationship statuses are managed separately from lead pipeline statuses.
-- Existing customer rows keep their stored value; disabling a status only prevents new selections.
CREATE TABLE IF NOT EXISTS crm.customer_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES crm.workspaces(id) ON DELETE CASCADE,
  legacy_id text,
  name text NOT NULL,
  slug text NOT NULL,
  color text,
  sort_order integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (workspace_id, slug),
  UNIQUE (workspace_id, legacy_id)
);

WITH defaults(legacy_id, name, slug, color, sort_order) AS (
  VALUES
    ('customer-status-active', 'Active', 'active', '#5d9670', 10),
    ('customer-status-hot', 'Hot', 'hot', '#b36b55', 20),
    ('customer-status-cold', 'Cold', 'cold', '#9e9a92', 30),
    ('customer-status-follow-up', 'Follow-up', 'follow-up', '#b6904f', 40),
    ('customer-status-interested', 'Interested', 'interested', '#b6904f', 50),
    ('customer-status-not-interested', 'Not Interested', 'not-interested', '#9e9a92', 60),
    ('customer-status-closed-won', 'Closed Won', 'closed-won', '#5d9670', 70)
)
INSERT INTO crm.customer_statuses (workspace_id, legacy_id, name, slug, color, sort_order, is_default, is_active)
SELECT w.id, d.legacy_id, d.name, d.slug, d.color, d.sort_order, true, true
FROM crm.workspaces w CROSS JOIN defaults d
WHERE w.legacy_id = 'workspace_default'
ON CONFLICT (workspace_id, legacy_id) DO NOTHING;

-- Normalize retired labels while preserving the customer relationship history.
UPDATE crm.customers SET customer_status = 'Interested' WHERE customer_status = 'Booking Interested';
UPDATE crm.customers SET customer_status = 'Active' WHERE customer_status = 'Warm';
UPDATE crm.customers SET customer_status = 'Not Interested' WHERE customer_status = 'Closed Lost';
