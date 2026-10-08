window.AureumCustomerIntegrations = window.AureumCustomerIntegrations || {};
window.AureumCustomerIntegrations.getCustomerFromLeadId = leadId => (typeof state !== 'undefined' ? state.customers?.items || [] : []).find(customer => customer.lead_id === leadId || customer.leadId === leadId) || null;
window.AureumCustomerIntegrations.createCustomerFromLead = lead => ({ available: false, leadId: lead?.id, message: 'Customer profile is prepared from this lead. Persistence is available through Module 4 customer records.' });
window.AureumCustomerIntegrations.getLinkedLeadForCustomer = customer => customer?.lead_id || customer?.leadId || null;
