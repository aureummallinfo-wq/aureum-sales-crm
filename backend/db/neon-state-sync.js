const crypto = require('node:crypto');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function stableUuid(value) {
  return crypto.createHash('md5').update(`aureum:${String(value)}`).digest('hex').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
}

function uuidFor(value) {
  const text = String(value || '');
  return UUID_RE.test(text) ? text : stableUuid(text);
}

function json(value) {
  return JSON.stringify(value === undefined ? {} : value);
}

function timestamp(value, time = null) {
  if (!value || ['Today', 'Yesterday', 'Not contacted', 'Not scheduled'].includes(String(value))) return null;
  const raw = time ? `${value}T${time}:00` : String(value);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function slug(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
}

function mapEntries(value) {
  if (value instanceof Map) return [...value.entries()];
  return Array.isArray(value) ? value : [];
}

async function query(tx, text, params = []) {
  return tx.query(text, params);
}

async function syncCrmSnapshot(sql, snapshot, options = {}) {
  if (!sql || !snapshot) return { skipped: true };
  const workspaceLegacyId = options.workspaceLegacyId || 'workspace_default';
  const result = { workspace: workspaceLegacyId, users: 0, teams: 0, leads: 0, customers: 0, followUps: 0, chat: 0, notifications: 0, webhooks: 0 };

  // The reconciliation intentionally performs ordered idempotent upserts so
  // it works with both the direct PostgreSQL and serverless SQL adapters while
  // the route modules move to repository transactions.
  const tx = sql;
    const workspaceRows = await query(tx, 'SELECT id FROM crm.workspaces WHERE legacy_id = $1 AND is_active = true LIMIT 1', [workspaceLegacyId]);
    const workspaceId = workspaceRows[0]?.id;
    if (!workspaceId) throw new Error(`CRM workspace ${workspaceLegacyId} is missing; run the database migration first.`);

    const teamIds = new Map();
    for (const team of Array.isArray(snapshot.teams) ? snapshot.teams : []) {
      const rows = await query(tx, `INSERT INTO crm.teams (workspace_id, legacy_id, name, description, is_active, updated_at)
        VALUES ($1, $2, $3, $4, true, now())
        ON CONFLICT (workspace_id, legacy_id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, updated_at = now()
        RETURNING id`, [workspaceId, team.id, team.name || team.id, team.description || null]);
      teamIds.set(team.id, rows[0].id);
      result.teams += 1;
    }

    const userIds = new Map();
    for (const user of Array.isArray(snapshot.users) ? snapshot.users : []) {
      const rows = await query(tx, `INSERT INTO crm.users (workspace_id, legacy_id, email, full_name, phone, password_hash, role_key, team_id, status, must_change_password, last_login_at, last_activity_at, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, coalesce($13::timestamptz, now()), coalesce($14::timestamptz, now()))
        ON CONFLICT (workspace_id, legacy_id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, password_hash = EXCLUDED.password_hash, role_key = EXCLUDED.role_key, team_id = EXCLUDED.team_id, status = EXCLUDED.status, must_change_password = EXCLUDED.must_change_password, last_login_at = EXCLUDED.last_login_at, last_activity_at = EXCLUDED.last_activity_at, updated_at = now()
        RETURNING id`, [workspaceId, user.id, String(user.email || `${user.id}@local.invalid`).toLowerCase(), user.full_name || user.id, user.phone || null, user.password_hash || '', user.role || 'sales_agent', teamIds.get(user.team_id) || null, user.status || 'active', Boolean(user.must_change_password), timestamp(user.last_login_at), timestamp(user.last_activity_at), timestamp(user.created_at), timestamp(user.updated_at)]);
      userIds.set(user.id, rows[0].id);
      result.users += 1;
    }
    for (const team of Array.isArray(snapshot.teams) ? snapshot.teams : []) {
      await query(tx, 'UPDATE crm.teams SET manager_user_id = $1, updated_at = now() WHERE workspace_id = $2 AND legacy_id = $3', [userIds.get(team.manager_id) || null, workspaceId, team.id]);
      if (userIds.get(team.manager_id) && teamIds.get(team.id)) await query(tx, `INSERT INTO crm.team_memberships (team_id, user_id, is_primary) VALUES ($1, $2, true) ON CONFLICT (team_id, user_id) DO UPDATE SET is_primary = true`, [teamIds.get(team.id), userIds.get(team.manager_id)]);
    }
    for (const user of Array.isArray(snapshot.users) ? snapshot.users : []) {
      if (teamIds.get(user.team_id) && userIds.get(user.id)) await query(tx, `INSERT INTO crm.team_memberships (team_id, user_id, is_primary) VALUES ($1, $2, true) ON CONFLICT (team_id, user_id) DO UPDATE SET is_primary = true`, [teamIds.get(user.team_id), userIds.get(user.id)]);
    }

    const statusIds = new Map();
    for (const item of Array.isArray(snapshot.leadStatuses) ? snapshot.leadStatuses : []) {
      const rows = await query(tx, `INSERT INTO crm.lead_statuses (workspace_id, legacy_id, name, slug, color, sort_order, is_default, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (workspace_id, legacy_id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug, color = EXCLUDED.color, sort_order = EXCLUDED.sort_order, is_default = EXCLUDED.is_default, is_active = EXCLUDED.is_active RETURNING id`, [workspaceId, item.id, item.name, item.slug || slug(item.name), item.color || null, Number(item.sort_order || 0), Boolean(item.is_default), item.is_active !== false]);
      statusIds.set(item.name, rows[0].id);
      statusIds.set(item.id, rows[0].id);
    }
    const sourceIds = new Map();
    for (const item of Array.isArray(snapshot.leadSources) ? snapshot.leadSources : []) {
      const rows = await query(tx, `INSERT INTO crm.lead_sources (workspace_id, legacy_id, name, slug, is_default, is_active) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (workspace_id, legacy_id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug, is_default = EXCLUDED.is_default, is_active = EXCLUDED.is_active RETURNING id`, [workspaceId, item.id, item.name, item.slug || slug(item.name), Boolean(item.is_default), item.is_active !== false]);
      sourceIds.set(item.name, rows[0].id);
      sourceIds.set(item.id, rows[0].id);
    }
    const tagIds = new Map();
    for (const item of Array.isArray(snapshot.leadTags) ? snapshot.leadTags : []) {
      const rows = await query(tx, `INSERT INTO crm.lead_tags (workspace_id, legacy_id, name, slug, tag_type, is_active) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (workspace_id, legacy_id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug, tag_type = EXCLUDED.tag_type, is_active = EXCLUDED.is_active RETURNING id`, [workspaceId, item.id, item.name, item.slug || slug(item.name), item.tag_type || 'lead', item.is_active !== false]);
      tagIds.set(item.name, rows[0].id);
      tagIds.set(item.id, rows[0].id);
    }

    const leadIds = new Map();
    for (const lead of Array.isArray(snapshot.leads) ? snapshot.leads : []) {
      const rows = await query(tx, `INSERT INTO crm.leads (workspace_id, legacy_id, full_name, email, phone, whatsapp_number, city, area, interested_in, property_type, budget, preferred_location, purpose, buying_timeline, financing_required, status_id, source_id, priority, assigned_agent_id, assigned_team_id, created_by, external_source, external_lead_id, idempotency_key, last_contacted_at, next_follow_up_at, metadata, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27::jsonb,now())
        ON CONFLICT (workspace_id, legacy_id) DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email, phone = EXCLUDED.phone, whatsapp_number = EXCLUDED.whatsapp_number, city = EXCLUDED.city, area = EXCLUDED.area, interested_in = EXCLUDED.interested_in, property_type = EXCLUDED.property_type, budget = EXCLUDED.budget, preferred_location = EXCLUDED.preferred_location, purpose = EXCLUDED.purpose, buying_timeline = EXCLUDED.buying_timeline, financing_required = EXCLUDED.financing_required, status_id = EXCLUDED.status_id, source_id = EXCLUDED.source_id, priority = EXCLUDED.priority, assigned_agent_id = EXCLUDED.assigned_agent_id, assigned_team_id = EXCLUDED.assigned_team_id, created_by = EXCLUDED.created_by, external_source = EXCLUDED.external_source, external_lead_id = EXCLUDED.external_lead_id, idempotency_key = EXCLUDED.idempotency_key, last_contacted_at = EXCLUDED.last_contacted_at, next_follow_up_at = EXCLUDED.next_follow_up_at, metadata = EXCLUDED.metadata, updated_at = now() RETURNING id`, [workspaceId, lead.id, lead.full_name || 'Unnamed lead', lead.email || null, lead.phone || null, lead.whatsapp_number || null, lead.city || null, lead.area || null, lead.interested_in || null, lead.property_type || null, lead.budget || null, lead.preferred_location || null, lead.purpose || null, lead.buying_timeline || null, Boolean(lead.financing_required), statusIds.get(lead.status) || null, sourceIds.get(lead.lead_source) || null, lead.priority || 'Medium', userIds.get(lead.assigned_agent_id) || null, teamIds.get(lead.assigned_team_id) || null, userIds.get(lead.created_by) || null, lead.imported_from || lead.source_platform || null, lead.external_lead_id || null, lead.idempotency_key || null, timestamp(lead.last_contacted_at), timestamp(lead.next_follow_up_at), json(lead)]);
      leadIds.set(lead.id, rows[0].id);
      await query(tx, 'DELETE FROM crm.lead_tag_assignments WHERE lead_id = $1', [rows[0].id]);
      for (const tag of Array.isArray(lead.tags) ? lead.tags : []) if (tagIds.get(tag)) await query(tx, `INSERT INTO crm.lead_tag_assignments (lead_id, tag_id, assigned_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [rows[0].id, tagIds.get(tag), userIds.get(lead.created_by) || null]);
      result.leads += 1;
    }

    const customerIds = new Map();
    for (const customer of Array.isArray(snapshot.customers) ? snapshot.customers : []) {
      const leadId = leadIds.get(customer.lead_id);
      if (!leadId) continue;
      const rows = await query(tx, `INSERT INTO crm.customers (workspace_id, legacy_id, lead_id, full_name, email, phone, whatsapp_number, customer_status, assigned_agent_id, assigned_team_id, created_by, metadata, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,now())
        ON CONFLICT (workspace_id, legacy_id) DO UPDATE SET lead_id = EXCLUDED.lead_id, full_name = EXCLUDED.full_name, email = EXCLUDED.email, phone = EXCLUDED.phone, whatsapp_number = EXCLUDED.whatsapp_number, customer_status = EXCLUDED.customer_status, assigned_agent_id = EXCLUDED.assigned_agent_id, assigned_team_id = EXCLUDED.assigned_team_id, created_by = EXCLUDED.created_by, metadata = EXCLUDED.metadata, updated_at = now() RETURNING id`, [workspaceId, customer.id, leadId, customer.full_name || 'Unnamed customer', customer.email || null, customer.phone || null, customer.whatsapp_number || null, customer.customer_status || 'Active', userIds.get(customer.assigned_agent_id) || null, teamIds.get(customer.assigned_team_id) || null, userIds.get(customer.created_by) || null, json(customer)]);
      customerIds.set(customer.id, rows[0].id);
      result.customers += 1;
    }

    for (const item of Array.isArray(snapshot.followUps) ? snapshot.followUps : []) {
      const assignedAgentId = userIds.get(item.assigned_agent_id) || userIds.get(item.created_by);
      if (!assignedAgentId) continue;
      const dueAt = timestamp(item.due_date, item.due_time) || new Date().toISOString();
      await query(tx, `INSERT INTO crm.follow_ups (workspace_id, legacy_id, lead_id, customer_id, assigned_agent_id, assigned_team_id, follow_up_type, due_at, priority, status, notes, metadata, completed_at, created_by, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,now())
        ON CONFLICT (workspace_id, legacy_id) DO UPDATE SET lead_id = EXCLUDED.lead_id, customer_id = EXCLUDED.customer_id, assigned_agent_id = EXCLUDED.assigned_agent_id, assigned_team_id = EXCLUDED.assigned_team_id, follow_up_type = EXCLUDED.follow_up_type, due_at = EXCLUDED.due_at, priority = EXCLUDED.priority, status = EXCLUDED.status, notes = EXCLUDED.notes, metadata = EXCLUDED.metadata, completed_at = EXCLUDED.completed_at, created_by = EXCLUDED.created_by, updated_at = now()`, [workspaceId, item.id, leadIds.get(item.lead_id) || null, customerIds.get(item.customer_id) || null, assignedAgentId, teamIds.get(item.assigned_team_id) || null, item.follow_up_type || item.type || 'General Follow-up', dueAt, item.priority || 'Medium', item.status || 'Pending', item.notes || item.note || null, json(item), timestamp(item.completed_at), userIds.get(item.created_by) || assignedAgentId]);
      result.followUps += 1;
    }

    const definitions = Array.isArray(snapshot.notificationDefinitions) ? snapshot.notificationDefinitions : [];
    for (const definition of definitions) await query(tx, `INSERT INTO crm.notification_definitions (event_key, event_name, is_active) VALUES ($1,$2,true) ON CONFLICT (event_key) DO UPDATE SET event_name = EXCLUDED.event_name`, [definition.event_key, definition.event_name || definition.event_key]);
    const notificationSettingEntries = mapEntries(snapshot.notificationSettings);
    if (notificationSettingEntries.length) {
      for (const [legacyUserId, entries] of notificationSettingEntries) for (const item of entries || []) if (userIds.get(legacyUserId) && item.event_key) await query(tx, `INSERT INTO crm.notification_settings (user_id,event_key,in_app_enabled,email_enabled,whatsapp_enabled,sms_enabled) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (user_id,event_key) DO UPDATE SET in_app_enabled=EXCLUDED.in_app_enabled,email_enabled=EXCLUDED.email_enabled,whatsapp_enabled=EXCLUDED.whatsapp_enabled,sms_enabled=EXCLUDED.sms_enabled`, [userIds.get(legacyUserId), item.event_key, item.in_app_enabled !== false, Boolean(item.email_enabled), Boolean(item.whatsapp_enabled), Boolean(item.sms_enabled)]);
    }
    const notificationEntries = mapEntries(snapshot.notifications);
    if (notificationEntries.length) {
      for (const [legacyUserId, entries] of notificationEntries) for (const item of entries || []) if (userIds.get(legacyUserId)) await query(tx, `INSERT INTO crm.notifications (id,user_id,event_key,title,message,related_entity_type,related_entity_id,dedupe_key,is_read,read_at,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,coalesce($11::timestamptz,now())) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,message=EXCLUDED.message,is_read=EXCLUDED.is_read,read_at=EXCLUDED.read_at`, [uuidFor(item.id), userIds.get(legacyUserId), item.event_type || null, item.title || 'Aureum notification', item.message || '', item.related_entity_type || null, leadIds.get(item.related_entity_id) || customerIds.get(item.related_entity_id) || null, `${legacyUserId}:${item.id}`, Boolean(item.is_read), timestamp(item.read_at), timestamp(item.created_at)]);
    }
    result.notifications += notificationEntries.reduce((total, [, entries]) => total + (entries?.length || 0), 0);

    const channelIds = new Map();
    for (const channel of Array.isArray(snapshot.chatChannels) ? snapshot.chatChannels : []) {
      const rows = await query(tx, `INSERT INTO crm.chat_channels (workspace_id,legacy_id,name,description,visibility,is_archived,updated_at) VALUES ($1,$2,$3,$4,$5,$6,now()) ON CONFLICT (workspace_id,legacy_id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,visibility=EXCLUDED.visibility,is_archived=EXCLUDED.is_archived,updated_at=now() RETURNING id`, [workspaceId, channel.id, channel.name || channel.channel_name || channel.id, channel.description || null, channel.visibility || 'public', Boolean(channel.is_archived)]);
      channelIds.set(channel.id, rows[0].id);
      for (const memberId of Array.isArray(channel.member_ids) ? channel.member_ids : []) if (userIds.get(memberId)) await query(tx, `INSERT INTO crm.chat_channel_members (channel_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [rows[0].id, userIds.get(memberId)]);
    }
    for (const [legacyChannelId, entries] of mapEntries(snapshot.chatMessages)) for (const item of entries || []) if (channelIds.get(legacyChannelId) && userIds.get(item.sender_id)) {
      await query(tx, `INSERT INTO crm.chat_messages (id,workspace_id,legacy_id,channel_id,sender_id,message_type,message_text,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,coalesce($8::timestamptz,now())) ON CONFLICT (legacy_id) DO UPDATE SET message_text=EXCLUDED.message_text,message_type=EXCLUDED.message_type`, [uuidFor(item.id), workspaceId, item.id, channelIds.get(legacyChannelId), userIds.get(item.sender_id), item.message_type || 'text', item.message_text || null, timestamp(item.created_at)]);
      result.chat += 1;
    }

    if (Array.isArray(snapshot.webhookConnections)) for (const item of snapshot.webhookConnections) {
      await query(tx, `INSERT INTO crm.webhook_connections (workspace_id,legacy_id,name,source_platform,secret_hash,status,field_mappings,created_by,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,now()) ON CONFLICT (workspace_id,legacy_id) DO UPDATE SET name=EXCLUDED.name,source_platform=EXCLUDED.source_platform,secret_hash=EXCLUDED.secret_hash,status=EXCLUDED.status,field_mappings=EXCLUDED.field_mappings,updated_at=now()`, [workspaceId, item.id, item.connection_name || item.name || item.id, item.source_platform || 'custom', item.secret_hash || '', String(item.status || 'Inactive').toLowerCase(), json(item.field_mappings || {}), userIds.get(item.created_by) || null]);
      result.webhooks += 1;
    }

    if (snapshot.systemSettings && typeof snapshot.systemSettings === 'object') for (const [key, value] of Object.entries(snapshot.systemSettings)) await query(tx, `INSERT INTO crm.workspace_settings (workspace_id,setting_key,setting_value,updated_at) VALUES ($1,$2,$3::jsonb,now()) ON CONFLICT (workspace_id,setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=now()`, [workspaceId, key, json(value)]);
    await query(tx, `INSERT INTO crm.user_preferences (user_id, preference_key, preference_value, updated_at)
      SELECT u.id, pref.key, pref.value, now()
      FROM jsonb_array_elements($1::jsonb) AS pair
      JOIN crm.users u ON u.legacy_id = pair->>0 AND u.workspace_id = $2
      CROSS JOIN LATERAL jsonb_each(pair->1) AS pref(key, value)
      ON CONFLICT (user_id, preference_key) DO UPDATE SET preference_value = EXCLUDED.preference_value, updated_at = now()`, [json(mapEntries(snapshot.accountPreferences)), workspaceId]);

    if (Array.isArray(snapshot.activityLogs)) for (const item of snapshot.activityLogs.slice(0, 500)) await query(tx, `INSERT INTO crm.audit_events (id,workspace_id,actor_user_id,action,entity_type,entity_id,after_data,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,coalesce($8::timestamptz,now())) ON CONFLICT (id) DO UPDATE SET action=EXCLUDED.action,after_data=EXCLUDED.after_data`, [uuidFor(item.id), workspaceId, userIds.get(item.actor_user_id) || null, item.action_type || 'activity', item.entity_type || 'system', leadIds.get(item.entity_id) || customerIds.get(item.entity_id) || null, json({ description: item.description, metadata: item.metadata || {} }), timestamp(item.created_at)]);
  return result;
}

module.exports = { syncCrmSnapshot };
