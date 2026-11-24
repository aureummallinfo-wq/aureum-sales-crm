const app = document.querySelector('#app');
const API_BASE_URL = String(window.__AUREUM_API_BASE_URL__ || '').replace(/\/+$/, '');
function apiUrl(path) { if (/^https?:\/\//i.test(path)) return path; const normalized = path.startsWith('/') ? path : `/${path}`; return `${API_BASE_URL}${normalized}`; }

const icons = {
  dashboard: window.AureumUI?.icon('home'), leads: window.AureumUI?.icon('chart'), customers: window.AureumUI?.icon('users'), followups: window.AureumUI?.icon('calendar'), chat: window.AureumUI?.icon('message'), reports: window.AureumUI?.icon('chart'), agents: window.AureumUI?.icon('users'), settings: window.AureumUI?.icon('settings'), search: window.AureumUI?.icon('search'), bell: window.AureumUI?.icon('bell'), plus: window.AureumUI?.icon('plus'), arrow: window.AureumUI?.icon('arrow'), close: window.AureumUI?.icon('close'), lock: '?', calendar: window.AureumUI?.icon('calendar'), filter: '�', phone: window.AureumUI?.icon('phone'), whatsapp: '?'
};
const icon = (name) => `<span class="nav-icon" aria-hidden="true">${icons[name] || ''}</span>`;

const routePermissions = {
  dashboard: ['SUPER_ADMIN', 'SALES_MANAGER', 'SALES_AGENT', 'HR', 'PROJECT_MANAGER'],
  leads: ['SUPER_ADMIN', 'SALES_MANAGER'],
  'my-leads': ['SUPER_ADMIN', 'SALES_MANAGER', 'SALES_AGENT'],
  'add-lead': ['SUPER_ADMIN', 'SALES_MANAGER', 'SALES_AGENT'],
  customers: ['SUPER_ADMIN', 'SALES_MANAGER', 'SALES_AGENT'],
  'follow-ups': ['SUPER_ADMIN', 'SALES_MANAGER', 'SALES_AGENT', 'HR'],
  tasks: ['SUPER_ADMIN', 'SALES_MANAGER', 'SALES_AGENT', 'HR', 'PROJECT_MANAGER'],
  'team-chat': ['SUPER_ADMIN', 'SALES_MANAGER', 'SALES_AGENT', 'PROJECT_MANAGER'],
  reports: ['SUPER_ADMIN', 'SALES_MANAGER', 'HR', 'PROJECT_MANAGER'],
  'meta-inbox': ['SUPER_ADMIN', 'SALES_MANAGER'],
  agents: ['SUPER_ADMIN', 'SALES_MANAGER'],
  users: ['SUPER_ADMIN', 'SALES_MANAGER'],
  'my-account': ['SUPER_ADMIN', 'SALES_MANAGER', 'SALES_AGENT', 'HR', 'PROJECT_MANAGER'],
  'change-password': ['SUPER_ADMIN', 'SALES_MANAGER', 'SALES_AGENT', 'HR', 'PROJECT_MANAGER'],
  'access-denied': ['SUPER_ADMIN', 'SALES_MANAGER', 'SALES_AGENT', 'HR', 'PROJECT_MANAGER'],
  settings: ['SUPER_ADMIN']
};
const routePaths = { dashboard: '/dashboard', leads: '/all-leads', 'my-leads': '/my-leads', 'meta-inbox': '/meta-inbox', 'add-lead': '/add-lead', customers: '/customers', 'follow-ups': '/follow-ups', tasks: '/tasks', 'team-chat': '/team-chat', reports: '/reports', agents: '/users', 'my-account': '/my-account', 'change-password': '/change-password', 'access-denied': '/access-denied', settings: '/settings' };
const screenForPath = Object.fromEntries(Object.entries(routePaths).map(([screen, path]) => [path, screen]));
screenForPath['/meta-intake'] = 'meta-inbox';
screenForPath['/access-denied'] = 'unauthorized';

const API_REQUEST_TIMEOUT_MS = 20000;
const API_CACHE = new Map();
const API_INFLIGHT = new Map();
let apiDataRevision = 0;
let portalSessionRevision = 0;
function defaultApiCacheTtl(path, method) {
  if (!['GET', 'HEAD'].includes(method)) return 0;
  const pathname = String(path || '').split('?')[0];
  if (pathname.startsWith('/api/auth/') || pathname.includes('/download')) return 0;
  if (pathname === '/api/chat/unread-counts') return 0;
  if (pathname === '/api/search' || pathname.startsWith('/api/notifications')) return 5000;
  if (pathname.startsWith('/api/dashboard/')) return 30000;
  if (pathname.startsWith('/api/account/preferences/') || pathname.startsWith('/api/users') || pathname.startsWith('/api/agents')) return 60000;
  return 15000;
}
function portalUserScope(user) {
  return JSON.stringify([user?.workspace_id || user?.workspaceId || '', user?.id || user?.db_id || '', user?.role || '', user?.team_id || '']);
}
function portalSessionKey() { return `${API_BASE_URL}:${portalSessionRevision}:${portalUserScope(state.authUser)}`; }
window.aureumPortalSessionKey = portalSessionKey;
function apiCacheKey(path, requestOptions = {}) {
  const method = String(requestOptions.method || 'GET').toUpperCase();
  return `${portalSessionKey()}:${method}:${apiUrl(path)}`;
}
function apiInvalidateCache(pathPrefix = '') {
  apiDataRevision += 1;
  const prefix = String(pathPrefix || '');
  for (const key of API_CACHE.keys()) {
    if (!prefix || key.includes(apiUrl(prefix))) API_CACHE.delete(key);
  }
}
window.apiInvalidateCache = apiInvalidateCache;
async function apiFetch(path, options = {}) {
  const sessionKey = portalSessionKey();
  const dataRevision = apiDataRevision;
  const { cacheTtl: requestedCacheTtl, force = false, ...requestOptions } = options;
  const method = String(requestOptions.method || 'GET').toUpperCase();
  const cacheTtl = requestedCacheTtl === undefined ? defaultApiCacheTtl(path, method) : Number(requestedCacheTtl);
  const cacheable = method === 'GET' && Number(cacheTtl) > 0;
  const mutation = !['GET', 'HEAD'].includes(method) && typeof requestOptions.body === 'string';
  const key = cacheable ? apiCacheKey(path, requestOptions) : mutation ? `${apiCacheKey(path, requestOptions)}:${requestOptions.body}` : '';
  if (mutation && API_INFLIGHT.has(key)) return API_INFLIGHT.get(key);
  if (cacheable && !force) {
    const cached = API_CACHE.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.body;
    if (cached) API_CACHE.delete(key);
    if (API_INFLIGHT.has(key)) return API_INFLIGHT.get(key);
  }
  const request = (async () => {
    const controller = requestOptions.signal ? null : new AbortController();
    const timeoutId = controller ? window.setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS) : null;
    let response, body;
    try {
      response = await fetch(apiUrl(path), {
        credentials: 'include',
        ...requestOptions,
        headers: { 'Content-Type': 'application/json', ...(requestOptions.headers || {}), ...(state.authUser ? { 'X-Aureum-Portal-Scope': portalUserScope(state.authUser) } : {}) },
        ...(controller ? { signal: controller.signal } : {})
      });
      try {
        body = await response.json();
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid response');
      }
      catch (error) {
        if (controller?.signal.aborted || error?.name === 'AbortError') throw error;
        body = {};
        if (response.ok) throw new Error('The server returned an unreadable response. Please refresh this screen.');
      }
    } catch (error) {
      if (controller?.signal.aborted || error?.name === 'AbortError') {
        const failure = new Error(mutation ? 'The save could not be confirmed. Refresh the record before trying again.' : 'The request timed out. Please try again.');
        failure.code = mutation ? 'SAVE_UNCONFIRMED' : 'REQUEST_TIMEOUT';
        throw failure;
      }
      if (mutation) { const failure = new Error('The save could not be confirmed. Refresh the record before trying again.'); failure.code = 'SAVE_UNCONFIRMED'; throw failure; }
      throw error;
    } finally { if (timeoutId) window.clearTimeout(timeoutId); }
    // A response from a previous account must never repopulate the current portal.
    if (sessionKey !== portalSessionKey()) throw new Error('The signed-in account changed. Please retry.');
    if ((response.status === 401 || body.code === 'PORTAL_SESSION_CHANGED') && state?.authUser && state.screen !== 'login') {
      state.authUser = null;
      state.ready = true;
      state.screen = 'login';
      state.drawer = null;
      state.loginError = body.code === 'PORTAL_SESSION_CHANGED' ? 'The account for this tab changed. Please sign in again.' : 'Your session has expired. Please sign in again.';
      window.history.replaceState({}, '', '/');
      if (typeof render === 'function') render();
    }
    if (!response.ok) {
      const error = new Error(body.error || (response.status >= 500 ? 'The service is temporarily unavailable. Please try again.' : 'Request failed'));
      error.status = response.status;
      error.code = body.code || '';
      error.retryAfter = Number(response.headers?.get('retry-after') || body.retryAfter || 0);
      error.requestId = response.headers?.get('x-request-id') || body.requestId || '';
      throw error;
    }
    // A GET started before a successful mutation must never repaint old data.
    if (method === 'GET' && dataRevision !== apiDataRevision) return apiFetch(path,{...options,force:true});
    if (cacheable) API_CACHE.set(key, { expiresAt: Date.now() + Number(cacheTtl), body });
    if (method !== 'GET' && method !== 'HEAD') {
      apiInvalidateCache();
      window.invalidateDashboardCache?.();
      const record=body.data;
      if (record && ['Closed Lost','Not Interested'].includes(record.customer_status || record.status)) {
        const customerPath=/\/customers\//.test(path);
        const leadId=customerPath ? record.lead_id : record.id;
        const customerId=customerPath ? record.id : record.customer_id;
        if(state.followups?.items) state.followups.items=state.followups.items.filter(f=>f.lead_id!==leadId && (!customerId || f.customer_id!==customerId));
        for(const item of state.leads?.items || []) if(item.id===leadId) Object.assign(item,{status:'Closed Lost',next_follow_up_at:null});
        for(const item of state.customers?.items || []) if(item.id===customerId || item.lead_id===leadId) Object.assign(item,{customer_status:'Closed Lost',status:'Closed Lost',next_follow_up_at:null});
        window.dispatchEvent(new CustomEvent('aureum:opportunity-closed',{detail:{leadId,customerId}}));
      }
    }
    window.AureumSidebarBadges?.observeResponse(path, method, body);
    return body;
  })();
  if (cacheable || mutation) API_INFLIGHT.set(key, request);
  try { return await request; } finally { if ((cacheable || mutation) && API_INFLIGHT.get(key) === request) API_INFLIGHT.delete(key); }
}

function recoveryEscape(value) { return String(value || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }
function renderPortalStartupError() {
  return `<div class="loading-screen"><section class="card empty-state" role="alert"><h1>CRM temporarily unavailable</h1><p>${recoveryEscape(state.startupError)}</p><button type="button" class="btn btn-gold" data-retry-portal>Try again</button></section></div>`;
}
function renderPortalContent() {
  // Evaluate only the active screen. A dashboard rendering error must not
  // execute again when a user opens a healthy screen such as Customers.
  try {
    switch (state.screen) {
      case 'leads': return renderLeads(false);
      case 'my-leads': return renderLeads(true);
      case 'meta-inbox': return window.renderMetaIntake ? window.renderMetaIntake() : renderDashboard();
      case 'add-lead': return renderAddLead();
      case 'customers': return renderCustomers();
      case 'follow-ups': return renderFollowups();
      case 'tasks': return renderTasks();
      case 'team-chat': return renderChat();
      case 'reports': return renderReports();
      case 'agents': return typeof renderUsers === 'function' ? renderUsers() : renderAgents();
      case 'my-account': return renderMyAccount();
      case 'change-password': return renderChangePassword();
      case 'settings': return renderSettings();
      default: return renderDashboard();
    }
  } catch (error) {
    console.error('CRM screen rendering failed:', state.screen, error.name);
    return '<section class="card empty-state" role="alert"><h2>This screen could not be displayed</h2><p>Try refreshing its data, or open another section from the sidebar.</p><button type="button" class="btn btn-secondary" data-retry-screen>Retry this screen</button></section>';
  }
}
function renderProtectedDrawer(renderer) {
  try { return renderer(); }
  catch (error) {
    console.error('CRM drawer rendering failed:', state.drawer, error.name);
    return '<div class="drawer-backdrop" data-recovery-close-drawer></div><aside class="drawer" role="alert"><div class="drawer-header"><h2>This record could not be displayed</h2><button type="button" class="drawer-close" aria-label="Close record" data-recovery-close-drawer>x</button></div><div class="drawer-section">Close this record and try opening it again.</div></aside>';
  }
}
document.addEventListener?.('click', event => {
  const button = event.target?.closest?.('[data-retry-portal], [data-retry-screen], [data-recovery-close-drawer]');
  if (!button) return;
  event.preventDefault();
  if (button.hasAttribute('data-retry-portal')) { window.aureumRetryPortal?.(); return; }
  if (button.hasAttribute('data-recovery-close-drawer')) { state.drawer = null; render(); return; }
  navigate(state.screen);
});


const leadRows = [
  { name: 'Ahmed Khan', initials: 'AK', meta: '0321-4829100 � Lahore', interest: '1 Bed Apartment', budget: 'PKR 25M', source: 'Website', agent: 'Ali Raza', status: 'Hot', tag: 'High intent', next: 'Today � 4:00 PM', contacted: 'Today' },
  { name: 'Sara Malik', initials: 'SM', meta: '0300-8458921 � Lahore', interest: 'Commercial Shop', budget: 'PKR 35M', source: 'WhatsApp', agent: 'Hamza Khan', status: 'New', tag: 'Commercial investor', next: 'Tomorrow � 11:00 AM', contacted: 'Not contacted' },
  { name: 'Usman Ali', initials: 'UA', meta: '0333-7192834 � Islamabad', interest: 'Corporate Office', budget: 'PKR 40M', source: 'Partner', agent: 'Unassigned', status: 'Follow-up', tag: 'Office buyer', next: 'Oct 10 � 10:30 AM', contacted: 'Yesterday' },
  { name: 'Fatima Ahmed', initials: 'FA', meta: '0345-6291045 � Lahore', interest: '2 Bed Apartment', budget: 'PKR 32M', source: 'Facebook', agent: 'Sara Ahmed', status: 'Visit', tag: 'VIP showing', next: 'Today � 6:00 PM', contacted: 'Today' },
  { name: 'Bilal Hussain', initials: 'BH', meta: '0312-9012384 � Faisalabad', interest: 'Hotel Room', budget: 'PKR 50M', source: 'Website', agent: 'Ayesha Noor', status: 'Negotiation', tag: 'Investor', next: 'Oct 09 � 2:00 PM', contacted: 'Yesterday' },
  { name: 'Zoya Tariq', initials: 'ZT', meta: '0322-1144789 � Lahore', interest: 'Food Court Space', budget: 'PKR 28M', source: 'Walk-in', agent: 'Ali Raza', status: 'Contacted', tag: 'Retail VIP', next: 'Oct 11 � 12:00 PM', contacted: '2 days ago' }
];

const followups = [
  { time: '10:00 AM', name: 'Ahmed Khan', type: 'Phone call', agent: 'Ali Raza', status: 'Pending', priority: 'High', copy: 'Discuss Floor 4 suite booking' },
  { time: '12:30 PM', name: 'Sara Malik', type: 'WhatsApp', agent: 'Hamza Khan', status: 'Pending', priority: 'Medium', copy: 'Send commercial payment schedule' },
  { time: '03:00 PM', name: 'Usman Ali', type: 'Plan review', agent: 'Sara Ahmed', status: 'Overdue', priority: 'High', copy: 'Escrow installment milestone' },
  { time: '05:00 PM', name: 'Fatima Ahmed', type: 'Confirmation', agent: 'Ayesha Noor', status: 'Completed', priority: 'VIP', copy: 'On-site gallery booking' }
];

const state = {
  screen: 'dashboard',
  role: 'SUPER_ADMIN',
  authUser: null,
  ready: false,
  dashboard: { loading: true, error: '', data: null },
  leads: { loading: false, error: '', items: [] },
  leadFilters: { q: '', status: '', source: '', interest: '', propertyType: '', priority: '', agentId: '', assignment: '', dateRange: 'all', startDate: '', endDate: '' },
  leadDetail: null,
  customers: { loading: false, error: '', items: [] },
  followups: { loading: false, error: '', items: [] },
  sidebarCounts: {},
  tasks: { loading: false, error: '', items: [], users: [], filters: { status: 'all', priority: 'all', assignedTo: 'all', search: '' }, formOpen: false, editing: null },
  followupTab: 'all',
  followupDateFilter: 'all',
  followupMode: '',
  customerTab: 'overview',
  userMenu: false,
  loginError: '',
  deniedPath: '',
  drawer: null,
  followupPrefill: null,
  metaInbox: { loading: false, error: '', items: [], selected: null, filters: { q: '', status: '', formId: '', dateFrom: '', dateTo: '' } },
  selectedChannel: 'Sales Team',
  toast: ''
};

// Clear ev