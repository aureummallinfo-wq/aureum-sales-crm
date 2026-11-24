(function () {
  'use strict';

  const esc = value => window.AureumUI?.escape ? window.AureumUI.escape(String(value ?? '')) : String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const safeDate = value => value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
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
    return `<div class="table-wrap meta-table-scroll"><table class="meta-intake-table"><thead><tr><th>Lead ID</th><th>Received</th><th>Lead / Contact</th><th>Source</th><th>Interested property</th><th>Purpose</th><th>Budget</th><th>Payment</th><th>Attribution</th><th>Status</th><th>Action</th></tr></thead><tbody>${items.map(item => {
      const id = item.id;
      const crmStatus = item.crm_lead_id ? metaStatus('Sent to CRM') : '<span class="badge badge-neutral">Not sent</span>';
      return `<tr data-meta-staging-open="${esc(id)}">
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
    const data = state.metaInbox; const items = data.items || [];
    const pending = items.filter(item => item.review_status === 'Pending review').length;
    const sent = items.filter(item => item.review_status === 'Sent to CRM').length;
    const ready = items.filter(item => ['Ready for Meta', 'Queued'].includes(item.feedback_status)).length;
    const missing = items.filter(item => !item.phone || !item.full_name).length;
    const metricValue = value => data.loading ? '<span class="kpi-loading" aria-label="Loading">…</span>' : value;
    const body = data.loading ? '<div class="empty-state">Loading Meta intake records.</div>' : data.error ? `<div class="empty-state"><strong>Meta intake could not be loaded</strong><br/>${esc(data.error)}<br/><button class="btn btn-secondary btn-sm" data-meta-intake-reload>Retry</button></div>` : metaTable(items);
    return pageHeader('Pre-CRM review queue', 'Meta Intake', 'Review Meta leads, add the business outcome, and send approved records into the CRM.', '<button class="btn btn-secondary" data-meta-intake-reload>Refresh</button>') + `<section class="grid grid-4 meta-intake-kpis">${kpi('Pending review', metricValue(pending), 'Needs a decision', 'down')}${kpi('Sent to CRM', metricValue(sent), 'Approved records')}${kpi('Ready for Meta', metricValue(ready), 'Outcome captured')}${kpi('Needs correction', metricValue(missing), 'Missing contact data', 'down')}</section><section class="card table-card meta-intake-card" style="margin-top:18px"><div class="section-title"><div><div class="eyebrow">Meta lead staging</div><h3>Review before CRM</h3><p>Raw Meta data is retained for reconciliation. Internal notes stay in the CRM; Meta receives only approved outcome signals through the later Conversions API step.</p></div><span class="badge badge-neutral">${data.loading ? 'Loading' : `${items.length} visible`}</span></div>${metaFilters()}${body}</section>`;
  }

  function detailValue(label, value) { return `<div class="detail-field"><div class="detail-label">${esc(label)}</div><div class="detail-value">${display(value)}</div></div>`; }
  function detailGrid(fields) { return `<div class="meta-detail-grid">${fields.join('')}</div>`; }

  function renderMetaStagingDrawer() {
    const item = state.metaInbox.selected;
    if (!item) return `<div class="drawer-backdrop" data-close-drawer></div><aside class="drawer meta-intake-drawer"><div class="drawer-header"><div><div class="eyebrow">Meta intake</div><h2>Loading lead…</h2></div><button class="drawer-close" data-close-drawer aria-label="Close details">${icons.close}</button></div><div class="empty-state">Loading the staged Meta lead.</div></aside>`;
    const p = item.raw_payload || {};
    const field = (...keys) => rawValue(item, ...keys);
    const feedback = item.feedback_status && item.feedback_status !== 'Not queued' ? metaStatus(item.feedback_status) : '<span class="badge badge-neutral">Not queued</span>';
    return `<div class="drawer-backdrop" data-close-drawer></div><aside class="drawer meta-intake-drawer" aria-label="Meta lead details">
      <div class="drawer-header"><div><div class="eyebrow">Meta lead review</div><h2>${display(item.full_name || 'Unnamed lead')}</h2><p class="page-subtitle">${metaStatus(item.review_status)} <span class="drawer-separator">·</span> ${esc(sourceLabel(item))}</p></div><button class="drawer-close" data-close-drawer aria-label="Close details">${icons.close}</button></div>
      <form id="meta-staging-review-form">
        <div class="drawer-section"><div class="drawer-section-heading"><h3>Lead & contact</h3><span class="source-badge source-meta">${esc(sourceLabel(item))}</span></div>${detailGrid([detailValue('Internal CRM ID', item.id), detailValue('Meta Lead ID', item.external_lead_id), detailValue('Full name', item.full_name), detailValue('Phone number', item.phone), detailValue('WhatsApp number', item.whatsapp_number), detailValue('Email', item.email), detailValue('City', item.city), detailValue('Country', field('country')), detailValue('Area / address', item.area), detailValue('Active contact', field('active_contact', 'any_active_contact')), detailValue('Consent', field('consent_status') || 'Not captured')])}</div>
        <div class="drawer-section"><div class="drawer-section-heading"><h3>Customer qualification</h3><span class="detail-hint">Conditional residential/commercial fields are preserved</span></div>${detailGrid([detailValue('Interested in', field('interested_in', 'interest_category', 'interest', 'what_are_you_interested_in?', 'what_are_you_interested_in?_')), detailValue('Property type', field('property_type', 'residential_property_type', 'commercial_property_type')), detailValue('Commercial property type', field('commercial_property_type')), detailValue('Residential budget', field('residential_budget', 'budget_residential')), detailValue('Commercial budget', field('commercial_budget', 'budget_commercial')), detailValue('Purpose of investment', field('purpose', 'residential_investment_purpose', 'purpose_of_investment')), detailValue('Commercial purpose', field('commercial_investment_purpose', 'purpose_commercial')), detailValue('Investment type', field('investment_type', 'select_your_investment_')), detailValue('Down payment', field('down_payment', 'how_much_down_payment_you_can_pay', 'how_much_down_payment_you_can_manage?')), detailValue('Preferred contact', field('preferred_contact_method', 'best_contact_method')), detailValue('Payment preference', field('payment_preference', 'payment_method')), detailValue('Purchase timeline', field('buying_timeline', 'purchase_timeline')), detailValue('Site visit interest', field('site_visit_interest'))])}</div>
        <div class="drawer-section"><div class="drawer-section-heading"><h3>Meta attribution</h3><span class="detail-hint">Names are shown first; IDs remain available in the details</span></div>${detailGrid([detailValue('Source', sourceLabel(item)), detailValue('Medium', field('source_medium') || (sourceLabel(item).includes('Lead Ads') ? 'Paid' : 'Organic')), detailValue('Campaign name', field('campaign_name')), detailValue('Campaign ID', field('campaign_id')), detailValue('Ad set name', field('adset_name')), detailValue('Ad set ID', field('adset_id')), detailValue('Ad name', field('ad_name')), detailValue('Ad ID', field('ad_id')), detailValue('Form name', field('form_name')), detailValue('Form ID', field('form_id')), detailValue('Page ID', field('page_id')), detailValue('Platform', field('platform') || 'Meta')])}</div>
        <div class="drawer-section"><div class="drawer-section-heading"><h3>CRM processing</h3><span>${feedback}</span></div>${detailGrid([detailValue('Review status', item.review_status), detailValue('CRM status', item.crm_lead_id ? 'Sent to CRM' : 'Not sent'), detailValue('CRM lead ID', item.crm_lead_id), detailValue('Ingested via', field('ingested_via') || 'n8n webhook'), detailValue('Reviewed by', item.reviewer_name), detailValue('Reviewed at', item.reviewed_at ? safeDate(item.reviewed_at) : '-'), detailValue('Received at', safeDate(item.submitted_at || item.created_at)), detailValue('Last updated', safeDate(item.updated_at))])}</div>
        <div class="drawer-section"><div class="drawer-section-heading"><h3>Review decision</h3><span class="detail-hint">Internal notes are never sent to Meta</span></div><div class="form-grid"><div class="form-field"><label>Review status</label><select name="review_status">${statusOptions.map(value => `<option ${item.review_status === value ? 'selected' : ''}>${value}</option>`).join('')}</select></div><div class="form-field"><label>Outcome for Meta</label><select name="outcome"><option value="">Choose outcome</option>${['New','Contacted','Qualified','Hot','Follow-up','Closed Won','Closed Lost','Not Interested'].map(value => `<option ${item.outcome === value ? 'selected' : ''}>${value}</option>`).join('')}</select></div><div class="form-field full"><label>Review notes</label><textarea name="review_notes" rows="4" placeholder="What did the team learn from this lead?">${esc(item.review_notes || '')}</textarea></div></div></div>
        <div class="drawer-section"><details class="meta-raw-details"><summary>View original Meta payload</summary><pre>${esc(JSON.stringify(p, null, 2))}</pre></details></div>
        <div class="drawer-section meta-intake-actions"><button class="btn btn-secondary" type="submit">Save review</button>${item.review_status !== 'Sent to CRM' ? `<button class="btn btn