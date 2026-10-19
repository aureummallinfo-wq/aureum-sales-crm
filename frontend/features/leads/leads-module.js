(function initializeAureumLeadsModule() {
  const constants = window.AureumLeadConstants || {};
  const allStatuses = constants.statuses || ['New', 'Contacted', 'Qualified', 'Hot', 'Warm', 'Cold', 'Follow-up', 'Visit Scheduled', 'Visit Completed', 'Meeting Scheduled', 'Negotiation', 'Booking', 'Closed Won', 'Closed Lost', 'No Response', 'Not Interested', 'Invalid'];
  const primaryStatuses = constants.statusGroups?.primary || ['New', 'Hot', 'Warm', 'Cold', 'Follow-up', 'Visit Scheduled', 'Negotiation', 'Booking', 'Closed Won'];
  const moreStatuses = constants.statusGroups?.more || ['Contacted', 'Qualified', 'No Response', 'Visit Completed', 'Meeting Scheduled', 'Closed Lost', 'Not Interested', 'Invalid'];
  const sources = constants.sources || ['Website', 'WhatsApp', 'Facebook', 'Instagram', 'Sales Partner', 'Referral', 'Walk-in', 'Manual Entry'];
  const propertyTypes = constants.propertyTypes || ['1 Bed Apartment', '2 Bed Apartment', 'Commercial', 'Office', 'Food Court Space', 'Other'];
  const purposes = constants.purposes || ['End use', 'Investment', 'Business', 'Rental', 'Other'];
  const timelines = constants.timelines || ['Within 30 days', '1–3 months', '3–6 months', 'Exploring', 'Not decided'];
  const priorities = constants.priorities || ['Low', 'Medium', 'High', 'VIP'];
  const tags = constants.tags || ['High Intent', 'VIP', 'Investor', 'Family Buyer', 'Retail VIP', 'Follow-up Needed'];

  state.leadModule = state.leadModule || { drawerTab: 'overview', notice: '', editing: false, agents: [], agentsLoading: false, agentsLoaded: false, agentsError: '', importDialog: null };
  state.leadModule.agents = Array.isArray(state.leadModule.agents) ? state.leadModule.agents : [];
  state.leadModule.agentsLoading = Boolean(state.leadModule.agentsLoading);
  state.leadModule.agentsLoaded = Boolean(state.leadModule.agentsLoaded);
  state.leadModule.agentsError = state.leadModule.agentsError || '';
  state.leadModule.editing = Boolean(state.leadModule.editing);
  state.leadModule.importDialog = state.leadModule.importDialog || null;

  const escape = value => window.AureumUI?.escape ? window.AureumUI.escape(String(value ?? '')) : String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const valueOf = (lead, key, fallback = '—') => lead && lead[key] !== undefined && lead[key] !== null && lead[key] !== '' ? lead[key] : fallback;
  const initials = lead => valueOf(lead, 'initials', String(valueOf(lead, 'full_name', 'Lead')).split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase());
  const titleCase = value => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
  const currentLead = () => state.leadDetail?.data || null;
  const linkedCustomerId = lead => lead.customer_id !== undefined ? lead.customer_id : window.AureumCustomerIntegrations?.getCustomerFromLeadId?.(lead.id)?.id;
  const canManage = () => ['SUPER_ADMIN', 'SALES_MANAGER'].includes(state.role);
  const canCreateLead = () => ['SUPER_ADMIN', 'SALES_MANAGER', 'SALES_AGENT'].includes(state.role);
  const isManager = () => ['SUPER_ADMIN', 'SALES_MANAGER'].includes(state.role);
  const statusBadge = status => typeof badge === 'function' ? badge(status) : `<span class="badge badge-neutral">${escape(status)}</span>`;
  const selectOptions = (items, selected = '', placeholder = '') => `${placeholder ? `<option value="">${escape(placeholder)}</option>` : ''}${items.map(item => `<option value="${escape(item)}" ${String(item) === String(selected) ? 'selected' : ''}>${escape(item)}</option>`).join('')}`;
  const normalizeTags = value => [...new Set((Array.isArray(value) ? value : value ? String(value).split(/[|;]/) : []).map(tag => String(tag || '').trim()).filter(Boolean))];
  const multiTagOptions = selected => tags.map(tag => `<option value="${escape(tag)}" ${normalizeTags(selected).some(item => item.toLowerCase() === String(tag).toLowerCase()) ? 'selected' : ''}>${escape(tag)}</option>`).join('');
  const multiTagField = (selected = '', id = '') => `<select name="tags"${id ? ` id="${escape(id)}"` : ''} class="tag-multi-select" multiple size="4" aria-describedby="${id ? `${escape(id)}-help` : 'tag-multi-help'}">${multiTagOptions(selected)}</select><small id="${id ? `${escape(id)}-help` : 'tag-multi-help'}" class="form-hint">Select one or more tags. Follow-up Needed creates the follow-up automatically.</small>`;
  const knownInterest = value => { const interest = String(value || ''); return propertyTypes.includes(interest) && interest !== 'Other'; };
  const otherInterestField = (id, value = '', visible = false) => `<div class="form-field lead-other-interest-field" data-other-interest-field ${visible ? '' : 'hidden'}><label for="${escape(id)}">Tell us what they want *</label><input id="${escape(id)}" name="interested_in_other" value="${escape(value)}" placeholder="e.g. 3 Bed Apartment, Villa, or another requirement" ${visible ? 'required' : ''} /></div>`;
  const syncOtherInterestField = form => {
    if (!form) return;
    const select = form.querySelector('[data-interest-select]');
    const field = form.querySelector('[data-other-interest-field]');
    const input = field?.querySelector('input[name="interested_in_other"]');
    if (!select || !field || !input) return;
    const visible = select.value === 'Other';
    field.hidden = !visible;
    input.required = visible;
    if (!visible) input.value = '';
  };
  const agentOptions = (selected = '', includeBlank = true) => {
    const agents = state.leadModule.agents.filter(item => item.status === 'Active' || item.status === 'active' || !item.status);
    const placeholder = state.leadModule.agentsLoading ? 'Loading active advisors…' : state.leadModule.agentsError ? 'Unable to load advisors' : 'Assign later';
    return `${includeBlank ? `<option value="">${escape(placeholder)}</option>` : ''}${agents.map(agent => `<option value="${escape(agent.id)}" ${String(agent.id) === String(selected) ? 'selected' : ''}>${escape(agent.full_name || agent.fullName || agent.name)}${agent.role === 'sales_manager' ? ' · Manager' : ''}</option>`).join('')}`;
  };
  const agentFilterOptions = (selected = '') => {
    const agents = state.leadModule.agents.filter(item => item.status === 'Active' || item.status === 'active' || !item.status);
    return `<option value="">All agents</option>${agents.map(agent => `<option value="${escape(agent.id)}" ${String(agent.id) === String(selected) ? 'selected' : ''}>${escape(agent.full_name || agent.fullName || agent.name)}${agent.role === 'sales_manager' ? ' · Manager' : ''}</option>`).join('')}`;
  };
  const populateLeadAgentSelect = () => {
    const select = document.querySelector('#lead-create-form select[name="assigned_agent_id"]');
    if (select) select.innerHTML = agentOptions();
  };

  async function loadLeadAgents(force = false) {
    if (state.role === 'SALES_AGENT') {
      if (state.leadModule.agentsLoaded && !force) return;
      state.leadModule.agents = state.authUser ? [{ id: state.authUser.id, full_name: state.authUser.full_name, role: 'sales_agent', status: 'active' }] : [];
      state.leadModule.agentsLoaded = true;
      state.leadModule.agentsError = '';
      render();
      populateLeadAgentSelect();
      return;
    }
    if (!isManager() || (state.leadModule.agentsLoaded && !force) || state.leadModule.agentsLoading) return;
    state.leadModule.agentsLoading = true;
    state.leadModule.agentsError = '';
    render();
    try {
      const result = await apiFetch('/api/users?role=sales_agent&status=active');
      state.leadModule.agents = Array.isArray(result.data) ? result.data : [];
      state.leadModule.agentsLoaded = true;
    } catch (error) {
      state.leadModule.agents = [];
      state.leadModule.agentsError = error.message || 'Unable to load active advisors.';
    } finally {
      state.leadModule.agentsLoading = false;
      render();
      populateLeadAgentSelect();
    }
  }
  const formatTags = lead => (Array.isArray(lead?.tags) ? lead.tags : lead?.tag ? [lead.tag] : []).map(tag => `<span class="lead-tag">${escape(tag)}</span>`).join('') || '<span class="person-meta">No tags</span>';
  const safeDate = value => value && value !== '—' ? escape(value) : '—';

  const importHeaderAliases = { name: 'full_name', full_name: 'full_name', fullname: 'full_name', phone: 'phone', phone_number: 'phone', mobile: 'phone', whatsapp: 'whatsapp_number', whatsapp_number: 'whatsapp_number', email: 'email', city: 'city', area: 'area', locality: 'area', interested_in: 'interested_in', interest: 'interested_in', property: 'interested_in', property_type: 'property_type', budget: 'budget', preferred_location: 'preferred_location', purpose: 'purpose', buying_timeline: 'buying_timeline', lead_source: 'lead_source', source: 'lead_source', priority: 'priority', status: 'status', assigned_agent_id: 'assigned_agent_id', financing_required: 'financing_required', tags: 'tags', tag: 'tags' };
  const normalizeImportHeader = value => { const key = String(value || '').replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); return importHeaderAliases[key] || key; };
  function parseCsvImport(text) {
    const rows = []; let row = []; let cell = ''; let quoted = false;
    for (let index = 0; index < String(text || '').length; index += 1) { const char = text[index]; const next = text[index + 1]; if (char === '"' && quoted && next === '"') { cell += '"'; index += 1; } else if (char === '"') quoted = !quoted; else if (char === ',' && !quoted) { row.push(cell); cell = ''; } else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && next === '\n') index += 1; row.push(cell); if (row.some(value => String(value).trim())) rows.push(row); row = []; cell = ''; } else cell += char; }
    if (cell || row.length) { row.push(cell); if (row.some(value => String(value).trim())) rows.push(row); }
    if (rows.length < 2) return { headers: [], rows: [], error: 'The CSV must contain a header row and at least one lead.' };
    const headers = rows[0].map(normalizeImportHeader); const required = ['full_name', 'phone', 'interested_in']; const missing = required.filter(field => !headers.includes(field));
    if (missing.length) return { headers, rows: [], error: `Missing required columns: ${missing.map(titleCase).join(', ')}.` };
    return { headers, rows: rows.slice(1).map((values, index) => { const item = { __row_number: index + 2 }; headers.forEach((header, cellIndex) => { if (header && importHeaderAliases[header]) item[header] = String(values[cellIndex] || '').trim(); }); return item; }).filter(item => Object.keys(item).some(key => key !== '__row_number' && item[key])) };
  }
  function importRowErrors(rows) { return Object.fromEntries(rows.filter(row => !row.full_name || !row.phone || !row.interested_in).map(row => [row.__row_number, 'Full name, phone, and interested in are required.'])); }
  function importCsvCell(value) { const text = String(value ?? ''); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
  function downloadImportTemplate() { const csv = [['Full Name', 'Phone', 'Email', 'WhatsApp', 'City', 'Area', 'Interested In', 'Property Type', 'Budget', 'Preferred Location', 'Purpose', 'Buying Timeline', 'Lead Source', 'Priority', 'Status', 'Assigned Agent ID', 'Financing Required', 'Tags'], ['Ahmed Khan', '+92 300 1234567', 'ahmed@example.com', '+92 300 1234567', 'Lahore', 'DHA', '1 Bed Apartment', '1 Bed Apartment', 'PKR 25M', 'DHA Phase 6', 'Investment', '1-3 months', 'Manual Entry', 'High', 'New', '', 'FALSE', 'Investor']].map(row => row.map(importCsvCell).join(',')).join('\n'); const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = 'aureum-lead-import-template.csv'; link.click(); URL.revokeObjectURL(url); }
  function renderImportDialog() {
    const dialog = state.leadModule.importDialog;
    if (!dialog?.open) return '';
    const rows = dialog.rows || [];
    const errors = dialog.errors || {};
    const valid = rows.filter(row => !errors[row.__row_number]);
    const result = dialog.result;
    const resultView = result ? `<div class="import-result"><strong>Import complete</strong><span>${result.imported} imported · ${result.skippedCount} skipped · ${result.failedCount} failed</span>${result.failed?.length ? `<div class="import-result-list">${result.failed.slice(0, 8).map(item => `<div>Row ${item.row}: ${escape(item.error)}</div>`).join('')}</div>` : ''}</div>` : '';
    const preview = !result && rows.length ? `<div class="import-preview"><div class="import-preview-head"><strong>Preview and edit</strong><span>${valid.length} ready · ${Object.keys(errors).length} invalid</span></div><p class="form-hint">Correct the visible fields below before importing. Other CSV columns remain unchanged.</p><div class="table-wrap"><table><thead><tr><th>Row</th><th>Name</th><th>Phone</th><th>Email</th><th>City</th><th>Interested in</th><th>Validation</th></tr></thead><tbody>${rows.slice(0, 8).map(row => `<tr><td>${row.__row_number}</td><td><input class="import-preview-input" data-import-edit data-import-row="${row.__row_number}" data-import-field="full_name" value="${escape(row.full_name || '')}" aria-label="Row ${row.__row_number} full name" /></td><td><input class="import-preview-input" data-import-edit data-import-row="${row.__row_number}" data-import-field="phone" value="${escape(row.phone || '')}" aria-label="Row ${row.__row_number} phone" /></td><td><input class="import-preview-input" data-import-edit data-import-row="${row.__row_number}" data-import-field="email" value="${escape(row.email || '')}" aria-label="Row ${row.__row_number} email" /></td><td><input class="import-preview-input" data-import-edit data-import-row="${row.__row_number}" data-import-field="city" value="${escape(row.city || '')}" aria-label="Row ${row.__row_number} city" /></td><td><input class="import-preview-input" data-import-edit data-import-row="${row.__row_number}" data-import-field="interested_in" value="${escape(row.interested_in || '')}" aria-label="Row ${row.__row_number} interested in" /></td><td>${errors[row.__row_number] ? `<span class="badge badge-overdue">${escape(errors[row.__row_number])}</span>` : '<span class="badge badge-completed">Ready</span>'}</td></tr>`).join('')}</tbody></table></div>${rows.length > 8 ? `<p class="form-hint">Showing the first 8 rows. All ${rows.length} rows will be processed.</p>` : ''}</div>` : '';
    const buttonLabel = dialog.uploading ? 'Importing…' : `Import ${valid.length} lead${valid.length === 1 ? '' : 's'}`;
    const body = resultView || `${preview}<div class="form-grid import-options"><div class="form-field"><label for="import-duplicates">Duplicate handling</label><select id="import-duplicates" data-import-duplicates ${dialog.uploading ? 'disabled' : ''}><option value="skip" ${dialog.duplicateMode !== 'allow' ? 'selected' : ''}>Skip matching phone or email</option><option value="allow" ${dialog.duplicateMode === 'allow' ? 'selected' : ''}>Create duplicates anyway</option></select><small class="form-hint">Matches are checked against existing CRM leads before creation.</small></div></div><div class="drawer-action-row"><button class="btn btn-secondary" type="button" data-import-template>Download template</button><span class="form-hint">Required: Full Name, Phone, Interested In</span><button class="btn btn-gold" type="button" data-import-confirm ${dialog.uploading || !valid.length ? 'disabled' : ''}>${buttonLabel}</button></div>`;
    return `<div class="import-dialog-backdrop" data-import-close><section class="import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-dialog-title" onclick="event.stopPropagation()"><div class="drawer-header"><div><div class="eyebrow">Lead intake</div><h2 id="import-dialog-title">Import leads from CSV or Excel</h2><p class="page-subtitle">${escape(dialog.fileName || 'Upload a CSV or Excel file')} · rows without an Assigned Agent ID are added to the importer’s own pipeline.</p></div><button class="drawer-close" type="button" data-import-close aria-label="Close import dialog">×</button></div>${body}</section></div>`;
  }

  async function fileToBase64(file) { const bytes = new Uint8Array(await file.arrayBuffer()); let binary = ''; const chunkSize = 0x8000; for (let offset = 0; offset < bytes.length; offset += chunkSize) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length))); return btoa(binary); }
  async function openImportPicker() {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xls,application/vnd.ms-excel';
    input.addEventListener('change', async () => {
      const file = input.files?.[0]; if (!file) return;
      try {
        const isExcel = /\.(xlsx|xls)$/i.test(file.name);
        const csv = isExcel ? (await apiFetch('/api/leads/import/parse', { method: 'POST', body: JSON.stringify({ file_name: file.name, file_base64: await fileToBase64(file) }) })).data?.csv : await file.text();
        const parsed = parseCsvImport(csv);
        if (parsed.error) { showToast(parsed.error); return; }
        state.leadModule.importDialog = { open: true, fileName: file.name, rows: parsed.rows, errors: importRowErrors(parsed.rows), duplicateMode: 'skip', uploading: false, result: null };
        render();
      } catch (error) { showToast(error.message || 'The spreadsheet could not be read.'); }
    });
    input.click();
  }

  async function confirmImport() {
    const dialog = state.leadModule.importDialog; if (!dialog || dialog.uploading) return;
    const rows = (dialog.rows || []).filter(row => !dialog.errors?.[row.__row_number]); if (!rows.length) return;
    dialog.uploading = true; render();
    try { const response = await apiFetch('/api/leads/import', { method: 'POST', body: JSON.stringify({ rows, duplicate_mode: dialog.duplicateMode }) }); dialog.uploading = false; dialog.result = response.data || {}; await refreshLeads(); render(); }
    catch (error) { dialog.uploading = false; render(); showToast(error.message || 'CSV import failed.'); }
  }

  function roleCopy(my) {
    if (my && state.role === 'SALES_AGENT') return 'Only leads assigned to your advisor account are visible here.';
    if (my) return 'A focused view of the relationships assigned to you and your team scope.';
    return 'Review the full Aureum pipeline, ownership, intent, and next commercial action.';
  }

  function leadModuleItems(my) {
    return Array.isArray(state.leads?.items) ? state.leads.items.filter(lead => {
      const filters = state.leadFilters || {};
      const q = String(filters.q || '').trim().toLowerCase();
      const haystack = [lead.full_name, lead.phone, lead.whatsapp_number, lead.email, lead.city, lead.area, lead.interested_in, lead.property_type, lead.assigned_agent, lead.lead_source, lead.status].join(' ').toLowerCase();
      if (q && !haystack.includes(q)) return false;
      if (filters.status && lead.status !== filters.status) return false;
      if (filters.source && (lead.lead_source || lead.source) !== filters.source) return false;
      if (filters.propertyType && lead.property_type !== filters.propertyType) return false;
      if (filters.priority && lead.priority !== filters.priority) return false;
      if (filters.agentId && String(lead.assigned_agent_id || '') !== String(filters.agentId)) return false;
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
    return `<details class="lead-action-menu"><summary class="table-action" aria-label="Actions for ${escape(lead.full_name)}">Actions <span aria-hidden="true">⌄</span></summary><div class="lead-action-options"><button data-leads-open="${id}">Open details</button><button data-leads-action="edit" data-lead-id="${id}">Edit lead</button><button data-leads-action="call" data-lead-id="${id}">Call lead</button><button data-leads-action="whatsapp" data-lead-id="${id}">Open WhatsApp</button><button data-leads-action="status" data-lead-id="${id}">Update status</button>${management}<button data-leads-action="customer" data-lead-id="${id}">${linkedCustomerId(lead) ? 'Customer profile' : 'Create customer'}</button><button data-leads-action="follow-up" data-lead-id="${id}">Schedule follow-up</button></div></details>`;
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
    // Keep lead intake available from the management registry and primary
    // navigation, but keep My Leads focused on the assigned pipeline.
    const addAction = !my && canCreateLead() ? '<button class="btn btn-gold" data-screen="add-lead">+ Add new lead</button>' : '';
    const importAction = canCreateLead() ? '<button class="btn btn-secondary" data-leads-template>Download CSV template</button><button class="btn btn-secondary" data-leads-import>Import CSV / Excel</button>' : '';
    const search = escape(state.leadFilters?.q || '');
    const tableHeaders = my ? '<th>Lead name</th><th>Phone / WhatsApp</th><th>Interested in</th><th>Budget</th><th>Status</th><th>Tags</th><th>Next follow-up</th><th>Last contacted</th><th>Actions</th>' : '<th>Lead name</th><th>Phone / WhatsApp</th><th>Email</th><th>City</th><th>Interested in</th><th>Budget</th><th>Source</th><th>Assigned agent</th><th>Status</th><th>Tags</th><th>Next follow-up</th><th>Created date</th><th>Last contacted</th><th>Actions</th>';
    const agentFilter = !my && isManager() ? `<select class="select" data-leads-agent aria-label="Filter by assigned agent">${agentFilterOptions(state.leadFilters?.agentId || '')}</select>` : '';
    const page = pageHeader(my ? 'Assigned pipeline' : 'Aureum private registry', my ? 'My leads' : 'All leads', roleCopy(my), `${importAction}<button class="btn btn-secondary" data-leads-reload>Refresh</button>${addAction}`) + `<section class="grid grid-4 lead-summary-grid">${summaryCard('Visible leads', total, my ? 'Ownership-scoped view' : 'Company / team registry')}${summaryCard('Hot leads', hot, hot ? 'Prioritize today' : 'No hot leads in view', hot ? 'hot' : '')}${summaryCard('Follow-up leads', followUp, followUp ? 'Conversation in motion' : 'No follow-ups tagged', followUp ? 'warm' : '')}${summaryCard('Scheduled next actions', due, due ? 'Review before end of day' : 'Nothing scheduled', due ? 'blue' : '')}</section><section class="card table-card lead-registry-card"><div class="lead-registry-head"><div><h2>${my ? 'My leads' : 'All leads registry'}</h2><p>${items.length} of ${total} visible records · data is scoped to your role.</p></div><span class="badge badge-neutral">${state.role === 'SALES_AGENT' ? 'Assigned only' : my ? 'Personal scope' : 'Management scope'}</span></div>${statusTabs(my)}<div class="lead-filter-bar"><label class="lead-search-field"><span aria-hidden="true">⌕</span><input data-leads-search value="${search}" placeholder="Search by name, phone, email, city…" aria-label="Search leads" /></label>${agentFilter}<select class="select" data-leads-source aria-label="Filter by source">${selectOptions(sources, state.leadFilters?.source || '', 'All sources')}</select><select class="select" data-leads-property aria-label="Filter by property type">${selectOptions(propertyTypes, state.leadFilters?.propertyType || '', 'All interests')}</select><select class="select" data-leads-priority aria-label="Filter by priority">${selectOptions(priorities, state.leadFilters?.priority || '', 'All priorities')}</select><button class="btn btn-secondary btn-sm" data-leads-reset>Reset</button></div><div class="table-wrap lead-table-wrap"><table class="lead-data-table"><thead><tr>${tableHeaders}</tr></thead><tbody>${leadTableRows(items, my)}</tbody></table></div></section>`;
    return page + renderImportDialog();
  }

  function formField(label, name, input, full = false, required = false) {
    return `<div class="form-field ${full ? 'full' : ''}"><label for="lead-${name}">${escape(label)}${required ? ' *' : ''}</label>${input.replace('<input ', `<input id="lead-${name}" `).replace('<select ', `<select id="lead-${name}" `).replace('<textarea ', `<textarea id="lead-${name}" `)}</div>`;
  }

  function renderAddLeadModule() {
    if (!canCreateLead()) return renderAccessDenied();
    const assignmentField = state.role === 'SALES_AGENT'
      ? formField('Assigned agent', 'assigned_agent_id', `<input name="assigned_agent_display" value="${escape(state.authUser?.full_name || 'My account')}" readonly /><input type="hidden" name="assigned_agent_id" value="${escape(state.authUser?.id || '')}" />`)
      : formField('Assigned agent', 'assigned_agent_id', '<select name="assigned_agent_id"><option value="">Assign later</option></select>');
    const interestedInField = formField('Interested in', 'interested_in', `<select name="interested_in" data-interest-select required>${selectOptions(propertyTypes, '', 'Choose an interest')}</select>`, false, true);
    return pageHeader('Pipeline intake', 'Add new lead', 'Capture a complete customer inquiry once, then keep ownership and next action clear.', '<button class="btn btn-secondary" data-screen="my-leads">Cancel</button>') + `<form id="lead-create-form" class="lead-create-form"><section class="card card-pad lead-form-section"><div class="lead-form-section-head"><div><span class="eyebrow">01 · Customer information</span><h2>Who is the customer?</h2><p>Use the primary contact details the advisor will use for the first conversation.</p></div><span class="badge badge-neutral">Required fields marked *</span></div><div class="form-grid">${formField('Full name', 'full_name', '<input name="full_name" required placeholder="e.g. Ahmed Khan" />', false, true)}${formField('Phone number', 'phone', '<input name="phone" required placeholder="03xx-xxxxxxx" />', false, true)}${formField('WhatsApp number', 'whatsapp_number', '<input name="whatsapp_number" placeholder="Same as phone if blank" />')}${formField('Email address', 'email', '<input name="email" type="email" placeholder="customer@example.com" />')}${formField('City', 'city', '<input name="city" placeholder="Lahore" />')}${formField('Area / locality', 'area', '<input name="area" placeholder="DHA, Gulberg…" />')}${formField('Preferred contact method', 'preferred_contact_method', '<select name="preferred_contact_method"><option>Phone call</option><option>WhatsApp</option><option>Email</option></select>')}</div></section><section class="card card-pad lead-form-section"><div class="lead-form-section-head"><div><span class="eyebrow">02 · Requirement information</span><h2>What are they looking for?</h2><p>Capture enough intent to route the lead to the right Aureum conversation.</p></div></div><div class="form-grid">${interestedInField}${otherInterestField('lead-interested_in_other')}${formField('Budget', 'budget', '<input name="budget" placeholder="PKR 25M" />')}${formField('Preferred location', 'preferred_location', '<input name="preferred_location" placeholder="Sector C, Mall Commercial Hub…" />')}${formField('Purpose', 'purpose', `<select name="purpose">${selectOptions(purposes, '', 'Choose a purpose')}</select>`)}</div></section><section class="card card-pad lead-form-section"><div class="lead-form-section-head"><div><span class="eyebrow">03 · CRM information</span><h2>How should Aureum work it?</h2><p>Set the pipeline context, ownership, and next follow-up at intake.</p></div></div><div class="form-grid">${formField('Lead source', 'lead_source', `<select name="lead_source">${selectOptions(sources, 'Manual Entry')}</select>`)}${formField('Priority', 'priority', `<select name="priority">${selectOptions(priorities, 'Medium')}</select>`)}${formField('Initial status', 'status', `<select name="status">${selectOptions(allStatuses.slice(0, 8), 'New')}</select>`)}${assignmentField}${formField('Next follow-up', 'next_follow_up_at', '<input name="next_follow_up_at" type="datetime-local" />')}${formField('Tags', 'tags', multiTagField([]))}${formField('Internal notes', 'initial_note', '<textarea name="initial_note" rows="4" placeholder="Context for the assigned advisor…"></textarea>', true)}</div></section><div class="lead-form-actions"><span>Leads are stored in the protected CRM registry.</span><div><button class="btn btn-secondary" type="button" data-screen="my-leads">Cancel</button><button class="btn btn-secondary" type="submit" name="save_mode" value="another">Save & add another</button><button class="btn btn-gold" type="submit" name="save_mode" value="close">Save lead</button></div></div></form>`;
  }

  function detailItem(label, value) { return `<div><div class="detail-label">${escape(label)}</div><div class="detail-value">${escape(valueOf({ value }, 'value'))}</div></div>`; }

  function renderCreateCustomerForm(lead) {
    const schedule = Boolean(state.leadModule.creatingCustomer?.schedule);
    const inheritedTags = normalizeTags(lead.tags);
    const customerTags = [...new Set([...tags, ...inheritedTags])].map(tag => `<option value="${escape(tag)}" ${inheritedTags.includes(tag) ? 'selected' : ''}>${escape(tag)}</option>`).join('');
    const field = (label, name, type = 'text') => `<div class="form-field"><label for="lead-customer-${name}">${escape(label)}</label><input id="lead-customer-${name}" name="${name}" type="${type}" value="${escape(lead[name] || (name === 'whatsapp_number' ? lead.phone : '') || '')}" ${['full_name', 'phone'].includes(name) ? 'required' : ''} /></div>`;
    const dates = window.AureumFollowUpDateUtils;
    const today = dates.todayInTimezone();
    const tomorrow = dates.todayInTimezone(new Date(Date.now() + 86400000));
    return `<form id="lead-module-customer-form" class="drawer-section" data-lead-id="${escape(lead.id)}"><div class="drawer-section-label">Create customer</div><p class="form-hint">Review the details copied from this lead. The customer stays linked to the same lead and advisor.</p><div class="form-grid">${field('Full name *', 'full_name')}${field('Phone *', 'phone')}${field('WhatsApp', 'whatsapp_number')}${field('Email', 'email', 'email')}${field('City', 'city')}${field('Area / locality', 'area')}${field('Interested in', 'interested_in')}${field('Property type', 'property_type')}${field('Budget', 'budget')}${field('Preferred location', 'preferred_location')}${field('Purpose', 'purpose')}${field('Buying timeline', 'buying_timeline')}<div class="form-field"><label for="lead-customer-contact">Preferred contact</label><select id="lead-customer-contact" name="preferred_contact_method">${selectOptions(['Phone call', 'WhatsApp', 'Email'], lead.preferred_contact_method || 'Phone call')}</select></div><div class="form-field"><label for="lead-customer-tags">Customer tags</label><select id="lead-customer-tags" name="tags" class="tag-multi-select" multiple size="4">${customerTags}</select></div></div><div class="lead-customer-followup"><label class="lead-customer-schedule-toggle"><input type="checkbox" name="schedule_followup" value="true" data-lead-customer-schedule ${schedule ? 'checked' : ''} /> Schedule a follow-up</label><p class="form-hint">Optionally plan the next conversation while creating this customer.</p><fieldset data-lead-customer-followup ${schedule ? '' : 'hidden disabled'}><legend>Follow-up details</legend><div class="form-field"><label for="lead-customer-note">Follow-up note *</label><textarea id="lead-customer-note" name="note" rows="3" maxlength="2000" required placeholder="What should happen in the next conversation?"></textarea></div><div class="form-grid"><div class="form-field"><label for="lead-customer-date">Follow-up date *</label><input id="lead-customer-date" name="next_due_date" type="date" value="${tomorrow}" min="${today}" required /></div><div class="form-field"><label for="lead-customer-time">Time (Pakistan) *</label><input id="lead-customer-time" name="next_due_time" type="time" value="10:00" required /></div></div><div class="form-field"><label for="lead-customer-followup-tag">Follow-up tag *</label><select id="lead-customer-followup-tag" name="followup_tag" required>${selectOptions(tags, 'Follow-up Needed')}</select></div></fieldset></div><p class="form-hint" data-lead-customer-error role="alert"></p><div class="drawer-action-row"><button class="btn btn-secondary" type="button" data-leads-action="cancel-customer" data-lead-id="${escape(lead.id)}">Cancel</button><button class="btn btn-gold" type="submit">${schedule ? 'Create customer & follow-up' : 'Create customer'}</button></div></form>`;
  }

  function renderLeadEditForm(lead) {
    const field = (label, name, input, full = false) => `<div class="form-field ${full ? 'full' : ''}"><label for="lead-edit-${name}">${escape(label)}</label>${input.replace('<input ', `<input id="lead-edit-${name}" `).replace('<select ', `<select id="lead-edit-${name}" `).replace('<textarea ', `<textarea id="lead-edit-${name}" `)}</div>`;
    const editValue = key => escape(lead?.[key] ?? '');
    const dateTimeValue = value => { const raw = String(value || '').trim(); const match = raw.match(/(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/); return match ? `${match[1]}T${match[2]}` : ''; };
    const selectedSource = lead.lead_source || lead.source || '';
    const selectedInterest = lead.interested_in || lead.interest || '';
    const customInterest = selectedInterest && !knownInterest(selectedInterest) && selectedInterest !== 'Other' ? selectedInterest : '';
    const interestValue = customInterest || selectedInterest === 'Other' ? 'Other' : selectedInterest;
    const selectedPriority = lead.priority || 'Medium';
    const selectedTags = normalizeTags(lead.tags || lead.tag);
    return `<form id="lead-module-edit-form" class="drawer-section lead-edit-form"><div class="drawer-section-label">Edit lead details</div><p class="form-hint">Update the customer record from your phone. Changes remain limited to the records permitted for your role.</p><div class="form-grid">${field('Full name *', 'full_name', `<input name="full_name" required value="${editValue('full_name')}" />`)}${field('Phone *', 'phone', `<input name="phone" required value="${editValue('phone')}" />`)}${field('WhatsApp', 'whatsapp_number', `<input name="whatsapp_number" value="${editValue('whatsapp_number')}" />`)}${field('Email', 'email', `<input name="email" type="email" value="${editValue('email')}" />`)}${field('City', 'city', `<input name="city" value="${editValue('city')}" />`)}${field('Area / locality', 'area', `<input name="area" value="${editValue('area')}" />`)}${field('Interested in', 'interested_in', `<select name="interested_in" data-interest-select>${selectOptions(propertyTypes, interestValue, 'Choose an interest')}</select>`)}${otherInterestField('lead-edit-interested_in_other', customInterest, selectedInterest === 'Other' || Boolean(customInterest))}${field('Property type', 'property_type', `<select name="property_type">${selectOptions(propertyTypes, lead.property_type || '', 'Choose a property type')}</select>`)}${field('Budget', 'budget', `<input name="budget" value="${editValue('budget')}" placeholder="PKR 25M" />`)}${field('Preferred location', 'preferred_location', `<input name="preferred_location" value="${editValue('preferred_location')}" />`)}${field('Purpose', 'purpose', `<select name="purpose">${selectOptions(purposes, lead.purpose || '', 'Choose a purpose')}</select>`)}${field('Buying timeline', 'buying_timeline', `<select name="buying_timeline">${selectOptions(timelines, lead.buying_timeline || '', 'Choose a timeline')}</select>`)}${field('Lead source', 'lead_source', `<select name="lead_source">${selectOptions(sources, selectedSource, 'Choose a source')}</select>`)}${field('Priority', 'priority', `<select name="priority">${selectOptions(priorities, selectedPriority)}</select>`)}${field('Status', 'status', `<select name="status">${selectOptions(allStatuses, lead.status || 'New')}</select>`)}${field('Next follow-up', 'next_follow_up_at', `<input name="next_follow_up_at" type="datetime-local" step="900" value="${dateTimeValue(lead.next_follow_up_at)}" aria-describedby="lead-edit-next-follow-up-help" /> <small id="lead-edit-next-follow-up-help" class="form-hint">Choose the date and time for the next customer touchpoint.</small>`)}${field('Tags', 'tags', multiTagField(selectedTags))} </div><div class="drawer-action-row"><button type="button" class="btn btn-secondary" data-leads-action="cancel-edit" data-lead-id="${escape(lead.id)}">Cancel</button><button type="submit" class="btn btn-gold">Save lead</button></div></form>`;
  }

  function renderLeadDrawerModule() {
    const lead = currentLead();
    if (!lead) return `<div class="drawer-backdrop" data-lead-module-close></div><aside class="drawer"><div class="empty-state">Loading lead details…</div></aside>`;
    const activity = state.leadDetail?.activity || [];
    const notes = activity.filter(item => item.activity_type === 'Note added');
    const tab = state.leadModule.drawerTab || 'overview';
    const statusForm = `<form id="lead-module-status-form" class="drawer-inline-form"><label>Status</label><div class="drawer-form-row"><select name="status">${selectOptions(allStatuses, lead.status)}</select><select name="priority">${selectOptions(priorities, lead.priority || 'Medium')}</select><button class="btn btn-gold btn-sm" type="submit">Save</button></div></form>`;
    const assignment = canManage() ? `<form id="lead-module-assign-form" class="drawer-inline-form"><label>Assigned agent</label><div class="drawer-form-row"><select name="assigned_agent_id">${agentOptions(lead.assigned_agent_id, false)}${lead.assigned_agent_id ? '' : '<option value="" selected>Keep current assignment</option>'}</select><button class="btn btn-secondary btn-sm" type="submit">Assign</button></div></form>` : '';
    const overview = `<div class="drawer-section"><div class="detail-grid">${detailItem('Phone / WhatsApp', `${valueOf(lead, 'phone')} · ${valueOf(lead, 'whatsapp_number')}`)}${detailItem('Email', valueOf(lead, 'email'))}${detailItem('City / area', `${valueOf(lead, 'city')} · ${valueOf(lead, 'area')}`)}${detailItem('Interested in', valueOf(lead, 'interested_in'))}${detailItem('Budget', valueOf(lead, 'budget'))}${detailItem('Property type', valueOf(lead, 'property_type'))}${detailItem('Purpose', valueOf(lead, 'purpose'))}${detailItem('Buying timeline', valueOf(lead, 'buying_timeline'))}${detailItem('Next follow-up', valueOf(lead, 'next_follow_up_at'))}${detailItem('Last contacted', valueOf(lead, 'last_contacted_at'))}</div></div><div class="drawer-section"><div class="lead-drawer-tags">${formatTags(lead)}</div>${statusForm}${assignment}</div><div class="drawer-section"><div class="drawer-action-row"><button class="btn btn-gold btn-sm" data-leads-action="edit" data-lead-id="${escape(lead.id)}">Edit lead</button><button class="btn btn-secondary btn-sm" data-leads-action="call" data-lead-id="${escape(lead.id)}">Call</button><button class="btn btn-secondary btn-sm" data-leads-action="whatsapp" data-lead-id="${escape(lead.id)}">WhatsApp</button><button class="btn btn-secondary btn-sm" data-leads-action="customer" data-lead-id="${escape(lead.id)}">${linkedCustomerId(lead) ? 'Customer profile' : 'Create customer'}</button><button class="btn btn-secondary btn-sm" data-leads-action="follow-up" data-lead-id="${escape(lead.id)}">Schedule follow-up</button></div></div>`;
    const notesView = `<div class="drawer-section"><form id="lead-module-note-form">${window.AureumFollowUpNoteUI.fields()}<button class="btn btn-gold btn-sm" type="submit">Save note</button></form></div><div class="lead-notes-list">${notes.length ? notes.map(note => `<article class="lead-note"><strong>Note</strong><p>${escape(note.description || note.note)}</p><time>${escape(note.created_at)}</time></article>`).join('') : '<div class="empty-state">No notes yet. Add the first useful context for this relationship.</div>'}</div>`;
    const activityView = `<div class="lead-activity-timeline">${activity.length ? activity.map(item => `<div class="timeline-item"><div class="timeline-dot"></div><div><div class="timeline-title">${escape(item.activity_type || 'Activity')}</div><div class="timeline-copy">${escape(item.description || '')}</div><div class="timeline-time">${escape(item.created_at || '')}</div></div></div>`).join('') : '<div class="empty-state">No activity recorded yet.</div>'}</div>`;
    const creatingCustomer = state.leadModule.creatingCustomer?.id === lead.id;
    const body = creatingCustomer ? renderCreateCustomerForm(lead) : state.leadModule.editing ? renderLeadEditForm(lead) : `${tab === 'overview' ? overview : tab === 'notes' ? notesView : activityView}`;
    return `<div class="drawer-backdrop" data-lead-module-close></div><aside class="drawer lead-detail-drawer"><div class="drawer-header"><div><div class="eyebrow">Lead record</div><h2>${escape(lead.full_name)}</h2><p class="page-subtitle">${escape(lead.assigned_agent || 'Unassigned')} · ${statusBadge(lead.status)}</p></div><button class="drawer-close" data-lead-module-close aria-label="Close lead details">×</button></div>${state.leadModule.editing || creatingCustomer ? '' : `<div class="lead-drawer-tabs"><button class="${tab === 'overview' ? 'active' : ''}" data-lead-drawer-tab="overview">Overview</button><button class="${tab === 'notes' ? 'active' : ''}" data-lead-drawer-tab="notes">Notes <span>${notes.length}</span></button><button class="${tab === 'activity' ? 'active' : ''}" data-lead-drawer-tab="activity">Activity <span>${activity.length}</span></button></div>`}${body}</aside>`;
  }

  async function refreshLeads() { try { await loadLeads(state.screen === 'my-leads', true); } catch { /* loadLeads renders its own error state */ } }
  async function leadModuleAction(action, id) {
    const lead = (state.leads?.items || []).find(item => item.id === id) || currentLead();
    if (!lead) return;
    if (action === 'call') { showToast(`Call ready for ${lead.full_name}`); return; }
    if (action === 'whatsapp') { showToast(`WhatsApp ready for ${lead.full_name}`); return; }
    if (action === 'customer' || (action === 'follow-up' && !linkedCustomerId(lead))) {
      const customerId = linkedCustomerId(lead);
      if (customerId) { await openCustomer(customerId); return; }
      state.leadModule.editing = false;
      state.leadModule.creatingCustomer = { id, schedule: action === 'follow-up' };
      await openLead(id);
      // The detail response is authoritative if the table was loaded before conversion.
      const linked = currentLead()?.id === id && linkedCustomerId(currentLead());
      if (linked) { state.leadModule.creatingCustomer = null; await openCustomer(linked); }
      return;
    }
    if (action === 'follow-up') { window.openFollowupComposer?.({ lead_id: id, customer_id: linkedCustomerId(lead) || '' }); return; }
    if (action === 'cancel-customer') { state.leadModule.creatingCustomer = null; render(); return; }
    if (action === 'edit') { state.leadModule.editing = true; state.leadModule.drawerTab = 'overview'; await openLead(id); return; }
    if (action === 'cancel-edit') { state.leadModule.editing = false; render(); return; }
    if (action === 'status') { await openLead(id); state.leadModule.drawerTab = 'overview'; return; }
    if (action === 'assign') { await openLead(id); state.leadModule.drawerTab = 'overview'; return; }
  }

  async function submitCreateLead(form, mode) {
    const formData = new FormData(form);
    const raw = Object.fromEntries(formData.entries());
    raw.tags = normalizeTags(formData.getAll('tags'));
    const result = window.AureumLeadValidation?.validate(raw) || { valid: true, errors: {} };
    if (!result.valid) { showToast(Object.values(result.errors)[0]); return; }
    if (raw.interested_in === 'Other') {
      raw.interested_in = String(raw.interested_in_other || '').trim();
      if (!raw.interested_in) { showToast('Tell us what they want before saving'); return; }
    }
    const payload = { ...raw, tags: normalizeTags(raw.tags) };
    delete payload.save_mode; delete payload.initial_note; delete payload.preferred_contact_method; delete payload.interested_in_other;
    try {
      const response = await apiFetch('/api/leads', { method: 'POST', body: JSON.stringify(payload) });
      if (raw.initial_note && response.data?.id) await apiFetch(`/api/leads/${response.data.id}/notes`, { method: 'POST', body: JSON.stringify({ note: raw.initial_note }) });
      showToast('Lead saved to the Aureum registry');
      if (mode === 'another') { form.reset(); form.querySelector('[name="lead_source"]').value = 'Manual Entry'; form.querySelector('[name="priority"]').value = 'Medium'; }
      else navigate(state.role === 'SALES_AGENT' ? 'my-leads' : 'leads');
    } catch (error) { showToast(error.message); }
  }

  async function submitCreateCustomer(form) {
    if (form.dataset.saving) return;
    const formData = new FormData(form);
    const payload = { ...Object.fromEntries(formData.entries()), tags: normalizeTags(formData.getAll('tags')), schedule_followup: formData.get('schedule_followup') === 'true' };
    const button = form.querySelector('button[type="submit"]');
    const errorField = form.querySelector('[data-lead-customer-error]');
    form.dataset.saving = 'true'; button.disabled = true; errorField.textContent = '';
    try {
      const result = await apiFetch(`/api/leads/${form.dataset.leadId}/customer`, { method: 'POST', body: JSON.stringify(payload) });
      const customerId = result.data.id;
      if (currentLead()?.id === form.dataset.leadId) currentLead().customer_id = customerId;
      const row = state.leads?.items?.find(item => item.id === form.dataset.leadId);
      if (row) row.customer_id = customerId;
      state.leadModule.creatingCustomer = null;
      if (state.customerModule) { state.customerModule.editing = false; state.customerModule.tab = 'overview'; }
      await loadCustomers(true);
      await refreshLeads();
      if (payload.schedule_followup && typeof loadFollowups === 'function') await loadFollowups(true);
      await openCustomer(customerId);
      showToast(result.created === false ? 'Customer profile already exists' : result.follow_up_id ? 'Customer created and follow-up scheduled' : 'Customer created');
    } catch (error) { errorField.textContent = error.message || 'Unable to create customer.'; }
    finally { delete form.dataset.saving; button.disabled = false; }
  }

  document.addEventListener('click', event => {
    const leadTemplate = event.target.closest?.('[data-leads-template]');
    if (leadTemplate) { event.preventDefault(); downloadImportTemplate(); return; }
    const importButton = event.target.closest?.('[data-leads-import]');
    if (importButton) { event.preventDefault(); openImportPicker(); return; }
    const importClose = event.target.closest?.('[data-import-close]');
    if (importClose && (event.target === importClose || importClose.matches('button'))) { state.leadModule.importDialog = null; render(); return; }
    const importTemplate = event.target.closest?.('[data-import-template]');
    if (importTemplate) { event.preventDefault(); downloadImportTemplate(); return; }
    const importConfirm = event.target.closest?.('[data-import-confirm]');
    if (importConfirm) { event.preventDefault(); confirmImport(); return; }
    const addLead = event.target.closest?.('[data-screen="add-lead"]');
    if (addLead && state.screen !== 'add-lead') {
      event.preventDefault();
      state.drawer = null;
      state.screen = 'add-lead';
      window.history.pushState({}, '', routePaths['add-lead'] || '/add-lead');
      render();
      loadLeadAgents();
      return;
    }
    const row = event.target.closest('[data-lead-module-row]');
    if (row && !event.target.closest('button, a, input, select, textarea, summary, details')) { openLead(row.dataset.leadModuleRow); return; }
    const close = event.target.closest('[data-lead-module-close]');
    if (close) { state.drawer = null; state.leadDetail = null; state.leadModule.editing = false; state.leadModule.creatingCustomer = null; render(); return; }
    const open = event.target.closest('[data-leads-open]');
    if (open) { event.preventDefault(); openLead(open.dataset.leadsOpen); return; }
    const tab = event.target.closest('[data-leads-tab]');
    if (tab) { event.preventDefault(); state.leadFilters.status = tab.dataset.leadsTab || ''; render(); return; }
    const reset = event.target.closest('[data-leads-reset]');
    if (reset) { state.leadFilters = { q: '', status: '', source: '', propertyType: '', priority: '', agentId: '' }; if (state.screen === 'leads') refreshLeads(); else render(); return; }
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

  document.addEventListener('input', event => {
    const edit = event.target.closest?.('[data-import-edit]');
    if (edit && state.leadModule.importDialog) {
      const row = state.leadModule.importDialog.rows?.find(item => String(item.__row_number) === String(edit.dataset.importRow));
      if (row) { row[edit.dataset.importField] = edit.value; state.leadModule.importDialog.errors = importRowErrors(state.leadModule.importDialog.rows || []); }
      return;
    }
    const input = event.target.closest('[data-leads-search]'); if (input) { state.leadFilters.q = input.value; render(); const next = document.querySelector('[data-leads-search]'); if (next) { next.focus(); next.setSelectionRange(next.value.length, next.value.length); } }
  });
  document.addEventListener('change', event => {
    const input = event.target;
    if (input.matches('[data-lead-customer-schedule]')) {
      const form = input.closest('form');
      const fields = form.querySelector('[data-lead-customer-followup]');
      fields.hidden = !input.checked; fields.disabled = !input.checked;
      form.querySelector('button[type="submit"]').textContent = input.checked ? 'Create customer & follow-up' : 'Create customer';
      return;
    }
    if (input.matches('[data-import-duplicates]') && state.leadModule.importDialog) { state.leadModule.importDialog.duplicateMode = input.value === 'allow' ? 'allow' : 'skip'; return; }
    if (input.matches('[data-interest-select]')) { syncOtherInterestField(input.closest('form')); return; }
    if (input.matches('[data-leads-source]')) state.leadFilters.source = input.value;
    if (input.matches('[data-leads-property]')) state.leadFilters.propertyType = input.value;
    if (input.matches('[data-leads-priority]')) state.leadFilters.priority = input.value;
    if (input.matches('[data-leads-agent]')) { state.leadFilters.agentId = input.value; refreshLeads(); return; }
    if (input.matches('[data-leads-source], [data-leads-property], [data-leads-priority]')) render();
  });
  document.addEventListener('submit', event => {
    const form = event.target;
    if (form.matches('#lead-module-customer-form')) { event.preventDefault(); return submitCreateCustomer(form); }
    if (form.matches('#lead-create-form')) { event.preventDefault(); submitCreateLead(form, new FormData(form).get('save_mode') || 'close'); }
    if (form.matches('#lead-module-status-form')) { event.preventDefault(); const data = Object.fromEntries(new FormData(form).entries()); apiFetch(`/api/leads/${currentLead().id}/status`, { method: 'PATCH', body: JSON.stringify(data) }).then(() => { showToast('Lead status updated'); return openLead(currentLead().id); }).then(refreshLeads).catch(error => showToast(error.message)); }
    if (form.matches('#lead-module-note-form')) { event.preventDefault(); const data=Object.fromEntries(new FormData(form).entries()); apiFetch(`/api/leads/${currentLead().id}/notes`, { method: 'POST', body: JSON.stringify(data) }).then(() => { showToast('Note added'); return openLead(currentLead().id); }).then(refreshLeads).catch(error => showToast(error.message)); }
     if (form.matches('#lead-module-edit-form')) { event.preventDefault(); const id = currentLead()?.id; if (!id) return; const formData = new FormData(form); const raw = Object.fromEntries(formData.entries()); raw.tags = normalizeTags(formData.getAll('tags')); if (raw.interested_in === 'Other') { raw.interested_in = String(raw.interested_in_other || '').trim(); if (!raw.interested_in) { showToast('Tell us what they want before saving'); return; } } delete raw.interested_in_other; const payload = { ...raw, tags: normalizeTags(raw.tags) }; apiFetch(`/api/leads/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }).then(() => { state.leadModule.editing = false; showToast('Lead details updated'); return openLead(id); }).then(refreshLeads).catch(error => showToast(`Unable to update lead: ${error.message}`)); }
    if (form.matches('#lead-module-assign-form')) { event.preventDefault(); const id = currentLead().id; const assigned_agent_id = new FormData(form).get('assigned_agent_id'); if (!assigned_agent_id) return showToast('Choose an active advisor first'); apiFetch(`/api/leads/${id}/assign`, { method: 'PATCH', body: JSON.stringify({ assigned_agent_id }) }).then(() => { showToast('Lead assignment updated'); return openLead(id); }).then(refreshLeads).catch(error => showToast(error.message)); }
  });

  window.renderLeads = renderLeadsModule;
  window.renderAddLead = renderAddLeadModule;
  window.renderLeadDrawer = renderLeadDrawerModule;
  window.loadLeadAgents = loadLeadAgents;
  if (state.authUser && (state.screen === 'add-lead' || state.screen === 'leads')) loadLeadAgents();
})();
