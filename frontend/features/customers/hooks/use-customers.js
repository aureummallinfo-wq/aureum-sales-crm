/** Buildless runtime adapter for the future typed customer hooks. */
window.AureumCustomerHooks = {
  list: (scope = 'all') => window.apiFetch?.(scope === 'my' ? '/api/customers/my' : '/api/customers'),
  detail: id => window.apiFetch?.(`/api/customers/${id}`),
  update: (id, input) => window.apiFetch?.(`/api/customers/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  changeStatus: (id, status) => window.apiFetch?.(`/api/customers/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  addNote: (id, note) => window.apiFetch?.(`/api/customers/${id}/notes`, { method: 'POST', body: JSON.stringify({ note }) }),
  timeline: id => window.apiFetch?.(`/api/customers/${id}/timeline`),
  followUps: id => window.apiFetch?.(`/api/customers/${id}/follow-ups`)
};
