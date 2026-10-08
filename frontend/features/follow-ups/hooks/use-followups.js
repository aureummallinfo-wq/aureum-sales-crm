window.AureumFollowUpHooks = {
  list: (scope = 'all', params = '') => window.apiFetch?.(`/api/follow-ups${scope === 'my' ? '/my' : ''}${params ? `?${params}` : ''}`),
  detail: id => window.apiFetch?.(`/api/follow-ups/${id}`),
  create: input => window.apiFetch?.('/api/follow-ups', { method: 'POST', body: JSON.stringify(input) }),
  update: (id, input) => window.apiFetch?.(`/api/follow-ups/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  reschedule: (id, input) => window.apiFetch?.(`/api/follow-ups/${id}/reschedule`, { method: 'PATCH', body: JSON.stringify(input) }),
  complete: (id, input) => window.apiFetch?.(`/api/follow-ups/${id}/complete`, { method: 'PATCH', body: JSON.stringify(input) }),
  missed: (id, reason) => window.apiFetch?.(`/api/follow-ups/${id}/missed`, { method: 'PATCH', body: JSON.stringify({ reason }) }),
  cancel: (id, reason) => window.apiFetch?.(`/api/follow-ups/${id}/cancel`, { method: 'PATCH', body: JSON.stringify({ reason }) }),
  addNote: (id, note) => window.apiFetch?.(`/api/follow-ups/${id}/notes`, { method: 'POST', body: JSON.stringify({ note }) })
};
