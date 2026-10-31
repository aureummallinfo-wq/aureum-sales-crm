(function () {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const time = value => { const date=new Date(value); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-PK',{timeZone:'Asia/Karachi',dateStyle:'medium',timeStyle:'short'}).format(date)+' PKT' : ''; };
  function stamp(note) { return note.version>1 ? `<small>Edited by ${escape(note.edited_by_name || 'Aureum teammate')} · ${escape(time(note.updated_at))}</small>` : ''; }
  function card(note, entity, parent) {
    const url=`/api/${entity}/${encodeURIComponent(parent)}/notes/${encodeURIComponent(note.id)}`;
    return `<article class="customer-note saved-note" data-note-id="${escape(note.id)}" data-note-url="${escape(url)}" data-note-version="${note.version}" data-note-kind="${entity}"><div class="customer-note-head"><strong>Note</strong><span>${escape(note.user_name || 'Aureum teammate')}</span>${note.can_edit ? '<button type="button" class="btn btn-secondary btn-sm" data-note-edit aria-label="Edit saved note">✎ Edit</button>' : ''}</div><p data-note-content style="white-space:pre-wrap">${escape(note.note)}</p><time datetime="${escape(note.created_at)}">${escape(time(note.created_at))}</time>${stamp(note)}${note.version>1 && (note.can_edit || state.authUser?.role==='super_admin') ? '<button type="button" class="btn btn-secondary btn-sm" data-note-history>Revision history</button>' : ''}<div data-note-feedback role="status" aria-live="polite"></div></article>`;
  }
  function synchronize(note) {
    for (const detail of [state.leadDetail,state.customerDetail,state.followupDetail]) {
      if(!detail)continue;
      for(const list of [detail.notes,detail.activity,detail.timeline]) {
        for(const item of list || []) {
          if(item.id===note.id)Object.assign(item,note);
          if(item.metadata?.note_id===note.id) { item.description=note.note; item.metadata={...item.metadata,note_edited_at:note.updated_at,note_edited_by:note.edited_by_name}; }
        }
      }
    }
    window.dispatchEvent(new CustomEvent('aureum:note-updated',{detail:note}));
  }
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-note-edit],[data-note-cancel],[data-note-history]'); if(!button)return;
    const article=button.closest('[data-note-id]'); const feedback=article.querySelector('[data-note-feedback]');
    if(button.matches('[data-note-cancel]')) { article.querySelector('form').remove(); article.querySelector('[data-note-content]').hidden=false; article.querySelector('[data-note-edit]').hidden=false; feedback.textContent=''; return; }
    if(button.matches('[data-note-history]')) {
      button.disabled=true; feedback.textContent='Loading revision history…';
      try { const result=await apiFetch(article.dataset.noteUrl+'/history'); feedback.replaceChildren(); for(const revision of result.data) { const row=document.createElement('p'); row.style.whiteSpace='pre-wrap'; row.textContent=`${revision.edited_by_name} · ${time(revision.edited_at)}\nPrevious: ${revision.previous_content}\nChanged to: ${revision.new_content}`; feedback.append(row); } }
      catch(error) { feedback.textContent=error.message; } finally { button.disabled=false; } return;
    }
    if(article.querySelector('form'))return;
    const content=article.querySelector('[data-note-content]'); content.hidden=true; button.hidden=true;
    const form=document.createElement('form'); form.dataset.savedNoteEdit='';
    form.innerHTML=`<label>Edit note<textarea name="note" rows="5" maxlength="2000" required></textarea></label><div class="drawer-action-row"><button type="submit" class="btn btn-gold btn-sm">Save Changes</button><button type="button" class="btn btn-secondary btn-sm" data-note-cancel>Cancel</button></div>`;
    form.elements.note.value=content.textContent; content.after(form); form.elements.note.focus();
  });
  document.addEventListener('submit',async event=>{
    const form=event.target;if(!form.matches('[data-saved-note-edit]'))return;event.preventDefault();
    const article=form.closest('[data-note-id]'), feedback=article.querySelector('[data-note-feedback]');
    const note=form.elements.note.value;
    if(!note.trim() || note.length>2000) { feedback.textContent='Enter 1–2000 characters.'; return; }
    for(const button of form.querySelectorAll('button'))button.disabled=true;
    feedback.textContent='Saving changes…';
    try {
      await apiFetch(article.dataset.noteUrl,{method:'PATCH',body:JSON.stringify({note,version:Number(article.dataset.noteVersion)})});
      const url=article.dataset.noteUrl.split('/notes/')[0]+'/notes';
      const result=await apiFetch(url); const saved=result.data.find(n=>n.id===article.dataset.noteId);
      if(!saved)throw new Error('Saved note could not be refreshed. Reopen the profile.');
      synchronize(saved);
      // Refresh existing detail caches so imported notes without a prior timeline
      // association also appear immediately when the user switches tabs.
      const leadId=state.leadDetail?.data?.id, customerId=state.customerDetail?.data?.id;
      await Promise.allSettled([
        state.leadDetail?.data?.id ? apiFetch('/api/leads/'+encodeURIComponent(state.leadDetail.data.id)+'/activity').then(r=>{ if(state.leadDetail?.data?.id===leadId)state.leadDetail.activity=r.data; }) : Promise.resolve(),
        state.customerDetail?.data?.id ? apiFetch('/api/customers/'+encodeURIComponent(state.customerDetail.data.id)+'/timeline').then(r=>{ if(state.customerDetail?.data?.id===customerId)state.customerDetail.timeline=r.data; }) : Promise.resolve()
      ]);
      article.outerHTML=card(saved,article.dataset.noteKind,decodeURIComponent(article.dataset.noteUrl.split('/')[3]));
      showToast('Note changes saved');
    } catch(error) {
      feedback.textContent=error.message+' Your draft is preserved. For a conflict, copy your draft and reopen the note to review the latest version.';
      for(const button of form.querySelectorAll('button'))button.disabled=false;
    }
  });
  window.AureumSavedNotes={card,time,stamp,synchronize};
})();
