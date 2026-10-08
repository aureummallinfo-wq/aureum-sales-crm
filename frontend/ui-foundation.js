/* Aureum UI Foundation
 * A dependency-free compatibility layer for the current buildless preview.
 * Its contracts mirror the planned shadcn/ui, Radix, TanStack, RHF/Zod,
 * Query, Zustand, Recharts, FullCalendar, Lucide, Sonner, and Motion roles.
 */
(function createAureumUI(global) {
  const svg = (path, label = '') => `<svg class="aureum-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="${label ? 'false' : 'true'}"${label ? ` role="img" aria-label="${label}"` : ''}>${path}</svg>`;
  const paths = {
    search: '<circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path><path d="M10 21h4"></path>',
    calendar: '<rect x="3" y="4" width="18" height="17" rx="2"></rect><path d="M16 2v4M8 2v4M3 10h18"></path>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.8 2.1Z"></path>',
    close: '<path d="M6 6l12 12M18 6 6 18"></path>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"></path>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"></path>',
    user: '<circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path>'
    ,home: '<path d="m3 10 9-7 9 7"></path><path d="M5 9v11h14V9M9 20v-6h6v6"></path>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"></path>',
    message: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"></path>',
    chart: '<path d="M4 19V5M4 19h16"></path><path d="m7 15 3-4 3 2 4-6"></path>',
    settings: '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"></path><path d="m19.4 15 .1.1a2 2 0 1 1-2.8 2.8l-.1-.1a2 2 0 0 0-3.4 1.4v.3a2 2 0 1 1-4 0v-.2A2 2 0 0 0 5.8 18l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A2 2 0 0 0 1.6 12H1.3a2 2 0 1 1 0-4h.2a2 2 0 0 0 1.4-3.4l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A2 2 0 0 0 9.1.4V.2a2 2 0 1 1 4 0v.2a2 2 0 0 0 3.4 1.4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A2 2 0 0 0 20.7 8h.2a2 2 0 1 1 0 4h-.2a2 2 0 0 0-1.3 3Z"></path>',
    plus: '<path d="M12 5v14M5 12h14"></path>'
  };

  const normalizeStatus = value => String(value || '').trim().toLowerCase();
  const badgeClass = value => {
    const status = normalizeStatus(value);
    if (['hot', 'booking', 'vip', 'high'].includes(status)) return 'badge-hot';
    if (['new', 'contacted', 'visit', 'active'].includes(status)) return 'badge-new';
    if (['warm', 'follow-up', 'medium', 'pending', 'rescheduled'].includes(status)) return 'badge-follow';
    if (['closed', 'completed', 'closed won'].includes(status)) return 'badge-completed';
    if (['overdue', 'missed', 'lost', 'closed lost'].includes(status)) return 'badge-overdue';
    return 'badge-neutral';
  };

  const escape = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const debounce = (callback, wait = 250) => { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => callback(...args), wait); }; };
  const date = {
    isoToday: () => new Date().toISOString().slice(0, 10),
    isOverdue: (dateValue, timeValue, status) => status === 'Pending' && new Date(`${dateValue}T${timeValue || '23:59'}:00`).getTime() < Date.now(),
    format: (dateValue, timeValue) => { const value = new Date(`${dateValue}T${timeValue || '00:00'}:00`); return Number.isNaN(value.getTime()) ? `${dateValue || ''} ${timeValue || ''}`.trim() : value.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  };

  const validation = {
    required: (value, label = 'This field') => String(value || '').trim() ? '' : `${label} is required.`,
    email: value => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? '' : 'Enter a valid email address.',
    phone: value => !value || /^[+\d][\d\s().-]{6,}$/.test(value) ? '' : 'Enter a valid phone number.',
    futureDate: value => !value || value >= date.isoToday() ? '' : 'Choose today or a future date.'
  };

  const table = (rows, { page = 1, pageSize = 10, sortKey = '', direction = 'asc', filter = '' } = {}) => {
    let output = Array.isArray(rows) ? [...rows] : [];
    if (filter) output = output.filter(row => Object.values(row).some(value => String(value || '').toLowerCase().includes(filter.toLowerCase())));
    if (sortKey) output.sort((a, b) => String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? '')) * (direction === 'desc' ? -1 : 1));
    const total = output.length; const start = Math.max(0, (page - 1) * pageSize);
    return { rows: output.slice(start, start + pageSize), total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
  };

  const render = {
    statusBadge: value => `<span class="badge ${badgeClass(value)}">${escape(value)}</span>`,
    statCard: (label, value, foot = '', tone = 'up') => `<div class="card kpi-card"><div class="kpi-label">${escape(label)}</div><div class="kpi-value">${escape(value)}</div><div class="kpi-foot"><span class="trend-${tone}">${escape(foot)}</span></div></div>`,
    empty: (title, copy = '', action = '') => `<div class="empty-state" role="status"><strong>${escape(title)}</strong>${escape(copy)}${action}</div>`,
    loading: (label = 'Loading') => `<div class="empty-state aureum-loading" role="status" aria-live="polite"><span class="skeleton-line"></span><strong>${escape(label)}</strong></div>`,
    error: (title, copy, action = '') => `<div class="empty-state aureum-error" role="alert"><strong>${escape(title)}</strong>${escape(copy)}${action}</div>`
  };

  global.AureumUI = { svg, icon: (name, label = '') => svg(paths[name] || paths.arrow, label), badgeClass, escape, debounce, date, validation, table, render };

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || typeof state === 'undefined' || !state.drawer) return;
    state.drawer = null; state.followupMode = ''; render();
  });
}(window));
