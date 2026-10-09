window.AureumLeadIntegrations = window.AureumLeadIntegrations || {};
window.AureumLeadIntegrations.createFollowUpFromLead = lead => ({ available: true, leadId: lead?.id, customerId: lead?.customer_id || lead?.customerId || null, action: 'open-followup-composer' });
