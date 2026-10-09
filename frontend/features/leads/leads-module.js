(function initializeAureumLeadsModule() {
  const constants = window.AureumLeadConstants || {};
  const allStatuses = constants.statuses || ['New', 'Contacted', 'Qualified', 'Hot', 'Warm', 'Cold', 'Follow-up', 'Visit Scheduled', 'Visit Completed', 'Meeting Scheduled', 'Negotiation', 'Booking', 'Closed Won', 'Closed Lost', 'No Response', 'Not Interested', 'Invalid'];
  const primaryStatuses = constants.statusGroups?.primary || ['New', 'Hot', 'Warm', 'Cold', 'Follow-up', 'Visit Scheduled', 'Negotiation', 'Booking', 'Closed Won'];
  const moreStatuses = constants.statusGroups?.more || ['Contacted', 'Qualified', 'No Response', 'Visit Completed', 'Meeting Scheduled', 'Closed Lost', 'Not Interested', 'Invalid'];
  const sources = constants.sources || ['Website', 'WhatsApp', 'Facebook', 'Instagram', 'Sales Partner', 'Referral', 'Walk-in', 'Manual Entry'];
  const propertyTypes = constants.propertyTypes || ['Apartment', 'Commercial', 'Office', 'Hotel Room', 'Food Court Space', 'Plot', 'Other'];
  const purposes = constants.purposes || ['End use', 'Investment', 'Business', 'Rental', 'Other'];
  const timelines = constants.timelines || ['Within 30 days', '1–3 months', '3–6 months', 'Exploring', 'Not decided'];
  const priorities = constants.priorities || ['Low', 'Medium', 'High', 'VIP'];

  state.leadModule = state.leadModule || { drawerTab: 'overview', notice: '' };

  const escape = value => window.AureumUI?.escape ? window.AureumUI.escape(String(value ?? '')) : String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const valueOf = (lead, key, fallback = '—') => lead && lead[key] !== undefined && lead[key] !== null && lead[key] !== '' ? lead[key] : fallback;
  const initials = lead => valueOf(lead, 'initials', String(valueOf(lead, 'full_name', 'Lead')).split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase());
  const titleCase = value => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
  const currentLead = () => state.leadDetail?.data || null;
  const canManage = () => ['SUPER_ADMIN', 'SALES_MANAGER'].includes(state.role);
  const isManager = () => state.role === 'SALES_MANAGER';
  const statusBadge = status => typeof badge === 'function' ? badge(status) : `<span class="badge badge-neutral">${escape(status)}</span>`;
  const selectOptions = (items, selected = '', placeholder = '') => `${placeholder ? `<option value="">${escape(placeholder)}</option>` : ''}${items.map(item => `<option value="${escape(item)}" ${String(item) === String(selected) ? 'selected' : ''}>${escape(item)}</option>`).join('')}`;
  const formatTags = lead => (Array.isArray(lead?.tags) ? lead.tags : lead?.tag ? [lead.tag] : []).map(tag => `<span class="lead-tag">${escape(tag)}</span>`).join('') || '<span class="person-meta">No tags</span>';
  const safeDate = value => value && value !== '—' ? escape(value) : '—';

  function roleCopy(my) {
    if (my && state.role === 'SALES_AGENT') return 'Only leads assigned to your advisor account are visible here.';
    if (my) return 'A focused view of the relationships assigned to you and your team scope.';
    return 'Review the full Aureum pipeline, ownership, intent, and next commercial action.';
  }

  function leadModuleItems(my) {
    return Array.isArray(state.leads?.items) ? state.leads.items.filter(lead => {
      const filters = state.leadFilters || {};
      const q = String(filters.q || '').trim().toLowerCase();
      const haystack = [lead.full_name, lead.phone, lead.whatsapp_number, lead.email, lead.city, lead.interested_in, lead.assigned_agent].join(' ').toLowerCase();
      if (q && !haystack.includes(q)) return false;
      if (filters.status && lead.status !== filters.status) return false;
      if (filters.source && (lead.lead_source || lead.source) !== filters.source) return false;
      if (filters.propertyType && lead.property_type !== filters.propertyType) return false;
      if (filters.priority && lead.priority !== filters.priority) return false;
      return true;
    }) : [];
  }

  function summaryCard(label, value, detail, tone = '') {
    return `<div class="card lead-summary-card"><div class="kpi-label">${escape(label)}</div><div class="kpi-value">${escape(value)}</div><div class="lead-summary-detail ${tone ? `is-${tone}` : ''}">${escape(detail)}</div></div>`;
  }

  function statusTabs(my) {
    const allLabel = my ? 'All' : 'All Leads';
    const active = state.leadFilters?.status || '';
    const tabs = [[allLabel, ''], ...primaryStatuses.map(status => [status, status])];
    return `<div class="lead-status-tabs" role="tablist">${tabs.map(([label, value]) => `<button class="lead-status-tab ${active === value ? 'active' : ''}" data-leads-tab="${escape(value)}" role="tab" aria-selected="${active === value}">${escape(label)}</button>`).join('')}<details class="lead-more-menu"><summary class="lead-status-tab">More <span aria-hidden="true">⌄</span></summary><div class="lead-more-options">${moreStatuses.map(status => `<button data-leads-tab="${escape(status)}">${escape(status)}</button>`).join('')}</div></details></div>`;
  }

  function leadActionMenu(lead) {
    const id = escape(lead.id);
    const management = canManage() ? `<button data-leads-action="assign" data-lead-id="${id}">Assign / reassign</button>` : '';
    return `<details class="lead-action-menu"><summary class="table-action" aria-label="Actions for ${escape(lead.full_name)}">Actions <span aria-hidden="true">⌄</span></summary><div class="lead-action-options"><button data-leads-open="${id}">Open details</button><button data-leads-action="call" data-lead-id="${id}">Call lead</button><button data-leads-action="whatsapp" data-lead-id="${id}">Open WhatsApp</button><button data-leads-action="status" data-lead-id="${id}">Update status</button>${management}<button data-leads-action="customer" data-lead-id="${id}">Open or create customer</button><button data-leads-action="follow-up" data-lead-id="${id}">Schedule follow-up</button></div></details>`;
  }

  function leadTableRows(items, my) {
    if (!items.length) return `<tr><td colspan="${my ? 9 : 14}"><div class="lead-empty-inline"><strong>No leads match these filters.</strong><span>Try clearing a filter or search another customer.</span><button class="btn btn-secondary btn-sm" data-leads-reset>Reset filters</button></div></td></tr>`;
    return items.map(lead => {
      const contact = `${valueOf(lead, 'phone')}${lead.whatsapp_number ? ` · ${escape(lead.whatsapp_number)}` : ''}`;
      const name = escape(valueOf(lead, 'full_name', 'Unnamed lead'));
      const id = escape(lead.id);
      const tags = formatTags(lead);
      return my ? `<tr data-lead-module-row="${id}" tabindex="0" aria-label="Open ${name} details"><td><button class="lead-name-button" data-leads-open="${id}">${person(name, initials(lead), escape(lead.email || ''))}</button></td><td>${escape(contact)}</td><td>${escape(valueOf(lead, 'interested_in'))}</td><td><b>${escape(valueOf(lead, 'budget'))}</b></td><td>${statusBadge(valueOf(lead, 'status'))}</td><td><div class="lead-tags">${tags}</div></td><td>${safeDate(valueOf(lead, 'next_follow_up_at'))}</td><td>${safeDate(valueOf(lead, 'last_contacted_at'))}</td><td>${leadActionMenu(lead)}</td></tr>` : `<tr data-lead-module-row="${id}" tabindex="0" aria-label="Open ${name} details"><td><button class="lead-name-button" data-leads-open="${id}">${person(name, initials(lead), escape(lead.email || ''))}</button></td><td>${escape(contact)}</td><td>${escape(valueOf(lead, 'email'))}</td><td>${escape(valueOf(lead, 'city'))}</td><td>${escape(valueOf(lead, 'interested_in'))}</td><td><b>${escape(valueOf(lead, 'budget'))}</b></td><td>${escape(valueOf(lead, 'lead_source', valueOf(lead, 'source')))}</td><td>${escape(valueOf(lead, 'assigned_agent', valueOf(lead, 'agent')))}</td><td>${statusBadge(valueOf(lead, 'status'))}</td><td><div class="lead-tags">${tags}</div></td><td>${safeDate(valueOf(lead, 'next_follow_up_at'))}</td><td>${safeDate(valueOf(lead, 'created_at'))}</td><td>${safeDate(valueOf(lead, 'last_contacted_at'))}</td><td>${leadActionMenu(lead)}</td></tr>`;
    }).join('');
  }

  function leadsLoading(my) {
    return pageHeader(my ? 'Assigned pipeline' : 'Aureum private registry', my ? 'My leads' : 'All leads', roleCopy(my)) + '<div class="lead-loading-grid"><div class="lead-skeleton"></div><div class="lead-skeleton lead-skeleton-tall"></div></div>';
  }

  function leadsError(my) {
    const message = state.leads?.error || 'The lead registry could not load.';
    return pageHeader(my ? 'Assigned pipeline' : 'Aureum private registry', my ? 'My leads' : 'All leads', roleCopy(my)) + `<div class="card lead-error-state"><div class="access-mark">!</div><h2>Leads unavailable</h2><p>${escape(message)}</p><button class="btn btn-secondary" data-leads-reload>Retry</button></div>`;
  }

  function renderLeadsModule(my = false) {
    if (state.leads?.loading && !state.leads.items?.length) return leadsLoading(my);
    if (state.leads?.error && !state.leads.items?.length) return leadsError(my);
    const items = leadModuleItems(my);
    const total = Array.isArray(state.leads?.items) ? state.leads.items.length : 0;
    const hot = (state.leads?.items || []).filter(lead => lead.status === 'Hot').length;
    const followUp = (state.leads?.items || []).filter(lead => lead.status === 'Follow-up').length;
    const due = (state.leads?.items || []).filter(lead => lead.next_follow_up_at && lead.next_follow_up_at !== 'Not scheduled').length;
    const addAction = isManager() ? '<button class="btn btn-gold" data-screen="add-lead">+ Add new lead</button>' : '';
    const search = escape(state.leadFilters?.q || '');
    const tableHeaders = my ? '<th>Lead name</th><th>Phone / WhatsApp</th><th>Interested in</th><th>Budget</th><th>Status</th><th>Tags</th><th>Next follow-up</th><th>Last contacted</th><th>Actions</th>' : '<th>Lead name</th><th>Phone / WhatsApp</th><th>Email</th><th>City</th><th>Interested in</th><th>Budget</th><th>Source</th><th>Assigned agent</th><th>Status</th><th>Tags</th><th>Next follow-up</th><th>Created date</th><th>Last contacted</th><th>Actions</th>';
    return pageHeader(my ? 'Assigned pipeline' : 'Aureum private registry', my ? 'My leads' : 'All leads', roleCopy(my), `<button class="btn btn-secondary" data-leads-reload>Refresh</button>${addAction}`) + `<section class="grid grid-4 lead-summary-grid">${summaryCard('Visible leads', total, my ? 'Ownership-scoped view' : 'Company / team registry')}${summaryCard('Hot leads', hot, hot ? 'Prioritize today' : 'No hot leads in view', hot ? 'hot' : '')}${summaryCard('Follow-up leads', followUp, followUp ? 'Conversation in motion' : 'No follow-ups tagged', followUp ? 'warm' : '')}${summaryCard('Scheduled next actions', due, due ? 'Review before end of day' : 'Nothing scheduled', due ? 'blue' : '')}</section><section class="card table-card lead-registry-card"><div class="lead-registry-head"><div><h2>${my ? 'My leads' : 'All leads registry'}</h2><p>${items.length} of ${total} visible records · data is scoped to your role.</p></div><span class="badge badge-neutral">${state.role === 'SALES_AGENT' ? 'Assigned only' : my ? 'Personal scope' : 'Management scope'}</span></div>${statusTabs(my)}<div class="lead-filter-bar"><label class="lead-search-field"><span aria-hidden="true">⌕</span><input data-leads-search value="${search}" placeholder="Search by name, phone, email, city…" aria-label="Search leads" /></label><select class="select" data-leads-source aria-label="Filter by source">${selectOptions(['', ...sources], state.leadFilters?.source || '', 'All sources')}</select><select class="select" data-leads-property aria-label="Filter by property type">${selectOptions(['', ...propertyTypes], state.leadFilters?.propertyType || '', 'All interests')}</select><select class="select" data-leads-priority aria-label="Filter by priority">${selectOptions(['', ...priorities], state.leadFilters?.priority || '', 'All priorities')}</select><button class="btn btn-secondary btn-sm" data-leads-reset>Reset</button></div><div class="table-wrap lead-table-wrap"><table class="lead-data-table"><thead><tr>${tableHeaders}</tr></thead><tbody>${leadTableRows(items, my)}</tbody></table></div></section>`;
  }

  function formField(label, name, input, full = false, required = false) {
    return `<div class="form-field ${full ? 'full' : ''}"><label for="lead-${name}">${escape(label)}${required ? ' *' : ''}</label>${input.replace('<input ', `<input id="lead-${name}" `).replace('<select ', `<select id="lead-${name}" `).replace('<textarea ', `<textarea id="lead-${name}" `)}</div>`;
  }

  function renderAddLeadModule() {
    if (!isManager()) return renderAccessDenied();
    return pageHeader('Pipeline intake', 'Add new lead', 'Capture a complete customer inquiry once, then keep ownership and next action clear.', '<button class="btn btn-secondary" data-screen="my-leads">Cancel</button>') + `<form id="lead-create-form" class="lead-create-form"><section class="card card-pad lead-form-section"><div class="lead-form-section-head"><div><span class="eyebrow">01 · Customer information</span><h2>Who is the customer?</h2><p>Use the primary contact details the advisor will use for the first conversation.</p></div><span class="badge badge-neutral">Required fields marked *</span></div><div class="form-grid">${formField('Full name', 'full_name', '<input name="full_name" required placeholder="e.g. Ahmed Khan" />', false, true)}${formField('Phone number', 'phone', '<input name="phone" required placeholder="03xx-xxxxxxx" />', false, true)}${formField('WhatsApp number', 'whatsapp_number', '<input name="whatsapp_number" placeholder="Same as phone if blank" />')}${formField('Email address', 'email', '<input name="email" type="email" placeholder="customer@example.com" />')}${formField('City', 'city', '<input name="city" placeholder="Lahore" />')}${formField('Area / locality', 'area', '<input name="area" placeholder="DHA, Gulberg…" />')}${formField('Preferred contact method', 'preferred_contact_method', '<select name="preferred_contact_method"><option>Phone call</option><option>WhatsApp</option><option>Email</option></select>')}</div></section><section class="card card-pad lead-form-section"><div class="lead-form-section-head"><div><span class="eyebrow">02 · Requirement information</span><h2>What are they looking for?</h2><p>Capture enough intent to route the lead to the right Aureum conversation.</p></div></div><div class="form-grid">${formField('Interested in', 'interested_in', `<select name="interested_in" required>${selectOptions(propertyTypes, '', 'Choose an interest')}</select>`, false, true)}${formField('Property type', 'property_type', `<select name="property_type">${selectOptions(propertyTypes, '', 'Choose a property type')}</select>`)}${formField('Budget', 'budget', '<input name="budget" placeholder="PKR 25M" />')}${formField('Preferred location', 'preferred_location', '<input name="preferred_location" placeholder="Sector C, Mall Commercial Hub…" />')}${formField('Purpose', 'purpose', `<select name="purpose">${selectOptions(purposes, '', 'Choose a purpose')}</select>`)}${formField('Buying timeline', 'buying_timeline', `<select name="buying_timeline">${selectOptions(timelines, '', 'Choose a timeline')}</select>`)}${formField('Financing required', 'financing_required', '<label class="checkbox lead-checkbox"><input type="checkbox" name="financing_required" value="true" /> Customer may require financing</label>', true)}</div></section><section class="card card-pad lead-form-section"><div class="lead-form-section-head"><div><span class="eyebrow">03 · CRM information</span><h2>How should Aureum work it?</h2><p>Set the pipeline context, ownership, and next follow-up at intake.</p></div></div><div class="form-grid">${formField('Lead source', 'lead_source', `<select name="lead_source">${selectOptions(sources, 'Manual Entry')}</select>`)}${formField('Priority', 'priority', `<select name="priority">${selectOptions(priorities, 'Medium')}</select>`)}${formField('Initial status', 'status', `<select name="status">${selectOptions(allStatuses.slice(0, 8), 'New')}</select>`)}${formField('Assigned agent', 'assigned_agent_id', '<select name="assigned_agent_id"><option value="">Assign later</option></select>')}${formField('Next follow-up', 'next_follow_up_at', '<input name="next_follow_up_at" type="datetime-local" />')}${formField('Tags', 'tags', '<input name="tags" placeholder="High intent, VIP, Investor" />')}${formField('Internal notes', 'initial_note', '<textarea name="initial_note" rows="4" placeholder="Context for the assigned advisor…"></textarea>', true)}</div></section><div class="lead-form-actions"><span>Leads are stored in the protected CRM registry.</span><div><button class="btn btn-secondary" type="button" data-screen="my-leads">Cancel</button><button class="btn btn-secondary" type="submit" name="save_mode" value="another">Save & add another</button><button class="btn btn-gold" type="submit" name="save_mode" value="close">Save lead</button></div></div></form>`;
  }

  function detailItem(label, value) { return `<div><div class="detail-label">${escape(label)}</div><div class="detail-value">${escape(valueOf({ value }, 'value'))}</div></div>`; }

  function renderLeadDrawerModule() {
    const lead = currentLead();
    if (!lead) return `<div class="drawer-backdrop" data-lead-module-close></div><aside class="drawer"><div class="empty-state">Loading lead details…</div></aside>`;
    const activity = state.leadDetail?.activity || [];
    const notes = activity.filter(item => item.activity_type === 'Note added');
    const tab = state.leadModule.drawerTab || 'overview';
    const statusForm = `<form id="lead-module-status-form" class="drawer-inline-form"><label>Status</label><div class="drawer-form-row"><select name="status">${selectOptions(allStatuses, lead.status)}</select><select name="priority">${selectOptions(priorities, lead.priority || 'Medium')}</select><button class="btn btn-gold btn-sm" type="submit">Save</button></div></form>`;
    const assignment = canManage() ? `<form id="lead-module-assign-form" class="drawer-inline-form"><label>Assigned agent</label><div class="drawer-form-row"><select name="assigned_agent_id"><option value="">Keep current assignment</option><option value="usr_002" ${lead.assigned_agent_id === 'usr_002' ? 'selected' : ''}>Sales Manager</option><option value="usr_003" ${lead.assigned_agent_id === 'usr_003' ? 'selected' : ''}>Ali Raza</option></select><button class="btn btn-secondary btn-sm" type="submit">Assign</button></div></form>` : '';
    const overview = `<div class="drawer-section"><div class="detail-grid">${detailItem('Phone / WhatsApp', `${valueOf(lead, 'phone')} · ${valueOf(lead, 'whatsapp_number')}`)}${detailItem('Email', valueOf(lead, 'email'))}${detailItem('City / area', `${valueOf(lead, 'city')} · ${valueOf(lead, 'area')}`)}${detailItem('Interested in', valueOf(lead, 'interested_in'))}${detailItem('Budget', valueOf(lead, 'budget'))}${detailItem('Property type', valueOf(lead, 'property_type'))}${detailItem('Purpose', valueOf(lead, 'purpose'))}${detailItem('Buying timeline', valueOf(lead, 'buying_timeline'))}${detailItem('Next follow-up', valueOf(lead, 'next_follow_up_at'))}${detailItem('Last contacted', valueOf(lead, 'last_contacted_at'))}</div></div><div class="drawer-section"><div class="lead-drawer-tags">${formatTags(lead)}</div>${statusForm}${assignment}</div><div class="drawer-section"><div class="drawer-action-row"><button class="btn btn-secondary btn-sm" data-leads-action="call" data-lead-id="${escape(lead.id)}">Call</button><button class="btn btn-secondary btn-sm" data-leads-action="whatsapp" data-lead-id="${escape(lead.id)}">WhatsApp</button><button class="btn btn-secondary btn-sm" data-leads-action="customer" data-lead-id="${escape(lead.id)}">Customer profile</button><button class="btn btn-secondary btn-sm" data-leads-action="follow-up" data-lead-id="${escape(lead.id)}">Schedule follow-up</button></div></div>`;
    const notesView = `<div class="drawer-section"><form id="lead-module-note-form"><label for="lead-note-input">Add a note</label><textarea id="lead-note-input" name="note" rows="4" required placeholder="Write a useful next-conversation note…"></textarea><button class="btn btn-gold btn-sm" type="submit">Save note</button></form></div><div class="lead-notes-list">${notes.length ? notes.map(note => `<article class="lead-note"><strong>Note</strong><p>${escape(note.description || note.note)}</p><time>${escape(note.created_at)}</time></article>`).join('') : '<div class="empty-state">No notes yet. Add the first useful context for this relationship.</div>'}</div>`;
    const activityView = `<div class="lead-activity-timeline">${activity.length ? activity.map(item => `<div class="timeline-item"><div class="timeline-dot"></div><div><div class="timeline-title">${escape(item.activity_type || 'Activity')}</div><div class="timeline-copy">${escape(item.description || '')}</div><div class="timeline-time">${escape(item.created_at || '')}</div></div></div>`).join('') : '<div class="empty-state">No activity recorded yet.</div>'}</div>`;
    return `<div class="drawer-backdrop" data-lead-module-close></div><aside class="drawer lead-detail-drawer"><div class="drawer-header"><div><div class="eyebrow">Lead record</div><h2>${escape(lead.full_name)}</h2><p class="page-subtitle">${escape(lead.assigned_agent || 'Unassigned')} · ${statusBadge(lead.status)}</p></div><button class="drawer-close" data-lead-module-close aria-label="Close lead details">×</button></div><div class="lead-drawer-tabs"><button class="${tab === 'overview' ? 'active' : ''}" data-lead-drawer-tab="overview">Overview</button><button class="${tab === 'notes' ? 'active' : ''}" data-lead-drawer-tab="notes">Notes <span>${notes.length}</span></button><button class="${tab === 'activity' ? 'active' : ''}" data-lead-drawer-tab="activity">Activity <span>${activity.length}</span></button></div>${tab === 'overview' ? overview : tab === 'notes' ? notesView : activityView}</aside>`;
  }

  async function refreshLeads() { try { await loadLeads(state.screen === 'my-leads'); } catch { /* loadLeads renders its own error state */ } }
  async function leadModuleAction(action, id) {
    const lead = (state.leads?.items || []).find(item => item.id === id) || currentLead();
    if (!lead) return;
    if (action === 'call') { showToast(`Call ready for ${lead.full_name}`); return; }
    if (action === 'whatsapp') { showToast(`WhatsApp ready for ${lead.full_name}`); return; }
    if (action === 'customer') { const linked = window.AureumCustomerIntegrations?.getCustomerFromLeadId?.(id); if (linked) { await openCustomer(linked.id); } else { try { const result = await apiFetch(`/api/leads/${id}/customer`, { method: 'POST' }); await loadCustomers(); await openCustomer(result.data.id); showToast('Customer profile created from lead'); } catch (error) { showToast(`Unable to create customer: ${error.message}`); } } return; }
    if (action === 'follow-up') { window.openFollowupComposer?.({ lead_id: id, customer_id: lead.customer_id || lead.customerId || '' }); return; }
    if (action === 'status') { await openLead(id); state.leadModule.drawerTab = 'overview'; return; }
    if (action === 'assign') { await openLead(id); state.leadModule.drawerTab = 'overview'; return; }
  }

  async function submitCreateLead(form, mode) {
    const raw = Object.fromEntries(new FormData(form).entries());
    const result = window.AureumLeadValidation?.validate(raw) || { valid: true, errors: {} };
    if (!result.valid) { showToast(Object.values(result.errors)[0]); return; }
    const payload = { ...raw, financing_required: raw.financing_required === 'true', tags: String(raw.tags || '').split(',').map(tag => tag.trim()).filter(Boolean) };
    delete payload.save_mode; delete payload.initial_note; delete payload.preferred_contact_method;
    try {
      const response = await apiFetch('/api/leads', { method: 'POST', body: JSON.stringify(payload) });
      if (raw.initial_note && response.data?.id) await apiFetch(`/api/leads/${response.data.id}/notes`, { method: 'POST', body: JSON.stringify({ note: raw.initial_note }) });
      showToast('Lead saved to the Aureum registry');
      if (mode === 'another') { form.reset(); form.querySelector('[name="lead_source"]').value = 'Manual Entry'; form.querySelector('[name="priority"]').value = 'Medium'; }
      else navigate('my-leads');
    } catch (error) { showToast(error.message); }
  }

  document.addEventListener('click', event => {
    const row = event.target.closest('[data-lead-module-row]');
    if (row && !event.target.closest('button, a, input, select, textarea, summary, details')) { openLead(row.dataset.leadModuleRow); return; }
    const close = event.target.closest('[data-lead-module-close]');
    if (close) { state.drawer = null; state.leadDetail = null; render(); return; }
    const open = event.target.closest('[data-leads-open]');
    if (open) { event.preventDefault(); openLead(open.dataset.leadsOpen); return; }
    const tab = event.target.closest('[data-leads-tab]');
    if (tab) { event.preventDefault(); state.leadFilters.status = tab.dataset.leadsTab || ''; render(); return; }
    const reset = event.target.closest('[data-leads-reset]');
    if (reset) { state.leadFilters = { q: '', status: '', source: '', propertyType: '', priority: '' }; render(); return; }
    const action = event.target.closest('[data-leads-action]');
    if (action) { event.preventDefault(); leadModuleAction(action.dataset.leadsAction, action.dataset.leadId); return; }
    const drawerTab = event.target.closest('[data-lead-drawer-tab]');
    if (drawerTab) { state.leadModule.drawerTab = drawerTab.dataset.leadDrawerTab; render(); return; }
    const reload = event.target.closest('[data-leads-reload]');
    if (reload) refreshLeads();
  });

  document.addEventListener('keydown', event => {
    const row = event.target.closest('[data-lead-module-row]');
    if (row && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openLead(row.dataset.leadModuleRow); }
  });

  document.addEventListener('input', event => { const input = event.target.closest('[data-leads-search]'); if (input) { state.leadFilters.q = input.value; render(); const next = document.querySelector('[data-leads-search]'); if (next) { next.focus(); next.setSelectionRange(next.value.length, next.value.length); } } });
  document.addEventListener('change', event => {
    const input = event.target;
    if (input.matches('[data-leads-source]')) state.leadFilters.source = input.value;
    if (input.matches('[data-leads-property]')) state.leadFilters.propertyType = input.value;
    if (input.matches('[data-leads-priority]')) state.leadFilters.priority = input.value;
    if (input.matches('[data-leads-source], [data-leads-property], [data-leads-priority]')) render();
  });
  document.addEventListener('submit', event => {
    const form = event.target;
    if (form.matches('#lead-create-form')) { event.preventDefault(); submitCreateLead(form, new FormData(form).get('save_mode') || 'close'); }
    if (form.matches('#lead-module-status-form')) { event.preventDefault(); const data = Object.fromEntries(new FormData(form).entries()); apiFetch(`/api/leads/${currentLead().id}/status`, { method: 'PATCH', body: JSON.stringify(data) }).then(() => { showToast('Lead status updated'); return openLead(currentLead().id); }).then(refreshLeads).catch(error => showToast(error.message)); }
    if (form.matches('#lead-module-note-form')) { event.preventDefault(); const note = new FormData(form).get('note'); apiFetch(`/api/leads/${currentLead().id}/notes`, { method: 'POST', body: JSON.stringify({ note }) }).then(() => { showToast('Note added'); return openLead(currentLead().id); }).catch(error => showToast(error.message)); }
    if (form.matches('#lead-module-assign-form')) { event.preventDefault(); const id = currentLead().id; const assigned_agent_id = new FormData(form).get('assigned_agent_id'); if (!assigned_agent_id) return showToast('Choose an active advisor first'); apiFetch(`/api/leads/${id}/assign`, { method: 'PATCH', body: JSON.stringify({ assigned_agent_id }) }).then(() => { showToast('Lead assignment updated'); return openLead(id); }).then(refreshLeads).catch(error => showToast(error.message)); }
  });

  window.renderLeads = renderLeadsModule;
  window.renderAddLead = renderAddLeadModule;
  window.renderLeadDrawer = renderLeadDrawerModule;
})();
