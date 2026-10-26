const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { uniqueFollowUps } = require('../../../../backend/followup-workflow');

test('a closure tombstone never appears in active grouping after reactivation',()=>{
  assert.deepEqual(uniqueFollowUps([
    {id:'old',customer_id:'customer',status:'Cancelled',cancelled_by_closure:true},
    {id:'new',customer_id:'customer',status:'Pending'},
    {id:'other',customer_id:'other',status:'Pending'}
  ]).map(f=>f.id),['new','other']);
});

test('closure updates both screen caches and retries a stale in-flight GET',async()=>{
  const source=fs.readFileSync(path.join(__dirname,'../../../../frontend/app-shell.js'),'utf8');
  let resolveOld;
  const old=new Promise(resolve=>{resolveOld=resolve;});
  let reads=0;
  const state={authUser:null,leads:{items:[{id:'lead'}]},customers:{items:[{id:'customer',lead_id:'lead'}]},followups:{items:[{id:'old',lead_id:'lead'},{id:'other',lead_id:'other'}]}};
  const response=data=>({ok:true,status:200,headers:{get:()=>null},json:async()=>data});
  const context={state,API_BASE_URL:'',apiUrl:p=>p,AbortController,CustomEvent:class{constructor(type,props){Object.assign(this,{type,...props});}},window:{setTimeout,clearTimeout,dispatchEvent(){}},fetch:async(path,options)=>{
    if(options.method==='PATCH') return response({data:{id:'lead',status:'Closed Lost',customer_id:'customer'}});
    if(++reads===1) return old;
    return response({data:[]});
  }};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('const API_REQUEST_TIMEOUT_MS'),source.indexOf('function recoveryEscape')),context);
  const pending=context.apiFetch('/api/follow-ups/my',{cacheTtl:15000});
  await context.apiFetch('/api/leads/lead/status',{method:'PATCH',body:JSON.stringify({status:'Not Interested'})});
  resolveOld(response({data:[{id:'stale',lead_id:'lead'}]}));
  assert.deepEqual((await pending).data,[]);
  assert.equal(reads,2);
  assert.equal(state.leads.items[0].status,'Closed Lost');
  assert.equal(state.customers.items[0].customer_status,'Closed Lost');
  assert.deepEqual(state.followups.items.map(f=>f.id),['other']);
});
