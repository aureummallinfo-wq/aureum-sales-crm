/** API-ready contract for the future TypeScript/React migration. The current app uses the same endpoints from the buildless runtime. */
window.AureumLeadHooks = {
  list: (scope = 'all') => window.apiFetch?.(scope === 'my' ? '/api/leads/my' : '/api/leads'),
  detail: id => window.apiFetch?.(`/api/leads/${id}`),
  activity: id => window.apiFetch?.(`/api/leads/${id}/activity`),
  create: input => window.apiFetch?.('/api/leads', { method: 'POST', body: JSON.stringify(input) }),
  updateStatus: (id, input) => window.apiFetch?.(`/api/leads/${id}/status`, { method: 'PATCH', body: JSON.stringify(input) }),
  assign: (id, assigned_agent_id) => window.apiFetch?.(`/api/leads/${id}/assign`, { method: 'PATCH', body: JSON.stringify({ assigned_agent_id }) }),
  addNote: (id, note) => window.apiFetch?.(`/api/leads/${id}/notes`, { method: 'POST', body: JSON.stringify({ note }) })
};
