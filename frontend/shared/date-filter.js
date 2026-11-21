(function initializeAureumDateFilter() {
  const CRM_TIMEZONE = 'Asia/Karachi';
  const options = [
    ['all', 'All dates'],
    ['today', 'Today'],
    ['yesterday', 'Yesterday'],
    ['this_week', 'This week'],
    ['this_month', 'This month'],
    ['last_month', 'Last month'],
    ['custom', 'Custom range']
  ];
  const scopeLabels = Object.freeze({
    leads: 'Lead received',
    customers: 'Customer created',
    tasks: 'Due date',
    agents: 'User created'
  });

  function dateParts(value = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: CRM_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date(value));
    return Object.fromEntries(parts.map(part => [part.type, part.value]));
  }

  function today() {
    const parts = dateParts();
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function addDays(value, amount) {
    const date = new Date(`${value}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + amount);
    return date.toISOString().slice(0, 10);
  }

  function bounds(range = 'all', customStart = '', customEnd = '') {
    const current = today();
    if (!range || range === 'all') return { start: '', end: '' };
    if (range === 'today') return { start: current, end: current };
    if (range === 'yesterday') {
      const value = addDays(current, -1);
      return { start: value, end: value };
    }
    if (range === 'this_week') {
      const weekday = new Date(`${current}T00:00:00Z`).getUTCDay();
      const start = addDays(current, -((weekday + 6) % 7));
      return { start, end: addDays(start, 6) };
    }
    if (range === 'this_month') {
      const start = `${current.slice(0, 7)}-01`;
      const nextMonth = new Date(`${start}T00:00:00Z`);
      nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
      nextMonth.setUTCDate(0);
      return { start, end: nextMonth.toISOString().slice(0, 10) };
    }
    if (range === 'last_month') {
      const first = new Date(`${current.slice(0, 7)}-01T00:00:00Z`);
      first.setUTCMonth(first.getUTCMonth() - 1);
      const start = first.toISOString().slice(0, 10);
      const last = new Date(`${current.slice(0, 7)}-01T00:00:00Z`);
      last.setUTCDate(0);
      return { start, end: last.toISOString().slice(0, 10) };
    }
    if (range === 'custom') {
      let start = /^\d{4}-\d{2}-\d{2}$/.test(customStart) ? customStart : '';
      let end = /^\d{4}-\d{2}-\d{2}$/.test(customEnd) ? customEnd : '';
      if (start && end && end < start) [start, end] = [end, start];
      return { start, end };
    }
    return { start: '', end: '' };
  }

  function render(scope, range = 'all', customStart = '', customEnd = '') {
    const selected = options.some(([value]) => value === range) ? range : 'all';
    const label = scopeLabels[scope] || 'Created date';
    const select = `<label class="date-filter-control"><span>${label}</span><select data-date-filter="${scope}" aria-label="Filter by ${label.toLowerCase()}">${options.map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`;
    if (selected !== 'custom') return select;
    return `${select}<label class="date-filter-control"><span>From</span><input type="date" data-date-start="${scope}" value="${customStart || ''}" aria-label="Date range start" /></label><label class="date-filter-control"><span>To</span><input type="date" data-date-end="${scope}" value="${customEnd || ''}" aria-label="Date range end" /></label><button class="btn btn-gold btn-sm" type="button" data-date-apply="${scope}">Apply</button>`;
  }

  function query(range, customStart, customEnd) {
    const result = bounds(range, customStart, customEnd);
    return result.start && result.end ? result : null;
  }

  window.AureumDateFilter = { CRM_TIMEZONE, options, scopeLabels, today, addDays, bounds, render, query };
})();
