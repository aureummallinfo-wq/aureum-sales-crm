(function () {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  function fields({ contacted = false, callNote = false } = {}) {
    return `<div class="form-field"><label>${callNote ? 'Call note / customer response' : 'Note'}<textarea name="note" rows="4" maxlength="2000" required placeholder="What did the customer say? What happens next?"></textarea></label></div>
      ${contacted ? '<input type="hidden" name="customer_contacted" value="true" />' : '<div class="form-field"><label>Activity type<select name="customer_contacted"><option value="false">Internal note</option><option value="true">Customer contacted</option></select></label></div>'}
      <div class="form-grid"><div class="form-field"><label>Next contact<select name="next_followup_days" data-next-contact><option value="1">Tomorrow</option><option value="2" selected>In 2 days</option><option value="3">In 3 days</option><option value="5">In 5 days</option><option value="7">In 7 days</option><option value="10">In 10 days</option><option value="custom">Choose a date</option><option value="none">No next follow-up</option></select></label></div>
      <div class="form-field" data-next-contact-time><label>Time (Pakistan)<input name="next_due_time" type="time" value="10:00" required /></label></div>
      <div class="form-field" data-next-contact-date hidden><label>Next contact date<input name="next_due_date" type="date" disabled /></label></div></div>
      ${contacted ? '' : '<p class="form-hint">An internal note defers the overdue reminder. Choose Customer contacted to record the call and set the next contact.</p>'}`;
  }
  function activity(item, { dateTimeOnly = false } = {}) {
    const description = item.last_activity_description || item.last_activity || 'No activity yet';
    const instant = item.last_activity_at ? new Date(item.last_activity_at) : null;
    const time = instant && Number.isFinite(instant.getTime()) ? instant.toLocaleString('en-GB',{timeZone:'Asia/Karachi',day:'2-digit',month:'short',...(dateTimeOnly ? { year:'numeric' } : {}),hour:'2-digit',minute:'2-digit'}) : '';
    if (dateTimeOnly) return time ? `<time datetime="${escape(instant.toISOString())}">${escape(time)}</time>` : '—';
    return `<div class="followup-latest-response">${escape(description)}</div><div class="person-meta">${escape([item.last_activity_by,time].filter(Boolean).join(' · '))}</div>`;
  }
  function noteFields() {
    return `<div class="form-field"><label>Note<textarea name="note" rows="4" maxlength="2000" required placeholder="Add a useful detail about this customer."></textarea></label></div><input type="hidden" name="customer_contacted" value="false" /><input type="hidden" name="next_followup_days" value="none" />`;
  }
  function scheduleFields({ dueDate = '', dueTime = '10:00', minDate = '', tag = 'Follow-up', selectedTags } = {}) {
    const tags = window.AureumCRMStatusTags?.values || window.AureumCustomerConstants?.statuses || window.AureumLeadConstants?.statuses || ["New","Contacted","Hot","Cold","Follow-up","Visit Scheduled","Visit Completed","Negotiation","Closed Won","No Response","Not Interested","Invalid"];
    const selected = (Array.isArray(selectedTags) ? selectedTags : [tag]).filter(value => tags.includes(value));
    if (!selected.length) selected.push('Follow-up');
    return `<div class="form-field"><label>Call note / customer response<textarea name="note" rows="4" maxlength="2000" required placeholder="What did the customer say? What happens next?"></textarea></label></div>
      <input type="hidden" name="customer_contacted" value="true" /><input type="hidden" name="next_followup_days" value="custom" />
      <div class="form-grid"><div class="form-field"><label>Next contact date<input name="next_due_date" type="date" value="${escape(dueDate)}" min="${escape(minDate)}" required /></label></div>
      <div class="form-field"><label>Time (Pakistan)<input name="next_due_time" type="time" value="${escape(dueTime)}" required /></label></div></div>
      <div class="form-field"><label>Status tags<select name="followup_tag" class="tag-multi-select" multiple size="6" required aria-describedby="followup-status-tags-help">${tags.map(value => `<option value="${escape(value)}" ${selected.includes(value) ? 'selected' : ''}>${escape(value)}</option>`).join('')}</select></label><small id="followup-status-tags-help" class="form-hint">Select one or more status tags.</small></div>`;
  }
  document.addEventListener('change', event => {
    if (!event.target.matches('[data-next-contact]')) return;
    const form=event.target.closest('form');const custom=event.target.value==='custom';const none=event.target.value==='none';
    const date=form.querySelector('[data-next-contact-date]');const time=form.querySelector('[data-next-contact-time]');
    date.hidden=!custom;date.querySelector('input').disabled=!custom;date.querySelector('input').required=custom;
    time.hidden=none;time.querySelector('input').disabled=none;time.querySelector('input').required=!none;
  });
  window.AureumFollowUpNoteUI={fields,activity,noteFields,scheduleFields};
}());
