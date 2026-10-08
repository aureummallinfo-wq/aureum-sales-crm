window.AureumLeadIntegrations = window.AureumLeadIntegrations || {};
window.AureumLeadIntegrations.toReportsMetricSource = lead => ({ leadId: lead?.id, status: lead?.status, source: lead?.lead_source || lead?.source, assignedAgentId: lead?.assigned_agent_id, createdAt: lead?.created_at });
