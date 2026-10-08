(function () {
  const timezone = () => window.AureumFollowUpConstants?.timezone || 'Asia/Karachi';
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
  function isFollowUpOverdue(item, now = new Date()) { return item && ['Pending', 'Overdue'].includes(item.status) && toInstant(item.due_date || item.dueDate, item.due_time || item.dueTime) < now.getTime(); }
  function getComputedFollowUpStatus(item, now = new Date()) { return isFollowUpOverdue(item, now) ? 'Overdue' : (item?.status || 'Pending'); }
  function getOverdueFollowUps(items, now = new Date()) { return (items || []).filter(item => isFollowUpOverdue(item, now)); }
  window.AureumFollowUpDateUtils = { timezone, zonedNowParts, toInstant, todayInTimezone, isFollowUpOverdue, getComputedFollowUpStatus, getOverdueFollowUps };
}());
