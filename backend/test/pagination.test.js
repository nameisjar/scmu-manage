const test=require('node:test');const assert=require('node:assert/strict');
const {pageOptions,pageMeta,listPage}=require('../src/services/pagination');
const {financePage}=require('../src/services/financePage');
test('pagination rejects malformed or excessive queries and recovers after deleting the last page',async()=>{
  for(const query of [{page:'0'},{page:'-1'},{page:'1.5'},{page:'1e3'},{page:['1']},{page:'9007199254740992'},{limit:'201'},{limit:'0'}])assert.throws(()=>pageOptions(query));
  assert.deepEqual(pageMeta(0,{page:'99',limit:'25'}),{total:0,page:1,limit:25,pages:1});
  const model={count:async()=>11,findMany:async options=>{assert.equal(options.skip,10);assert.equal(options.take,10);assert.equal(options.where.status,'OPEN');return [{id:'last'}];}};
  assert.deepEqual(await listPage(model,{where:{status:'OPEN'},orderBy:[{createdAt:'desc'},{id:'asc'}]},{page:99,limit:10}),{data:[{id:'last'}],total:11,page:2,limit:10,pages:2});
});
test('financial pages keep global currency KPIs and export all filtered rows, not just the visible page',()=>{
  const jobs=Array.from({length:31},(_,index)=>({id:`j${index}`,jobNumber:`JOB-${index}`,title:'Surabaya Merauke',currency:index===30?'USD':'IDR',financials:{receivable:index%2?0:100}}));
  const payload={groups:[{currency:'IDR',revenue:'3000.00'},{currency:'USD',revenue:'100.00'}],jobs,invoices:jobs.map(row=>({id:`i${row.id}`,jobId:row.id,currency:row.currency,balance:'100.00'})),payables:[],internalExpenses:[],alerts:[]};
  const view=financePage(payload,{currency:'IDR',financeTab:'receivables',page:2,limit:10});
  assert.equal(view.data.length,10);assert.equal(view.data[0].id,'ij10');assert.equal(view.pagination.total,30);assert.equal(view.counts.overview,30);assert.equal(view.jobs.length,10);assert.deepEqual(view.groups,payload.groups);
  const exported=financePage(payload,{currency:'IDR',financeTab:'receivables',page:2,limit:10,export:'1'});assert.equal(exported.data.length,30);assert.equal(exported.jobs.length,30);
  const filtered=financePage(payload,{currency:'IDR',outstanding:'1',search:'JOB-2',page:1,limit:25});assert.deepEqual(filtered.jobs.map(row=>row.id),['j2','j20','j22','j24','j26','j28']);
});
