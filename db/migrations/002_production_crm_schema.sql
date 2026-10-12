-- Production CRM schema. The legacy public tables remain available during migration;
-- this schema is the durable source of truth for the next repository-backed API layer.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS crm;

CREATE TABLE IF NOT EXISTS crm.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Karachi',
  currency text NOT NULL DEFAULT 'PKR',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES crm.workspaces(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  UNIQUE (workspace_id, key)
);

CREATE TABLE IF NOT EXISTS crm.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS crm.role_permissions (
  role_id uuid NOT NULL REFERENCES crm.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES crm.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS crm.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES crm.workspaces(id) ON DELETE CASCADE,
  legacy_id text,
  name text NOT NULL,
  description text,
  manager_user_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, legacy_id),
  UNIQUE (workspace_id, name)
);

CREATE TABLE IF NOT EXISTS crm.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES crm.workspaces(id) ON DELETE CASCADE,
  legacy_id text,
  email text NOT NULL,
  full_name text NOT NULL,
  phone text,
  password_hash text NOT NULL,
  role_key text NOT NULL CHECK (role_key IN ('super_admin', 'sales_manager', 'sales_agent')),
  team_id uuid REFERENCES crm.teams(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending', 'suspended')),
  must_change_password boolean NOT NULL DEFAULT false,
  last_login_at timestamptz,
  last_activity_at timestamptz,
  failed_login_attempts integer NOT NULL DEFAULT 0 CHECK (failed_login_attempts >= 0),
  locked_until timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (workspace_id, email),
  UNIQUE (workspace_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS crm.team_memberships (
  team_id uuid NOT NULL REFERENCES crm.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES crm.users(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  PRIMARY KEY (team_id, user_id),
  CHECK (left_at IS NULL OR left_at >= joined_at)
);

CREATE TABLE IF NOT EXISTS crm.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES crm.users(id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL,
  ip_address inet,
  user_agent text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES crm.users(id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.user_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES crm.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES crm.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  role_key text NOT NULL CHECK (role_key IN ('super_admin', 'sales_manager', 'sales_agent')),
  token_hash text UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'accepted', 'expired', 'failed', 'revoked')),
  expires_at timestamptz,
  accepted_at timestamptz,
  created_by uuid REFERENCES crm.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.login_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES crm.users(id) ON DELETE SET NULL,
  email text,
  event_type text NOT NULL CHECK (event_type IN ('login_success', 'login_failed', 'logout', 'session_revoked', 'password_changed')),
  ip_address inet,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.user_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES crm.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.lead_statuses (
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

CREATE TABLE IF NOT EXISTS crm.lead_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES crm.workspaces(id) ON DELETE CASCADE,
  legacy_id text,
  name text NOT NULL,
  slug text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (workspace_id, slug),
  UNIQUE (workspace_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS crm.lead_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES crm.workspaces(id) ON DELETE CASCADE,
  legacy_id text,
  name text NOT NULL,
  slug text NOT NULL,
  tag_type text NOT NULL DEFAULT 'lead',
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (workspace_id, slug),
  UNIQUE (workspace_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS crm.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES crm.workspaces(id) ON DELETE CASCADE,
  legacy_id text,
  full_name text NOT NULL,
  email text,
  phone text,
  whatsapp_number text,
  city text,
  area text,
  interested_in text,
  property_type text,
  budget text,
  preferred_location text,
  purpose text,
  buying_timeline text,
  financing_required boolean NOT NULL DEFAULT false,
  status_id uuid REFERENCES crm.lead_statuses(id) ON DELETE RESTRICT,
  source_id uuid REFERENCES crm.lead_sources(id) ON DELETE SET NULL,
  priority text NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High', 'VIP')),
  assigned_agent_id uuid REFERENCES crm.users(id) ON DELETE SET NULL,
  assigned_team_id uuid REFERENCES crm.teams(id) ON DELETE SET NULL,
  created_by uuid REFERENCES crm.users(id) ON DELETE SET NULL,
  external_source text,
  external_lead_id text,
  idempotency_key text,
  last_contacted_at timestamptz,
  next_follow_up_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (workspace_id, legacy_id),
  UNIQUE (workspace_id, external_source, external_lead_id),
  UNIQUE (workspace_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS crm.lead_tag_assignments (
  lead_id uuid NOT NULL REFERENCES crm.leads(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES crm.lead_tags(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES crm.users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, tag_id)
);

CREATE TABLE IF NOT EXISTS crm.lead_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES crm.leads(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES crm.users(id) ON DELETE SET NULL,
  activity_type text NOT NULL,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.lead_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES crm.leads(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES crm.users(id) ON DELETE SET NULL,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS crm.lead_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES crm.leads(id) ON DELETE CASCADE,
  from_status_id uuid REFERENCES crm.lead_statuses(id) ON DELETE SET NULL,
  to_status_id uuid REFERENCES crm.lead_statuses(id) ON DELETE RESTRICT,
  changed_by uuid REFERENCES crm.users(id) ON DELETE SET NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.lead_assignment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES crm.leads(id) ON DELETE CASCADE,
  from_agent_id uuid REFERENCES crm.users(id) ON DELETE SET NULL,
  to_agent_id uuid REFERENCES crm.users(id) ON DELETE SET NULL,
  from_team_id uuid REFERENCES crm.teams(id) ON DELETE SET NULL,
  to_team_id uuid REFERENCES crm.teams(id) ON DELETE SET NULL,
  changed_by uuid REFERENCES crm.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES crm.workspaces(id) ON DELETE CASCADE,
  legacy_id text,
  lead_id uuid NOT NULL UNIQUE REFERENCES crm.leads(id) ON DELETE RESTRICT,
  full_name text NOT NULL,
  email text,
  phone text,
  whatsapp_number text,
  customer_status text NOT NULL DEFAULT 'Active',
  assigned_agent_id uuid REFERENCES crm.users(id) ON DELETE SET NULL,
  assigned_team_id uuid REFERENCES crm.teams(id) ON DELETE SET NULL,
  created_by uuid REFERENCES crm.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (workspace_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS crm.customer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES crm.customers(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES crm.users(id) ON DELETE SET NULL,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS crm.customer_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES crm.customers(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES crm.users(id) ON DELETE SET NULL,
  activity_type text NOT NULL,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.customer_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES crm.customers(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  changed_by uuid REFERENCES crm.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES crm.workspaces(id) ON DELETE CASCADE,
  legacy_id text,
  lead_id uuid REFERENCES crm.leads(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES crm.customers(id) ON DELETE CASCADE,
  assigned_agent_id uuid NOT NULL REFERENCES crm.users(id) ON DELETE RESTRICT,
  assigned_team_id uuid REFERENCES crm.teams(id) ON DELETE SET NULL,
  follow_up_type text NOT NULL,
  due_at timestamptz NOT NULL,
  priority text NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High', 'VIP')),
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Completed', 'Overdue', 'Missed', 'Rescheduled', 'Cancelled')),
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz,
  created_by uuid REFERENCES crm.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (workspace_id, legacy_id),
  CHECK (lead_id IS NOT NULL OR customer_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS crm.follow_up_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follow_up_id uuid NOT NULL REFERENCES crm.follow_ups(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES crm.users(id) ON DELETE SET NULL,
  activity_type text NOT NULL,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.follow_up_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follow_up_id uuid NOT NULL REFERENCES crm.follow_ups(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  changed_by uuid REFERENCES crm.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.chat_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES crm.workspaces(id) ON DELETE CASCADE,
  legacy_id text,
  name text NOT NULL,
  description text,
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'management', 'private')),
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS crm.chat_channel_members (
  channel_id uuid NOT NULL REFERENCES crm.chat_channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES crm.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS crm.chat_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES crm.workspaces(id) ON DELETE CASCADE,
  legacy_id text,
  name text NOT NULL,
  description text,
  created_by uuid REFERENCES crm.users(id) ON DELETE SET NULL,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS crm.chat_group_members (
  group_id uuid NOT NULL REFERENCES crm.chat_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES crm.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS crm.direct_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES crm.workspaces(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.direct_conversation_members (
  conversation_id uuid NOT NULL REFERENCES crm.direct_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES crm.users(id) ON DELETE CASCADE,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS crm.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES crm.workspaces(id) ON DELETE CASCADE,
  legacy_id text UNIQUE,
  channel_id uuid REFERENCES crm.chat_channels(id) ON DELETE CASCADE,
  group_id uuid REFERENCES crm.chat_groups(id) ON DELETE CASCADE,
  direct_conversation_id uuid REFERENCES crm.direct_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES crm.users(id) ON DELETE RESTRICT,
  message_type text NOT NULL DEFAULT 'text',
  message_text text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (((channel_id IS NOT NULL)::integer + (group_id IS NOT NULL)::integer + (direct_conversation_id IS NOT NULL)::integer) = 1),
  CHECK (message_text IS NOT NULL OR message_type <> 'text')
);

CREATE TABLE IF NOT EXISTS crm.chat_read_receipts (
  message_id uuid NOT NULL REFERENCES crm.chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES crm.users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS crm.chat_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES crm.chat_messages(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES crm.users(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  file_type text,
  file_size bigint CHECK (file_size IS NULL OR file_size >= 0),
  object_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.chat_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES crm.chat_messages(id) ON DELETE CASCADE,
  shared_by uuid REFERENCES crm.users(id) ON DELETE SET NULL,
  title text,
  url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.chat_message_reactions (
  message_id uuid NOT NULL REFERENCES crm.chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES crm.users(id) ON DELETE CASCADE,
  reaction text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, reaction)
);

CREATE TABLE IF NOT EXISTS crm.notification_definitions (
  event_key text PRIMARY KEY,
  event_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS crm.notification_settings (
  user_id uuid NOT NULL REFERENCES crm.users(id) ON DELETE CASCADE,
  event_key text NOT NULL REFERENCES crm.notification_definitions(event_key) ON DELETE CASCADE,
  in_app_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT false,
  whatsapp_enabled boolean NOT NULL DEFAULT false,
  sms_enabled boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, event_key)
);

CREATE TABLE IF NOT EXISTS crm.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES crm.users(id) ON DELETE CASCADE,
  event_key text REFERENCES crm.notification_definitions(event_key) ON DELETE SET NULL,
  title text NOT NULL,
  message text NOT NULL,
  related_entity_type text,
  related_entity_id uuid,
  dedupe_key text,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, dedupe_key)
);

CREATE TABLE IF NOT EXISTS crm.notification_delivery_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES crm.notifications(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('in_app', 'email', 'whatsapp', 'sms')),
  status text NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  error_message text,
  last_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES crm.workspaces(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES crm.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.webhook_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES crm.workspaces(id) ON DELETE CASCADE,
  legacy_id text,
  name text NOT NULL,
  source_platform text NOT NULL,
  secret_hash text NOT NULL,
  status text NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'disabled')),
  field_mappings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES crm.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS crm.webhook_field_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES crm.webhook_connections(id) ON DELETE CASCADE,
  external_field text NOT NULL,
  internal_field text NOT NULL,
  UNIQUE (connection_id, external_field)
);

CREATE TABLE IF NOT EXISTS crm.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES crm.webhook_connections(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  external_lead_id text,
  source_platform text NOT NULL,
  payload jsonb NOT NULL,
  signature_valid boolean NOT NULL DEFAULT false,
  status text NOT NULL CHECK (status IN ('received', 'processed', 'failed', 'duplicate')),
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (connection_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS crm.webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES crm.webhook_events(id) ON DELETE SET NULL,
  connection_id uuid REFERENCES crm.webhook_connections(id) ON DELETE CASCADE,
  status text NOT NULL,
  message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.failed_webhook_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES crm.webhook_events(id) ON DELETE SET NULL,
  connection_id uuid NOT NULL REFERENCES crm.webhook_connections(id) ON DELETE CASCADE,
  external_lead_id text,
  payload jsonb NOT NULL,
  error_message text NOT NULL,
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  next_retry_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.automation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES crm.workspaces(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_event_id uuid NOT NULL REFERENCES crm.automation_events(id) ON DELETE CASCADE,
  consumer text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  UNIQUE (automation_event_id, consumer)
);

CREATE TABLE IF NOT EXISTS crm.outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES crm.workspaces(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid,
  payload jsonb NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'delivered', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.scheduled_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES crm.workspaces(id) ON DELETE CASCADE,
  job_key text NOT NULL,
  cron_expression text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  UNIQUE (workspace_id, job_key)
);

CREATE TABLE IF NOT EXISTS crm.job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES crm.scheduled_jobs(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS crm.data_retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES crm.workspaces(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  retention_days integer NOT NULL CHECK (retention_days > 0),
  is_enabled boolean NOT NULL DEFAULT true,
  UNIQUE (workspace_id, entity_type)
);

ALTER TABLE crm.lead_activities ADD COLUMN IF NOT EXISTS legacy_id text;
ALTER TABLE crm.lead_notes ADD COLUMN IF NOT EXISTS legacy_id text;
ALTER TABLE crm.customer_activities ADD COLUMN IF NOT EXISTS legacy_id text;
ALTER TABLE crm.customer_notes ADD COLUMN IF NOT EXISTS legacy_id text;
ALTER TABLE crm.follow_up_activities ADD COLUMN IF NOT EXISTS legacy_id text;
ALTER TABLE crm.audit_events ADD COLUMN IF NOT EXISTS legacy_id text;
DROP INDEX IF EXISTS idx_crm_lead_activities_legacy_id;
DROP INDEX IF EXISTS idx_crm_lead_notes_legacy_id;
DROP INDEX IF EXISTS idx_crm_customer_activities_legacy_id;
DROP INDEX IF EXISTS idx_crm_customer_notes_legacy_id;
DROP INDEX IF EXISTS idx_crm_follow_up_activities_legacy_id;
DROP INDEX IF EXISTS idx_crm_audit_events_legacy_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_lead_activities_legacy_id ON crm.lead_activities(legacy_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_lead_notes_legacy_id ON crm.lead_notes(legacy_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_customer_activities_legacy_id ON crm.customer_activities(legacy_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_customer_notes_legacy_id ON crm.customer_notes(legacy_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_follow_up_activities_legacy_id ON crm.follow_up_activities(legacy_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_audit_events_legacy_id ON crm.audit_events(legacy_id);

CREATE OR REPLACE FUNCTION crm.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at ON crm.workspaces;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.workspaces FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON crm.teams;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.teams FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON crm.users;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.users FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON crm.leads;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.leads FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON crm.lead_notes;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.lead_notes FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON crm.customers;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.customers FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON crm.customer_notes;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.customer_notes FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON crm.follow_ups;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.follow_ups FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON crm.chat_channels;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.chat_channels FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON crm.chat_groups;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.chat_groups FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON crm.direct_conversations;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.direct_conversations FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON crm.webhook_connections;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.webhook_connections FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_crm_users_email ON crm.users(email);
CREATE INDEX IF NOT EXISTS idx_crm_users_team ON crm.users(team_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_scope ON crm.leads(workspace_id, assigned_team_id, assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_status ON crm.leads(workspace_id, status_id, priority);
CREATE INDEX IF NOT EXISTS idx_crm_leads_created ON crm.leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_followups_due ON crm.follow_ups(workspace_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_crm_notifications_unread ON crm.notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_messages_conversations ON crm.chat_messages(channel_id, group_id, direct_conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_outbox_delivery ON crm.outbox_events(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_crm_webhook_events_external ON crm.webhook_events(connection_id, external_lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_audit_entity ON crm.audit_events(entity_type, entity_id, created_at DESC);

CREATE OR REPLACE VIEW crm.v_overdue_follow_ups AS
SELECT f.id, f.workspace_id, f.lead_id, f.customer_id, f.assigned_agent_id, f.assigned_team_id, f.due_at
FROM crm.follow_ups f
WHERE f.deleted_at IS NULL AND f.status IN ('Pending', 'Overdue') AND f.due_at < now();

CREATE OR REPLACE VIEW crm.v_unread_notification_counts AS
SELECT user_id, count(*)::integer AS unread_count
FROM crm.notifications
WHERE is_read = false
GROUP BY user_id;

CREATE OR REPLACE VIEW crm.v_pending_outbox_events AS
SELECT * FROM crm.outbox_events
WHERE status IN ('pending', 'failed') AND next_attempt_at <= now()
ORDER BY created_at;
