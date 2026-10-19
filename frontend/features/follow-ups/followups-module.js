(function initializeAureumFollowUpsModule() {
  const constants = window.AureumFollowUpConstants || {};
  const dateUtils = window.AureumFollowUpDateUtils;
  const metrics = window.AureumFollowUpMetrics;
  const esc = value => window.AureumUI?.escape ? window.AureumUI.escape(String(value ?? '')) : String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const role = () => state.role || '';
  const currentDate = () => dateUtils.todayInTimezone();
  const value = (item, ...keys) => { for (const key of keys) if (item?.[key] !== undefined && item?.[key] !== null && item[key] !== '') return item[key]; return '—'; };
  const status = item => dateUtils.getComputedFollowUpStatus(item);
  const allowedTags = () => window.AureumCRMStatusTags?.values || window.AureumCustomerConstants?.statuses || [];
  const canonicalTag = tag => { const choices = allowedTags(); const text = String(tag || '').trim(); const normalized = window.AureumCRMStatusTags?.normalize ? window.AureumCRMStatusTags.normalize(text, '') : text; return choices.includes(normalized) ? normalized : ''; };
  const followupTags = item => [...new Set((item.followup_tags || (item.followup_tag ? [item.followup_tag] : [])).map(canonicalTag).filter(Boolean))];
  const businessTags = item => { const selected = followupTags(item); const fallback = canonicalTag(value(item, 'lead_status')); return (selected.length ? selected : fallback ? [fallback] : []).map(tag => badge(tag)).join(' '); };
  const customerTagChips = item => followupTags(item).map(tag => `<span class="customer-tag">${esc(tag)}</span>`).join('');
  const statusBadge = item => status(item) === 'Contacted' ? '<span class="badge followup-contacted-badge">Contacted</span>' : badge(status(item));
  const stateForModule = () => { state.followupModule = state.followupModule || { date: 'all', customStart: '', customEnd: '', selectedDate: '', status: '', search: '', agentId: '', type: '', leadStatus: '', priority: '', calendarMonth: currentDate().slice(0, 7), tab: 'overview', form: '' }; return state.followupModule; };
  const items = () => (state.followups?.items || []).map(item => ({ ...item, status: status(item), customer: value(item, 'customer', 'customer_name'), phone: value(item, 'phone', 'customer_phone'), agent: value(item, 'agent', 'assigned_agent'), type: value(item, 'type', 'follow_up_type') }));
  const select = (name, options, selected, label, required = false) => `<select name="${name}" ${required ? 'required' : ''}>${label ? `<option value="">${esc(label)}</option>` : ''}${options.map(option => { const val = Array.isArray(option) ? option[0] : option; const text = Array.isArray(option) ? option[1] : option; return `<option value="${esc(val)}" ${String(val) === String(selected || '') ? 'selected' : ''}>${esc(text)}</option>`; }).join('')}</select>`;
  const summaryCard = (label, amount, detail, tone = '') => `<div class="card followup-summary-card"><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${esc(amount)}</div><div class="followup-summary-detail ${tone ? `is-${tone}` : ''}">${esc(detail)}</div></div>`;
  const metricCard = (label, amount) => `<div class="followup-metric"><span>${esc(label)}</span><strong>${esc(amount)}</strong></div>`;

  // Calendar values are dates in Pakistan, not instants to convert to UTC.
  function addCalendarDays(date, days) {
    const calendarDate = new Date(`${date}T00:00:00Z`);
    calendarDate.setUTCDate(calendarDate.getUTCDate() + days);
    return calendarDate.toISOString().slice(0, 10);
  }

  function changeCalendarMonth(direction) {
    const moduleState = stateForModule();
    if (direction === 'today') {
      moduleState.calendarMonth = currentDate().slice(0, 7);
    } else {
      const [year, month] = moduleState.calendarMonth.split('-').map(Number);
      moduleState.calendarMonth = new Date(Date.UTC(year, month - 1 + (direction === 'next' ? 1 : -1), 1)).toISOString().slice(0, 7);
    }
    render();
  }

  function followupDateMatches(item, filter, moduleState) {
    const date = item.due_date; const today = currentDate();
    if (filter === 'all') return true;
    if (filter === 'overdue') return status(item) === 'Overdue';
    if (filter === 'custom') return (!moduleState.customStart || date >= moduleState.customStart) && (!moduleState.customEnd || date <= moduleState.customEnd);
    if (filter === 'today') return date === today;
    if (filter === 'tomorrow') return date === addCalendarDays(today, 1);
    if (filter === 'week') return date >= today && date < addCalendarDays(today, 7);
    if (filter === 'month') return date.slice(0, 7) === today.slice(0, 7);
    return true;
  }

  function filteredItems() {
    const moduleState = stateForModule(); const search = moduleState.search.trim().toLowerCase();
    return items().filter(item => (!moduleState.status || status(item) === moduleState.status) && followupDateMatches(item, moduleState.date, moduleState) && (!moduleState.selectedDate || item.due_date === moduleState.selectedDate) && (!moduleState.agentId || item.assigned_agent_id === moduleState.agentId) && (!moduleState.type || item.type === moduleState.type) && (!moduleState.leadStatus || item.lead_status === moduleState.leadStatus) && (!moduleState.priority || item.priority === moduleState.priority) && (!search || [item.customer, item.phone, item.agent, item.type, item.notes].some(part => String(part || '').toLowerCase().includes(search))));
  }

  function actionMenu(item) {
    return `<details class="followup-action-menu"><summary class="table-action" aria-label="Actions for ${esc(item.customer)}">Actions <span aria-hidden="true">⌄</span></summary><div class="followup-action-options"><button type="button" data-followup-module-action="reschedule" data-followup-id="${esc(item.id)}">Reschedule</button><button type="button" data-followup-module-action="note" data-followup-id="${esc(item.id)}">Add note</button></div></details>`;
  }

  function table(itemsToRender) {
    if (!itemsToRender.length) return '<div class="empty-state"><strong>No follow-ups match this view.</strong><br/>Clear a filter or schedule the next contact.</div>';
    return `<div class="table-wrap followup-table-wrap"><table><thead><tr><th>Customer</th><th>Phone / WhatsApp</th><th>Type</th><th>Assigned agent</th><th>Status tags</th><th>Due date</th><th>Due time</th><th>Priority</th><th>Status</th><th>Last activity</th><th>Actions</th></tr></thead><tbody>${itemsToRender.map(item => `<tr data-followup-module-open="${esc(item.id)}" tabindex="0" aria-label="Schedule follow-up for ${esc(item.customer)}">
      <td><button class="followup-customer-button" data-followup-module-open="${esc(item.id)}"><b>${esc(item.customer)}</b><span>${esc(item.notes || 'No note added')}</span></button>${customerTagChips(item)}</td>
      <td>${esc(item.phone)}</td><td>${esc(item.type)}</td><td>${esc(item.agent)}</td><td>${businessTags(item)}</td>
      <td>${esc(item.due_date)}</td><td>${esc(item.due_time)}</td><td>${badge(value(item, 'priority'))}</td><td>${statusBadge(item)}</td>
      <td>${window.AureumFollowUpNoteUI.activity(item, { dateTimeOnly: true })}</td><td>${actionMenu(item)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function calendar(itemsToRender) {
    const moduleState = stateForModule(); const month = moduleState.calendarMonth || currentDate().slice(0, 7); const [year, monthNumber] = month.split('-').map(Number); const days = metrics.getFollowUpCalendarDays(itemsToRender, month); const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay(); const blanks = Array.from({ length: firstDay }, () => '<span class="followup-calendar-empty"></span>').join('');
    return `<section class="card followup-calendar-card"><div class="followup-calendar-head"><div><div class="eyebrow">Schedule map</div><h3>${new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleString(undefined, { timeZone: 'UTC', month: 'long', year: 'numeric' })}</h3></div><div class="header-actions"><button class="table-action" data-followup-module-month="prev">←</button><button class="table-action" data-followup-module-month="today">Today</button><button class="table-action" data-followup-module-month="next">→</button></div></div><div class="followup-calendar-week">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => `<span>${day}</span>`).join('')}</div><div class="followup-calendar-grid">${blanks}${days.map(day => `<button class="followup-calendar-day ${moduleState.selectedDate === day.date ? 'selected' : ''}" data-followup-module-calendar-date="${day.date}"><strong>${day.day}</strong><span class="followup-calendar-dots">${day.hasScheduled ? '<i class="scheduled"></i>' : ''}${day.hasCompleted ? '<i class="completed"></i>' : ''}${day.hasOverdue ? '<i class="overdue"></i>' : ''}</span></button>`).join('')}</div><div class="followup-calendar-legend"><span><i class="scheduled"></i> Scheduled</span><span><i class="completed"></i> Completed</span><span><i class="overdue"></i> Overdue</span></div></section>`;
  }

  function renderFollowupsModule() {
    const moduleState = stateForModule(); const all = items(); const visible = filteredItems(); const summary = metrics.getFollowUpSummaryStats(all); const performance = metrics.getFollowUpSuccessMetrics(all); const statusTabs = [['', 'All'], ...constants.statuses.map(item => [item, item])]; const agents = [...new Map(all.filter(item => item.assigned_agent_id).map(item => [item.assigned_agent_id, [item.assigned_agent_id, item.agent]])).values()]; const leadStatuses = [...new Set(all.map(item => item.lead_status).filter(Boolean))];
    if (state.followups?.loading && !state.followups.items?.length) return pageHeader('Daily rhythm', 'Follow-ups', 'Loading your permitted follow-up schedule…');
    const error = state.followups?.error ? `<div class="empty-state"><strong>Unable to load follow-ups</strong><br/>${esc(state.followups.error)}<br/><button class="btn btn-secondary btn-sm" data-followup-module-reload>Retry</button></div>` : '';
    const dateFilter = select('followup_date_filter', constants.dateFilters, moduleState.date, '', false).replace('name="followup_date_filter"', 'name="followup_date_filter" data-followup-module-date');
    return pageHeader('Daily rhythm', 'Follow-ups', role() === 'SALES_AGENT' ? 'Work the next conversation assigned to your advisor account.' : role() === 'SALES_MANAGER' ? 'Coordinate the team’s next conversations and recover overdue commitments.' : 'Protect every customer conversation with a clear owner, due time, priority, and outcome.', `<button class="btn btn-secondary" data-followup-module-calendar-toggle>${moduleState.calendarOpen ? 'Hide calendar' : 'Calendar view'}</button><button class="btn btn-secondary" data-followup-module-reload>Refresh</button><button class="btn btn-gold" data-followup-module-create>+ New Customer Follow-up</button>`) + `<section class="grid grid-4 followup-summary-grid">${summaryCard("Today's follow-ups", summary.today, 'Due in your timezone', summary.today ? 'warm' : '')}${summaryCard('Overdue', summary.overdue, summary.overdue ? 'Action required' : 'Clear', summary.overdue ? 'hot' : 'green')}${summaryCard('Upcoming', summary.upcoming, 'Pending future actions')}${summaryCard('Completed', summary.completed, 'Closed commitments', 'green')}${summaryCard('Missed', summary.missed, summary.missed ? 'Needs recovery' : 'None', summary.missed ? 'hot' : '')}${summaryCard('Total follow-ups', summary.total, role() === 'SALES_AGENT' ? 'Assigned to me' : 'Permitted scope')}</section><section class="card followup-performance-card"><div class="section-title"><div><h3>Follow-up performance</h3><p>Operational metrics for the current permitted scope.</p></div><span class="badge badge-neutral">Timezone: ${esc(constants.timezone)}</span></div><div class="followup-metrics-grid">${metricCard('Completion rate', `${performance.completionRate}%`)}${metricCard('Overdue rate', `${performance.overdueRate}%`)}${metricCard('Missed rate', `${performance.missedRate}%`)}${metricCard('Reschedule rate', `${performance.rescheduleRate}%`)}${metricCard('High-priority completion', `${performance.highPriorityCompletionRate}%`)}${metricCard('Same-day completion', `${performance.sameDayCompletionRate}%`)}</div></section>${moduleState.calendarOpen ? calendar(all) : ''}<section class="card table-card followup-registry-card"><div class="tabs followup-status-tabs">${statusTabs.map(([id, label]) => `<button class="tab ${moduleState.status === id ? 'active' : ''}" data-followup-module-status="${esc(id)}">${esc(label)}${id ? `<span>${all.filter(item => status(item) === id).length}</span>` : ''}</button>`).join('')}</div><div class="filter-bar followup-filter-bar"><div class="search-box">${icons.search}<input data-followup-module-search value="${esc(moduleState.search)}" placeholder="Search customer, phone, type, agent…" /></div>${dateFilter}${role() !== 'SALES_AGENT' ? select('followup_agent', [['', 'All agents'], ...agents], moduleState.agentId) .replace('name="followup_agent"', 'name="followup_agent" data-followup-module-agent') : ''}${select('followup_type', [['', 'All types'], ...constants.types], moduleState.type).replace('name="followup_type"', 'name="followup_type" data-followup-module-type')}${select('followup_priority', [['', 'All priorities'], ...constants.priorities], moduleState.priority).replace('name="followup_priority"', 'name="followup_priority" data-followup-module-priority')}${leadStatuses.length ? select('followup_lead_status', [['', 'All lead statuses'], ...leadStatuses], moduleState.leadStatus).replace('name="followup_lead_status"', 'name="followup_lead_status" data-followup-module-lead-status') : ''}<button class="btn btn-secondary btn-sm" data-followup-module-clear>Clear</button></div>${moduleState.date === 'custom' ? `<div class="followup-custom-date-bar"><label>Start date<input type="date" data-followup-module-custom-start value="${esc(moduleState.customStart)}" /></label><label>End date<input type="date" data-followup-module-custom-end value="${esc(moduleState.customEnd)}" /></label><button class="btn btn-gold btn-sm" data-followup-module-apply-custom>Apply range</button></div>` : ''}${state.followups?.loading && !all.length ? '<div class="empty-state">Refreshing the permitted follow-up schedule…</div>' : error && !all.length ? error : table(visible)}</section>`;
  }

  function scheduleFields(item = {}) {
    const future = dateUtils.toInstant(item.due_date, item.due_time) > Date.now();
    return window.AureumFollowUpNoteUI.scheduleFields({
      dueDate: future ? item.due_date : addCalendarDays(currentDate(), 1),
      dueTime: item.due_time || '10:00', minDate: currentDate(), tag: item.followup_tag || item.lead_status, selectedTags: item.followup_tags
    });
  }

  function renderFollowupDrawerModule() {
    if (state.drawer === 'create-followup') return renderCreateFollowupDrawerModule();
    const detail = state.followupDetail;
    if (!detail) return '<div class="drawer-backdrop" data-followup-module-close></div><aside class="drawer"><div class="drawer-header"><h2>Loading follow-up…</h2><button class="drawer-close" data-followup-module-close aria-label="Close">×</button></div></aside>';
    if (detail.error) return `<div class="drawer-backdrop" data-followup-module-close></div><aside class="drawer"><div class="drawer-header"><h2>Unable to open follow-up</h2><button class="drawer-close" data-followup-module-close aria-label="Close">×</button></div><div class="drawer-section">${esc(detail.error)}</div></aside>`;
    const item = detail.data;
    const note = stateForModule().form === 'note';
    const closed = ['Completed', 'Cancelled'].includes(item.lifecycle_status || item.status) || Boolean(item.completed_at);
    const activity = Array.isArray(detail.activity) ? detail.activity : [];
    const notes = Array.isArray(detail.notes) ? detail.notes : [];
    const noteEntries = notes.length ? notes : item.notes ? [{ note: item.notes, user_name: item.last_activity_by, created_at: item.last_activity_at }] : [];
    const history = Array.isArray(item.reschedule_history) ? item.reschedule_history : item.rescheduled_from_date ? [{ fromDate: item.rescheduled_from_date, fromTime: item.rescheduled_from_time, toDate: item.due_date, toTime: item.due_time, reason: item.reschedule_reason }] : [];
    const activityTime = value => { const date = value ? new Date(value) : null; return date && Number.isFinite(date.getTime()) ? date.toLocaleString('en-GB', { timeZone: 'Asia/Karachi', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : String(value || ''); };
    const noteMarkup = noteEntries.length ? noteEntries.map(entry => `<article class="customer-note"><div class="customer-note-head"><strong>Remark</strong><span>${esc(entry.user_name || entry.user_id || 'Aureum teammate')}</span></div><p>${esc(entry.note || entry.description || '')}</p><time>${esc(activityTime(entry.created_at))}</time></article>`).join('') : '<div class="empty-state">No notes or remarks have been added yet.</div>';
    const activityMarkup = activity.length ? activity.map(entry => `<div class="timeline-item"><div class="timeline-dot"></div><div><div class="timeline-title">${esc(String(entry.activity_type || 'Activity').replace(/_/g, ' '))}${entry.user_name ? ` · ${esc(entry.user_name)}` : ''}</div><div class="timeline-copy">${esc(entry.description || '')}</div><div class="timeline-time">${esc(activityTime(entry.created_at))}</div></div></div>`).join('') : '<div class="empty-state">No follow-up activity recorded yet.</div>';
    const historyMarkup = history.length ? history.map(entry => `<div class="followup-history-row"><b>${esc(entry.fromDate || 'Previous schedule')} · ${esc(entry.fromTime || '')}</b><span>Moved to ${esc(entry.toDate || item.due_date)} · ${esc(entry.toTime || item.due_time)}</span><small>${esc(entry.reason || 'Schedule updated')}</small></div>`).join('') : '<div class="empty-state">No reschedule history yet.</div>';
    const historySections = `<div class="drawer-section"><div class="drawer-section-label">Notes & remarks</div><div class="customer-note-list">${noteMarkup}</div></div><div class="drawer-section"><div class="drawer-section-label">Follow-up activity</div><div class="timeline">${activityMarkup}</div></div><div class="drawer-section"><div class="drawer-section-label">Reschedule history</div><div class="followup-history-list">${historyMarkup}</div></div>`;
    return `<div class="drawer-backdrop" data-followup-module-close></div><aside class="drawer followup-detail-drawer"><div class="drawer-header"><div><div class="eyebrow">Follow-up schedule</div><h2>${esc(value(item, 'customer', 'customer_name'))}</h2><p class="page-subtitle">${statusBadge(item)} · ${esc(value(item, 'phone', 'customer_phone'))}</p></div><button class="drawer-close" data-followup-module-close aria-label="Close follow-up">×</button></div>
      ${historySections}<div class="tabs followup-drawer-tabs" role="tablist" aria-label="Follow-up actions"><button type="button" class="tab ${note ? '' : 'active'}" role="tab" aria-selected="${!note}" data-followup-module-form="reschedule">Reschedule</button><button type="button" class="tab ${note ? 'active' : ''}" role="tab" aria-selected="${note}" data-followup-module-form="note">Add note</button></div>
      <form id="${note ? 'followup-module-note-form' : 'followup-module-reschedule-form'}" class="drawer-section">
        <p class="form-hint">${note ? 'Add a note to the customer history. The current contact date and status stay the same.' : 'Record the customer response and choose the next contact. Rescheduling changes this reminder to Contacted.'}</p>
        ${note ? window.AureumFollowUpNoteUI.noteFields() : scheduleFields(item)}
        <div class="drawer-action-row"><button class="btn btn-secondary" type="button" data-followup-module-close>Cancel</button><button class="btn btn-gold" type="submit">${note ? 'Save note' : 'Reschedule'}</button></div>
        ${!note && closed ? '<p class="form-hint">This reminder is closed. Rescheduling opens the next contact for this customer.</p>' : ''}
      </form></aside>`;
  }

  function customerOptions() {
    const source = state.customers?.items || [];
    const permitted = role() === 'SALES_AGENT' ? source.filter(item => item.assigned_agent_id === state.authUser?.id) : source;
    const prefill = state.followupPrefill || {};
    const selected = prefill.customer_id && !permitted.some(item => item.id === prefill.customer_id) ? [{ id: prefill.customer_id, full_name: 'Selected customer', phone: '' }, ...permitted] : permitted;
    return selected.map(customer => `<option value="${esc(customer.id)}" ${customer.id === prefill.customer_id ? 'selected' : ''}>${esc(value(customer, 'full_name', 'name'))} · ${esc(customer.phone)}</option>`).join('') || '<option value="">No permitted customers available</option>';
  }

  function renderCreateFollowupDrawerModule() {
    const prefill = state.followupPrefill || {};
    return `<div class="drawer-backdrop" data-followup-module-close></div><aside class="drawer followup-detail-drawer"><div class="drawer-header"><h2>New Customer Follow-up</h2><button class="drawer-close" data-followup-module-close aria-label="Close follow-up">×</button></div><form id="followup-module-create-form" class="drawer-section">${prefill.lead_id && !prefill.customer_id ? `<input type="hidden" name="lead_id" value="${esc(prefill.lead_id)}" />` : `<div class="form-field"><label>Customer<select name="customer_id" required><option value="">Choose a customer</option>${customerOptions()}</select></label></div>`}${scheduleFields()}<button class="btn btn-gold" type="submit">Schedule follow-up</button></form></aside>`;
  }

  async function refreshList() {
    if (typeof loadFollowups === 'function') await loadFollowups(true);
    else if (typeof render === 'function') render();
  }

  function openSchedule(id, form = 'reschedule') {
    stateForModule().form = form;
    openFollowup(id);
  }

  async function saveWorkflow(form, endpoint, success) {
    if (form.dataset.saving) return;
    form.dataset.saving = 'true';
    const button = form.querySelector('button[type=submit]');
    if (button) button.disabled = true;
    try {
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());
      const tags = formData.getAll('followup_tag');
      if (tags.length) { data.followup_tag = tags[0]; data.followup_tags = tags; }
      await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(data) });
      state.drawer = null;
      state.followupPrefill = null;
      stateForModule().form = '';
      if (state.customers) state.customers.loaded = false;
      if (state.leads) state.leads.loaded = false;
      await refreshList();
      if (state.screen === 'customers' && typeof loadCustomers === 'function') await loadCustomers(true);
      showToast(success);
    } catch (error) {
      showToast(error.message);
    } finally {
      delete form.dataset.saving;
      if (button) button.disabled = false;
    }
  }

  document.addEventListener('click', event => {
    const target = event.target;
    const moduleState = stateForModule();
    if (target.closest('[data-followup-module-close]')) {
      state.drawer = null; moduleState.form = ''; state.followupPrefill = null; render(); return;
    }
    if (target.closest('[data-followup-module-create]')) {
      state.followupPrefill = null; state.drawer = 'create-followup'; state.followupDetail = null; moduleState.form = ''; render();
      if (!state.customers?.items?.length && typeof loadCustomers === 'function') loadCustomers();
      return;
    }
    const action = target.closest('[data-followup-module-action]');
    if (action) {
      event.preventDefault();
      if (['reschedule', 'note'].includes(action.dataset.followupModuleAction)) openSchedule(action.dataset.followupId, action.dataset.followupModuleAction);
      return;
    }
    // Let the dropdown open without triggering the row's follow-up editor.
    if (target.closest('.followup-action-menu')) return;
    const form = target.closest('[data-followup-module-form]');
    if (form) { moduleState.form = form.dataset.followupModuleForm; render(); return; }
    const open = target.closest('[data-followup-module-open]');
    if (open) { openSchedule(open.dataset.followupModuleOpen); return; }
    const statusTab = target.closest('[data-followup-module-status]');
    if (statusTab) { moduleState.status = statusTab.dataset.followupModuleStatus; render(); return; }
    const day = target.closest('[data-followup-module-calendar-date]');
    if (day) { moduleState.selectedDate = moduleState.selectedDate === day.dataset.followupModuleCalendarDate ? '' : day.dataset.followupModuleCalendarDate; render(); return; }
    const month = target.closest('[data-followup-module-month]');
    if (month) { changeCalendarMonth(month.dataset.followupModuleMonth); return; }
    if (target.closest('[data-followup-module-calendar-toggle]')) { moduleState.calendarOpen = !moduleState.calendarOpen; render(); return; }
    if (target.closest('[data-followup-module-reload]')) refreshList();
    if (target.closest('[data-followup-module-clear]')) {
      Object.assign(moduleState, { date: 'all', customStart: '', customEnd: '', selectedDate: '', status: '', search: '', agentId: '', type: '', leadStatus: '', priority: '' }); render();
    }
    if (target.closest('[data-followup-module-apply-custom]')) {
      moduleState.customStart = document.querySelector('[data-followup-module-custom-start]')?.value || '';
      moduleState.customEnd = document.querySelector('[data-followup-module-custom-end]')?.value || '';
      moduleState.date = 'custom'; render();
    }
  });
  document.addEventListener('keydown', event => {
    if (event.target.matches('tr[data-followup-module-open]') && ['Enter', ' '].includes(event.key)) {
      event.preventDefault(); openSchedule(event.target.dataset.followupModuleOpen);
    }
  });
  document.addEventListener('input', event => {
    if (!event.target.matches('[data-followup-module-search]')) return;
    const { value, selectionStart, selectionEnd, selectionDirection } = event.target;
    stateForModule().search = value;
    render();
    const input = document.querySelector('[data-followup-module-search]');
    if (input) {
      input.focus({ preventScroll: true });
      input.setSelectionRange(selectionStart, selectionEnd, selectionDirection);
    }
  });
  document.addEventListener('change', event => {
    const target = event.target; const moduleState = stateForModule();
    const filters = { date: 'date', agent: 'agentId', type: 'type', priority: 'priority', 'lead-status': 'leadStatus' };
    for (const [attribute, key] of Object.entries(filters)) {
      if (target.matches(`[data-followup-module-${attribute}]`)) { moduleState[key] = target.value; render(); break; }
    }
  });
  document.addEventListener('submit', async event => {
    const form = event.target;
    if (!['followup-module-create-form', 'followup-module-reschedule-form', 'followup-module-note-form'].includes(form.id)) return;
    event.preventDefault();
    if (form.id === 'followup-module-create-form') {
      const data = new FormData(form);
      const endpoint = data.get('customer_id') ? `/api/customers/${data.get('customer_id')}/notes` : `/api/leads/${data.get('lead_id')}/notes`;
      await saveWorkflow(form, endpoint, 'Follow-up scheduled · Contacted');
      return;
    }
    const item = state.followupDetail?.data;
    if (!item) return;
    const note = form.id === 'followup-module-note-form';
    const closed = ['Completed', 'Cancelled'].includes(item.lifecycle_status || item.status) || Boolean(item.completed_at);
    const endpoint = !note && closed ? (item.customer_id ? `/api/customers/${item.customer_id}/notes` : `/api/leads/${item.lead_id}/notes`) : `/api/follow-ups/${item.id}/notes`;
    await saveWorkflow(form, endpoint, note ? 'Note added' : 'Follow-up rescheduled · Contacted');
  });

  setInterval(() => { if (state.ready && state.screen === 'follow-ups' && !state.drawer && !document.hidden) refreshList().catch(() => {}); }, 60000);
  window.renderFollowups = renderFollowupsModule;
  window.renderFollowupDrawer = renderFollowupDrawerModule;
  window.AureumFollowUpRuntime = { render: renderFollowupsModule, metrics: () => metrics.getFollowUpSuccessMetrics(items()) };
  if (typeof state !== 'undefined' && state.ready && state.screen === 'follow-ups') render();
}());
