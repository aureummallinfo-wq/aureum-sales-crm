function taskText(value) {
  return window.AureumUI?.escape ? AureumUI.escape(String(value ?? '')) : String(value ?? '').replace(/[&<>\"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function taskDate(value) {
  if (!value) return 'No due date';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'No due date' : (window.AureumPreferences?.formatDateTime ? window.AureumPreferences.formatDateTime(date) : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }));
}

function taskDueClass(value, status) {
  if (status === 'Completed' || status === 'Cancelled') return '';
  if (status === 'Overdue' || (value && new Date(value).getTime() < Date.now())) return 'task-overdue';
  return '';
}

function taskState() {
  if (!state.tasks) state.tasks = { loading: false, error: '', items: [], users: [], leads: [], customers: [], followUps: [], filters: { status: 'all', priority: 'all', assignedTo: 'all', search: '' }, formOpen: false, editing: null };
  return state.tasks;
}

async function loadTasks(force = false) {
  if (!state.authUser || !canAccess('tasks')) return;
  const tasks = taskState();
  tasks.loading = true;
  tasks.error = '';
  render();
  try {
    const query = new URLSearchParams();
    if (tasks.filters.status !== 'all') query.set('status', tasks.filters.status);
    if (tasks.filters.priority !== 'all') query.set('priority', tasks.filters.priority);
    if (tasks.filters.assignedTo !== 'all') query.set('assignedTo', tasks.filters.assignedTo);
    if (tasks.filters.search) query.set('q', tasks.filters.search);
    const result = await apiFetch(`/api/tasks${query.toString() ? `?${query}` : ''}`, { cacheTtl: 30 * 1000, force });
    tasks.items = result.data || [];
    if (['SUPER_ADMIN', 'SALES_MANAGER'].includes(state.role) && !tasks.users.length) {
      const [users, leads, customers, followUps] = await Promise.all([apiFetch('/api/users?status=active', { cacheTtl: 2 * 60 * 1000 }), apiFetch('/api/leads', { cacheTtl: 30 * 1000 }), apiFetch('/api/customers', { cacheTtl: 30 * 1000 }), apiFetch('/api/follow-ups', { cacheTtl: 15 * 1000 })]);
      tasks.users = (users.data || []).filter(item => ['sales_agent', 'sales_manager'].includes(String(item.role || item.roleKey || '').toLowerCase()) && String(item.status || '').toLowerCase() === 'active');
      tasks.leads = leads.data || [];
      tasks.customers = customers.data || [];
      tasks.followUps = followUps.data || [];
    }
  } catch (error) {
    tasks.error = error.message || 'Unable to load tasks.';
  }
  tasks.loading = false;
  render();
}

function taskSummary(items) {
  return {
    pending: items.filter(item => item.status === 'Pending').length,
    progress: items.filter(item => item.status === 'In Progress').length,
    overdue: items.filter(item => item.status === 'Overdue' || taskDueClass(item.dueAt, item.status) === 'task-overdue').length,
    completed: items.filter(item => item.status === 'Completed').length
  };
}

function taskOptionRows(items, label, selected) {
  return (items || []).map(item => `<option value="${taskText(item.id)}" ${String(selected || '') === String(item.id) ? 'selected' : ''}>${taskText(label(item))}</option>`).join('');
}

function renderTaskForm() {
  const tasks = taskState();
  const editing = tasks.editing;
  const canAssign = ['SUPER_ADMIN', 'SALES_MANAGER'].includes(state.role);
  const selected = editing?.assignedTo || state.authUser?.id || '';
  const users = (tasks.users || []).map(item => { const id = item.id || item.userId; const name = item.fullName || item.full_name || item.name || id; return `<option value="${taskText(id)}" ${String(selected) === String(id) ? 'selected' : ''}>${taskText(name)} · ${taskText(item.role || '')}</option>`; }).join('');
  const links = `<div class="form-field"><label for="task-lead">Lead link</label><select id="task-lead" name="lead_id"><option value="">No lead link</option>${taskOptionRows(tasks.leads, item => item.full_name || item.name || item.id, editing?.leadId)}</select></div><div class="form-field"><label for="task-customer">Customer link</label><select id="task-customer" name="customer_id"><option value="">No customer link</option>${taskOptionRows(tasks.customers, item => item.full_name || item.name || item.id, editing?.customerId)}</select></div><div class="form-field"><label for="task-follow-up">Follow-up link</label><select id="task-follow-up" name="follow_up_id"><option value="">No follow-up link</option>${taskOptionRows(tasks.followUps, item => `${item.follow_up_type || item.type || item.id} · ${item.due_date || ''}`, editing?.followUpId)}</select></div>`;
  return `<section class="card card-pad task-form-card"><div class="section-title"><div><h3>${editing ? 'Edit task' : 'Assign a task'}</h3><p>Keep ownership, priority, and the next action explicit.</p></div><button class="btn btn-secondary btn-sm" type="button" data-task-close>Cancel</button></div><form id="task-form"><div class="form-grid"><div class="form-field full"><label for="task-title">Task title</label><input id="task-title" name="title" required maxlength="160" value="${taskText(editing?.title || '')}" placeholder="Call the client about the payment schedule" /></div><div class="form-field full"><label for="task-description">Details</label><textarea id="task-description" name="description" rows="3" maxlength="5000" placeholder="Add the outcome or context the assignee needs.">${taskText(editing?.description || '')}</textarea></div><div class="form-field"><label for="task-priority">Priority</label><select id="task-priority" name="priority">${['Low', 'Medium', 'High', 'Urgent'].map(item => `<option ${editing?.priority === item ? 'selected' : ''}>${item}</option>`).join('')}</select></div><div class="form-field"><label for="task-status">Status</label><select id="task-status" name="status">${['Pending', 'In Progress', 'Completed', 'Overdue', 'Cancelled'].map(item => `<option ${editing?.status === item ? 'selected' : ''}>${item}</option>`).join('')}</select></div><div class="form-field"><label for="task-due-at">Due date and time</label><input id="task-due-at" type="datetime-local" name="due_at" value="${editing?.dueAt ? taskText(String(editing.dueAt).slice(0, 16)) : ''}" /></div>${canAssign ? `<div class="form-field"><label for="task-assigned-to">Assign to</label><select id="task-assigned-to" name="assigned_to"><option value="">Select an active team member</option>${users}</select></div>` : ''}${links}</div><div class="header-actions" style="margin-top:14px"><button class="btn btn-gold" type="submit">${editing ? 'Save task' : 'Assign task'}</button></div></form></section>`;
}

function renderTasks() {
  const tasks = taskState();
  const summary = taskSummary(tasks.items || []);
  const manager = ['SUPER_ADMIN', 'SALES_MANAGER'].includes(state.role);
  const filters = tasks.filters;
  const rows = tasks.items || [];
  const content = tasks.loading && !tasks.items?.length ? '<div class="card card-pad"><div class="empty-state"><strong>Loading tasks</strong><p>Syncing assignments from Neon…</p></div></div>' : tasks.error && !tasks.items?.length ? `<div class="card card-pad"><div class="empty-state"><strong>Unable to load tasks</strong><p>${taskText(tasks.error)}</p><button class="btn btn-secondary btn-sm" data-tasks-reload>Retry</button></div></div>` : `<section class="card table-card"><div class="table-head"><div><h3>${manager ? 'Workspace assignments' : 'My assigned tasks'}</h3><p class="page-subtitle">${manager ? 'Tasks are visible within your permitted company or team scope.' : 'Only tasks assigned to your account are shown.'}</p></div><button class="btn btn-secondary btn-sm" data-tasks-reload>Refresh</button></div>${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Task</th><th>Owner</th><th>Linked record</th><th>Due</th><th>Priority</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows.map(item => `<tr><td><b>${taskText(item.title)}</b><div class="person-meta">${taskText(item.description || 'No details')}</div></td><td>${taskText(item.assignedAgent || 'Unassigned')}</td><td>${taskText(item.leadName ? `Lead · ${item.leadName}` : item.customerName ? `Customer · ${item.customerName}` : item.followUpId ? `Follow-up · ${item.followUpId}` : 'General task')}</td><td class="${taskDueClass(item.dueAt, item.status)}">${taskText(taskDate(item.dueAt))}</td><td>${badge(item.priority)}</td><td>${badge(item.status)}</td><td><div class="header-actions"><button class="table-action" data-task-status="${taskText(item.id)}" data-next-status="${item.status === 'Completed' ? 'Pending' : 'Completed'}">${item.status === 'Completed' ? 'Reopen' : 'Complete'}</button>${manager ? `<button class="table-action" data-task-edit="${taskText(item.id)}">Edit</button><button class="table-action" data-task-delete="${taskText(item.id)}">Delete</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state"><strong>No tasks yet.</strong><p>Assigned work will appear here as soon as a manager creates it.</p></div>'}</section>`;
  return pageHeader('Aureum work management', manager ? 'Task assignment' : 'My tasks', manager ? 'Assign clear next actions to your team and keep ownership visible.' : 'Your assigned next actions, due dates, and priorities in one place.', manager ? '<button class="btn btn-gold" data-task-create>+ Assign task</button>' : '') + `<section class="grid grid-4 task-summary-grid" style="margin-bottom:18px">${kpi('Pending', summary.pending, 'Awaiting action')} ${kpi('In progress', summary.progress, 'Active work')} ${kpi('Overdue', summary.overdue, 'Needs attention', 'down')} ${kpi('Completed', summary.completed, 'Closed tasks')}</section>${tasks.formOpen ? renderTaskForm() : ''}<section class="card filter-bar task-filter-bar"><label class="form-field"><span>Search</span><input data-task-search value="${taskText(filters.search)}" placeholder="Search tasks" /></label><label class="form-field"><span>Status</span><select data-task-filter="status"><option value="all">All statuses</option>${['Pending', 'In Progress', 'Completed', 'Overdue', 'Cancelled'].map(item => `<option ${filters.status === item ? 'selected' : ''}>${item}</option>`).join('')}</select></label><label class="form-field"><span>Priority</span><select data-task-filter="priority"><option value="all">All priorities</option>${['Low', 'Medium', 'High', 'Urgent'].map(item => `<option ${filters.priority === item ? 'selected' : ''}>${item}</option>`).join('')}</select></label>${manager ? `<label class="form-field"><span>Assignee</span><select data-task-filter="assignedTo"><option value="all">All assignees</option>${(tasks.users || []).map(item => { const id = item.id || item.userId; const name = item.fullName || item.full_name || item.name || id; return `<option value="${taskText(id)}" ${filters.assignedTo === id ? 'selected' : ''}>${taskText(name)}</option>`; }).join('')}</select></label>` : ''}</section>${content}`;
}

function ensureTaskEvents() {
  if (window.__aureumTasksEventsBound) return;
  window.__aureumTasksEventsBound = true;
  document.addEventListener('click', async event => {
    const target = event.target instanceof Element ? event.target.closest('[data-task-create], [data-task-close], [data-tasks-reload], [data-task-status], [data-task-edit], [data-task-delete]') : null;
    if (!target) return;
    const tasks = taskState();
    if (target.matches('[data-task-create]')) { tasks.formOpen = true; tasks.editing = null; render(); return; }
    if (target.matches('[data-task-close]')) { tasks.formOpen = false; tasks.editing = null; render(); return; }
    if (target.matches('[data-tasks-reload]')) { loadTasks(true); return; }
    if (target.matches('[data-task-edit]')) { tasks.editing = tasks.items.find(item => item.id === target.dataset.taskEdit) || null; tasks.formOpen = Boolean(tasks.editing); render(); return; }
    if (target.matches('[data-task-delete]')) { if (!window.confirm('Delete this task? It will be removed from active task views.')) return; try { await apiFetch(`/api/tasks/${encodeURIComponent(target.dataset.taskDelete)}`, { method: 'DELETE' }); showToast('Task deleted.'); await loadTasks(); } catch (error) { showToast(error.message); } return; }
    if (target.matches('[data-task-status]')) { try { await apiFetch(`/api/tasks/${encodeURIComponent(target.dataset.taskStatus)}`, { method: 'PATCH', body: JSON.stringify({ status: target.dataset.nextStatus }) }); showToast(target.dataset.nextStatus === 'Completed' ? 'Task completed.' : 'Task reopened.'); await loadTasks(); } catch (error) { showToast(error.message); } }
  });
  document.addEventListener('input', event => { if (event.target instanceof Element && event.target.matches('[data-task-search]') && state.screen === 'tasks') { taskState().filters.search = event.target.value; window.clearTimeout(window.__aureumTaskSearchTimer); window.__aureumTaskSearchTimer = window.setTimeout(() => loadTasks(), 250); } });
  document.addEventListener('change', event => { const target = event.target; if (!(target instanceof Element) || !target.matches('[data-task-filter]')) return; taskState().filters[target.dataset.taskFilter] = target.value; loadTasks(); });
  document.addEventListener('submit', async event => { const form = event.target; if (!(form instanceof HTMLFormElement) || form.id !== 'task-form') return; event.preventDefault(); const data = Object.fromEntries(new FormData(form).entries()); const editing = taskState().editing; try { await apiFetch(editing ? `/api/tasks/${encodeURIComponent(editing.id)}` : '/api/tasks', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(data) }); taskState().formOpen = false; taskState().editing = null; showToast(editing ? 'Task updated.' : 'Task assigned.'); await loadTasks(); } catch (error) { showToast(error.message); } });
}

ensureTaskEvents();
