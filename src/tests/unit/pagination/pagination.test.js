'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const backend = require(path.resolve(__dirname, '../../../../backend/pagination'));
const ui = require(path.resolve(__dirname, '../../../../frontend/shared/pagination'));

test('unpaged legacy requests stay unpaged', () => {
  assert.equal(backend.parsePagination(new URLSearchParams('q=lahore')), null);
});
test('valid pages and allowed sizes', () => {
  assert.deepEqual(backend.parsePagination(new URLSearchParams('page=3&pageSize=50')), { page:3,pageSize:50,offset:100 });
  assert.deepEqual(backend.parsePagination(new URLSearchParams('pageSize=10')), { page:1,pageSize:10,offset:0 });
});
test('invalid page values are rejected safely', () => {
  for (const text of ['page=0', 'page=-1', 'page=1.5','page=x','page=Infinity','pageSize=11','pageSize=101','page=999999999999999999999999']) {
    assert.throws(() => backend.parsePagination(new URLSearchParams(text)), { name: 'PaginationValidationError' });
  }
});
test('empty and last page metadata', () => {
  assert.deepEqual(backend.paginationMeta({page:1,pageSize:25},0), {page:1,pageSize:25,total:0,totalPages:0,hasNextPage:false,hasPreviousPage:false});
  assert.deepEqual(backend.paginationMeta({page:182,pageSize:25},4538), {page:182,pageSize:25,total:4538,totalPages:182,hasNextPage:false,hasPreviousPage:true});
});
test('SQL count and page use same scoped WHERE and parameterized limit', async () => {
  const queries = [];
  const sql = {async query(statement, params) {
    queries.push({statement,params});
    return queries.length === 1 ? [{total:'4538'}] : [{id:'abc'}];
  }};
  const pagination = backend.parsePagination(new URLSearchParams('page=2&pageSize=25'));
  const result = await backend.selectPage({sql,selectSql:'SELECT l.id',fromSql:'FROM crm.leads l',whereSql:'l.workspace_id = $1 AND l.assigned_agent_id = $2',orderBySql:'l.created_at DESC, l.id DESC',params:['ws-1','agent-7'],pagination});
  assert.equal(result.meta.total,4538);
  assert.deepEqual(queries[0].params, ['ws-1','agent-7']);
  assert.deepEqual(queries[1].params, ['ws-1','agent-7',25,25]);
  assert.match(queries[0].statement,/WHERE l.workspace_id = \$1 AND l.assigned_agent_id = \$2/);
  assert.match(queries[1].statement,/WHERE l.workspace_id = \$1 AND l.assigned_agent_id = \$2 ORDER BY l.created_at DESC, l.id DESC LIMIT \$3 OFFSET \$4/);
});
test('page counts and buttons are consistent', () => {
  assert.deepEqual(ui.pageWindow(ui.normalizeMeta({page:10,pageSize:25,total:4538})),[8,9,10,11,12]);
  const result=ui.render({page:1,pageSize:25,total:4538}, 'leads');
  assert.match(result,/Showing 1–25 of 4,538 records/);
  assert.match(result,/aria-current="page"/);
  assert.match(result,/data-aureum-page-size/);
  assert.match(result,/data-aureum-jump/);
  assert.match(result,/disabled aria-label="First page"/);
});
test('UI query serializer preserves filters and page', () => {
  assert.equal(ui.pageQuery({page:3,pageSize:10},{q:'A&B',status:'New'}),'q=A%26B&status=New&page=3&pageSize=10');
});
