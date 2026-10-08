window.AureumLeadIntegrations = window.AureumLeadIntegrations || {};
window.AureumLeadIntegrations.getRecentLeadsFromLeads = leads => (leads || []).slice(0, 5);
window.AureumLeadIntegrations.getLeadSummaryStats = leads => (leads || []).reduce((summary, lead) => { summary.total += 1; summary.byStatus[lead.status] = (summary.byStatus[lead.status] || 0) + 1; return summary; }, { total: 0, byStatus: {} });
window.AureumLeadIntegrations.getConversionOverviewFromLeads = leads => ['New', 'Contacted', 'Qualified', 'Follow-up', 'Negotiation', 'Booking', 'Closed Won'].map(status => ({ name: status, value: (leads || []).filter(lead => lead.status === status).length }));
