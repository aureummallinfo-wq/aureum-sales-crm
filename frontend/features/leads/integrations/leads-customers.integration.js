window.AureumLeadIntegrations = window.AureumLeadIntegrations || {};
window.AureumLeadIntegrations.createCustomerFromLead = lead => ({ available: true, leadId: lead?.id, customerId: lead?.customer_id || lead?.customerId || null, action: 'create-or-open-customer' });
