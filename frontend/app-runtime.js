// Final runtime bindings for the live Goals 1–5 workflow.
// Loaded after app.js so the API-backed renderers are the active versions.

function followupDateMatches(item, filter) {
  if (filter === 'all') return true;
  if (filter === 'overdue') return item.status === 'Overdue';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const date = new Date(`${item.due_date}T00:00:00`);
  if (filter === 'custom') { const start = state.followupCustomStart ? new Date(`${state.followupCustomStart}T00:00:00`) : null; const end = state.followupCustomEnd ? new Date(`${state.followupCustomEnd}T23:59:59`) : null; return (!start || date >= start) && (!end || date <= end); }
  if (filter === 'today') return date.toDateString() === today.toDateString();
  if (filter === 'tomorrow') { const target = new Date(today); target.setDate(target.getDate() + 1); return date.toDateString() === target.toDateString(); }
  if (filter === 'week') { const end = new Date(today); end.setDate(end.getDate() + 7); return date >= today && date < end; }
  if (filter === 'month') return date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
  return true;
}

function followupTable(items) {
  if (!items.length) return '<div class="empty-state"><strong>No follow-ups in this view</strong>Try another date or status filter, or schedule a new client touchpoint.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Customer</th><th>Type</th><th>Advisor</th><th>Lead status</th><th>Due date / time</th><th>Priority</th><th>Status</th><th>Last activity</th><th>Actions</th></tr></thead><tbody>${items.map(item => `<tr><td>${person(item.customer, customerInitials(item.customer), item.phone)}</td><td><b>${item.type}</b><div class="person-meta">${item.notes || 'No note added'}</div></td><td>${item.agent}</td><td>${badge(item.lead_status || 'Active')}</td><td>${followupDateLabel(item.due_date, item.due_time)}</td><td>${badge(item.priority)}</td><td>${badge(item.status)}</td><td>${item.last_activity || '—'}</td><td><div class="header-actions"><button class="table-action" data-followup-open="${item.id}">Open</button><button class="table-action" data-followup-call="${item.phone}">${icons.phone}</button><button class="table-action" data-followup-whatsapp="${item.phone}">${icons.whatsapp}</button>${!['Completed', 'Cancelled'].includes(item.status) ? `<button class="table-action" data-followup-complete="${item.id}">Done</button>` : ''}<button class="table-action" data-followup-note="${item.id}">Note</button></div></td></tr>`).join('')}</tbody></table></div>`;
}

function renderFollowups() {
  const all = state.followups.items || [];
  const search = String(state.followupSearch || '').toLowerCase();
  const visible = all.filter(item => (state.followupTab === 'all' || item.status === state.followupTab) && followupDateMatches(item, state.followupDateFilter) && (!state.followupType || item.type === state.followupType) && (!state.followupPriority || item.priority === state.followupPriority) && (!search || [item.customer, item.phone, item.agent, item.notes].some(value => String(value || '').toLowerCase().includes(search))));
  const today = all.filter(item => followupDateMatches(item, 'today') && !['Completed', 'Cancelled'].includes(item.status)).length;
  const overdue = all.filter(item => item.status === 'Overdue').length;
  const completed = all.filter(item => item.status === 'Completed').length;
  const missed = all.filter(item => item.status === 'Missed').length;
  const upcoming = all.filter(item => ['Pending', 'Rescheduled'].includes(item.status)).length;
  const dates = [['all', 'All dates'], ['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'This week'], ['month', 'This month'], ['overdue', 'Overdue'], ['custom', 'Custom range']];
  const calendar = state.followupCalendarOpen ? `<div class="filter-bar"><label class="form-field" style="min-width:150px"><span>Start date</span><input type="date" data-followup-start value="${state.followupCustomStart || ''}" /></label><label class="form-field" style="min-width:150px"><span>End date</span><input type="date" data-followup-end value="${state.followupCustomEnd || ''}" /></label><button class="btn btn-gold btn-sm" data-followup-apply-custom>Apply</button><button class="btn btn-secondary btn-sm" data-followup-clear-custom>Clear</button></div>` : '';
  const error = state.followups.error ? `<div class="empty-state"><strong>Unable to load follow-ups</strong>${state.followups.error}<br/><button class="btn btn-secondary btn-sm" data-reload-followups>Retry</button></div>` : '';
  return pageHeader('Daily rhythm', 'Follow-ups', 'Protect the next conversation with a clear owner, due time, priority, and outcome.', '<button class="btn btn-secondary" data-toggle-calendar>Calendar filter</button><button class="btn btn-gold" data-create-followup>+ Schedule follow-up</button>') + `<section class="grid grid-4">${kpi('Today', String(today), 'Due now', today ? 'down' : 'up')} ${kpi('Overdue', String(overdue), overdue ? 'Action required' : 'Clear', overdue ? 'down' : 'up')} ${kpi('Upcoming', String(upcoming), 'Pending touchpoints')} ${kpi('Completed', String(completed), '+14%')}</section><section class="grid grid-2" style="margin-top:18px">${kpi('Missed', String(missed), missed ? 'Needs recovery' : 'None', missed ? 'down' : 'up')} ${kpi('Total follow-ups', String(all.length), state.role === 'SALES_AGENT' ? 'Assigned to me' : 'Permitted scope')}</section><section class="card table-card" style="margin-top:18px"><div class="tabs">${dates.map(([id, label]) => `<button class="tab ${state.followupDateFilter === id ? 'active' : ''}" data-followup-date="${id}">${label}</button>`).join('')}</div>${calendar}<div class="tabs">${followupStatuses.map(status => `<button class="tab ${state.followupTab === status.toLowerCase() ? 'active' : ''}" data-followup-status="${status.toLowerCase()}">${status}</button>`).join('')}</div><div class="filter-bar"><div class="search-box">${icons.search}<input data-followup-search value="${state.followupSearch || ''}" placeholder="Search customer, phone, advisor, or note" /></div><select class="select" data-followup-type><option value="">All types</option>${followupTypes.map(type => `<option ${state.followupType === type ? 'selected' : ''}>${type}</option>`).join('')}</select><select class="select" data-followup-priority><option value="">All priorities</option><option ${state.followupPriority === 'High' ? 'selected' : ''}>High</option><option ${state.followupPriority === 'Medium' ? 'selected' : ''}>Medium</option><option ${state.followupPriority === 'Low' ? 'selected' : ''}>Low</option></select><button class="btn btn-secondary btn-sm" data-reload-followups>Refresh</button></div>${state.followups.loading ? '<div class="empty-state"><strong>Loading follow-up rhythm</strong>Syncing the permitted schedule…</div>' : error || followupTable(visible)}</section>`;
}

function followupAgentOptions() {
  if (state.role === 'SALES_AGENT') return '<option value="usr_003">Ali Raza</option>';
  return '<option value="usr_003">Ali Raza</option><option value="usr_002">Sales Manager</option>';
}

function followupCustomerOptions() {
  const source = state.customers.items?.length ? state.customers.items : leadRows.slice(0, 5).map((item, index) => ({ id: `customer_${String(index + 1).padStart(3, '0')}`, full_name: item.name, phone: item.meta.split(' · ')[0], assigned_agent_id: index < 2 ? 'usr_003' : 'usr_002' }));
  const items = state.role === 'SALES_AGENT' ? source.filter(item => item.assigned_agent_id === state.authUser?.id) : source;
  return items.map(item => `<option value="${item.id}">${item.full_name} · ${item.phone || ''}</option>`).join('');
}

function followupLeadOptions() {
  const leads = state.leads?.items?.length ? state.leads.items : leadRows.slice(0, 5).map((item, index) => ({ id: `lead_${String(index + 1).padStart(3, '0')}`, full_name: item.name }));
  return `<option value="">No linked lead</option>${leads.map(item => `<option value="${item.id}">${item.full_name}</option>`).join('')}`;
}

function renderCreateFollowupDrawer() {
  return `<div class="drawer-backdrop" data-close-drawer></div><aside class="drawer"><div class="drawer-header"><div><div class="eyebrow">New commitment</div><h2>Schedule follow-up</h2><p class="page-subtitle">Create a dated next action for a permitted customer.</p></div><button class="drawer-close" data-close-drawer>${icons.close}</button></div><form id="create-followup-form"><div class="drawer-section"><div class="form-grid"><div class="form-field full"><label>Customer</label><select name="customer_id" required>${followupCustomerOptions()}</select></div><div class="form-field"><label>Lead (optional)</label><select name="lead_id">${followupLeadOptions()}</select></div><div class="form-field"><label>Assigned agent</label><select name="assigned_agent_id" ${state.role === 'SALES_AGENT' ? 'disabled' : ''}>${followupAgentOptions()}</select></div><div class="form-field"><label>Type</label><select name="follow_up_type">${followupTypes.map(type => `<option>${type}</option>`).join('')}</select></div><div class="form-field"><label>Priority</label><select name="priority"><option>High</option><option selected>Medium</option><option>Low</option></select></div><div class="form-field"><label>Due date</label><input name="due_date" type="date" required value="${new Date().toISOString().slice(0, 10)}" /></div><div class="form-field"><label>Due time</label><input name="due_time" type="time" required value="10:00" /></div><div class="form-field full"><label>Notes</label><textarea name="notes" rows="4" placeholder="What should happen next?"></textarea></div></div></div><div class="drawer-section"><button class="btn btn-gold" type="submit">Schedule follow-up</button></div></form></aside>`;
}

function renderCustomers() {
  const all = state.customers.items || [];
  const query = String(state.customerSearch || '').toLowerCase();
  const filter = state.customerListFilter || '';
  const items = all.filter(item => (!filter || (filter === 'Closed' ? ['Closed', 'Closed Won'].includes(item.status) : item.status === filter)) && (!state.customerStatusFilter || item.status === state.customerStatusFilter) && (!query || [item.full_name, item.phone, item.email, item.city, item.interest].some(value => String(value || '').toLowerCase().includes(query))));
  const customerContent = state.customers.loading ? '<div class="empty-state"><strong>Loading customer registry</strong>Syncing your permitted customer profiles…</div>' : state.customers.error ? `<div class="empty-state"><strong>Unable to load customers</strong>${state.customers.error}<br/><button class="btn btn-secondary btn-sm" data-reload-customers>Retry</button></div>` : customerTable(items);
  return pageHeader('Client relationships', 'Customers', 'Search, understand, and move every assigned customer relationship forward.', '<button class="btn btn-secondary">Export customer list</button><button class="btn btn-gold" data-screen="add-lead">+ Add customer</button>') + `<section class="grid grid-4">${kpi('Total customers', String(all.length), state.role === 'SALES_AGENT' ? 'Assigned to me' : 'Permitted scope')} ${kpi('Active customers', String(all.filter(item => ['Active', 'Warm'].includes(item.status)).length), '+9%')} ${kpi('Hot / booking', String(all.filter(item => ['Hot', 'Booking Interested'].includes(item.status)).length), 'High intent')} ${kpi('Follow-ups due', String(all.filter(item => item.status === 'Follow-up').length), 'Needs attention', 'down')}</section><section class="card table-card" style="margin-top:18px"><div class="tabs">${['', 'Active', 'Hot', 'Follow-up', 'Booking Interested', 'Closed', 'Lost'].map((tab, i) => `<button class="tab ${filter === tab ? 'active' : ''}" data-customer-tab-filter="${tab}">${tab || 'All Customers'}</button>`).join('')}</div><div class="filter-bar"><div class="search-box">${icons.search}<input data-customer-search value="${state.customerSearch || ''}" placeholder="Search by name, phone, WhatsApp, or email" /></div><select class="select" data-customer-status><option value="">All statuses</option>${['Active', 'Hot', 'Warm', 'Follow-up', 'Booking Interested', 'Closed Won', 'Closed Lost'].map(status => `<option ${state.customerStatusFilter === status ? 'selected' : ''}>${status}</option>`).join('')}</select><button class="btn btn-secondary btn-sm" data-reload-customers>Refresh</button></div>${customerContent}</section>`;
}

function renderFollowupDrawer() {
  if (state.drawer === 'create-followup') return renderCreateFollowupDrawer();
  if (state.drawer === 'create-followup') return `<div class="drawer-backdrop" data-close-drawer></div><aside class="drawer"><div class="drawer-header"><div><div class="eyebrow">New commitment</div><h2>Schedule follow-up</h2><p class="page-subtitle">Create a dated next action for a permitted customer.</p></div><button class="drawer-close" data-close-drawer>${icons.close}</button></div><form id="create-followup-form"><div class="drawer-section"><div class="form-field"><label>Customer</label><select name="customer_id" required>${followupCustomerOptions()}</select></div><div class="form-grid"><div class="form-field"><label>Type</label><select name="follow_up_type">${followupTypes.map(type => `<option>${type}</option>`).join('')}</select></div><div class="form-field"><label>Priority</label><select name="priority"><option>High</option><option selected>Medium</option><option>Low</option></select></div><div class="form-field"><label>Due date</label><input name="due_date" type="date" required value="${new Date().toISOString().slice(0, 10)}" /></div><div class="form-field"><label>Due time</label><input name="due_time" type="time" required value="10:00" /></div><div class="form-field full"><label>Notes</label><textarea name="notes" rows="4" placeholder="What should happen next?"></textarea></div></div></div><div class="drawer-section"><button class="btn btn-gold" type="submit">Schedule follow-up</button></div></form></aside>`;
  const detail = state.followupDetail;
  if (!detail) return `<div class="drawer-backdrop" data-close-drawer></div><aside class="drawer"><div class="drawer-header"><div><div class="eyebrow">Follow-up detail</div><h2>Loading…</h2></div><button class="drawer-close" data-close-drawer>${icons.close}</button></div><div class="empty-state">Loading the permitted follow-up…</div></aside>`;
  if (detail.error) return `<div class="drawer-backdrop" data-close-drawer></div><aside class="drawer"><div class="drawer-header"><div><div class="eyebrow">Protected follow-up</div><h2>Access denied</h2></div><button class="drawer-close" data-close-drawer>${icons.close}</button></div><div class="empty-state"><strong>${detail.error}</strong></div></aside>`;
  const f = detail.data;
  const action = state.followupMode === 'reschedule' ? `<form id="reschedule-followup-form" class="drawer-section"><div class="form-grid"><div class="form-field"><label>New date</label><input name="due_date" type="date" value="${f.due_date}" required /></div><div class="form-field"><label>New time</label><input name="due_time" type="time" value="${f.due_time}" required /></div><div class="form-field full"><label>Reason</label><textarea name="reason" rows="3" required></textarea></div></div><button class="btn btn-gold" type="submit">Reschedule</button></form>` : state.followupMode === 'complete' ? `<form id="complete-followup-form" class="drawer-section"><div class="form-field"><label>Completion note</label><textarea name="completion_note" rows="3" required></textarea></div><div class="form-field"><label>Customer response</label><input name="customer_response" /></div><div class="form-grid"><div class="form-field"><label>Next date</label><input name="next_due_date" type="date" /></div><div class="form-field"><label>Next time</label><input name="next_due_time" type="time" /></div></div><button class="btn btn-gold" type="submit">Mark completed</button></form>` : state.followupMode === 'note' ? `<form id="followup-note-form" class="drawer-section"><div class="form-field"><label>Add note</label><textarea name="note" rows="3" required></textarea></div><button class="btn btn-gold" type="submit">Save note</button></form>` : '';
  const activity = (detail.activity || []).map(item => `<div class="timeline-item"><div class="timeline-dot"></div><div><div class="timeline-title">${item.activity_type}</div><div class="timeline-copy">${item.description}</div><div class="timeline-time">${item.created_at}</div></div></div>`).join('') || '<div class="empty-state">No activity recorded yet.</div>';
  return `<div class="drawer-backdrop" data-close-drawer></div><aside class="drawer"><div class="drawer-header"><div><div class="eyebrow">Follow-up detail</div><h2>${f.customer}</h2><p class="page-subtitle">${badge(f.status)} · ${f.type} · ${f.agent}</p></div><button class="drawer-close" data-close-drawer>${icons.close}</button></div><div class="drawer-section"><div class="header-actions"><button class="btn btn-gold btn-sm" data-followup-complete="${f.id}">${icons.phone} Mark done</button><button class="btn btn-secondary btn-sm" data-followup-reschedule="${f.id}">Reschedule</button><button class="btn btn-secondary btn-sm" data-followup-note="${f.id}">Add note</button><button class="btn btn-secondary btn-sm" data-followup-customer="${f.customer_id}">Open customer</button></div></div><div class="drawer-section"><div class="detail-grid"><div><div class="detail-label">Phone / WhatsApp</div><div class="detail-value">${f.phone}</div></div><div><div class="detail-label">Due</div><div class="detail-value">${followupDateLabel(f.due_date, f.due_time)}</div></div><div><div class="detail-label">Priority</div><div class="detail-value">${badge(f.priority)}</div></div><div><div class="detail-label">Lead status</div><div class="detail-value">${badge(f.lead_status || 'Active')}</div></div></div><div class="timeline-copy" style="margin-top:16px">${f.notes || 'No note added.'}</div></div>${action}<div class="drawer-section"><h3>Activity history</h3><div class="timeline" style="margin-top:15px">${activity}</div></div></aside>`;
}

function openFollowup(id, mode = '') {
  state.drawer = 'followup'; state.followupDetail = null; state.followupMode = mode; render();
  apiFetch(`/api/follow-ups/${id}`).then(result => { state.followupDetail = result; render(); }).catch(error => { state.followupDetail = { error: error.message }; render(); });
}

function renderDrawer() {
  if (state.drawer === 'customer') return renderCustomerDrawer();
  if (state.drawer === 'followup' || state.drawer === 'create-followup') return renderFollowupDrawer();
  if (state.drawer === 'lead') return renderLeadDrawer();
  return legacyRenderDrawer();
}

function navigate(screen) {
  if (routePaths[screen]) window.history.pushState({}, '', routePaths[screen]);
  if (!canAccess(screen)) { state.drawer = null; state.deniedPath = screen; state.screen = 'unauthorized'; }
  else { state.drawer = null; state.screen = screen; }
  render();
  if (screen === 'dashboard') loadDashboard();
  if (screen === 'leads') loadLeads(false);
  if (screen === 'my-leads') loadLeads(true);
  if (screen === 'customers') loadCustomers();
  if (screen === 'follow-ups') loadFollowups();
}

function bind() {
  baseBind();
  document.querySelectorAll('[data-reload-dashboard]').forEach(el => el.addEventListener('click', loadDashboard));
  document.querySelectorAll('[data-reload-leads]').forEach(el => el.addEventListener('click', () => loadLeads(state.screen === 'my-leads')));
  document.querySelectorAll('[data-lead-status]').forEach(el => el.addEventListener('click', () => { state.leadFilters.status = el.dataset.leadStatus; render(); }));
  document.querySelectorAll('[data-clear-lead-filters]').forEach(el => el.addEventListener('click', () => { state.leadFilters = { q: '', status: '', source: '' }; render(); }));
  const leadSearch = document.querySelector('[data-lead-search]');
  if (leadSearch) leadSearch.addEventListener('input', event => { state.leadFilters.q = event.target.value; render(); });
  const leadSource = document.querySelector('[data-lead-source]');
  if (leadSource) leadSource.addEventListener('change', event => { state.leadFilters.source = event.target.value; render(); });
  document.querySelectorAll('[data-lead-open]').forEach(el => el.addEventListener('click', () => openLead(el.dataset.leadOpen)));
  document.querySelectorAll('[data-lead-note]').forEach(el => el.addEventListener('click', () => openLead(el.dataset.leadNote)));
  document.querySelectorAll('[data-lead-toast]').forEach(el => el.addEventListener('click', () => showToast(el.dataset.leadToast)));
  document.querySelectorAll('[data-lead-customer]').forEach(el => el.addEventListener('click', () => openCustomer(el.dataset.leadCustomer)));
  const leadStatusForm = document.querySelector('#lead-status-form');
  if (leadStatusForm) leadStatusForm.addEventListener('submit', async event => { event.preventDefault(); const data = Object.fromEntries(new FormData(leadStatusForm).entries()); try { await apiFetch(`/api/leads/${state.leadDetail.data.id}/status`, { method: 'PATCH', body: JSON.stringify(data) }); await openLead(state.leadDetail.data.id); await loadLeads(state.screen === 'my-leads'); } catch (error) { showToast(error.message); } });
  const leadNoteForm = document.querySelector('#lead-note-form');
  if (leadNoteForm) leadNoteForm.addEventListener('submit', async event => { event.preventDefault(); const data = Object.fromEntries(new FormData(leadNoteForm).entries()); try { await apiFetch(`/api/leads/${state.leadDetail.data.id}/notes`, { method: 'POST', body: JSON.stringify(data) }); await openLead(state.leadDetail.data.id); } catch (error) { showToast(error.message); } });
  document.querySelectorAll('[data-customer-tab-filter]').forEach(el => el.addEventListener('click', () => { state.customerListFilter = el.dataset.customerTabFilter; render(); }));
  const customerSearch = document.querySelector('[data-customer-search]');
  if (customerSearch) customerSearch.addEventListener('input', event => { state.customerSearch = event.target.value; render(); });
  const customerStatus = document.querySelector('[data-customer-status]');
  if (customerStatus) customerStatus.addEventListener('change', event => { state.customerStatusFilter = event.target.value; render(); });
  document.querySelectorAll('[data-followup-call]').forEach(el => el.addEventListener('click', () => showToast(`Call ${el.dataset.followupCall}`)));
  document.querySelectorAll('[data-followup-whatsapp]').forEach(el => el.addEventListener('click', () => showToast(`WhatsApp ${el.dataset.followupWhatsapp}`)));
  document.querySelectorAll('[data-followup-note]').forEach(el => el.addEventListener('click', () => openFollowup(el.dataset.followupNote, 'note')));
  document.querySelectorAll('[data-followup-customer]').forEach(el => el.addEventListener('click', () => openCustomer(el.dataset.followupCustomer)));
  document.querySelectorAll('[data-toggle-calendar]').forEach(el => el.addEventListener('click', () => { state.followupCalendarOpen = !state.followupCalendarOpen; render(); }));
  document.querySelectorAll('[data-followup-apply-custom]').forEach(el => el.addEventListener('click', () => { state.followupDateFilter = 'custom'; state.followupCustomStart = document.querySelector('[data-followup-start]')?.value || ''; state.followupCustomEnd = document.querySelector('[data-followup-end]')?.value || ''; render(); }));
  document.querySelectorAll('[data-followup-clear-custom]').forEach(el => el.addEventListener('click', () => { state.followupDateFilter = 'all'; state.followupCustomStart = ''; state.followupCustomEnd = ''; render(); }));
  const followupSearch = document.querySelector('[data-followup-search]');
  if (followupSearch) followupSearch.addEventListener('input', event => { state.followupSearch = event.target.value; render(); });
  const followupType = document.querySelector('[data-followup-type]');
  if (followupType) followupType.addEventListener('change', event => { state.followupType = event.target.value; render(); });
  const followupPriority = document.querySelector('[data-followup-priority]');
  if (followupPriority) followupPriority.addEventListener('change', event => { state.followupPriority = event.target.value; render(); });
  const followupNoteForm = document.querySelector('#followup-note-form');
  if (followupNoteForm) followupNoteForm.addEventListener('submit', async event => { event.preventDefault(); const data = Object.fromEntries(new FormData(followupNoteForm).entries()); try { await apiFetch(`/api/follow-ups/${state.followupDetail.data.id}/notes`, { method: 'POST', body: JSON.stringify(data) }); state.followupMode = ''; await refreshFollowupDetail(); } catch (error) { showToast(error.message); } });
  const addLeadForm = document.querySelector('#add-lead-form');
  if (addLeadForm) addLeadForm.addEventListener('submit', async event => { event.preventDefault(); const data = Object.fromEntries(new FormData(addLeadForm).entries()); data.financing_required = data.financing_required === 'true'; try { await apiFetch('/api/leads', { method: 'POST', body: JSON.stringify(data) }); showToast('Lead saved to registry'); navigate('leads'); } catch (error) { showToast(error.message); } });
}

async function boot() {
  const requestedScreen = screenForPath[window.location.pathname] || 'dashboard';
  try { const result = await apiFetch('/api/auth/me'); state.authUser = result.user; state.role = result.user.role.toUpperCase(); state.screen = requestedScreen; }
  catch { state.authUser = null; state.screen = 'login'; }
  state.ready = true;
  render();
  if (state.authUser && state.screen === 'dashboard') loadDashboard();
  if (state.authUser && state.screen === 'leads') loadLeads(false);
  if (state.authUser && state.screen === 'my-leads') loadLeads(true);
  if (state.authUser && state.screen === 'customers') loadCustomers();
  if (state.authUser && state.screen === 'follow-ups') loadFollowups();
}

boot();
window.aureumFinalBind = bind;
window.aureumFinalBoot = boot;
