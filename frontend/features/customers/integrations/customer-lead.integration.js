window.AureumCustomerIntegrations = window.AureumCustomerIntegrations || {};
window.AureumCustomerIntegrations.getCustomerFromLeadId = leadId => (typeof state !== 'undefined' ? state.customers?.items || [] : []).find(customer => customer.lead_id === leadId || customer.leadId === leadId) || null;
window.AureumCustomerIntegrations.createCustomerFromLead = lead => ({ available: true, leadId: lead?.id, customerId: lead?.customer_id || lead?.customerId || null, action: 'create-or-open-customer' });
window.AureumCustomerIntegrations.getLinkedLeadForCustomer = customer => customer?.lead_id || customer?.leadId || null;
