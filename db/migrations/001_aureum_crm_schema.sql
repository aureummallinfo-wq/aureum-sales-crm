-- Aureum CRM relational schema.
-- The application currently keeps a compatibility snapshot in aureum_crm_state;
-- these tables provide durable, queryable domain storage while the API is migrated.

CREATE TABLE IF NOT EXISTS aureum_schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teams (
  id text PRIMARY KEY,
  manager_id text,
  name text NOT NULL,
  description text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  phone text,
  role text NOT NULL,
  team_id text,
  status text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at text,
  updated_at text
);

CREATE TABLE IF NOT EXISTS user_invites (
  user_id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS user_audit_logs (
  user_id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS leads (
  id text PRIMARY KEY,
  assigned_agent_id text,
  assigned_team_id text,
  created_by text,
  lead_source text,
  status text,
  priority text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at text,
  updated_at text
);

CREATE TABLE IF NOT EXISTS lead_activities (
  id text PRIMARY KEY,
  lead_id text,
  user_id text,
  activity_type text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at text
);

CREATE TABLE IF NOT EXISTS customers (
  id text PRIMARY KEY,
  lead_id text,
  assigned_agent_id text,
  assigned_team_id text,
  created_by text,
  customer_status text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at text,
  updated_at text
);

CREATE TABLE IF NOT EXISTS customer_activities (
  id text PRIMARY KEY,
  customer_id text,
  user_id text,
  activity_type text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at text
);

CREATE TABLE IF NOT EXISTS customer_notes (
  id text PRIMARY KEY,
  customer_id text,
  user_id text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at text
);

CREATE TABLE IF NOT EXISTS customer_follow_ups (
  customer_id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS follow_ups (
  id text PRIMARY KEY,
  customer_id text,
  lead_id text,
  assigned_agent_id text,
  assigned_team_id text,
  status text,
  due_date text,
  due_time text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at text,
  updated_at text
);

CREATE TABLE IF NOT EXISTS follow_up_activities (
  id text PRIMARY KEY,
  follow_up_id text,
  user_id text,
  activity_type text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at text
);

CREATE TABLE IF NOT EXISTS chat_channels (
  id text PRIMARY KEY,
  name text NOT NULL,
  visibility text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id text PRIMARY KEY,
  channel_id text,
  group_id text,
  sender_id text,
  message_type text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at text
);

CREATE TABLE IF NOT EXISTS chat_read_receipts (
  user_id text NOT NULL,
  chat_id text NOT NULL,
  read_at text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (user_id, chat_id)
);

CREATE TABLE IF NOT EXISTS chat_groups (
  id text PRIMARY KEY,
  created_by text,
  is_archived boolean NOT NULL DEFAULT false,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at text,
  updated_at text
);

CREATE TABLE IF NOT EXISTS chat_group_members (
  group_id text NOT NULL,
  user_id text NOT NULL,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS direct_messages (
  id text PRIMARY KEY,
  sender_id text,
  receiver_id text,
  read_at text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at text
);

CREATE TABLE IF NOT EXISTS chat_attachments (
  id text PRIMARY KEY,
  chat_id text,
  message_id text,
  uploaded_by text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  uploaded_at text
);

CREATE TABLE IF NOT EXISTS chat_links (
  id text PRIMARY KEY,
  chat_id text,
  shared_by text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  shared_at text
);

CREATE TABLE IF NOT EXISTS user_activities (
  id text PRIMARY KEY,
  user_id text,
  activity_type text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at text
);

CREATE TABLE IF NOT EXISTS system_settings (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS account_preferences (
  user_id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS lead_statuses (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text,
  is_active boolean,
  sort_order integer,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS lead_tags (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text,
  tag_type text,
  is_active boolean,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS lead_sources (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text,
  is_active boolean,
  is_default boolean,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS notification_settings (
  user_id text NOT NULL,
  event_key text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (user_id, event_key)
);

CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY,
  user_id text,
  event_type text,
  related_entity_type text,
  related_entity_id text,
  is_read boolean,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at text
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id text PRIMARY KEY,
  actor_user_id text,
  entity_type text,
  entity_id text,
  action_type text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at text
);

CREATE TABLE IF NOT EXISTS webhook_connections (
  id text PRIMARY KEY,
  source_platform text,
  status text,
  created_by text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at text,
  updated_at text
);

CREATE TABLE IF NOT EXISTS webhook_logs (
  id text PRIMARY KEY,
  connection_id text,
  status text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at text
);

CREATE TABLE IF NOT EXISTS failed_webhook_leads (
  id text PRIMARY KEY,
  connection_id text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at text
);

CREATE INDEX IF NOT EXISTS idx_users_team_id ON users(team_id);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_agent_id ON leads(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_customers_assigned_agent_id ON customers(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_assigned_agent_id ON follow_ups(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_due_date ON follow_ups(due_date);
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_id ON chat_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_group_id ON chat_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_connection_id ON webhook_logs(connection_id);

INSERT INTO aureum_schema_migrations (version)
VALUES ('001_aureum_crm_schema')
ON CONFLICT (version) DO NOTHING;
