const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
let chromium;
try { ({chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')); } catch {}
test('saved note editor: cancel, validation, saving, conflict, attribution, audit and synchronized caches',{skip:!chromium},async t=>{
  const browser=await chromium.launch({headless:true,...(process.env.CRM_TEST_BROWSER?{executablePath:process.env.CRM_TEST_BROWSER}:{})}); t.after(()=>browser.close());
  const page=await browser.newPage();
  await page.setContent('<main id="notes"></main>');
  await page.evaluate(()=>{
    window.saved={id:'00000000-0000-4000-8000-000000000001',note:'Original author text',user_name:'Sales Agent',created_at:'2026-10-31T00:00:00Z',version:1,can_edit:true};
    window.state={authUser:{role:'sales_manager'},leadDetail:{notes:[{...saved}],activity:[{metadata:{note_id:saved.id},description:saved.note}]},customerDetail:{notes:[{...saved}],timeline:[{metadata:{note_id:saved.id},description:saved.note}]},followupDetail:{notes:[{...saved}]}};
    window.calls=[];window.showToast=text=>window.toast=text;
    window.apiFetch=async(url,options)=>{
      calls.push({url,options});
      if(options){if(window.conflict)throw new Error('This note changed. Review the latest note before saving.');await new Promise(r=>setTimeout(r,150));saved={...saved,...JSON.parse(options.body),version:2,edited_by_name:'Sales Manager',updated_at:'2026-10-31T01:00:00Z'};return {data:saved};}
      if(url.endsWith('/history'))return {data:[{previous_content:'Original author text',new_content:saved.note,edited_by_name:'Sales Manager',edited_at:saved.updated_at}]};
      return {data:[saved]};
    };
  });
  await page.addScriptTag({path:path.resolve(__dirname,'../../../frontend/shared/saved-notes.js')});
  await page.evaluate(()=>document.querySelector('#notes').innerHTML=AureumSavedNotes.card(saved,'customers','fixture'));
  await page.getByRole('button',{name:'Edit saved note'}).click();await page.locator('textarea').fill('Discard this draft');await page.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal(await page.locator('[data-note-content]').textContent(),'Original author text');assert.equal(await page.evaluate(()=>calls.length),0);
  await page.getByRole('button',{name:'Edit saved note'}).click();await page.locator('textarea').fill('   ');await page.getByRole('button',{name:'Save Changes'}).click();assert.match(await page.getByRole('status').textContent(),/1–2000/);assert.equal(await page.evaluate(()=>calls.length),0);
  assert.equal(await page.locator('textarea').getAttribute('maxlength'),'2000');
  await page.locator('textarea').fill('<img src=x onerror="window.xss=1"> Corrected remark');await page.getByRole('button',{name:'Save Changes'}).click();
  assert.equal(await page.getByRole('button',{name:'Save Changes'}).isDisabled(),true);
  await page.waitForFunction(()=>window.toast==='Note changes saved');
  assert.match(await page.locator('article').textContent(),/Sales Agent/);assert.match(await page.locator('article').textContent(),/Edited by Sales Manager/);assert.match(await page.locator('time').textContent(),/PKT/);assert.equal(await page.locator('article img').count(),0);assert.equal(await page.evaluate(()=>window.xss),undefined);
  const snapshot=await page.evaluate(()=>({lead:state.leadDetail.activity[0].description,customer:state.customerDetail.timeline[0].description,followup:state.followupDetail.notes[0].note}));assert.equal(snapshot.lead,snapshot.customer);assert.equal(snapshot.lead,snapshot.followup);
  await page.getByRole('button',{name:'Revision history'}).click();await page.waitForFunction(()=>document.querySelector('[data-note-feedback]').textContent.includes('Previous:'));assert.match(await page.getByRole('status').textContent(),/Original author text/);
  await page.evaluate(()=>window.conflict=true);await page.getByRole('button',{name:'Edit saved note'}).click();await page.locator('textarea').fill('Preserved conflict draft');await page.getByRole('button',{name:'Save Changes'}).click();await page.waitForFunction(()=>document.querySelector('[data-note-feedback]').textContent.includes('Your draft is preserved'));
  assert.equal(await page.locator('textarea').inputValue(),'Preserved conflict draft');assert.equal(await page.getByRole('button',{name:'Cancel',exact:true}).isEnabled(),true);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.match(await page.locator('[data-note-content]').textContent(),/Corrected remark/);
  await page.evaluate(()=>document.querySelector('#notes').innerHTML=AureumSavedNotes.card({...saved,can_edit:false},'customers','fixture'));assert.equal(await page.getByRole('button',{name:'Edit saved note'}).count(),0);
});
