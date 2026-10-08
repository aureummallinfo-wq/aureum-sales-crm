const app = document.querySelector('#app');

const icons = {
  dashboard: window.AureumUI?.icon('home'), leads: window.AureumUI?.icon('chart'), customers: window.AureumUI?.icon('users'), followups: window.AureumUI?.icon('calendar'), chat: window.AureumUI?.icon('message'), reports: window.AureumUI?.icon('chart'), agents: window.AureumUI?.icon('users'), settings: window.AureumUI?.icon('settings'), search: window.AureumUI?.icon('search'), bell: window.AureumUI?.icon('bell'), plus: window.AureumUI?.icon('plus'), arrow: window.AureumUI?.icon('arrow'), close: window.AureumUI?.icon('close'), lock: '⌑', calendar: window.AureumUI?.icon('calendar'), filter: '≡', phone: window.AureumUI?.icon('phone'), whatsapp: '◉'
};
const icon = (name) => `<span class="nav-icon" aria-hidden="true">${icons[name] || '•'}</span>`;

const routePermissions = {
  dashboard: ['SUPER_ADMIN', 'SALES_MANAGER', 'SALES_AGENT'],
  leads: ['SUPER_ADMIN', 'SALES_MANAGER'],
  'my-leads': ['SUPER_ADMIN', 'SALES_MANAGER', 'SALES_AGENT'],
  'add-lead': ['SUPER_ADMIN', 'SALES_MANAGER'],
  customers: ['SUPER_ADMIN', 'SALES_MANAGER', 'SALES_AGENT'],
  'follow-ups': ['SUPER_ADMIN', 'SALES_MANAGER', 'SALES_AGENT'],
  'team-chat': ['SUPER_ADMIN', 'SALES_MANAGER', 'SALES_AGENT'],
  reports: ['SUPER_ADMIN', 'SALES_MANAGER'],
  agents: ['SUPER_ADMIN', 'SALES_MANAGER'],
  settings: ['SUPER_ADMIN']
};
const routePaths = { dashboard: '/dashboard', leads: '/all-leads', 'my-leads': '/my-leads', 'add-lead': '/add-lead', customers: '/customers', 'follow-ups': '/follow-ups', 'team-chat': '/team-chat', reports: '/reports', agents: '/agents', settings: '/settings' };
const screenForPath = Object.fromEntries(Object.entries(routePaths).map(([screen, path]) => [path, screen]));

async function apiFetch(path, options = {}) {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Request failed');
  return body;
}

const leadRows = [
  { name: 'Ahmed Khan', initials: 'AK', meta: '0321-4829100 · Lahore', interest: '1 Bed Apartment', budget: 'PKR 25M', source: 'Website', agent: 'Ali Raza', status: 'Hot', tag: 'High intent', next: 'Today · 4:00 PM', contacted: 'Today' },
  { name: 'Sara Malik', initials: 'SM', meta: '0300-8458921 · Lahore', interest: 'Commercial Shop', budget: 'PKR 35M', source: 'WhatsApp', agent: 'Hamza Khan', status: 'New', tag: 'Commercial investor', next: 'Tomorrow · 11:00 AM', contacted: 'Not contacted' },
  { name: 'Usman Ali', initials: 'UA', meta: '0333-7192834 · Islamabad', interest: 'Corporate Office', budget: 'PKR 40M', source: 'Partner', agent: 'Unassigned', status: 'Follow-up', tag: 'Office buyer', next: 'Oct 10 · 10:30 AM', contacted: 'Yesterday' },
  { name: 'Fatima Ahmed', initials: 'FA', meta: '0345-6291045 · Lahore', interest: '2 Bed Apartment', budget: 'PKR 32M', source: 'Facebook', agent: 'Sara Ahmed', status: 'Visit', tag: 'VIP showing', next: 'Today · 6:00 PM', contacted: 'Today' },
  { name: 'Bilal Hussain', initials: 'BH', meta: '0312-9012384 · Faisalabad', interest: 'Hotel Room', budget: 'PKR 50M', source: 'Website', agent: 'Ayesha Noor', status: 'Negotiation', tag: 'Investor', next: 'Oct 09 · 2:00 PM', contacted: 'Yesterday' },
  { name: 'Zoya Tariq', initials: 'ZT', meta: '0322-1144789 · Lahore', interest: 'Food Court Space', budget: 'PKR 28M', source: 'Walk-in', agent: 'Ali Raza', status: 'Contacted', tag: 'Retail VIP', next: 'Oct 11 · 12:00 PM', contacted: '2 days ago' }
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
  leadFilters: { q: '', status: '', source: '' },
  leadDetail: null,
  customers: { loading: false, error: '', items: [] },
  followups: { loading: false, error: '', items: [] },
  followupTab: 'all',
  followupDateFilter: 'all',
  followupMode: '',
  customerTab: 'overview',
  userMenu: false,
  loginError: '',
  deniedPath: '',
  drawer: null,
  selectedChannel: 'Sales Team',
  toast: ''
};

const roleLabels = { SUPER_ADMIN: 'Super Admin', SALES_MANAGER: 'Sales Manager', SALES_AGENT: 'Sales Agent' };
const navByRole = {
  SUPER_ADMIN: [['dashboard', 'Dashboard', 'dashboard'], ['leads', 'All Leads', 'leads'], ['my-leads', 'My Leads', 'leads'], ['customers', 'Customers', 'customers'], ['follow-ups', 'Follow-ups', 'followups'], ['team-chat', 'Team Chat', 'chat'], ['reports', 'Reports', 'reports'], ['agents', 'Agents', 'agents'], ['settings', 'Settings', 'settings']],
  SALES_MANAGER: [['dashboard', 'Dashboard', 'dashboard'], ['leads', 'All Leads', 'leads'], ['my-leads', 'My Leads', 'leads'], ['add-lead', 'Add New Lead', 'plus'], ['customers', 'Customers', 'customers'], ['follow-ups', 'Follow-ups', 'followups'], ['team-chat', 'Team Chat', 'chat'], ['reports', 'Reports', 'reports'], ['agents', 'Agents', 'agents']],
  SALES_AGENT: [['dashboard', 'Dashboard', 'dashboard'], ['my-leads', 'My Leads', 'leads'], ['customers', 'Customers', 'customers'], ['follow-ups', 'Follow-ups', 'followups'], ['team-chat', 'Team Chat', 'chat']]
};

function badge(status) {
  if (window.AureumUI?.render?.statusBadge) return window.AureumUI.render.statusBadge(status);
  const normalized = status.toLowerCase();
  let cls = 'badge-neutral';
  if (['hot', 'booking', 'vip', 'high'].includes(normalized)) cls = 'badge-hot';
  if (['new', 'contacted', 'visit'].includes(normalized)) cls = 'badge-new';
  if (['warm', 'follow-up', 'medium'].includes(normalized)) cls = 'badge-follow';
  if (['closed', 'completed'].includes(normalized)) cls = 'badge-completed';
  if (['overdue', 'lost'].includes(normalized)) cls = 'badge-overdue';
  if (normalized === 'negotiation') cls = 'badge-booking';
  return `<span class="badge ${cls}">${status}</span>`;
}

function person(name, initials, meta = '') {
  return `<div class="person"><div class="person-avatar">${initials}</div><div><div class="person-name">${name}</div>${meta ? `<div class="person-meta">${meta}</div>` : ''}</div></div>`;
}

function userInitials() {
  return (state.authUser?.full_name || 'Aureum').split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase();
}

function canAccess(screen) {
  return (routePermissions[screen] || []).includes(state.role);
}

function navigate(screen) {
  if (routePaths[screen]) window.history.pushState({}, '', routePaths[screen]);
  if (!canAccess(screen)) {
    state.drawer = null;
    state.deniedPath = screen;
    state.screen = 'unauthorized';
  } else {
    state.drawer = null;
    state.screen = screen;
  }
  render();
}

function layout(content) {
  const nav = navByRole[state.role].map(([id, label, ico]) => `<button class="nav-item ${state.screen === id ? 'active' : ''}" data-screen="${id}" aria-label="${label}" title="${label}">${icon(ico)}<span>${label}</span></button>`).join('');
  const userMenu = state.userMenu ? `<div class="user-menu"><div class="user-menu-name">${state.authUser.full_name}</div><div class="user-menu-role">${roleLabels[state.role]} · ${state.authUser.email}</div><button class="btn btn-secondary btn-sm" data-logout>Log out</button></div>` : '';
  return `<div class="app-shell"><aside class="sidebar"><div class="brand"><div class="brand-mark">A</div><div class="brand-copy"><div class="brand-title">Aureum</div><div class="brand-subtitle">Sales command center</div></div></div><div class="sidebar-label">Workspace</div><nav class="nav-list">${nav}</nav><div class="sidebar-footer"><div class="secure-note"><i class="secure-dot"></i><span>Secure workspace<br/>Live sync enabled</span></div></div></aside><div class="main"><header class="topbar"><div class="crumbs">Aureum Sales CRM <span> / </span> <strong>${screenLabel(state.screen)}</strong></div><div class="topbar-actions"><div class="top-search">${icons.search}<input placeholder="Search CRM" aria-label="Search CRM" /></div><div class="live-pill"><i></i> Sales HQ online</div><button class="icon-btn" aria-label="Notifications">${icons.bell}</button><div class="account-wrap"><button class="avatar" aria-label="Account menu" data-user-menu>${userInitials()}</button>${userMenu}</div></div></header><main class="page">${content}</main></div>${state.drawer ? renderDrawer() : ''}${state.toast ? `<div class="toast">${state.toast}</div>` : ''}</div>`;
}

function screenLabel(screen) { return ({dashboard: 'Dashboard', leads: 'All Leads', 'my-leads': 'My Leads', 'add-lead': 'Add New Lead', customers: 'Customers', 'follow-ups': 'Follow-ups', 'team-chat': 'Team Chat', reports: 'Reports', agents: 'Agents', settings: 'Settings', unauthorized: 'Access Denied'})[screen] || 'Dashboard'; }

function pageHeader(eyebrow, title, subtitle, actions = '') { return `<div class="page-header"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p class="page-subtitle">${subtitle}</p></div><div class="header-actions">${actions}</div></div>`; }

function kpi(label, value, foot, tone = 'up') { return `<div class="card kpi-card"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-foot"><span class="trend-${tone}">${foot}</span><span>vs last month</span></div></div>`; }

function renderDashboard() {
  const dashboardActions = `<button class="btn btn-secondary" data-screen="reports">View reports ${icons.arrow}</button>${state.role !== 'SALES_AGENT' ? `<button class="btn btn-gold" data-screen="add-lead">${icons.plus} Add new lead</button>` : ''}`;
  return pageHeader('Aureum Mall & Residences · Executive view', `Welcome back, ${roleLabels[state.role]}`, 'Track Aureum leads, follow-ups, agents, and sales performance from one calm command center.', dashboardActions) + `<section class="grid grid-4">${kpi('Total leads', '1,248', '+12%')} ${kpi('New leads', '320', '+18%')} ${kpi('Hot leads', '86', '+24%')} ${kpi('Follow-ups due', '42', '14 today', 'down')}</section><section class="grid grid-2" style="margin-top:18px"><div class="card chart-card"><div class="section-title"><div><h3>Lead inflow trend</h3><p>Monthly inquiry velocity across digital & direct channels</p></div><select class="select"><option>Last 12 months</option><option>This year</option></select></div><div class="bar-chart">${[58,72,45,66,80,55,65,75,84,100,72,88].map((v, i) => `<div class="bar-group"><div class="bar alt" style="height:${Math.max(28, v - 22)}%"></div><div class="bar" style="height:${v}%"></div></div>`).join('')}</div><div class="bar-labels"><span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span><span>Oct</span><span>Nov</span><span>Dec</span></div><div class="legend"><span><i></i> Actual inflow</span><span><i class="soft"></i> Projection</span><span class="trend-up">October peak · 220 leads</span></div></div><div class="card chart-card"><div class="section-title"><div><h3>Lead sources</h3><p>Acquisition channels distribution</p></div><span class="section-link">This month ${icons.arrow}</span></div><div class="donut-wrap"><div style="position:relative"><div class="donut"></div><div class="donut-label"><strong>1,248</strong><span>Total leads</span></div></div><div class="source-list"><div class="source-row"><span class="source-name"><i></i>Website</span><b>35%</b></div><div class="source-row"><span class="source-name"><i style="background:#e4c782"></i>WhatsApp</span><b>28%</b></div><div class="source-row"><span class="source-name"><i style="background:#b6904f"></i>Facebook</span><b>18%</b></div><div class="source-row"><span class="source-name"><i style="background:#765c3a"></i>Partners</span><b>12%</b></div><div class="source-row"><span class="source-name"><i style="background:#d8cbb7"></i>Walk-in</span><b>7%</b></div></div></div></div></section><section class="grid grid-2" style="margin-top:18px"><div class="card chart-card"><div class="section-title"><div><h3>Follow-up performance</h3><p>Scheduled advisor client resolution</p></div><span class="trend-up">65.2% overall</span></div><div class="progress-row"><span>Completed</span><div class="progress-track"><div class="progress-value" style="width:65%"></div></div><b>184</b></div><div class="progress-row"><span>Pending</span><div class="progress-track"><div class="progress-value" style="width:38%;background:#e4c782"></div></div><b>56</b></div><div class="progress-row"><span>Rescheduled</span><div class="progress-track"><div class="progress-value" style="width:20%;background:#b6904f"></div></div><b>28</b></div><div class="progress-row"><span>Overdue</span><div class="progress-track"><div class="progress-value" style="width:11%;background:var(--red)"></div></div><b>14</b></div><div class="legend"><span>Response SLA: &lt; 2.4 hours</span><span class="trend-up">Target &gt; 80%</span></div></div><div class="card chart-card"><div class="section-title"><div><h3>Agent performance</h3><p>Top advisor conversion benchmark</p></div><span class="section-link" data-screen="reports">Leaderboard ${icons.arrow}</span></div>${[['Ali R.', '22.2%', 88], ['Hamza K.', '18.0%', 72], ['Sara A.', '19.0%', 76], ['Ayesha N.', '15.0%', 60], ['Bilal H.', '12.0%', 48]].map(x => `<div class="progress-row"><span>${x[0]}</span><div class="progress-track"><div class="progress-value" style="width:${x[2]}%"></div></div><b>${x[1]}</b></div>`).join('')}<div class="legend"><span class="trend-up">Top closer: Sara Ahmed</span><span>PKR 112M booked</span></div></div></section><section class="two-col" style="margin-top:18px"><div class="card table-card"><div class="table-head"><div><h3>Recent leads</h3><p class="page-subtitle">Latest prospective investor inquiries</p></div><button class="section-link" data-screen="leads">View all ${icons.arrow}</button></div>${leadTable(leadRows.slice(0, 4), false)}</div><div class="card card-pad"><div class="section-title"><div><h3>Today’s follow-ups</h3><p>14 scheduled advisor touchpoints</p></div><button class="section-link" data-screen="follow-ups">View all</button></div><div class="timeline">${followups.map((f, i) => `<div class="timeline-item"><div class="timeline-dot" style="background:${f.status === 'Overdue' ? 'var(--red)' : f.status === 'Completed' ? 'var(--green)' : 'var(--gold)'}"></div><div><div class="timeline-title">${f.time} · ${f.name}</div><div class="timeline-copy">${f.type} · ${f.copy}</div><div class="timeline-time">${badge(f.status)}</div></div></div>`).join('')}</div></div></section>`;
}

function leadTable(rows, full = true) {
  return `<div class="table-wrap"><table><thead><tr><th>Lead & contact</th><th>Interest & budget</th><th>Source</th><th>Advisor</th><th>Status</th>${full ? '<th>Next follow-up</th><th>Action</th>' : ''}</tr></thead><tbody>${rows.map((l) => `<tr><td>${person(l.name, l.initials, l.meta)}</td><td><b>${l.interest}</b><div class="person-meta">${l.budget}</div></td><td>${l.source}</td><td>${l.agent}</td><td>${badge(l.status)}</td>${full ? `<td>${l.next}</td><td><button class="table-action" data-drawer="lead" data-name="${l.name}">Open ${icons.arrow}</button></td>` : ''}</tr>`).join('')}</tbody></table></div>`;
}

function renderLeads(my = false) {
  const rows = my ? leadRows.filter(l => ['Ali Raza', 'Hamza Khan'].includes(l.agent)) : leadRows;
  return pageHeader(my ? 'Assigned pipeline' : 'Aureum private registry', my ? 'My leads' : 'All leads', my ? 'Keep every assigned relationship moving with clear next actions.' : 'Manage Aureum inquiries, lead status, advisor assignment, and follow-ups.', `<button class="btn btn-secondary">${icons.filter} Filter</button>${!my && state.role !== 'SALES_AGENT' ? '<button class="btn btn-gold" data-screen="add-lead">+ Add new lead</button>' : ''}`) + `<section class="card table-card"><div class="tabs">${['All Leads', 'New', 'Hot', 'Warm', 'Follow-up', 'Visit Scheduled', 'Negotiation', 'Closed Won'].map((t, i) => `<button class="tab ${i === 0 ? 'active' : ''}">${t}</button>`).join('')}</div><div class="filter-bar"><div class="search-box">${icons.search}<input placeholder="Search leads by name, phone, or email" /></div><select class="select"><option>All statuses</option><option>Hot</option><option>Follow-up</option><option>Negotiation</option></select><select class="select"><option>All sources</option><option>Website</option><option>WhatsApp</option><option>Walk-in</option></select><select class="select"><option>All advisors</option><option>Ali Raza</option><option>Hamza Khan</option></select><button class="btn btn-secondary btn-sm">Reset filters</button></div>${leadTable(rows, true)}</section>`;
}

function legacyRenderCustomers() {
  return pageHeader('Client relationships', 'Customers', 'A single view of active Aureum buyers, investors, and high-value conversations.', '<button class="btn btn-secondary">Export list</button><button class="btn btn-gold" data-screen="add-lead">+ Add customer</button>') + `<section class="grid grid-4">${kpi('Active customers', '684', '+9%')} ${kpi('VIP accounts', '42', '+6%')} ${kpi('Due today', '18', '5 urgent', 'down')} ${kpi('Retention score', '94.2%', '+2.1%')}</section><section class="card table-card" style="margin-top:18px"><div class="filter-bar"><div class="search-box">${icons.search}<input placeholder="Search customers" /></div><select class="select"><option>All statuses</option><option>Active</option><option>VIP</option><option>At risk</option></select><select class="select"><option>All advisors</option><option>Ali Raza</option><option>Hamza Khan</option></select></div><div class="table-wrap"><table><thead><tr><th>Customer</th><th>Interest</th><th>Advisor</th><th>Status</th><th>Last activity</th><th>Next follow-up</th><th>Action</th></tr></thead><tbody>${leadRows.slice(0, 5).map(l => `<tr><td>${person(l.name, l.initials, l.meta)}</td><td>${l.interest}<div class="person-meta">${l.budget}</div></td><td>${l.agent}</td><td>${badge(l.status === 'Hot' ? 'VIP' : 'Active')}</td><td>Today · 10:20 AM</td><td>${l.next}</td><td><button class="table-action" data-drawer="customer" data-name="${l.name}">View profile ${icons.arrow}</button></td></tr>`).join('')}</tbody></table></div></section>`;
}

function renderFollowups() {
  return pageHeader('Daily rhythm', 'Follow-ups', 'Protect the next conversation. Every reminder is a promise to the client.', '<button class="btn btn-secondary">Calendar view</button><button class="btn btn-gold">+ Schedule follow-up</button>') + `<section class="grid grid-4">${kpi('Today’s follow-ups', '14', '5 urgent', 'down')} ${kpi('Overdue', '4', 'Action required', 'down')} ${kpi('Upcoming', '28', '+8%')} ${kpi('Completed', '184', '+14%')}</section><section class="card table-card" style="margin-top:18px"><div class="filter-bar"><button class="tab active">Today</button><button class="tab">Tomorrow</button><button class="tab">This week</button><button class="tab">Overdue</button><div style="flex:1"></div><select class="select"><option>All advisors</option><option>Ali Raza</option><option>Hamza Khan</option></select><select class="select"><option>All types</option><option>Phone call</option><option>WhatsApp</option></select></div><div class="table-wrap"><table><thead><tr><th>Time</th><th>Customer</th><th>Type / purpose</th><th>Advisor</th><th>Priority</th><th>Status</th><th>Action</th></tr></thead><tbody>${followups.map(f => `<tr><td><b>${f.time}</b></td><td>${person(f.name, f.name.split(' ').map(x=>x[0]).join(''), 'Lahore')}</td><td>${f.type}<div class="person-meta">${f.copy}</div></td><td>${f.agent}</td><td>${badge(f.priority)}</td><td>${badge(f.status)}</td><td><button class="table-action" data-toast="Follow-up marked as complete">${f.status === 'Completed' ? 'View note' : 'Mark done'}</button></td></tr>`).join('')}</tbody></table></div></section>`;
}

const chatMessages = {
  'Sales Team': [['Ali Raza', 'AR', '10:20 AM', 'Ahmed Khan requested the payment plan for 1 Bed Apartment (Sector C). I will follow up at 4:00 PM.'], ['Sales Manager', 'SM', '10:23 AM', 'Good. Mark him as Hot Lead and update the follow-up note in the CRM registry immediately after the call.'], ['Sara Ahmed', 'SA', '10:28 AM', 'Fatima Ahmed’s site visit is confirmed for 6:00 PM today at Bahria Town show gallery.'], ['Hamza Khan', 'HK', '10:35 AM', 'I have shared the complete commercial floor brochure with Sara Malik on WhatsApp.']],
  'General': [['Admin Console', 'AD', '09:15 AM', 'Weekly sales target updated. Please review the new Q4 pacing notes.'], ['Ali Raza', 'AR', '09:22 AM', 'Acknowledged. Team A will prioritize the Sector C apartment inventory today.']],
  'Follow-ups': [['Sales Manager', 'SM', '10:04 AM', '14 follow-ups are scheduled for today. Please update notes within 30 minutes of every touchpoint.'], ['Ayesha Noor', 'AN', '10:11 AM', 'The Fatima Ahmed gallery booking is confirmed and assigned.']]
};

function renderChat() {
  const messages = chatMessages[state.selectedChannel] || chatMessages['Sales Team'];
  return pageHeader('Communication / internal only', 'Team chat', 'Keep sales coordination focused, searchable, and inside the Aureum workspace.', '') + `<section class="card chat-layout"><aside class="chat-sidebar"><div class="search-box chat-search">${icons.search}<input placeholder="Search chat" /></div><button class="btn btn-gold btn-sm" style="width:100%">+ New chat</button><div class="chat-label">Channels · 6 active</div>${['General', 'Sales Team', 'Announcements', 'Follow-ups', 'Bookings', 'Management'].map((c, i) => `<button class="channel ${state.selectedChannel === c ? 'active' : ''}" data-channel="${c}"><span># ${c}</span>${i === 1 || i === 3 ? '<span class="unread">'+(i === 1 ? 4 : 2)+'</span>' : ''}</button>`).join('')}<div class="chat-label">Direct advisors</div>${[['Ali Raza','AR'],['Hamza Khan','HK'],['Sara Ahmed','SA'],['Ayesha Noor','AN']].map(([n, i]) => `<button class="channel"><span>${i} &nbsp; ${n}</span><span class="online"></span></button>`).join('')}</aside><div class="chat-main"><div class="chat-header"><div><div class="chat-channel-title"># ${state.selectedChannel}</div><div class="chat-channel-copy">12 advisors · Internal sales coordination & high-value pipeline updates</div></div><div class="header-actions"><button class="icon-btn">⌕</button><button class="icon-btn">⋯</button></div></div><div class="messages">${messages.map((m, i) => `<div class="message ${i === 1 ? 'mine' : ''}"><div class="person-avatar">${m[1]}</div><div class="message-body"><div class="message-meta"><b>${m[0]}</b><span>${m[2]}</span></div><div class="message-bubble">${m[3]}</div></div></div>`).join('')}</div><div class="chat-compose"><button class="icon-btn">+</button><input id="chat-input" placeholder="Message #${state.selectedChannel}" /><button class="btn btn-gold btn-sm" data-send-chat>Send</button></div></div><aside class="chat-details"><div class="section-title"><div><h3>Channel details</h3><p>Sales Team</p></div></div><p class="page-subtitle">Internal coordination hub for senior sales advisors, client visits, unit reservations, and priority follow-ups.</p><div class="chat-label">Active advisors · 5 / 12</div><div class="member-list">${[['Ali Raza','AR',true],['Hamza Khan','HK',true],['Sara Ahmed','SA',false],['Ayesha Noor','AN',false],['Sales Manager','SM',true]].map(m => `<div class="member"><div class="person-avatar">${m[1]}</div><span>${m[0]}</span><i class="${m[2] ? 'online' : 'online offline'}"></i></div>`).join('')}</div><div class="chat-label">Shared collateral</div><div class="timeline-copy">Payment Plan · 1 & 2 Bed.pdf<br/><br/>Aureum Mall Luxury Brochure.pdf<br/><br/>Site Walkthrough Schedule.xlsx</div></aside></section>`;
}

function renderReports() {
  return pageHeader('Performance intelligence', 'Agent-wise reports', 'Monitor sales team performance, conversion efficiency, and pipeline adherence across Aureum.', '<button class="btn btn-secondary">Export PDF</button><button class="btn btn-gold">Export Excel</button>') + `<section class="card card-pad" style="margin-bottom:18px"><div class="filter-bar" style="border:0;padding:0"><span class="kpi-label">Timeframe</span><button class="tab active">This month</button><button class="tab">This quarter</button><button class="tab">Custom range</button><div style="flex:1"></div><select class="select"><option>All agents (12)</option><option>Ali Raza</option><option>Hamza Khan</option></select><button class="btn btn-primary btn-sm">Apply filter</button></div></section><section class="grid grid-4">${kpi('Total advisors', '12', '+2 hired this quarter')} ${kpi('Leads assigned', '1,248', 'Avg. 104 / agent')} ${kpi('Completed touches', '842', '+14%')} ${kpi('Closed deals', '48', 'PKR 385M')}</section><section class="grid grid-2" style="margin-top:18px"><div class="card chart-card"><div class="section-title"><div><h3>Closed deals by agent</h3><p>Volume & monetary booking breakdown</p></div></div>${[['Ali Raza','12 deals · PKR 112M',92],['Hamza Khan','9 deals · PKR 78M',76],['Sara Ahmed','8 deals · PKR 65M',64],['Ayesha Noor','6 deals · PKR 48M',48],['Bilal Hussain','5 deals · PKR 42M',42]].map(x => `<div class="progress-row"><span>${x[0]}</span><div class="progress-track"><div class="progress-value" style="width:${x[2]}%"></div></div><b>${x[1].split('·')[0]}</b></div>`).join('')}<div class="legend"><span class="trend-up">Combined booking: PKR 385M</span><span>48 units sold</span></div></div><div class="card chart-card"><div class="section-title"><div><h3>Conversion benchmark</h3><p>Versus 15.0% corporate threshold target</p></div></div>${[['Ali Raza','22.2%','Excellent'],['Sara Ahmed','19.0%','Good'],['Hamza Khan','18.0%','Good'],['Ayesha Noor','15.0%','Average'],['Bilal Hussain','12.0%','Needs attention']].map(x => `<div class="source-row" style="padding:10px 0;border-bottom:1px solid var(--line)"><span class="source-name"><i></i>${x[0]}</span><b>${x[1]} <span style="color:var(--muted);font-weight:400">${x[2]}</span></b></div>`).join('')}<div class="legend"><span class="trend-up">4 of 5 leading advisors surpass target</span></div></div></section><section class="card table-card" style="margin-top:18px"><div class="table-head"><div><h3>Agent performance matrix</h3><p class="page-subtitle">Showing 5 of 12 registered sales advisors</p></div><div class="search-box">${icons.search}<input placeholder="Search advisor" /></div></div><div class="table-wrap"><table><thead><tr><th>Advisor</th><th>Team desk</th><th>Assigned</th><th>Contacted</th><th>Hot</th><th>Done</th><th>Overdue</th><th>Closed deals</th><th>Conversion</th><th>Action</th></tr></thead><tbody>${[['Ali Raza','AR','Sales Team A · Apartments','180','145','28','120','4','12 · PKR 112M','22%'],['Hamza Khan','HK','Sales Team A · Apartments','160','130','22','104','6','9 · PKR 78M','18%'],['Sara Ahmed','SA','Sales Team B · Commercial','145','118','18','96','3','8 · PKR 65M','19%'],['Ayesha Noor','AN','Sales Team B · Commercial','132','105','15','88','7','6 · PKR 48M','15%'],['Bilal Hussain','BH','Sales Team C · Suites','120','90','12','72','8','5 · PKR 42M','12%']].map(x => `<tr><td>${person(x[0],x[1],x[9] + ' conversion')}</td><td>${x[2]}</td><td>${x[3]}</td><td>${x[4]}</td><td>${x[5]}</td><td>${x[6]}</td><td>${x[7]}</td><td>${x[8]}</td><td>${badge(x[9] === '12%' ? 'Needs attention' : 'Excellent')}</td><td><button class="table-action" data-drawer="agent" data-name="${x[0]}">View details ${icons.arrow}</button></td></tr>`).join('')}</tbody></table></div></section>`;
}

function renderAgents() {
  return pageHeader('People & permissions', 'Agents', 'Manage the advisors who turn Aureum inquiries into lasting client relationships.', '<button class="btn btn-gold" data-drawer="add-agent">+ Add agent</button>') + `<section class="grid grid-4">${kpi('Active advisors', '12', '+2 this quarter')} ${kpi('Active leads', '684', 'Across all teams')} ${kpi('Due today', '42', '14 urgent', 'down')} ${kpi('Team conversion', '18.5%', '+3.2%')}</section><section class="card table-card" style="margin-top:18px"><div class="filter-bar"><div class="search-box">${icons.search}<input placeholder="Search agents" /></div><select class="select"><option>All teams</option><option>Sales Team A</option><option>Sales Team B</option></select><select class="select"><option>All statuses</option><option>Active</option><option>Away</option></select></div><div class="table-wrap"><table><thead><tr><th>Advisor</th><th>Team</th><th>Role</th><th>Assigned leads</th><th>Closed deals</th><th>Follow-ups due</th><th>Status</th><th>Action</th></tr></thead><tbody>${[['Ali Raza','AR','Sales Team A','Senior Advisor','180','12','4','Active'],['Hamza Khan','HK','Sales Team A','Luxury Consultant','160','9','6','Active'],['Sara Ahmed','SA','Sales Team B','Commercial Lead','145','8','3','On site'],['Ayesha Noor','AN','Sales Team B','Corporate Advisor','132','6','7','Away'],['Bilal Hussain','BH','Sales Team C','Suites Executive','120','5','8','Active']].map(x => `<tr><td>${person(x[0],x[1],x[3])}</td><td>${x[2]}</td><td>${x[3]}</td><td>${x[4]}</td><td>${x[5]}</td><td>${x[6]}</td><td>${badge(x[7])}</td><td><button class="table-action" data-drawer="agent" data-name="${x[0]}">Open dossier ${icons.arrow}</button></td></tr>`).join('')}</tbody></table></div></section>`;
}

function renderSettings() {
  return pageHeader('Workspace control', 'Settings', 'Keep the Aureum operating system aligned with your company, permissions, and communication standards.', '<button class="btn btn-gold" data-toast="Settings saved">Save changes</button>') + `<div class="grid grid-2"><div class="card card-pad"><div class="section-title"><div><h3>Company settings</h3><p>Brand and operating identity</p></div><span class="badge badge-completed">Configured</span></div><div class="form-field"><label>Company name</label><input value="Aureum Mall & Residences" /></div><div class="form-grid"><div class="form-field"><label>Primary city</label><input value="Lahore" /></div><div class="form-field"><label>Timezone</label><select><option>Asia/Karachi</option></select></div></div><div class="form-field"><label>Workspace tagline</label><input value="More Than a Destination · A Lifestyle of Distinction" /></div></div><div class="card card-pad"><div class="section-title"><div><h3>Roles & permissions</h3><p>Access gates for the sales team</p></div><span class="badge badge-hot">3 roles</span></div>${[['Super Admin','All workspace controls','Full access'],['Sales Manager','Team pipeline & reporting','Manager access'],['Sales Agent','Assigned relationships only','Restricted']].map(x => `<div class="source-row" style="padding:13px 0;border-bottom:1px solid var(--line)"><span><b>${x[0]}</b><small style="display:block;color:var(--muted);margin-top:3px">${x[1]}</small></span><span class="badge badge-neutral">${x[2]}</span></div>`).join('')}</div><div class="card card-pad"><div class="section-title"><div><h3>Lead statuses & tags</h3><p>Keep the pipeline language consistent</p></div><button class="section-link">Edit</button></div><div class="legend">${['New','Hot','Warm','Follow-up','Negotiation','Booking','Closed Won','Lost'].map(x => badge(x)).join('')}</div></div><div class="card card-pad"><div class="section-title"><div><h3>Notifications</h3><p>Choose the moments that need attention</p></div></div>${[['Overdue follow-up alerts',true],['Daily pipeline digest',true],['New lead assignment',true],['Weekly team report',false]].map(x => `<div class="source-row" style="padding:13px 0;border-bottom:1px solid var(--line)"><span>${x[0]}</span><input type="checkbox" ${x[1] ? 'checked' : ''} style="accent-color:var(--gold)" /></div>`).join('')}</div></div>`;
}

function legacyRenderLogin() {
  return `<div class="login-page"><section class="login-brand"><div class="brand"><div class="brand-mark">A</div><div class="brand-copy"><div class="brand-title">Aureum</div><div class="brand-subtitle">Mall & Residences</div></div></div><div class="login-copy"><div class="login-badge">✦ Private sales suite</div><h1>The perfect blend of serenity and luxury.</h1><p>High-velocity portfolio intelligence for relationship directors, executive sales partners, and high-net-worth real-estate advisors.</p></div><div class="login-feature-row"><div class="login-feature"><strong>1,248</strong>active inquiries</div><div class="login-feature"><strong>18.5%</strong>conversion rate</div><div class="login-feature"><strong>PKR 385M</strong>booked this month</div></div></section><section class="login-form-wrap"><form class="login-form" id="login-form"><div class="brand"><div class="brand-mark">A</div><div class="brand-copy"><div class="brand-title">Aureum Sales CRM</div><div class="brand-subtitle">Enterprise sales suite</div></div></div><div class="eyebrow">Secure workspace</div><h2>Welcome back</h2><p class="page-subtitle" style="margin-bottom:24px">Sign in to manage leads, advisors, follow-ups, and bookings.</p><div class="form-field"><label>Work email or phone</label><input required value="advisor@aureum.com" placeholder="Aureum ID / mobile" /></div><div class="form-field"><label>Password</label><input required value="password" type="password" placeholder="Secure password" /></div><div class="form-help"><label class="checkbox"><input type="checkbox" checked /> Remember terminal for 30 days</label><a class="link-gold" href="#">Forgot key?</a></div><button class="btn btn-primary" type="submit">${icons.lock} Login to sales desk</button><p class="demo-note">Secure SSO · 256-bit TLS encrypted · Verified role routing<br/>Demo mode is ready for this local prototype.</p></form></section></div>`;
}

function legacyRenderDrawer() {
  if (state.drawer === 'add-agent') return `<div class="drawer-backdrop" data-close-drawer></div><aside class="drawer"><div class="drawer-header"><div><div class="eyebrow">People & permissions</div><h2>Add new agent</h2><p class="page-subtitle">Invite an advisor into the Aureum workspace.</p></div><button class="drawer-close" data-close-drawer>${icons.close}</button></div><div class="drawer-section"><div class="form-grid"><div class="form-field full"><label>Full name</label><input placeholder="e.g. Hira Malik" /></div><div class="form-field"><label>Email</label><input placeholder="advisor@aureum.com" /></div><div class="form-field"><label>Phone</label><input placeholder="+92 300 ..." /></div><div class="form-field"><label>Role</label><select><option>Sales Agent</option><option>Sales Manager</option></select></div><div class="form-field"><label>Team</label><select><option>Sales Team A</option><option>Sales Team B</option><option>Sales Team C</option></select></div></div></div><div class="drawer-section"><button class="btn btn-gold" data-toast="Agent invitation prepared" data-close-drawer>Send invite</button> <button class="btn btn-secondary" data-close-drawer>Cancel</button></div></aside>`;
  const name = state.drawer === 'agent' ? (state.drawerName || 'Ali Raza') : (state.drawerName || 'Ahmed Khan');
  const isAgent = state.drawer === 'agent';
  return `<div class="drawer-backdrop" data-close-drawer></div><aside class="drawer"><div class="drawer-header"><div><div class="eyebrow">${isAgent ? 'Advisor dossier' : 'Customer relationship'}</div><h2>${name}</h2><p class="page-subtitle">${isAgent ? 'Senior Sales Advisor · Sales Team A' : 'High-intent buyer · Last active today'}</p></div><button class="drawer-close" data-close-drawer>${icons.close}</button></div><div class="drawer-section"><div class="detail-grid"><div><div class="detail-label">Status</div>${badge(isAgent ? 'Active' : 'Hot')}</div><div><div class="detail-label">Owner</div><div class="detail-value">${isAgent ? 'Sales Manager' : 'Ali Raza'}</div></div><div><div class="detail-label">Phone</div><div class="detail-value">0321-4829100</div></div><div><div class="detail-label">Email</div><div class="detail-value">${isAgent ? 'ali.raza@aureum.com' : 'ahmed@example.com'}</div></div></div></div><div class="drawer-section"><h3>${isAgent ? 'Performance snapshot' : 'Interest profile'}</h3><div class="metric-strip">${isAgent ? '<div class="mini-stat"><div class="mini-stat-label">Assigned</div><div class="mini-stat-value">180</div></div><div class="mini-stat"><div class="mini-stat-label">Closed</div><div class="mini-stat-value">12</div></div><div class="mini-stat"><div class="mini-stat-label">Conversion</div><div class="mini-stat-value">22%</div></div>' : '<div class="mini-stat"><div class="mini-stat-label">Interest</div><div class="mini-stat-value">1 Bed</div></div><div class="mini-stat"><div class="mini-stat-label">Budget</div><div class="mini-stat-value">25M</div></div><div class="mini-stat"><div class="mini-stat-label">Source</div><div class="mini-stat-value">Web</div></div>'}</div></div><div class="drawer-section"><h3>Recent timeline</h3><div class="timeline"><div class="timeline-item"><div class="timeline-dot"></div><div><div class="timeline-title">Payment plan requested</div><div class="timeline-copy">Advisor shared the 1 Bed Apartment plan for Sector C.</div><div class="timeline-time">Today · 10:20 AM</div></div></div><div class="timeline-item"><div class="timeline-dot"></div><div><div class="timeline-title">Lead marked hot</div><div class="timeline-copy">Budget and purchase timeline verified by advisor.</div><div class="timeline-time">Yesterday · 04:45 PM</div></div></div><div class="timeline-item"><div class="timeline-dot"></div><div><div class="timeline-title">First contact logged</div><div class="timeline-copy">Inbound website inquiry assigned to Ali Raza.</div><div class="timeline-time">Oct 06, 2026</div></div></div></div></div><div class="drawer-section"><button class="btn btn-gold" data-toast="Action opened">${icons.phone} ${isAgent ? 'Chat advisor' : 'Call client'}</button> <button class="btn btn-secondary" data-toast="Note composer opened">+ Add note</button></div></aside>`;
}

function legacyRender() {
  if (state.screen === 'login') { app.innerHTML = renderLogin(); bind(); return; }
  let content = renderDashboard();
  if (state.screen === 'leads') content = renderLeads(false);
  if (state.screen === 'my-leads') content = renderLeads(true);
  if (state.screen === 'add-lead') content = renderAddLead();
  if (state.screen === 'customers') content = renderCustomers();
  if (state.screen === 'follow-ups') content = renderFollowups();
  if (state.screen === 'team-chat') content = renderChat();
  if (state.screen === 'reports') content = renderReports();
  if (state.screen === 'agents') content = renderAgents();
  if (state.screen === 'settings') content = renderSettings();
  app.innerHTML = layout(content);
  bind();
}

function renderAddLead() {
  return pageHeader('Pipeline intake', 'Add new lead', 'Capture a new Aureum inquiry with enough context for the next best action.', '<button class="btn btn-secondary" data-screen="leads">Cancel</button><button class="btn btn-gold" data-toast="Lead saved to registry">Save lead</button>') + `<section class="grid grid-2"><div class="card card-pad"><div class="section-title"><div><h3>Customer information</h3><p>How should we reach them?</p></div></div><div class="form-grid"><div class="form-field full"><label>Full name</label><input placeholder="e.g. Ahmed Khan" /></div><div class="form-field"><label>Phone number</label><input placeholder="0321-..." /></div><div class="form-field"><label>WhatsApp number</label><input placeholder="Same as phone" /></div><div class="form-field"><label>Email</label><input placeholder="client@example.com" /></div><div class="form-field"><label>City</label><input value="Lahore" /></div><div class="form-field full"><label>Preferred contact method</label><select><option>WhatsApp</option><option>Phone call</option><option>Email</option></select></div></div></div><div class="card card-pad"><div class="section-title"><div><h3>Requirement information</h3><p>Shape the opportunity clearly.</p></div></div><div class="form-grid"><div class="form-field"><label>Interested in</label><select><option>1 Bed Apartment</option><option>Commercial Shop</option><option>Corporate Office</option><option>Hotel Room</option></select></div><div class="form-field"><label>Budget</label><input placeholder="PKR 25M" /></div><div class="form-field"><label>Property type</label><select><option>Apartment</option><option>Commercial</option><option>Hospitality</option></select></div><div class="form-field"><label>Purpose</label><select><option>Investment</option><option>End use</option><option>Business</option></select></div><div class="form-field"><label>Buying timeline</label><select><option>Within 30 days</option><option>1–3 months</option><option>Exploring</option></select></div><div class="form-field"><label>Financing</label><select><option>Self-funded</option><option>Financing required</option></select></div><div class="form-field full"><label>Preferred location</label><input placeholder="e.g. Sector C, Bahria Town" /></div></div></div><div class="card card-pad"><div class="section-title"><div><h3>CRM routing</h3><p>Make the next step visible to the team.</p></div></div><div class="form-grid"><div class="form-field"><label>Lead source</label><select><option>Website</option><option>WhatsApp</option><option>Sales partner</option><option>Walk-in</option></select></div><div class="form-field"><label>Assigned advisor</label><select><option>Ali Raza</option><option>Hamza Khan</option><option>Sara Ahmed</option></select></div><div class="form-field"><label>Status</label><select><option>New</option><option>Hot</option><option>Follow-up</option></select></div><div class="form-field"><label>Next follow-up</label><input type="date" value="2026-10-08" /></div><div class="form-field full"><label>Notes</label><textarea rows="5" placeholder="Add context for the advisor..."></textarea></div></div><div class="header-actions"><button class="btn btn-gold" data-toast="Lead saved to registry">Save lead</button><button class="btn btn-secondary" data-toast="Ready for another lead">Save & add another</button></div></div><div class="card card-pad"><div class="section-title"><div><h3>Intake guidance</h3><p>Make every handoff useful.</p></div></div><div class="timeline-copy">Capture the client’s primary motivation, who is involved in the decision, and the next promised action. High-value inquiries should always leave the intake stage with a named advisor and a dated follow-up.</div><div class="legend" style="margin-top:22px"><span>${badge('High')} High intent</span><span>${badge('New')} Needs first contact</span></div></div></section>`;
}

function customerIdForLead(leadId) {
  const match = String(leadId || '').match(/lead_(\d+)/);
  return match ? `customer_${String(Number(match[1])).padStart(3, '0')}` : '';
}

function renderLeadDrawer() {
  const detail = state.leadDetail;
  if (!detail) return `<div class="drawer-backdrop" data-close-drawer></div><aside class="drawer"><div class="drawer-header"><div><div class="eyebrow">Lead profile</div><h2>Loading…</h2></div><button class="drawer-close" data-close-drawer>${icons.close}</button></div><div class="empty-state">Loading the permitted lead…</div></aside>`;
  if (detail.error) return `<div class="drawer-backdrop" data-close-drawer></div><aside class="drawer"><div class="drawer-header"><div><div class="eyebrow">Protected lead</div><h2>Access denied</h2></div><button class="drawer-close" data-close-drawer>${icons.close}</button></div><div class="empty-state"><strong>${detail.error}</strong></div></aside>`;
  const lead = detail.data;
  const customerId = customerIdForLead(lead.id);
  return `<div class="drawer-backdrop" data-close-drawer></div><aside class="drawer"><div class="drawer-header"><div><div class="eyebrow">Lead profile</div><h2>${lead.full_name}</h2><p class="page-subtitle">${badge(lead.status)} · ${lead.agent}</p></div><button class="drawer-close" data-close-drawer>${icons.close}</button></div><div class="drawer-section"><div class="header-actions"><button class="btn btn-gold btn-sm" data-lead-toast="Call opened">${icons.phone} Call</button><button class="btn btn-secondary btn-sm" data-lead-toast="WhatsApp opened">${icons.whatsapp} WhatsApp</button>${customerId ? `<button class="btn btn-secondary btn-sm" data-lead-customer="${customerId}">Open customer</button>` : ''}</div></div><div class="drawer-section"><div class="detail-grid"><div><div class="detail-label">Phone</div><div class="detail-value">${lead.phone}</div></div><div><div class="detail-label">WhatsApp</div><div class="detail-value">${lead.whatsapp_number}</div></div><div><div class="detail-label">Email</div><div class="detail-value">${lead.email || '—'}</div></div><div><div class="detail-label">City / area</div><div class="detail-value">${lead.city} · ${lead.area}</div></div><div><div class="detail-label">Interested in</div><div class="detail-value">${lead.interest}</div></div><div><div class="detail-label">Budget</div><div class="detail-value">${lead.budget || '—'}</div></div></div></div><form id="lead-status-form" class="drawer-section"><div class="form-field"><label>Update lead status</label><select name="status">${['New', 'Contacted', 'Qualified', 'Hot', 'Warm', 'Cold', 'Follow-up', 'Visit Scheduled', 'Negotiation', 'Booking', 'Closed Won', 'Closed Lost', 'Not Interested', 'Invalid'].map(status => `<option ${status === lead.status ? 'selected' : ''}>${status}</option>`).join('')}</select></div><button class="btn btn-gold" type="submit">Save status</button></form><form id="lead-note-form" class="drawer-section"><div class="form-field"><label>Add note</label><textarea name="note" rows="3" required placeholder="Capture the next useful detail…"></textarea></div><button class="btn btn-secondary" type="submit">Save note</button></form><div class="drawer-section"><h3>Activity history</h3><div class="timeline" style="margin-top:15px">${(detail.activity || []).map(item => `<div class="timeline-item"><div class="timeline-dot"></div><div><div class="timeline-title">${item.activity_type}</div><div class="timeline-copy">${item.description}</div><div class="timeline-time">${item.created_at}</div></div></div>`).join('') || '<div class="empty-state">No activity recorded yet.</div>'}</div></div></aside>`;
}

async function openLead(id) {
  state.drawer = 'lead'; state.leadDetail = null; render();
  try { const [detail, activity] = await Promise.all([apiFetch(`/api/leads/${id}`), apiFetch(`/api/leads/${id}/activity`)]); state.leadDetail = { data: detail.data, activity: activity.data || [] }; }
  catch (error) { state.leadDetail = { error: error.message }; }
  render();
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
  const addLeadForm = document.querySelector('#add-lead-form');
  if (addLeadForm) addLeadForm.addEventListener('submit', async event => { event.preventDefault(); const data = Object.fromEntries(new FormData(addLeadForm).entries()); data.financing_required = data.financing_required === 'true'; try { await apiFetch('/api/leads', { method: 'POST', body: JSON.stringify(data) }); showToast('Lead saved to registry'); navigate('leads'); } catch (error) { showToast(error.message); } });
}

async function boot() {
  const requestedScreen = screenForPath[window.location.pathname] || 'dashboard';
  try { const result = await apiFetch('/api/auth/me'); state.authUser = result.user; state.role = result.user.role.toUpperCase(); state.screen = requestedScreen; }
  catch { state.authUser = null; state.screen = 'login'; }
  state.ready = true; render();
  if (state.authUser && state.screen === 'dashboard') loadDashboard();
  if (state.authUser && state.screen === 'leads') loadLeads(false);
  if (state.authUser && state.screen === 'my-leads') loadLeads(true);
  if (state.authUser && state.screen === 'customers') loadCustomers();
  if (state.authUser && state.screen === 'follow-ups') loadFollowups();
}

function legacyBind() {
  document.querySelectorAll('[data-screen]').forEach(el => el.addEventListener('click', () => { state.screen = el.dataset.screen; state.drawer = null; render(); }));
  document.querySelectorAll('[data-drawer]').forEach(el => el.addEventListener('click', () => { state.drawer = el.dataset.drawer; state.drawerName = el.dataset.name || ''; render(); }));
  document.querySelectorAll('[data-close-drawer]').forEach(el => el.addEventListener('click', () => { state.drawer = null; render(); }));
  document.querySelectorAll('[data-toast]').forEach(el => el.addEventListener('click', () => showToast(el.dataset.toast)));
  document.querySelectorAll('[data-channel]').forEach(el => el.addEventListener('click', () => { state.selectedChannel = el.dataset.channel; render(); }));
  const login = document.querySelector('#login-form');
  if (login) login.addEventListener('submit', (e) => { e.preventDefault(); state.screen = 'dashboard'; showToast('Welcome to the Aureum workspace'); });
  const send = document.querySelector('[data-send-chat]');
  if (send) send.addEventListener('click', () => { const input = document.querySelector('#chat-input'); if (input && input.value.trim()) { showToast('Message sent to #' + state.selectedChannel); input.value = ''; } });
}

function showToast(message) {
  state.toast = message;
  render();
  window.setTimeout(() => { state.toast = ''; render(); }, 2600);
}

function customerInitials(name) { return String(name || '').split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase(); }

async function loadCustomers() {
  if (!state.authUser) return;
  state.customers = { loading: true, error: '', items: state.customers.items || [] };
  render();
  try {
    const endpoint = state.role === 'SALES_AGENT' ? '/api/customers/my' : '/api/customers';
    const result = await apiFetch(endpoint);
    state.customers = { loading: false, error: '', items: result.data || [] };
  } catch (error) { state.customers = { loading: false, error: error.message, items: [] }; }
  render();
}

async function openCustomer(customerId) {
  state.drawer = 'customer'; state.customerId = customerId; state.customerDetail = null; state.customerTab = 'overview'; render();
  try { const result = await apiFetch(`/api/customers/${customerId}`); state.customerDetail = result; render(); }
  catch (error) { state.customerDetail = { error: error.message }; render(); }
}

function customerTable(items) {
  if (!items.length) return '<div class="empty-state"><strong>No customers found</strong>Try clearing filters or add a customer from an approved lead.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Customer</th><th>Email</th><th>City</th><th>Interested in</th><th>Advisor</th><th>Status</th><th>Last activity</th><th>Next follow-up</th><th>Action</th></tr></thead><tbody>${items.map(customer => `<tr><td>${person(customer.full_name, customerInitials(customer.full_name), customer.meta)}</td><td>${customer.email || '—'}</td><td>${customer.city || '—'}</td><td><b>${customer.interest}</b><div class="person-meta">${customer.budget || 'Budget pending'}</div></td><td>${customer.agent || 'Unassigned'}</td><td>${badge(customer.status)}</td><td>${customer.last_activity || '—'}</td><td>${customer.next || 'Not scheduled'}</td><td><button class="table-action" data-customer-id="${customer.id}">Open profile ${icons.arrow}</button></td></tr>`).join('')}</tbody></table></div>`;
}

function renderCustomers() {
  const items = state.customers.items || [];
  const hotCount = items.filter(item => ['Hot', 'Booking Interested'].includes(item.status)).length;
  const followCount = items.filter(item => item.status === 'Follow-up').length;
  const closedCount = items.filter(item => ['Closed Won', 'Closed'].includes(item.status)).length;
  const customerContent = state.customers.loading ? '<div class="empty-state"><strong>Loading customer registry</strong>Syncing your permitted customer profiles…</div>' : state.customers.error ? `<div class="empty-state"><strong>Unable to load customers</strong>${state.customers.error}<br/><button class="btn btn-secondary btn-sm" data-reload-customers>Retry</button></div>` : customerTable(items);
  return pageHeader('Client relationships', 'Customers', 'Search, understand, and move every assigned customer relationship forward.', '<button class="btn btn-secondary">Export customer list</button><button class="btn btn-gold" data-screen="add-lead">+ Add customer</button>') + `<section class="grid grid-4">${kpi('Total customers', String(items.length || (state.role === 'SALES_AGENT' ? 26 : 684)), state.role === 'SALES_AGENT' ? 'Assigned to me' : 'Permitted scope')} ${kpi('Active customers', String(items.filter(item => ['Active', 'Warm'].includes(item.status)).length || 12), '+9%')} ${kpi('Hot / booking', String(hotCount || 3), 'High intent')} ${kpi('Follow-ups due', String(followCount || 4), 'Needs attention', 'down')}</section><section class="card table-card" style="margin-top:18px"><div class="tabs">${['All Customers', 'Active', 'Hot', 'Follow-up', 'Booking Interested', 'Closed', 'Lost'].map((tab, i) => `<button class="tab ${i === 0 ? 'active' : ''}" data-customer-tab-filter="${tab}">${tab}</button>`).join('')}</div><div class="filter-bar"><div class="search-box">${icons.search}<input data-customer-search placeholder="Search by name, phone, WhatsApp, or email" /></div><select class="select" data-customer-status><option value="">All statuses</option><option>Active</option><option>Hot</option><option>Follow-up</option><option>Booking Interested</option><option>Closed Won</option></select><select class="select"><option>All interests</option><option>1 Bed Apartment</option><option>Commercial Shop</option><option>Corporate Office</option></select>${state.role !== 'SALES_AGENT' ? '<select class="select"><option>All advisors</option><option>Ali Raza</option><option>Sales Manager</option></select>' : ''}<button class="btn btn-secondary btn-sm" data-reload-customers>Reset filters</button></div>${customerContent}</section>`;
}

function renderCustomerDrawer() {
  const detail = state.customerDetail;
  if (!detail) return `<div class="drawer-backdrop" data-close-drawer></div><aside class="drawer"><div class="drawer-header"><div><div class="eyebrow">Customer relationship</div><h2>Loading profile…</h2></div><button class="drawer-close" data-close-drawer>${icons.close}</button></div><div class="empty-state">Loading permitted customer details…</div></aside>`;
  if (detail.error) return `<div class="drawer-backdrop" data-close-drawer></div><aside class="drawer"><div class="drawer-header"><div><div class="eyebrow">Protected profile</div><h2>Access denied</h2></div><button class="drawer-close" data-close-drawer>${icons.close}</button></div><div class="empty-state"><strong>${detail.error}</strong></div></aside>`;
  const c = detail.data;
  let body = `<div class="detail-grid"><div><div class="detail-label">Phone</div><div class="detail-value">${c.phone}</div></div><div><div class="detail-label">WhatsApp</div><div class="detail-value">${c.whatsapp_number}</div></div><div><div class="detail-label">Email</div><div class="detail-value">${c.email || '—'}</div></div><div><div class="detail-label">City / area</div><div class="detail-value">${c.city} · ${c.area}</div></div><div><div class="detail-label">Interested in</div><div class="detail-value">${c.interest}</div></div><div><div class="detail-label">Budget</div><div class="detail-value">${c.budget || '—'}</div></div><div><div class="detail-label">Lead source</div><div class="detail-value">${c.source}</div></div><div><div class="detail-label">Next follow-up</div><div class="detail-value">${c.next}</div></div></div><div class="legend" style="margin-top:16px">${(c.tags || []).map(tag => badge(tag)).join(' ')}</div>`;
  if (state.customerTab === 'timeline') body = `<div class="timeline">${(detail.timeline || []).map(item => `<div class="timeline-item"><div class="timeline-dot"></div><div><div class="timeline-title">${item.activity_type}</div><div class="timeline-copy">${item.description}</div><div class="timeline-time">${item.created_at}</div></div></div>`).join('') || '<div class="empty-state">No activity recorded yet.</div>'}</div>`;
  if (state.customerTab === 'notes') body = `<div class="timeline">${(detail.notes || []).map(note => `<div class="timeline-item"><div class="timeline-dot"></div><div><div class="timeline-title">Note</div><div class="timeline-copy">${note.note}</div><div class="timeline-time">${note.created_at}</div></div></div>`).join('') || '<div class="empty-state">No notes yet.</div>'}</div><form id="customer-note-form" class="drawer-section"><div class="form-field"><label>Add a note</label><textarea name="note" rows="3" placeholder="Capture the next useful detail…" required></textarea></div><button class="btn btn-gold" type="submit">Save note</button></form>`;
  if (state.customerTab === 'follow-ups') body = `<div class="timeline">${(detail.followUps || []).map(item => `<div class="timeline-item"><div class="timeline-dot"></div><div><div class="timeline-title">${item.type} · ${item.status}</div><div class="timeline-copy">${item.note || 'No note added.'}</div><div class="timeline-time">${item.due_date} · ${item.agent}</div></div></div>`).join('') || '<div class="empty-state">No follow-ups yet.</div>'}</div><form id="customer-followup-form" class="drawer-section"><div class="form-grid"><div class="form-field"><label>Type</label><select name="type"><option>Phone call</option><option>WhatsApp</option><option>Plan review</option></select></div><div class="form-field"><label>Due date / time</label><input name="due_date" value="Tomorrow · 10:00 AM" required /></div><div class="form-field full"><label>Note</label><input name="note" placeholder="What should happen next?" /></div></div><button class="btn btn-gold" type="submit">Schedule follow-up</button></form>`;
  return `<div class="drawer-backdrop" data-close-drawer></div><aside class="drawer"><div class="drawer-header"><div><div class="eyebrow">Customer relationship</div><h2>${c.full_name}</h2><p class="page-subtitle">${badge(c.status)} · ${c.agent} · ${c.source}</p></div><button class="drawer-close" data-close-drawer>${icons.close}</button></div><div class="drawer-section"><div class="header-actions"><button class="btn btn-gold btn-sm" data-customer-toast="Call opened">${icons.phone} Call</button><button class="btn btn-secondary btn-sm" data-customer-toast="WhatsApp opened">${icons.whatsapp} WhatsApp</button><button class="btn btn-secondary btn-sm" data-customer-tab="notes">+ Add note</button></div></div><div class="tabs" style="padding:0"><button class="tab ${state.customerTab === 'overview' ? 'active' : ''}" data-customer-tab="overview">Overview</button><button class="tab ${state.customerTab === 'timeline' ? 'active' : ''}" data-customer-tab="timeline">Timeline</button><button class="tab ${state.customerTab === 'notes' ? 'active' : ''}" data-customer-tab="notes">Notes</button><button class="tab ${state.customerTab === 'follow-ups' ? 'active' : ''}" data-customer-tab="follow-ups">Follow-ups</button></div><div class="drawer-section">${body}</div></aside>`;
}

function renderDrawer() {
  return state.drawer === 'customer' ? renderCustomerDrawer() : legacyRenderDrawer();
}

function renderAccessDenied() {
  return `<div class="access-denied"><div class="access-mark">${icons.lock}</div><div class="eyebrow">Protected route</div><h1>Access Denied</h1><p>You do not have permission to view this page.</p><div class="access-path">Requested screen: <strong>${screenLabel(state.deniedPath)}</strong></div><button class="btn btn-primary" data-screen="dashboard">Return to dashboard</button></div>`;
}

function renderLogin() {
  return `<div class="login-page"><section class="login-brand"><div class="login-brand-visual" aria-hidden="true"></div><div class="login-brand-content"><div class="brand"><div class="brand-mark">A</div><div class="brand-copy"><div class="brand-title">Aureum Mall & Residences</div><div class="brand-subtitle">Lahore · Bahria Town Ring Road Interchange</div></div></div><div class="login-location"><span>⌖</span> Phase I & II · Open for allotment</div><div class="login-copy"><div class="login-badge">✓ Enterprise sales suite & client desk</div><h1>The Perfect Blend of Serenity and Luxury</h1><p>High-velocity portfolio intelligence for relationship directors, executive sales partners, and high-net-worth real-estate advisors.</p></div><div class="login-feature-row"><div class="login-feature"><strong>210+</strong>residences</div><div class="login-feature"><strong>35</strong>serviced suites</div><div class="login-feature"><strong>10%</strong>instant allotment</div></div></div></section><section class="login-form-wrap"><form class="login-form" id="login-form"><div class="login-form-brand"><div class="brand-mark">A</div><div><div class="brand-title">Aureum Sales CRM</div><div class="brand-subtitle">Internal operations portal</div></div></div><div class="eyebrow">⌁ Secure workspace</div><h2>Welcome Back</h2><p class="page-subtitle" style="margin-bottom:24px">Sign in to manage leads, agents, visits, and bookings.</p><div class="form-field"><label>Work Email or Phone</label><input id="userIdentifier" required value="advisor@aureum.com" placeholder="Aureum ID / Mobile" /></div><div class="form-field"><label>Security Password <a class="link-gold" href="#">Forgot Key?</a></label><div class="password-field"><input id="userPassword" required value="Aureum123!" type="password" placeholder="Enter your secure password" /><button class="password-toggle" type="button" aria-label="Toggle password visibility" data-toggle-password>◉</button></div></div><div class="form-help"><label class="checkbox"><input type="checkbox" checked /> Remember terminal for 30 days</label><span class="secure-sso">◈ Secure SSO</span></div>${state.loginError ? `<div class="login-error">${state.loginError}</div>` : ''}<button class="btn btn-primary" type="submit">${icons.lock} Login to Sales Desk</button><div class="login-routing"><strong>⌁ Automated role routing</strong><span>Verified sessions map directly to designated permission gates: <b>Super Admin</b>, <b>Sales Manager</b>, or <b>Relationship Officer</b>.</span></div><p class="demo-note">Demo accounts: admin@aureum.com · manager@aureum.com · advisor@aureum.com / agent@aureum.com<br/>Password for all demo accounts: <strong>Aureum123!</strong></p><div class="login-security">⌁ 256-bit TLS encrypted · © 2026 Aureum Mall & Residences</div></form></section></div>`;
}

function render() {
  if (!state.ready) { app.innerHTML = '<div class="loading-screen"><div class="brand-mark">A</div><div>Loading secure workspace…</div></div>'; return; }
  if (!state.authUser || state.screen === 'login') { app.innerHTML = renderLogin(); bind(); return; }
  if (state.screen !== 'unauthorized' && !canAccess(state.screen)) { state.deniedPath = state.screen; state.screen = 'unauthorized'; }
  if (state.screen === 'unauthorized') { app.innerHTML = layout(renderAccessDenied()); bind(); return; }
  let content = renderDashboard();
  if (state.screen === 'leads') content = renderLeads(false);
  if (state.screen === 'my-leads') content = renderLeads(true);
  if (state.screen === 'add-lead') content = renderAddLead();
  if (state.screen === 'customers') content = renderCustomers();
  if (state.screen === 'follow-ups') content = renderFollowups();
  if (state.screen === 'team-chat') content = renderChat();
  if (state.screen === 'reports') content = renderReports();
  if (state.screen === 'agents') content = renderAgents();
  if (state.screen === 'settings') content = renderSettings();
  app.innerHTML = layout(content);
  bind();
}

async function logout() {
  await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  state.authUser = null; state.userMenu = false; state.screen = 'login'; state.ready = true; render();
}

function baseBind() {
  document.querySelectorAll('[data-screen]').forEach(el => el.addEventListener('click', () => navigate(el.dataset.screen)));
  document.querySelectorAll('[data-drawer]').forEach(el => el.addEventListener('click', () => { state.drawer = el.dataset.drawer; state.drawerName = el.dataset.name || ''; render(); }));
  document.querySelectorAll('[data-close-drawer]').forEach(el => el.addEventListener('click', () => { state.drawer = null; render(); }));
  document.querySelectorAll('[data-toast]').forEach(el => el.addEventListener('click', () => showToast(el.dataset.toast)));
  document.querySelectorAll('[data-channel]').forEach(el => el.addEventListener('click', () => { state.selectedChannel = el.dataset.channel; render(); }));
  document.querySelectorAll('[data-user-menu]').forEach(el => el.addEventListener('click', () => { state.userMenu = !state.userMenu; render(); }));
  document.querySelectorAll('[data-logout]').forEach(el => el.addEventListener('click', logout));
  const login = document.querySelector('#login-form');
  if (login) login.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fields = login.querySelectorAll('input');
    state.loginError = '';
    try {
      const result = await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ identifier: fields[0].value, password: fields[1].value }) });
      state.authUser = result.user; state.role = result.user.role.toUpperCase(); state.screen = 'dashboard'; state.ready = true; render(); showToast('Welcome to the Aureum workspace');
    } catch (error) { state.loginError = error.message; render(); }
  });
  const send = document.querySelector('[data-send-chat]');
  if (send) send.addEventListener('click', () => { const input = document.querySelector('#chat-input'); if (input && input.value.trim()) { showToast('Message sent to #' + state.selectedChannel); input.value = ''; } });
}

async function boot() {
  const requestedScreen = screenForPath[window.location.pathname] || 'dashboard';
  try { const result = await apiFetch('/api/auth/me'); state.authUser = result.user; state.role = result.user.role.toUpperCase(); state.screen = requestedScreen; }
  catch { state.authUser = null; state.screen = 'login'; }
  state.ready = true;
  render();
}

window.addEventListener('popstate', () => {
  if (!state.authUser) { state.screen = 'login'; render(); return; }
  state.screen = screenForPath[window.location.pathname] || 'dashboard';
  render();
});

boot();

// Follow-up and customer interaction layer for the local CRM prototype.
const followupTypes = ['Call', 'WhatsApp', 'Email', 'Payment Plan Follow-up', 'Booking Follow-up', 'Site Visit Reminder', 'General Follow-up'];
const followupStatuses = ['All', 'Pending', 'Completed', 'Overdue', 'Missed', 'Rescheduled', 'Cancelled'];

function followupDateLabel(date, time) {
  if (!date) return 'Not scheduled';
  const parsed = new Date(`${date}T${time || '00:00'}:00`);
  if (Number.isNaN(parsed.getTime())) return `${date} · ${time || ''}`;
  return parsed.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function followupDateMatches(item, filter) {
  if (filter === 'all') return true;
  if (filter === 'overdue') return item.status === 'Overdue';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(`${item.due_date}T00:00:00`);
  if (filter === 'today') return d.toDateString() === today.toDateString();
  if (filter === 'tomorrow') { const target = new Date(today); target.setDate(target.getDate() + 1); return d.toDateString() === target.toDateString(); }
  if (filter === 'week') { const end = new Date(today); end.setDate(end.getDate() + 7); return d >= today && d < end; }
  if (filter === 'month') return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  return true;
}

async function loadFollowups() {
  if (!state.authUser) return;
  state.followups = { loading: true, error: '', items: state.followups.items || [] };
  render();
  try {
    const endpoint = state.role === 'SALES_AGENT' ? '/api/follow-ups/my' : '/api/follow-ups';
    const result = await apiFetch(endpoint);
    state.followups = { loading: false, error: '', items: result.data || [] };
  } catch (error) { state.followups = { loading: false, error: error.message, items: [] }; }
  render();
}

function followupTable(items) {
  if (!items.length) return '<div class="empty-state"><strong>No follow-ups in this view</strong>Try another date or status filter, or schedule a new client touchpoint.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Customer</th><th>Type</th><th>Advisor</th><th>Lead status</th><th>Due date / time</th><th>Priority</th><th>Status</th><th>Actions</th></tr></thead><tbody>${items.map(item => `<tr><td>${person(item.customer, customerInitials(item.customer), item.phone)}</td><td><b>${item.type}</b><div class="person-meta">${item.notes || 'No note added'}</div></td><td>${item.agent}</td><td>${badge(item.lead_status || 'Active')}</td><td>${followupDateLabel(item.due_date, item.due_time)}</td><td>${badge(item.priority)}</td><td>${badge(item.status)}</td><td><div class="header-actions"><button class="table-action" data-followup-open="${item.id}">Open</button>${!['Completed', 'Cancelled'].includes(item.status) ? `<button class="table-action" data-followup-complete="${item.id}">Done</button>` : ''}<button class="table-action" data-followup-customer="${item.customer_id}">Customer</button></div></td></tr>`).join('')}</tbody></table></div>`;
}

function renderFollowups() {
  const all = state.followups.items || [];
  const visible = all.filter(item => (state.followupTab === 'all' || item.status === state.followupTab) && followupDateMatches(item, state.followupDateFilter));
  const today = all.filter(item => followupDateMatches(item, 'today') && !['Completed', 'Cancelled'].includes(item.status)).length;
  const overdue = all.filter(item => item.status === 'Overdue').length;
  const completed = all.filter(item => item.status === 'Completed').length;
  const missed = all.filter(item => item.status === 'Missed').length;
  const upcoming = all.filter(item => ['Pending', 'Rescheduled'].includes(item.status) && !followupDateMatches(item, 'overdue')).length;
  const dateButtons = [['all', 'All dates'], ['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'This week'], ['month', 'This month'], ['overdue', 'Overdue']];
  const error = state.followups.error ? `<div class="empty-state"><strong>Unable to load follow-ups</strong>${state.followups.error}<br/><button class="btn btn-secondary btn-sm" data-reload-followups>Retry</button></div>` : '';
  return pageHeader('Daily rhythm', 'Follow-ups', 'Protect the next conversation with a clear owner, due time, priority, and outcome.', '<button class="btn btn-secondary" data-toast="Calendar view is ready for the next release">Calendar view</button><button class="btn btn-gold" data-create-followup>+ Schedule follow-up</button>') + `<section class="grid grid-4">${kpi('Today', String(today), 'Due now', today ? 'down' : 'up')} ${kpi('Overdue', String(overdue), overdue ? 'Action required' : 'Clear', overdue ? 'down' : 'up')} ${kpi('Upcoming', String(upcoming), 'Pending touchpoints')} ${kpi('Completed', String(completed), '+14%')} </section><section class="grid grid-2" style="margin-top:18px">${kpi('Missed', String(missed), missed ? 'Needs recovery' : 'None', missed ? 'down' : 'up')} ${kpi('Total follow-ups', String(all.length), state.role === 'SALES_AGENT' ? 'Assigned to me' : 'Permitted scope')}</section><section class="card table-card" style="margin-top:18px"><div class="tabs">${dateButtons.map(([id, label]) => `<button class="tab ${state.followupDateFilter === id ? 'active' : ''}" data-followup-date="${id}">${label}</button>`).join('')}</div><div class="tabs">${followupStatuses.map(status => `<button class="tab ${state.followupTab === status.toLowerCase() ? 'active' : ''}" data-followup-status="${status.toLowerCase()}">${status}</button>`).join('')}</div><div class="filter-bar"><div class="search-box">${icons.search}<input data-followup-search placeholder="Search customer, phone, advisor, or note" /></div><select class="select" data-followup-type><option value="">All types</option>${followupTypes.map(type => `<option>${type}</option>`).join('')}</select><select class="select" data-followup-priority><option value="">All priorities</option><option>High</option><option>Medium</option><option>Low</option></select><button class="btn btn-secondary btn-sm" data-reload-followups>Refresh</button></div>${state.followups.loading ? '<div class="empty-state"><strong>Loading follow-up rhythm</strong>Syncing the permitted schedule…</div>' : error || followupTable(visible)}</section>`;
}

function followupCustomerOptions() {
  const items = state.customers.items?.length ? state.customers.items : leadRows.slice(0, 5).map((item, index) => ({ id: `customer_${String(index + 1).padStart(3, '0')}`, full_name: item.name, phone: item.meta.split(' · ')[0] }));
  return items.map(item => `<option value="${item.id}">${item.full_name} · ${item.phone || ''}</option>`).join('');
}

function renderFollowupDrawer() {
  if (state.drawer === 'create-followup') return `<div class="drawer-backdrop" data-close-drawer></div><aside class="drawer"><div class="drawer-header"><div><div class="eyebrow">New commitment</div><h2>Schedule follow-up</h2><p class="page-subtitle">Create a dated next action for a permitted customer.</p></div><button class="drawer-close" data-close-drawer>${icons.close}</button></div><form id="create-followup-form"><div class="drawer-section"><div class="form-field"><label>Customer</label><select name="customer_id" required>${followupCustomerOptions()}</select></div><div class="form-grid"><div class="form-field"><label>Type</label><select name="follow_up_type">${followupTypes.map(type => `<option>${type}</option>`).join('')}</select></div><div class="form-field"><label>Priority</label><select name="priority"><option>High</option><option selected>Medium</option><option>Low</option></select></div><div class="form-field"><label>Due date</label><input name="due_date" type="date" required value="${new Date().toISOString().slice(0, 10)}" /></div><div class="form-field"><label>Due time</label><input name="due_time" type="time" required value="10:00" /></div><div class="form-field full"><label>Notes</label><textarea name="notes" rows="4" placeholder="What should happen next?"></textarea></div></div></div><div class="drawer-section"><button class="btn btn-gold" type="submit">Schedule follow-up</button></div></form></aside>`;
  const detail = state.followupDetail;
  if (!detail) return `<div class="drawer-backdrop" data-close-drawer></div><aside class="drawer"><div class="drawer-header"><div><div class="eyebrow">Follow-up detail</div><h2>Loading…</h2></div><button class="drawer-close" data-close-drawer>${icons.close}</button></div><div class="empty-state">Loading the permitted follow-up…</div></aside>`;
  if (detail.error) return `<div class="drawer-backdrop" data-close-drawer></div><aside class="drawer"><div class="drawer-header"><div><div class="eyebrow">Protected follow-up</div><h2>Access denied</h2></div><button class="drawer-close" data-close-drawer>${icons.close}</button></div><div class="empty-state"><strong>${detail.error}</strong></div></aside>`;
  const f = detail.data;
  const activity = (detail.activity || []).map(item => `<div class="timeline-item"><div class="timeline-dot"></div><div><div class="timeline-title">${item.activity_type}</div><div class="timeline-copy">${item.description}</div><div class="timeline-time">${item.created_at}</div></div></div>`).join('') || '<div class="empty-state">No activity recorded yet.</div>';
  let actionForm = '';
  if (state.followupMode === 'reschedule') actionForm = `<form id="reschedule-followup-form" class="drawer-section"><div class="form-grid"><div class="form-field"><label>New date</label><input name="due_date" type="date" value="${f.due_date}" required /></div><div class="form-field"><label>New time</label><input name="due_time" type="time" value="${f.due_time}" required /></div><div class="form-field full"><label>Reason</label><textarea name="reason" rows="3" required placeholder="Why is this moving?"></textarea></div></div><button class="btn btn-gold" type="submit">Reschedule</button></form>`;
  if (state.followupMode === 'complete') actionForm = `<form id="complete-followup-form" class="drawer-section"><div class="form-field"><label>Completion note</label><textarea name="completion_note" rows="3" required placeholder="What happened on the call or visit?"></textarea></div><div class="form-field"><label>Customer response</label><input name="customer_response" placeholder="Optional response or objection" /></div><div class="form-grid"><div class="form-field"><label>Next date</label><input name="next_due_date" type="date" /></div><div class="form-field"><label>Next time</label><input name="next_due_time" type="time" /></div></div><button class="btn btn-gold" type="submit">Mark completed</button></form>`;
  return `<div class="drawer-backdrop" data-close-drawer></div><aside class="drawer"><div class="drawer-header"><div><div class="eyebrow">Follow-up detail</div><h2>${f.customer}</h2><p class="page-subtitle">${badge(f.status)} · ${f.type} · ${f.agent}</p></div><button class="drawer-close" data-close-drawer>${icons.close}</button></div><div class="drawer-section"><div class="header-actions"><button class="btn btn-gold btn-sm" data-followup-complete="${f.id}">${icons.phone} Mark done</button><button class="btn btn-secondary btn-sm" data-followup-reschedule="${f.id}">Reschedule</button><button class="btn btn-secondary btn-sm" data-followup-missed="${f.id}">Mark missed</button></div></div><div class="drawer-section"><div class="detail-grid"><div><div class="detail-label">Phone</div><div class="detail-value">${f.phone}</div></div><div><div class="detail-label">Due</div><div class="detail-value">${followupDateLabel(f.due_date, f.due_time)}</div></div><div><div class="detail-label">Priority</div><div class="detail-value">${badge(f.priority)}</div></div><div><div class="detail-label">Lead status</div><div class="detail-value">${badge(f.lead_status || 'Active')}</div></div></div><div class="timeline-copy" style="margin-top:16px">${f.notes || 'No note added.'}</div></div>${actionForm}<div class="drawer-section"><h3>Activity history</h3><div class="timeline" style="margin-top:15px">${activity}</div></div></aside>`;
}

function openFollowup(id) {
  state.drawer = 'followup'; state.followupDetail = null; state.followupMode = ''; render();
  apiFetch(`/api/follow-ups/${id}`).then(result => { state.followupDetail = result; render(); }).catch(error => { state.followupDetail = { error: error.message }; render(); });
}

async function refreshFollowupDetail() {
  if (state.followupDetail?.data?.id) state.followupDetail = await apiFetch(`/api/follow-ups/${state.followupDetail.data.id}`).catch(error => ({ error: error.message }));
  await loadFollowups();
}

function renderDrawer() {
  if (state.drawer === 'customer') return renderCustomerDrawer();
  if (state.drawer === 'followup' || state.drawer === 'create-followup') return renderFollowupDrawer();
  return legacyRenderDrawer();
}

function navigate(screen) {
  if (routePaths[screen]) window.history.pushState({}, '', routePaths[screen]);
  if (!canAccess(screen)) { state.drawer = null; state.deniedPath = screen; state.screen = 'unauthorized'; }
  else { state.drawer = null; state.screen = screen; }
  render();
  if (screen === 'customers') loadCustomers();
  if (screen === 'follow-ups') loadFollowups();
}

function baseBind() {
  document.querySelectorAll('[data-screen]').forEach(el => el.addEventListener('click', () => navigate(el.dataset.screen)));
  document.querySelectorAll('[data-drawer]').forEach(el => el.addEventListener('click', () => { state.drawer = el.dataset.drawer; state.drawerName = el.dataset.name || ''; render(); }));
  document.querySelectorAll('[data-close-drawer]').forEach(el => el.addEventListener('click', () => { state.drawer = null; state.followupMode = ''; render(); }));
  document.querySelectorAll('[data-toast]').forEach(el => el.addEventListener('click', () => showToast(el.dataset.toast)));
  document.querySelectorAll('[data-user-menu]').forEach(el => el.addEventListener('click', () => { state.userMenu = !state.userMenu; render(); }));
  document.querySelectorAll('[data-logout]').forEach(el => el.addEventListener('click', logout));
  document.querySelectorAll('[data-channel]').forEach(el => el.addEventListener('click', () => { state.selectedChannel = el.dataset.channel; render(); }));
  document.querySelectorAll('[data-customer-id]').forEach(el => el.addEventListener('click', () => openCustomer(el.dataset.customerId)));
  document.querySelectorAll('[data-reload-customers]').forEach(el => el.addEventListener('click', loadCustomers));
  document.querySelectorAll('[data-customer-tab]').forEach(el => el.addEventListener('click', () => { state.customerTab = el.dataset.customerTab; render(); }));
  document.querySelectorAll('[data-customer-toast]').forEach(el => el.addEventListener('click', () => showToast(el.dataset.customerToast)));
  document.querySelectorAll('[data-followup-date]').forEach(el => el.addEventListener('click', () => { state.followupDateFilter = el.dataset.followupDate; render(); }));
  document.querySelectorAll('[data-followup-status]').forEach(el => el.addEventListener('click', () => { state.followupTab = el.dataset.followupStatus; render(); }));
  document.querySelectorAll('[data-reload-followups]').forEach(el => el.addEventListener('click', loadFollowups));
  document.querySelectorAll('[data-create-followup]').forEach(el => el.addEventListener('click', () => { state.drawer = 'create-followup'; render(); }));
  document.querySelectorAll('[data-followup-open]').forEach(el => el.addEventListener('click', () => openFollowup(el.dataset.followupOpen)));
  document.querySelectorAll('[data-followup-customer]').forEach(el => el.addEventListener('click', () => openCustomer(el.dataset.followupCustomer)));
  document.querySelectorAll('[data-followup-reschedule]').forEach(el => el.addEventListener('click', () => { state.followupMode = 'reschedule'; render(); }));
  document.querySelectorAll('[data-followup-missed]').forEach(el => el.addEventListener('click', async () => { await apiFetch(`/api/follow-ups/${el.dataset.followupMissed}/missed`, { method: 'PATCH', body: JSON.stringify({ reason: 'Marked missed from workspace' }) }); state.followupMode = ''; await refreshFollowupDetail(); }));
  document.querySelectorAll('[data-followup-complete]').forEach(el => el.addEventListener('click', async () => { if (state.drawer === 'followup') { state.followupMode = 'complete'; render(); return; } await apiFetch(`/api/follow-ups/${el.dataset.followupComplete}/complete`, { method: 'PATCH', body: JSON.stringify({ completion_note: 'Completed from follow-up list' }) }); await loadFollowups(); }));
  const createForm = document.querySelector('#create-followup-form');
  if (createForm) createForm.addEventListener('submit', async event => { event.preventDefault(); const data = Object.fromEntries(new FormData(createForm).entries()); try { await apiFetch('/api/follow-ups', { method: 'POST', body: JSON.stringify(data) }); state.drawer = null; state.followupMode = ''; await loadFollowups(); showToast('Follow-up scheduled'); } catch (error) { showToast(error.message); } });
  const rescheduleForm = document.querySelector('#reschedule-followup-form');
  if (rescheduleForm) rescheduleForm.addEventListener('submit', async event => { event.preventDefault(); const data = Object.fromEntries(new FormData(rescheduleForm).entries()); try { await apiFetch(`/api/follow-ups/${state.followupDetail.data.id}/reschedule`, { method: 'PATCH', body: JSON.stringify(data) }); state.followupMode = ''; await refreshFollowupDetail(); } catch (error) { showToast(error.message); } });
  const completeForm = document.querySelector('#complete-followup-form');
  if (completeForm) completeForm.addEventListener('submit', async event => { event.preventDefault(); const data = Object.fromEntries(new FormData(completeForm).entries()); try { await apiFetch(`/api/follow-ups/${state.followupDetail.data.id}/complete`, { method: 'PATCH', body: JSON.stringify(data) }); state.followupMode = ''; await refreshFollowupDetail(); } catch (error) { showToast(error.message); } });
  const noteForm = document.querySelector('#customer-note-form');
  if (noteForm) noteForm.addEventListener('submit', async event => { event.preventDefault(); const data = Object.fromEntries(new FormData(noteForm).entries()); try { await apiFetch(`/api/customers/${state.customerId}/notes`, { method: 'POST', body: JSON.stringify(data) }); const result = await apiFetch(`/api/customers/${state.customerId}`); state.customerDetail = result; showToast('Customer note saved'); } catch (error) { showToast(error.message); } render(); });
  const customerFollowupForm = document.querySelector('#customer-followup-form');
  if (customerFollowupForm) customerFollowupForm.addEventListener('submit', async event => { event.preventDefault(); const data = Object.fromEntries(new FormData(customerFollowupForm).entries()); try { await apiFetch(`/api/customers/${state.customerId}/follow-ups`, { method: 'POST', body: JSON.stringify(data) }); const result = await apiFetch(`/api/customers/${state.customerId}`); state.customerDetail = result; showToast('Customer follow-up scheduled'); } catch (error) { showToast(error.message); } render(); });
  const login = document.querySelector('#login-form');
  if (login) login.addEventListener('submit', async event => { event.preventDefault(); const fields = login.querySelectorAll('input'); state.loginError = ''; try { const result = await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ identifier: fields[0].value, password: fields[1].value }) }); state.authUser = result.user; state.role = result.user.role.toUpperCase(); state.screen = 'dashboard'; state.ready = true; render(); if (typeof loadDashboard === 'function') loadDashboard(); showToast('Welcome to the Aureum workspace'); } catch (error) { state.loginError = error.message; render(); } });
  const passwordToggle = document.querySelector('[data-toggle-password]');
  if (passwordToggle) passwordToggle.addEventListener('click', () => { const password = document.querySelector('#userPassword'); if (!password) return; password.type = password.type === 'password' ? 'text' : 'password'; passwordToggle.textContent = password.type === 'password' ? '◉' : '◌'; });
  const send = document.querySelector('[data-send-chat]');
  if (send) send.addEventListener('click', () => { const input = document.querySelector('#chat-input'); if (input && input.value.trim()) { showToast('Message sent to #' + state.selectedChannel); input.value = ''; } });
}

async function boot() {
  const requestedScreen = screenForPath[window.location.pathname] || 'dashboard';
  try { const result = await apiFetch('/api/auth/me'); state.authUser = result.user; state.role = result.user.role.toUpperCase(); state.screen = requestedScreen; }
  catch { state.authUser = null; state.screen = 'login'; }
  state.ready = true;
  render();
  if (state.authUser && state.screen === 'customers') loadCustomers();
  if (state.authUser && state.screen === 'follow-ups') loadFollowups();
}

async function loadDashboard() {
  if (!state.authUser) return;
  state.dashboard = { loading: true, error: '', data: state.dashboard.data };
  render();
  try {
    const names = ['summary', 'lead-inflow', 'lead-sources', 'follow-up-performance', 'conversion-overview', 'recent-leads', 'today-follow-ups'];
    const entries = await Promise.all(names.map(name => apiFetch(`/api/dashboard/${name}`)));
    const data = Object.fromEntries(names.map((name, index) => [name === 'lead-inflow' ? 'leadInflow' : name === 'lead-sources' ? 'leadSources' : name === 'follow-up-performance' ? 'followUpPerformance' : name === 'conversion-overview' ? 'conversionOverview' : name === 'recent-leads' ? 'recentLeads' : name === 'today-follow-ups' ? 'todayFollowUps' : 'summary', entries[index].data]));
    if (state.role !== 'SALES_AGENT') data.agentPerformance = (await apiFetch('/api/dashboard/agent-performance')).data;
    state.dashboard = { loading: false, error: '', data };
  } catch (error) { state.dashboard = { loading: false, error: error.message, data: null }; }
  render();
}

function dashboardSourceRows(items) {
  return (items || []).map((item, index) => `<div class="source-row"><span class="source-name"><i style="background:${['#b6904f', '#e4c782', '#765c3a', '#d8cbb7', '#a98654'][index % 5]}"></i>${item.name}</span><b>${item.value}%</b></div>`).join('');
}

function renderDashboard() {
  const data = state.dashboard.data;
  if (state.dashboard.loading && !data) return pageHeader('Aureum Mall & Residences', 'Loading command center', 'Syncing the dashboard for your permitted scope.') + '<div class="card empty-state"><strong>Loading dashboard data</strong>Preparing your role-aware sales view…</div>';
  if (state.dashboard.error && !data) return pageHeader('Aureum Mall & Residences', 'Dashboard unavailable', 'The workspace could not load the latest metrics.') + `<div class="card empty-state"><strong>${state.dashboard.error}</strong><button class="btn btn-secondary" data-reload-dashboard>Retry</button></div>`;
  const summary = data?.summary || {};
  const isAgent = state.role === 'SALES_AGENT';
  const actions = isAgent ? '<button class="btn btn-secondary" data-screen="my-leads">My leads →</button><button class="btn btn-gold" data-screen="follow-ups">View follow-ups</button>' : `<button class="btn btn-secondary" data-screen="reports">View reports ${icons.arrow}</button><button class="btn btn-gold" data-screen="${state.role === 'SALES_MANAGER' ? 'add-lead' : 'leads'}">${state.role === 'SALES_MANAGER' ? '+ Add new lead' : 'View all leads'}</button>`;
  const inflow = data?.leadInflow || [];
  const maxInflow = Math.max(...inflow, 1);
  const recent = (data?.recentLeads || []).map(item => ({ name: item.name, initials: item.initials, meta: `${item.source} · ${item.created}`, interest: item.interest, budget: '', source: item.source, agent: item.agent, status: item.status, next: item.created, contacted: item.created }));
  return pageHeader(data?.scopeLabel || (isAgent ? 'My workspace · Personal overview' : 'Aureum Mall & Residences · Executive view'), `Welcome back, ${roleLabels[state.role]}`, isAgent ? 'Your assigned pipeline, customer relationships, and next actions in one focused view.' : 'Track permitted leads, follow-ups, customers, and sales performance from one calm command center.', actions) + `<section class="grid grid-4">${kpi(isAgent ? 'My leads' : 'Total leads', summary.totalLeads ?? '—', isAgent ? 'Assigned scope' : 'Permitted scope')} ${kpi(isAgent ? 'My new leads' : 'New leads', summary.newLeads ?? '—', 'Current pipeline')} ${kpi(isAgent ? 'My hot leads' : 'Hot leads', summary.hotLeads ?? '—', 'High intent')} ${kpi(isAgent ? 'Follow-ups today' : 'Follow-ups due', summary.followUpsDue ?? '—', `${summary.overdueFollowUps ?? 0} overdue`, 'down')}</section><section class="grid grid-2" style="margin-top:18px"><div class="card chart-card"><div class="section-title"><div><h3>Lead inflow trend</h3><p>Role-filtered inquiry velocity</p></div><span class="section-link">Last 12 months</span></div><div class="bar-chart">${inflow.map((value, index) => `<div class="bar-group"><div class="bar alt" style="height:${Math.max(18, (value / maxInflow) * 75)}%"></div><div class="bar" style="height:${Math.max(24, (value / maxInflow) * 100)}%"></div></div>`).join('')}</div><div class="bar-labels"><span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span><span>Oct</span><span>Nov</span><span>Dec</span></div></div><div class="card chart-card"><div class="section-title"><div><h3>Lead sources</h3><p>Visible acquisition channels</p></div></div><div class="donut-wrap"><div style="position:relative"><div class="donut"></div><div class="donut-label"><strong>${summary.totalLeads ?? '—'}</strong><span>${isAgent ? 'My leads' : 'Visible leads'}</span></div></div><div class="source-list">${dashboardSourceRows(data?.leadSources)}</div></div></div></section><section class="grid grid-2" style="margin-top:18px"><div class="card chart-card"><div class="section-title"><div><h3>Follow-up performance</h3><p>Current workload and outcomes</p></div></div>${(data?.followUpPerformance || []).map(item => `<div class="progress-row"><span>${item.name}</span><div class="progress-track"><div class="progress-value" style="width:${Math.min(100, item.value * 4)}%;background:${item.name === 'Overdue' || item.name === 'Missed' ? 'var(--red)' : item.name === 'Completed' ? 'var(--green)' : 'var(--gold)'}"></div></div><b>${item.value}</b></div>`).join('')}</div>${!isAgent ? `<div class="card chart-card"><div class="section-title"><div><h3>Agent performance</h3><p>${state.role === 'SALES_MANAGER' ? 'Team advisor benchmark' : 'Company advisor benchmark'}</p></div><span class="section-link" data-screen="reports">Leaderboard ${icons.arrow}</span></div>${(data?.agentPerformance || []).map(item => `<div class="progress-row"><span>${item.name}</span><div class="progress-track"><div class="progress-value" style="width:${parseFloat(item.conversion) * 4}%"></div></div><b>${item.conversion}</b></div>`).join('')}</div>` : `<div class="card chart-card"><div class="section-title"><div><h3>Conversion overview</h3><p>Your lead movement</p></div></div>${(data?.conversionOverview || []).slice(-5).map(item => `<div class="progress-row"><span>${item.name}</span><div class="progress-track"><div class="progress-value" style="width:${Math.min(100, item.value)}%"></div></div><b>${item.value}</b></div>`).join('')}</div>`}</section><section class="two-col" style="margin-top:18px"><div class="card table-card"><div class="table-head"><div><h3>Recent leads</h3><p class="page-subtitle">Latest permitted inquiries</p></div><button class="section-link" data-screen="${isAgent ? 'my-leads' : 'leads'}">View all ${icons.arrow}</button></div>${recent.length ? leadTable(recent, false) : '<div class="empty-state">No recent leads in your scope.</div>'}</div><div class="card card-pad"><div class="section-title"><div><h3>Today’s follow-ups</h3><p>${isAgent ? 'Your scheduled touchpoints' : 'Scheduled team touchpoints'}</p></div><button class="section-link" data-screen="follow-ups">View all</button></div><div class="timeline">${(data?.todayFollowUps || []).map(item => `<div class="timeline-item"><div class="timeline-dot" style="background:${item.status === 'Overdue' ? 'var(--red)' : item.status === 'Completed' ? 'var(--green)' : 'var(--gold)'}"></div><div><div class="timeline-title">${item.time} · ${item.customer}</div><div class="timeline-copy">${item.type} · ${item.agent}</div><div class="timeline-time">${badge(item.status)}</div></div></div>`).join('') || '<div class="empty-state">No follow-ups for today.</div>'}</div></div></section>`;
}

async function loadLeads(my = false) {
  if (!state.authUser) return;
  state.leads = { loading: true, error: '', items: state.leads.items || [] }; render();
  try { const result = await apiFetch(my ? '/api/leads/my' : '/api/leads'); state.leads = { loading: false, error: '', items: result.data || [] }; }
  catch (error) { state.leads = { loading: false, error: error.message, items: [] }; }
  render();
}

function liveLeadTable(items, my) {
  if (!items.length) return '<div class="empty-state"><strong>No leads found</strong>Try another status, source, or search term.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Lead & contact</th><th>Interest & budget</th><th>Source</th><th>Advisor</th><th>Status</th><th>Next follow-up</th><th>Action</th></tr></thead><tbody>${items.map(item => `<tr><td>${person(item.full_name, customerInitials(item.full_name), item.meta)}</td><td><b>${item.interest}</b><div class="person-meta">${item.budget || 'Budget pending'}</div></td><td>${item.source}</td><td>${item.agent}</td><td>${badge(item.status)}</td><td>${item.next || 'Not scheduled'}</td><td><button class="table-action" data-lead-open="${item.id}">Open ${icons.arrow}</button>${my ? ` <button class="table-action" data-lead-note="${item.id}">Note</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderLeads(my = false) {
  const all = state.leads.items || [];
  const q = state.leadFilters.q.toLowerCase();
  const items = all.filter(item => (!state.leadFilters.status || item.status === state.leadFilters.status) && (!state.leadFilters.source || item.source === state.leadFilters.source) && (!q || [item.full_name, item.phone, item.email, item.city].some(value => String(value || '').toLowerCase().includes(q))));
  const title = my ? 'My leads' : 'All leads';
  const statusTabs = ['All', 'New', 'Contacted', 'Qualified', 'Hot', 'Warm', 'Follow-up', 'Visit Scheduled', 'Negotiation', 'Booking', 'Closed Won'];
  const action = !my && state.role !== 'SALES_AGENT' ? '<button class="btn btn-gold" data-screen="add-lead">+ Add new lead</button>' : '';
  const content = state.leads.loading ? '<div class="empty-state"><strong>Loading lead registry</strong>Syncing permitted leads…</div>' : state.leads.error ? `<div class="empty-state"><strong>Unable to load leads</strong>${state.leads.error}<button class="btn btn-secondary btn-sm" data-reload-leads>Retry</button></div>` : liveLeadTable(items, my);
  return pageHeader(my ? 'Assigned pipeline' : 'Aureum private registry', title, my ? 'Keep every assigned relationship moving with clear next actions.' : 'Manage inquiries, ownership, lead status, and next actions.', `<button class="btn btn-secondary" data-reload-leads>Refresh</button>${action}`) + `<section class="grid grid-4">${kpi('Visible leads', String(all.length), my ? 'Assigned scope' : 'Permitted scope')} ${kpi('Hot leads', String(all.filter(item => item.status === 'Hot').length), 'High intent')} ${kpi('Follow-up', String(all.filter(item => item.status === 'Follow-up').length), 'Needs action', 'down')} ${kpi('Closed won', String(all.filter(item => item.status === 'Closed Won').length), 'Conversion')}</section><section class="card table-card" style="margin-top:18px"><div class="tabs">${statusTabs.map(status => `<button class="tab ${state.leadFilters.status === (status === 'All' ? '' : status) ? 'active' : ''}" data-lead-status="${status === 'All' ? '' : status}">${status}</button>`).join('')}</div><div class="filter-bar"><div class="search-box">${icons.search}<input data-lead-search value="${state.leadFilters.q}" placeholder="Search name, phone, email, or city" /></div><select class="select" data-lead-source><option value="">All sources</option>${['Website', 'WhatsApp', 'Facebook', 'Sales Partner', 'Walk-in', 'Referral', 'Manual Entry'].map(source => `<option ${state.leadFilters.source === source ? 'selected' : ''}>${source}</option>`).join('')}</select><button class="btn btn-secondary btn-sm" data-clear-lead-filters>Reset filters</button></div>${content}</section>`;
}

function renderAddLead() {
  return pageHeader('Pipeline intake', 'Add new lead', 'Capture a complete inquiry and route it to the right advisor.', '<button class="btn btn-secondary" data-screen="leads">Cancel</button>') + `<form id="add-lead-form"><section class="grid grid-2"><div class="card card-pad"><div class="section-title"><div><h3>Customer information</h3><p>How should the team reach them?</p></div></div><div class="form-grid"><div class="form-field full"><label>Full name</label><input name="full_name" required placeholder="e.g. Ahmed Khan" /></div><div class="form-field"><label>Phone number</label><input name="phone" required placeholder="0321-..." /></div><div class="form-field"><label>WhatsApp number</label><input name="whatsapp_number" placeholder="Same as phone" /></div><div class="form-field"><label>Email</label><input name="email" type="email" placeholder="client@example.com" /></div><div class="form-field"><label>City</label><input name="city" value="Lahore" /></div><div class="form-field"><label>Area</label><input name="area" placeholder="Bahria Town" /></div><div class="form-field full"><label>Preferred contact method</label><select name="preferred_contact_method"><option>WhatsApp</option><option>Phone call</option><option>Email</option></select></div></div></div><div class="card card-pad"><div class="section-title"><div><h3>Requirement information</h3><p>Shape the opportunity clearly.</p></div></div><div class="form-grid"><div class="form-field"><label>Interested in</label><select name="interested_in" required>${['1 Bed Apartment', '2 Bed Apartment', 'Commercial Shop', 'Corporate Office', 'Food Court Space', 'Hotel Room'].map(item => `<option>${item}</option>`).join('')}</select></div><div class="form-field"><label>Budget</label><input name="budget" placeholder="PKR 25M" /></div><div class="form-field"><label>Property type</label><select name="property_type"><option>Apartment</option><option>Commercial</option><option>Hospitality</option></select></div><div class="form-field"><label>Purpose</label><select name="purpose"><option>Investment</option><option>End use</option><option>Business</option></select></div><div class="form-field"><label>Buying timeline</label><select name="buying_timeline"><option>Within 30 days</option><option>1–3 months</option><option>Exploring</option></select></div><div class="form-field"><label>Financing</label><select name="financing_required"><option value="false">Self-funded</option><option value="true">Financing required</option></select></div><div class="form-field full"><label>Preferred location</label><input name="preferred_location" placeholder="Sector C" /></div></div></div><div class="card card-pad"><div class="section-title"><div><h3>CRM routing</h3><p>Make the next step visible to the team.</p></div></div><div class="form-grid"><div class="form-field"><label>Lead source</label><select name="lead_source">${['Website', 'WhatsApp', 'Facebook', 'Sales Partner', 'Walk-in', 'Referral', 'Manual Entry'].map(item => `<option>${item}</option>`).join('')}</select></div><div class="form-field"><label>Assigned advisor</label><select name="assigned_agent_id"><option value="usr_003">Ali Raza</option><option value="usr_002">Sales Manager</option></select></div><div class="form-field"><label>Status</label><select name="status"><option>New</option><option>Contacted</option><option>Hot</option><option>Follow-up</option></select></div><div class="form-field"><label>Next follow-up date</label><input name="next_follow_up_at" type="date" /></div><div class="form-field full"><label>Notes</label><textarea name="notes" rows="5" placeholder="Add context for the advisor…"></textarea></div></div><button class="btn btn-gold" type="submit">Save lead</button></div><div class="card card-pad"><div class="section-title"><div><h3>Intake guidance</h3><p>Make every handoff useful.</p></div></div><div class="timeline-copy">Capture the client’s primary motivation, who is involved in the decision, and the next promised action. High-value inquiries should leave intake with a named advisor and a dated follow-up.</div></div></section></form>`;
}
