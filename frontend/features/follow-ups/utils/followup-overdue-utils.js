(function (root) {
  const timezone = () => root.AureumFollowUpConstants?.timezone || 'Asia/Karachi';
  function zonedNowParts(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone(), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  }
  function toInstant(date, time = '23:59') {
    if (!date) return NaN;
    const value = `${date}T${time || '23:59'}:00+05:00`;
    return new Date(value).getTime();
  }
  function todayInTimezone(now = new Date()) { const p = zonedNowParts(now); return `${p.year}-${p.month}-${p.day}`; }
  function isFollowUpOverdue(item, now = new Date()) { return Boolean(item && ['Pending', 'Overdue', 'Rescheduled', 'Contacted'].includes(item.status || 'Pending') && !item.completed_at && toInstant(item.due_date || item.dueDate, item.due_time || item.dueTime) <= now.getTime()); }
  function getComputedFollowUpStatus(item, now = new Date()) { if (isFollowUpOverdue(item, now)) return 'Overdue'; if (item?.outcome === 'Contacted' && ['Rescheduled','Completed','Contacted'].includes(item.status)) return 'Contacted'; return item?.status === 'Overdue' ? 'Pending' : (item?.status || 'Pending'); }
  function getOverdueFollowUps(items, now = new Date()) { return (items || []).filter(item => isFollowUpOverdue(item, now)); }
  const api = { timezone, zonedNowParts, toInstant, todayInTimezone, isFollowUpOverdue, getComputedFollowUpStatus, getOverdueFollowUps };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AureumFollowUpDateUtils = api;
}(typeof window === 'object' ? window : globalThis));
