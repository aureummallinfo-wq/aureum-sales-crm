window.AureumFollowUpIntegrations = window.AureumFollowUpIntegrations || {};
window.AureumFollowUpIntegrations.fromLead = lead => ({ lead_id: lead?.id || null, customer_id: lead?.customer_id || null });
