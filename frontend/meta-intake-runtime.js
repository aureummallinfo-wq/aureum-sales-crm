(function () {
  'use strict';

  const esc = value => window.AureumUI?.escape ? window.AureumUI.escape(String(value ?? '')) : String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const safeDate = value => value ? (window.AureumPreferences?.formatDateTime ? window.AureumPreferences.formatDateTime(value) : new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', hour12: true })) : '-';
  const display = value => value === null || value === undefined || String(value).trim() === '' ? '-' : esc(value);
  const rawValue = (item, ...keys) => {
    const raw = item?.raw_payload && typeof item.raw_payload === 'object' ? item.raw_payload : {};
    for (const key of keys) {
      const value = item?.[key] ?? raw?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    const normalizeKey = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const normalizedKeys = new Set(keys.map(normalizeKey));
    const match = Object.entries(raw).find(([key, value]) => normalizedKeys.has(normalizeKey(key)) && value !== undefined && value !== null && String(value).trim() !== '');
    if (match) return match[1];
    return '';
  };
  const statusTone = value => ({ 'Pending review': 'warning', Reviewed: 'neutral', 'Sent to CRM': 'success', Rejected: 'danger', Failed: 'danger', Sent: 'success', 'Ready for Meta': 'warning' }[value] || 'neutral');
  const metaStatus = value => `<span class="badge badge-${statusTone(value)}">${esc(value || 'Pending review')}</span>`;
  const sourceLabel = item => {
    const source = String(rawValue(item, 'source_label', 'source', 'source_channel', 'platform') || 'Meta').toLowerCase();
    if (source.includes('messenger')) return 'Meta - Messenger';
    if (source.includes('instagram')) return 'Meta - Instagram';
    if (source.includes('website')) return 'Website - Form';
    if (source.includes('whatsapp')) return 'WhatsApp - Organic';
    return 'Meta - Lead Ads';
  };
  const interestLabel = item => rawValue(item, 'interested_in', 'interest_category', 'interest') || 'Not provided';
  const budgetLabel = item => rawValue(item, 'budget', 'residential_budget', 'commercial_budget') || 'Budget pending';
  const paymentLabel = item => rawValue(item, 'payment_preference', 'payment_method') || 'Not provided';
  const attributionLabel = item => {
    const campaign = rawValue(item, 'campaign_name', 'campaign_id');
    const campaignId = rawValue(item, 'campaign_id');
    const adset = rawValue(item, 'adset_name', 'adset_id');
    const adsetId = rawValue(item, 'adset_id');
    const form = rawValue(item, 'form_name', 'form_id');
    const formId = rawValue(item, 'form_id');
    return `<b>${display(campaign || 'Campaign not provided')}</b>${campaignId ? `<div class="person-meta">Campaign ID: ${display(campaignId)}</div>` : ''}<div class="person-meta">${display(adset || 'Ad set not provided')}${adsetId ? ` · ${display(adsetId)}` : ''}</div><div class="person-meta">${display(form || 'Form not provided')}${formId ? ` · ${display(formId)}` : ''}</div>`;
  };
  const statusOptions = ['Pending review', 'Reviewed', 'Sent to CRM', 'Rejected', 'Failed'];
  const sourceOptions = ['meta_lead_ads', 'meta_messenger', 'meta_instagram', 'website_form', 'website_chat', 'whatsapp', 'referral_partner', 'manual_entry', 'import', 'event_qr'];
  const sourceOptionLabel = value => ({ meta_lead_ads: 'Meta - Lead Ads', meta_messenger: 'Meta - Messenger', meta_instagram: 'Meta - Instagram', website_form: 'Website - Form', website_chat: 'Website - Chat', whatsapp: 'WhatsApp - Organic', referral_partner: 'Referral - Partner', manual_entry: 'Manual - Staff Entry', import: 'Import - CSV/Excel', event_qr: 'Event - QR Code' }[value] || value);
  const selectedMetaIds = () => new Set(Array.isArray(state.metaInbox.selectedIds) ? state.metaInbox.selectedIds.map(String) : []);
  const canBulkSend = item => Boolean(item && !item.crm_lead_id && item.review_status !== 'Sent to CRM');

  function metaFilters() {
    const filters = state.metaInbox.filters || {};
    return `<div class="filter-bar meta-intake-filters">
      <div class="search-box meta-search">${icons.search}<input data-meta-intake-search value="${esc(filters.q || '')}" placeholder="Search name, phone, WhatsApp, email, Meta ID, campaign, ad set, or form" /></div>
      <select class="select" data-meta-intake-source aria-label="Meta intake source"><option value="">All sources</option>${sourceOptions.map(item => `<option value="${item}" ${filters.source === item ? 'selected' : ''}>${sourceOptionLabel(item)}</option>`).join('')}</select>
      <select class="select" data-meta-intake-status aria-label="Meta intake status"><option value="">All review statuses</option>${statusOptions.map(item => `<option value="${item}" ${filters.status === item ? 'selected' : ''}>${item}</option>`).join('')}</select>
      <select class="select" data-meta-intake-interest aria-label="Interested property"><option value="">All interests</option>${['Studio', '1-Bed Apartment', '2-Bed Apartment', 'Commercial Shop', 'Corporate Office', 'Food Court Space'].map(item => `<option value="${esc(item)}" ${filters.interest === item ? 'selected' : ''}>${esc(item)}</option>`).join('')}</select>
      <input class="select" data-meta-intake-from type="date" value="${esc(filters.dateFrom || '')}" aria-label="Meta intake date from" />
      <input class="select" data-meta-intake-to type="date" value="${esc(filters.dateTo || '')}" aria-label="Meta intake date to" />
      <button class="btn btn-secondary btn-sm" data-meta-intake-clear>Clear</button>
    </div>`;
  }

  function metaTable(items) {
    if (!items.length) return '<div class="empty-state"><strong>No Meta leads are waiting here</strong><br/>Once the Meta connection is switched to Staging inbox, new leads will appear here before CRM delivery.</div>';
    const selected = selectedMetaIds();
    const selectableItems = items.filter(canBulkSend);
    const allSelectableSelected = selectableItems.length > 0 && selectableItems.every(item => selected.has(String(item.id)));
    return `<div class="table-wrap meta-table-scroll"><table class="meta-intake-table"><thead><tr><th class="meta-select-column"><input type="checkbox" data-meta-intake-select-all aria-label="Select all unsent Meta leads" ${allSelectableSelected ? 'checked' : ''} ${selectableItems.length ? '' : 'disabled'} /></th><th>Lead ID</th><th>Received</th><th>Lead / Contact</th><th>Source</th><th>Interested property</th><th>Purpose</th><th>Budget</th><th>Payment</th><th>Attribution</th><th>Status</th><th>Action</th></tr></thead><tbody>${items.map(item => {
      const id = item.id;
      const crmStatus = item.crm_lead_id ? metaStatus('Sent to CRM') : '<span class="badge badge-neutral">Not sent</span>';
      const selectable = canBulkSend(item);
      return `<tr data-meta-staging-open="${esc(id)}">
        <td class="meta-select-column"><input type="checkbox" data-meta-intake-select="${esc(id)}" aria-label="Select ${esc(item.full_name || 'Meta lead')}" ${selected.has(String(id)) ? 'checked' : ''} ${selectable ? '' : 'disabled'} /></td>
        <td><span class="meta-id" title="${esc(item.external_lead_id || id)}">${esc(String(item.external_lead_id || id).slice(-10))}</span></td>
        <td>${safeDate(item.submitted_at || item.created_at)}</td>
        <td><b>${display(item.full_name || 'Unnamed lead')}</b><div class="person-meta">${display(item.phone || item.whatsapp_number || 'Phone missing')}</div><div class="person-meta">${display(item.email || 'Email missing')}</div></td>
        <td><span class="source-badge source-meta">${esc(sourceLabel(item))}</span></td>
        <td><b>${display(interestLabel(item))}</b><div class="person-meta">${display(rawValue(item, 'property_type', 'residential_property_type', 'commercial_property_type'))}</div></td>
        <td>${display(rawValue(item, 'purpose', 'residential_investment_purpose', 'commercial_investment_purpose'))}</td>
        <td>${display(budgetLabel(item))}</td>
        <td>${display(paymentLabel(item))}</td>
        <td>${attributionLabel(item)}</td>
        <td>${metaStatus(item.review_status)}<div class="meta-table-substatus">${crmStatus}</div></td>
        <td><button class="table-action" data-meta-staging-open-button="${esc(id)}">View details</button></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
  }

  function renderMetaIntake() {
    const data = state.metaInbox; const items = data.items || []; const summary = data.summary || {};
    const pending = summary.pendingReview ?? items.filter(item => item.review_status === 'Pending review').length;
    const sent = summary.sentToCrm ?? items.filter(item => item.review_status === 'Sent to CRM').length;
    const ready = summary.readyForMeta ?? items.filter(item => ['Ready for Meta', 'Queued'].includes(item.feedback_status)).length;
    const pager = !data.loading && !data.error && window.AureumPagination?.render(data.meta || data.pagination, 'meta-intake', { busy: Boolean(data.loading) }) || '';
    const body = data.loading ? '<div class="empty-state">Loading Meta intake records.</div>' : data.error ? `<div class="empty-state"><strong>Meta intake could not be loaded</strong><br/>${esc(data.error)}<br/><button class="btn btn-secondary btn-sm" data-meta-intake-reload>Retry</button></div>` : `${metaTable(items)}${pager}`;
    const selectedCount = selectedMetaIds().size;
    const deleteSelected = state.role === 'SUPER_ADMIN' ? '<button class="btn btn-danger btn-sm" data-meta-bulk-delete>Delete selected</button>' : '';
    const bulkToolbar = selectedCount ? `<div class="meta-bulk-toolbar" role="status"><strong>${selectedCount} selected</strong><span>Only records not yet sent to the CRM are included.</span><button class="btn btn-gold btn-sm" data-meta-bulk-send>Approve &amp; send selected</button>${deleteSelected}<button class="btn btn-secondary btn-sm" data-meta-clear-selection>Clear selection</button></div>` : '';
    const metricValue = value => data.loading ? '<span class="kpi-loading" aria-label="Loading">…</span>' : value;
    return pageHeader('Pre-CRM review queue', 'Meta Intake', 'Review Meta leads, add the business outcome, and send approved records into the CRM.', '<button class="btn btn-secondary" data-meta-intake-reload>Refresh</button>') + `<section class="grid grid-3 meta-intake-kpis">${kpi('Pending review', metricValue(pending), 'Needs a decision', 'down')}${kpi('Sent to CRM', metricValue(sent), 'Approved records')}${kpi('Ready for Meta', metricValue(ready), 'Outcome captured')}</section><section class="card table-card meta-intake-card" style="margin-top:18px"><div class="section-title"><div><div class="eyebrow">Meta lead staging</div><h3>Review before CRM</h3><p>Raw Meta data is retained for reconciliation. Internal notes stay in the CRM; Meta receives only approved outcome signals through the later Conversions API step.</p></div><span class="badge badge-neutral">${data.loading ? 'Loading' : `${items.length} visible`}</span></div>${metaFilters()}${bulkToolbar}${body}</section>`;
  }

  function detailValue(label, value) { return `<div class="detail-field"><div class="detail-label">${esc(label)}</div><div class="detail-value">${display(value)}</div></div>`; }
  function detailGrid(fields) { return `<div class="meta-detail-grid">${fields.join('')}</div>`; }
  function editField(label, name, value, type = 'text') { return `<div class="form-field"><label for="meta-edit-${esc(name)}">${esc(label)}</label><input id="meta-edit-${esc(name)}" name="${esc(name)}" type="${esc(type)}" value="${esc(value ?? '')}" /></div>`; }
  function editGrid(fields) { return `<div class="form-grid meta-edit-grid">${fields.join('')}</div>`; }

  function renderMetaStagingDrawer() {
    const item = state.metaInbox.selected;
    if (!item) return `<div class="drawer-backdrop" data-close-drawer></div><aside class="drawer meta-intake-drawer"><div class="drawer-header"><div><div class="eyebrow">Meta intake</div><h2>Loading lead…</h2></div><button class="drawer-close" data-close-drawer aria-label="Close details">${icons.close}</button></div><div class="empty-state">Loading the staged Meta lead.</div></aside>`;
    const p = item.raw_payload || {};
    const field = (...keys) => rawValue(item, ...keys);
    const feedback = item.feedback_status && item.feedback_status !== 'Not queued' ? metaStatus(item.feedback_status) : '<span class="badge badge-neutral">Not queued</span>';
    return `<div class="drawer-backdrop" data-close-drawer></div><aside class="drawer meta-intake-drawer" aria-label="Meta lead details">
      <div class="drawer-header"><div><div class="eyebrow">Meta lead review</div><h2>${display(item.full_name || 'Unnamed lead')}</h2><p class="page-subtitle">${metaStatus(item.review_status)} <span class="drawer-separator">·</span> ${esc(sourceLabel(item))}</p></div><button class="drawer-close" data-close-drawer aria-label="Close details">${icons.close}</button></div>
      <form id="meta-staging-review-form">
        <div class="drawer-section"><div class="drawer-section-heading"><h3>Lead & contact</h3><span class="source-badge source-meta">${esc(sourceLabel(item))}</span></div>${detailGrid([detailValue('Internal CRM ID', item.id), detailValue('Meta Lead ID', item.external_lead_id)])}${editGrid([editField('Full name', 'full_name', item.full_name), editField('Phone number', 'phone', item.phone), editField('WhatsApp number', 'whatsapp_number', item.whatsapp_number), editField('Email', 'email', item.email, 'email'), editField('City', 'city', item.city), editField('Country', 'country', field('country')), editField('Area / address', 'area', item.area), editField('Active contact', 'active_contact', field('active_contact', 'any_active_contact')), editField('Consent', 'consent_status', field('consent_status') || 'Not captured')])}</div>
        <div class="drawer-section"><div class="drawer-section-heading"><h3>Customer qualification</h3><span class="detail-hint">Correct missing or incorrectly mapped Meta answers before sending</span></div>${editGrid([editField('Interested in', 'interested_in', field('interested_in', 'interest_category', 'interest', 'what_are_you_interested_in?', 'what_are_you_interested_in?_')), editField('Property type', 'property_type', field('property_type', 'residential_property_type', 'commercial_property_type')), editField('Commercial property type', 'commercial_property_type', field('commercial_property_type')), editField('Residential budget', 'residential_budget', field('residential_budget', 'budget_residential')), editField('Commercial budget', 'commercial_budget', field('commercial_budget', 'budget_commercial')), editField('Purpose of investment', 'purpose', field('purpose', 'residential_investment_purpose', 'purpose_of_investment')), editField('Commercial purpose', 'commercial_investment_purpose', field('commercial_investment_purpose', 'purpose_commercial')), editField('Investment type', 'investment_type', field('investment_type', 'select_your_investment_')), editField('Down payment', 'down_payment', field('down_payment', 'how_much_down_payment_you_can_pay', 'how_much_down_payment_you_can_manage?')), editField('Preferred contact', 'preferred_contact_method', field('preferred_contact_method', 'best_contact_method')), editField('Payment preference', 'payment_preference', field('payment_preference', 'payment_method')), editField('Purchase timeline', 'buying_timeline', field('buying_timeline', 'purchase_timeline')), editField('Site visit interest', 'site_visit_interest', field('site_visit_interest'))])}</div>
        <div class="drawer-section"><div class="drawer-section-heading"><h3>Meta attribution</h3><span class="detail-hint">Correct attribution when Zapier or Meta sends incomplete labels</span></div>${editGrid([editField('Source medium', 'source_medium', field('source_medium') || (sourceLabel(item).includes('Lead Ads') ? 'Paid' : 'Organic')), editField('Campaign name', 'campaign_name', field('campaign_name')), editField('Campaign ID', 'campaign_id', field('campaign_id')), editField('Ad set name', 'adset_name', field('adset_name')), editField('Ad set ID', 'adset_id', field('adset_id')), editField('Ad name', 'ad_name', field('ad_name')), editField('Ad ID', 'ad_id', field('ad_id')), editField('Form name', 'form_name', field('form_name')), editField('Form ID', 'form_id', field('form_id')), editField('Page ID', 'page_id', field('page_id')), editField('Platform', 'platform', field('platform') || 'Meta')])}</div>
        <div class="drawer-section"><div class="drawer-section-heading"><h3>CRM processing</h3><span>${feedback}</span></div>${detailGrid([detailValue('Review status', item.review_status), detailValue('CRM status', item.crm_lead_id ? 'Sent to CRM' : 'Not sent'), detailValue('CRM lead ID', item.crm_lead_id), detailValue('Ingested via', field('ingested_via') || 'n8n webhook'), detailValue('Reviewed by', item.reviewer_name), detailValue('Reviewed at', item.reviewed_at ? safeDate(item.reviewed_at) : '-'), detailValue('Received at', safeDate(item.submitted_at || item.created_at)), detailValue('Last updated', safeDate(item.updated_at))])}</div>
        <div class="drawer-section"><div class="drawer-section-heading"><h3>Review decision</h3><span class="detail-hint">Internal notes are never sent to Meta</span></div><div class="form-grid"><div class="form-field"><label>Review status</label><select name="review_status">${statusOptions.map(value => `<option ${item.review_status === value ? 'selected' : ''}>${value}</option>`).join('')}</select></div><div class="form-field"><label>Outcome for Meta</label><select name="outcome"><option value="">Choose outcome</option>${['New','Contacted','Qualified','Hot','Follow-up','Closed Won','Closed Lost','Not Interested'].map(value => `<option ${item.outcome === value ? 'selected' : ''}>${value}</option>`).join('')}</select></div><div class="form-field full"><label>Review notes</label><textarea name="review_notes" rows="4" placeholder="What did the team learn from this lead?">${esc(item.review_notes || '')}</textarea></div></div></div>
        <div class="drawer-section"><details class="meta-raw-details"><summary>View original Meta payload</summary><pre>${esc(JSON.stringify(p, null, 2))}</pre></details></div>
        <div class="drawer-section meta-intake-actions"><button class="btn btn-secondary" type="submit">Save review</button>${item.review_status !== 'Sent to CRM' ? `<button class="btn btn-gold" type="button" data-meta-send-crm="${esc(item.id)}">Approve & send to CRM</button>` : '<span class="badge badge-success">CRM record created</span>'}</div>
      </form>
    </aside>`;
  }

  async function loadMetaIntake(force = false) {
    if (!state.authUser || state.screen !== 'meta-inbox' || state.metaInbox.loading) return;
    state.metaInbox.startupLoadTriggered = true;
    state.metaInbox.loading = true; state.metaInbox.error = ''; render();
    try { const filters = state.metaInbox.filters || {}; const pagination = state.metaInbox.pagination = { page: 1, pageSize: 25, ...(state.metaInbox.pagination || {}) }; const query = new URLSearchParams(Object.fromEntries(Object.entries({ ...filters, page: pagination.page, pageSize: pagination.pageSize }).filter(([, value]) => value))); const result = await apiFetch(`/api/meta/staging?${query.toString()}`, { cacheTtl: 30 * 1000, ...(force ? { force: true } : {}) }); state.metaInbox.items = result.data || []; state.metaInbox.summary = result.summary || {}; state.metaInbox.meta = result.meta || { page: pagination.page, pageSize: pagination.pageSize, total: state.metaInbox.items.length, totalPages: Math.ceil(state.metaInbox.items.length / pagination.pageSize) }; const selectableIds = new Set(state.metaInbox.items.filter(canBulkSend).map(item => String(item.id))); state.metaInbox.selectedIds = (state.metaInbox.selectedIds || []).filter(id => selectableIds.has(String(id))); } catch (error) { state.metaInbox.error = error.message; } finally { state.metaInbox.loading = false; render(); }
  }

  async function openMetaStaging(id) {
    state.drawer = 'meta-staging'; state.metaInbox.selected = null; render();
    try { const result = await apiFetch(`/api/meta/staging/${encodeURIComponent(id)}`, { force: true }); state.metaInbox.selected = result.data; render(); } catch (error) { state.metaInbox.error = error.message; state.drawer = null; render(); }
  }

  async function bulkSendMetaLeads() {
    const ids = [...selectedMetaIds()].filter(id => (state.metaInbox.items || []).some(item => String(item.id) === String(id) && canBulkSend(item)));
    if (!ids.length) return;
    if (!window.confirm(`Approve and send ${ids.length} selected lead${ids.length === 1 ? '' : 's'} to the CRM?`)) return;
    const button = document.querySelector('[data-meta-bulk-send]');
    if (button) { button.disabled = true; button.textContent = 'Sending…'; }
    let sent = 0; const failed = [];
    for (const id of ids) {
      try { await apiFetch(`/api/meta/staging/${encodeURIComponent(id)}/send-to-crm`, { method: 'POST', body: '{}' }); sent += 1; }
      catch (error) { failed.push(error.message || 'Unable to send'); }
    }
    state.metaInbox.selectedIds = [];
    await loadMetaIntake();
    showToast(failed.length ? `${sent} sent; ${failed.length} need review.` : `${sent} lead${sent === 1 ? '' : 's'} sent to the CRM.`);
  }

  async function bulkDeleteMetaLeads() {
    const ids = [...selectedMetaIds()].filter(id => (state.metaInbox.items || []).some(item => String(item.id) === String(id) && canBulkSend(item)));
    if (!ids.length || !window.confirm(`Delete ${ids.length} selected Meta lead${ids.length === 1 ? '' : 's'} from Meta Intake? This cannot be undone.`)) return;
    const button = document.querySelector('[data-meta-bulk-delete]');
    if (button) { button.disabled = true; button.textContent = 'Deleting…'; }
    try {
      const result = await apiFetch('/api/meta/staging/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) });
      state.metaInbox.selectedIds = [];
      await loadMetaIntake();
      showToast(`${result.meta?.deleted || 0} Meta lead${result.meta?.deleted === 1 ? '' : 's'} deleted.`);
    } catch (error) { showToast(error.message || 'Unable to delete the selected Meta leads.'); }
    finally { render(); }
  }

  function bindMetaIntakeEvents() {
    document.querySelectorAll('[data-meta-staging-open], [data-meta-staging-open-button]').forEach(element => element.addEventListener('click', event => { event.stopPropagation(); openMetaStaging(element.dataset.metaStagingOpen || element.dataset.metaStagingOpenButton); }));
    document.querySelectorAll('[data-meta-intake-select]').forEach(element => element.addEventListener('click', event => event.stopPropagation()));
    document.querySelectorAll('[data-meta-intake-select]').forEach(element => element.addEventListener('change', event => { const id = String(event.target.dataset.metaIntakeSelect); const selected = selectedMetaIds(); event.target.checked ? selected.add(id) : selected.delete(id); state.metaInbox.selectedIds = [...selected]; render(); }));
    const selectAll = document.querySelector('[data-meta-intake-select-all]'); if (selectAll) selectAll.addEventListener('change', event => { const selected = selectedMetaIds(); (state.metaInbox.items || []).filter(canBulkSend).forEach(item => event.target.checked ? selected.add(String(item.id)) : selected.delete(String(item.id))); state.metaInbox.selectedIds = [...selected]; render(); });
    document.querySelectorAll('[data-meta-bulk-send]').forEach(element => element.addEventListener('click', bulkSendMetaLeads));
    document.querySelectorAll('[data-meta-bulk-delete]').forEach(element => element.addEventListener('click', bulkDeleteMetaLeads));
    document.querySelectorAll('[data-meta-clear-selection]').forEach(element => element.addEventListener('click', () => { state.metaInbox.selectedIds = []; render(); }));
    document.querySelectorAll('[data-meta-intake-reload]').forEach(element => element.addEventListener('click', () => loadMetaIntake(true)));
    document.querySelectorAll('[data-meta-intake-clear]').forEach(element => element.addEventListener('click', () => { state.metaInbox.filters = { q: '', status: '', source: '', interest: '', dateFrom: '', dateTo: '' }; state.metaInbox.pagination.page = 1; loadMetaIntake(); }));
    const search = document.querySelector('[data-meta-intake-search]'); if (search) search.addEventListener('input', event => { const snapshot = window.AureumSearch?.capture?.(event.target); state.metaInbox.filters.q = event.target.value; state.metaInbox.pagination.page = 1; render(); window.AureumSearch?.restore?.('[data-meta-intake-search]', snapshot); window.clearTimeout(state.metaInbox.searchTimer); state.metaInbox.searchTimer = window.setTimeout(() => loadMetaIntake(), 300); });
    const bindFilter = (selector, key) => { const element = document.querySelector(selector); if (element) element.addEventListener('change', event => { state.metaInbox.filters[key] = event.target.value; state.metaInbox.pagination.page = 1; loadMetaIntake(); }); };
    bindFilter('[data-meta-intake-source]', 'source'); bindFilter('[data-meta-intake-status]', 'status'); bindFilter('[data-meta-intake-interest]', 'interest'); bindFilter('[data-meta-intake-from]', 'dateFrom'); bindFilter('[data-meta-intake-to]', 'dateTo');
    const form = document.querySelector('#meta-staging-review-form'); if (form) form.addEventListener('submit', async event => { event.preventDefault(); try { const data = Object.fromEntries(new FormData(form).entries()); if (data.outcome) data.feedback_status = 'Ready for Meta'; const result = await apiFetch(`/api/meta/staging/${encodeURIComponent(state.metaInbox.selected.id)}`, { method: 'PATCH', body: JSON.stringify(data) }); state.metaInbox.selected = result.data; showToast('Meta intake review saved'); await loadMetaIntake(); } catch (error) { showToast(error.message); } });
    document.querySelectorAll('[data-meta-send-crm]').forEach(button => button.addEventListener('click', async () => { if (!window.confirm('Approve this reviewed Meta lead and send it to the CRM?')) return; try { const result = await apiFetch(`/api/meta/staging/${encodeURIComponent(button.dataset.metaSendCrm)}/send-to-crm`, { method: 'POST', body: '{}' }); state.metaInbox.selected = result.data; showToast('Lead sent to CRM'); await loadMetaIntake(); } catch (error) { showToast(error.message); } }));
  }

  window.renderMetaIntake = renderMetaIntake;
  window.renderMetaStagingDrawer = renderMetaStagingDrawer;
  window.loadMetaIntake = loadMetaIntake;
  const previousRenderDrawer = renderDrawer;
  renderDrawer = function renderMetaAwareDrawer() { if (state.drawer === 'meta-staging') return renderMetaStagingDrawer(); return previousRenderDrawer(); };
  const previousBind = bind;
  bind = function bindWithMetaIntake() { previousBind(); bindMetaIntakeEvents(); };
  if (window.AureumPagination && !window.__aureumMetaPagerBound) {
    window.__aureumMetaPagerBound = true;
    window.AureumPagination.attach(document, 'meta-intake', () => state.metaInbox.meta || state.metaInbox.pagination, ({ page, pageSize }) => {
      state.metaInbox.pagination = { page, pageSize }; state.metaInbox.selectedIds = []; loadMetaIntake();
    });
  }
  window.setTimeout(() => { if (state.authUser && state.ready && state.screen === 'meta-inbox' && !state.metaInbox.startupLoadTriggered) { state.metaInbox.startupLoadTriggered = true; loadMetaIntake(); } }, 1000);
  if (state.authUser && state.ready && state.screen === 'meta-inbox') { render(); loadMetaIntake(); }
})();
