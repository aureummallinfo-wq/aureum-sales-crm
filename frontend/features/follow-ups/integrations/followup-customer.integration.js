window.AureumFollowUpIntegrations = window.AureumFollowUpIntegrations || {};
window.AureumFollowUpIntegrations.fromCustomer = customer => ({ customer_id: customer?.id || null, lead_id: customer?.lead_id || null, assigned_agent_id: customer?.assigned_agent_id || null });
