window.AureumCustomerIntegrations = window.AureumCustomerIntegrations || {};
window.AureumCustomerIntegrations.scheduleFollowUp = customer => ({ available: true, customerId: customer?.id, leadId: customer?.lead_id || customer?.leadId || null, action: 'open-followup-composer' });
