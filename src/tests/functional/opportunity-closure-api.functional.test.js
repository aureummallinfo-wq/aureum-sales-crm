const test=require('node:test');
const assert=require('node:assert/strict');
const {startApiServer}=require('../helpers/api-test-server');

test('Sales Manager and Sales Agent closure propagates across API screens without losing history',async t=>{
  const api=await startApiServer(t);
  for(const login of ['dua@aureum.com','adan@aureum.com']) await t.test(login,async()=>{
    const cookie=await api.login(login);
    const request=(url,method='GET',body)=>api.request(url,{method,headers:{cookie,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const result=await request('/api/leads','POST',{full_name:'Isolated opportunity',phone:login.startsWith('dua') ? '+923001237654' : '+923001237655',interested_in:'Commercial',status:'New',...(login.startsWith('dua') ? {assigned_agent_id:'usr_002'} : {})});
    assert.equal(result.response.status,201,result.text);
    const lead=result.body.data;
    const converted=await request(`/api/leads/${lead.id}/customer`,'POST',{schedule_followup:true,followup_tag:'Follow-up',note:'Preserve original call note',next_due_date:'2099-01-01',next_due_time:'10:00'});
    assert.equal(converted.response.status,200,converted.text);
    const customer=converted.body.data;
    const scheduled = await request('/api/follow-ups','POST',{customer_id:customer.id,lead_id:lead.id,due_date:'2099-01-01',due_time:'10:00',follow_up_type:'General Follow-up',notes:'Preserve original call note'});
    assert.equal(scheduled.response.status,201,scheduled.text);
    const before=(await request('/api/follow-ups/my')).body.data.find(f=>f.lead_id===lead.id);
    assert.ok(before);
    const summaryBefore=(await request('/api/dashboard/summary?dateRange=custom&startDate=2020-01-01&endDate=2100-01-01')).body.data;
    const endpoint=login.startsWith('dua') ? `/api/customers/${customer.id}/status` : `/api/leads/${lead.id}/status`;
    assert.equal((await request(endpoint,'PATCH',{status:'Not Interested',closure_reason:'No longer buying'})).response.status,200);
    assert.equal((await request(`/api/leads/${lead.id}`)).body.data.status,'Closed Lost');
    const profile=(await request(`/api/customers/${customer.id}`)).body;
    assert.equal(profile.data.customer_status,'Closed Lost');
    assert.ok(profile.followUps.some(f=>f.id===before.id && f.status==='Cancelled'));
    assert.equal((await request('/api/follow-ups/my')).body.data.some(f=>f.lead_id===lead.id),false);
    const summaryAfter=(await request('/api/dashboard/summary?dateRange=custom&startDate=2020-01-01&endDate=2100-01-01')).body.data;
    assert.ok(summaryAfter.followUpsDue < summaryBefore.followUpsDue);
    assert.equal((await request(`/api/follow-ups/${before.id}/reschedule`,'PATCH',{due_date:'2099-01-02',due_time:'10:00'})).response.status,409);
    assert.equal((await request('/api/follow-ups','POST',{customer_id:customer.id,lead_id:lead.id,due_date:'2099-01-02',due_time:'10:00'})).response.status,409);
    assert.equal((await request(`/api/customers/${customer.id}/notes`,'POST',{note:'Retain post-closure note',next_followup_days:'none'})).response.status,201);
    assert.equal((await request('/api/notifications')).body.data.some(n=>n.related_entity_id===before.id && n.event_type==='follow_up_due'),false);
    assert.equal((await request(endpoint,'PATCH',{status:'New'})).response.status,200);
    assert.equal((await request(`/api/follow-ups/${before.id}`)).body.data.status,'Cancelled');
    assert.equal((await request('/api/follow-ups','POST',{customer_id:customer.id,lead_id:lead.id,due_date:'2099-01-02',due_time:'10:00'})).response.status,201);
  });
});
