const crypto = require('node:crypto');
const { canViewOwnedRecord } = require('./security-utils');

// Implements the task repository contract for the local JSON/in-memory server.
// HTTP validation, permissions and response formatting stay in relational-api.
function createMemoryTaskRepository({ tasks, users, records, onChange, notify }) {
  const visible = (actor, task) => !task.deleted_at && (actor.role === 'super_admin' || (actor.role === 'sales_manager' ? task.assigned_team_id === actor.team_id || task.created_by === actor.id : task.assigned_to === actor.id));
  const assignment = (actor, id) => users.find(user => user.id === id && user.status === 'active' && ['sales_agent', 'sales_manager'].includes(user.role) && (actor.role === 'super_admin' || user.team_id === actor.team_id));
  const date = value => !value ? null : new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value) ? `${value}+05:00` : value).toISOString();
  function enrich(task) {
    const owner = users.find(user => user.id === task.assigned_to);
    return { ...task, assigned_agent_id: task.assigned_to, assigned_agent: owner?.full_name || 'Unassigned', assigned_agent_email: owner?.email || null, created_by_name: users.find(user => user.id === task.created_by)?.full_name || '', lead_name: records('lead_id').find(row => row.id === task.lead_id)?.full_name || null, customer_name: records('customer_id').find(row => row.id === task.customer_id)?.full_name || null };
  }
  function linksAllowed(actor, input) {
    return ['lead_id', 'customer_id', 'follow_up_id'].every(key => !input[key] || records(key).some(row => row.id === input[key] && canViewOwnedRecord(actor, row)));
  }
  async function listTasks(_, actor, filters = {}) {
    const search = String(filters.search || '').toLowerCase();
    return tasks.filter(task => visible(actor, task)).map(enrich).filter(task =>
      (!filters.status || filters.status === 'all' || task.status === filters.status) &&
      (!filters.priority || filters.priority === 'all' || task.priority === filters.priority) &&
      (!filters.assignedTo || filters.assignedTo === 'all' || task.assigned_to === filters.assignedTo) &&
      (!search || [task.title, task.description, task.lead_name, task.customer_name].some(value => String(value || '').toLowerCase().includes(search)))
    ).sort((a, b) => String(a.due_at || '9999').localeCompare(String(b.due_at || '9999')));
  }
  async function getTask(_, actor, id) {
    const task = tasks.find(row => row.id === id && visible(actor, row));
    return task ? enrich(task) : null;
  }
  async function createTask(_, actor, input) {
    const owner = assignment(actor, input.assigned_to || input.assigned_agent_id || actor.id);
    if (!owner || !linksAllowed(actor, input)) return null;
    const now = new Date().toISOString();
    const task = { id: `task_${crypto.randomUUID()}`, title: input.title, description: input.description || '', status: ['Pending', 'In Progress', 'Completed', 'Overdue', 'Cancelled'].includes(input.status) ? input.status : 'Pending', priority: ['Low', 'Medium', 'High', 'Urgent'].includes(input.priority) ? input.priority : 'Medium', assigned_to: owner.id, assigned_team_id: owner.team_id, created_by: actor.id, due_at: date(input.due_at), completed_at: input.status === 'Completed' ? now : null, lead_id: input.lead_id || null, customer_id: input.customer_id || null, follow_up_id: input.follow_up_id || null, created_at: now, updated_at: now };
    tasks.unshift(task);
    if (owner.id !== actor.id) notify(owner.id, task, actor);
    onChange(task, actor, 'task_created');
    return enrich(task);
  }
  async function updateTask(_, actor, id, input) {
    const task = tasks.find(row => row.id === id && visible(actor, row));
    if (!task || !linksAllowed(actor, input)) return null;
    const patch = {};
    if (input.assigned_to !== undefined || input.assigned_agent_id !== undefined) {
      const owner = assignment(actor, input.assigned_to || input.assigned_agent_id);
      if (!owner) return null;
      patch.assigned_to = owner.id; patch.assigned_team_id = owner.team_id;
    }
    for (const field of ['title', 'description', 'lead_id', 'customer_id', 'follow_up_id']) if (input[field] !== undefined) patch[field] = input[field] || null;
    if (['Pending', 'In Progress', 'Completed', 'Overdue', 'Cancelled'].includes(input.status)) { patch.status = input.status; patch.completed_at = input.status === 'Completed' ? new Date().toISOString() : null; }
    if (['Low', 'Medium', 'High', 'Urgent'].includes(input.priority)) patch.priority = input.priority;
    if (input.due_at !== undefined) patch.due_at = date(input.due_at);
    Object.assign(task, patch, { updated_at: new Date().toISOString() });
    onChange(task, actor, 'task_updated');
    return enrich(task);
  }
  async function deleteTask(_, actor, id) {
    const task = tasks.find(row => row.id === id && visible(actor, row));
    if (!task) return null;
    task.deleted_at = task.updated_at = new Date().toISOString();
    onChange(task, actor, 'task_deleted');
    return true;
  }
  return { listTasks, getTask, createTask, updateTask, deleteTask };
}

module.exports = { createMemoryTaskRepository };
