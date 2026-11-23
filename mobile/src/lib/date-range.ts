export type DateRangeValue = 'all' | 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_month' | 'custom';

export type DateRangeBounds = { start: string; end: string } | null;

const CRM_TIMEZONE = 'Asia/Karachi';

function parts(value: Date) {
  const formatted = new Intl.DateTimeFormat('en-US', { timeZone: CRM_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  return Object.fromEntries(formatted.map(item => [item.type, item.value]));
}

function dateKey(value: Date) {
  const current = parts(value);
  return `${current.year}-${current.month}-${current.day}`;
}

function utcDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function addDays(value: string, amount: number) {
  const date = utcDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function valid(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = utcDate(value);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function dateRangeBounds(range: DateRangeValue, customStart = '', customEnd = ''): DateRangeBounds {
  if (range === 'all') return null;
  if (range === 'custom') {
    if (!valid(customStart) || !valid(customEnd)) return null;
    return customEnd < customStart ? { start: customEnd, end: customStart } : { start: customStart, end: customEnd };
  }
  const today = dateKey(new Date());
  if (range === 'today') return { start: today, end: today };
  if (range === 'yesterday') { const yesterday = addDays(today, -1); return { start: yesterday, end: yesterday }; }
  if (range === 'this_week') {
    const current = utcDate(today);
    const mondayOffset = (current.getUTCDay() + 6) % 7;
    const start = addDays(today, -mondayOffset);
    return { start, end: addDays(start, 6) };
  }
  const monthStart = `${today.slice(0, 7)}-01`;
  if (range === 'this_month') {
    const nextMonth = new Date(`${monthStart}T00:00:00Z`);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    return { start: monthStart, end: new Date(nextMonth.getTime() - 86400000).toISOString().slice(0, 10) };
  }
  const lastMonthEnd = addDays(monthStart, -1);
  return { start: `${lastMonthEnd.slice(0, 7)}-01`, end: lastMonthEnd };
}

export function dateRangeReady(range: DateRangeValue, customStart = '', customEnd = '') {
  return range !== 'custom' || Boolean(dateRangeBounds(range, customStart, customEnd));
}
