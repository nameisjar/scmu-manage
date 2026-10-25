const assert=require('node:assert/strict');const fixture=require('./pagination-fixture.cjs');let context;
async function main(){
  context=await fixture();const {request,auth,marker,jobs,ids}=context;
  async function walk(path,expected,limit=25){const seen=new Set();let page=1;let pages;
    do{const result=await request(`${path}${path.includes('?')?'&':'?'}page=${page}&limit=${limit}`,auth.token);assert.equal(result.total,expected,path);assert.equal(result.page,page);assert.ok(result.data.length<=limit);pages=result.pages;for(const row of result.data){assert.ok(!seen.has(row.id),`${path}: repeated ${row.id}`);seen.add(row.id);}page++;}while(page<=pages);
    assert.equal(seen.size,expected);return seen;
  }
  for(const [path,count] of [[`/jobs?search=${marker}`,211],[`/sales-quotations?search=${marker}`,211],[`/companies?search=${marker}`,55],[`/fleet?search=${marker}`,55],[`/drivers?search=${marker}`,55],[`/users?search=${marker}`,55],[`/rfq?search=${marker}`,55],[`/shipments?search=${marker}`,56],[`/invoices?search=${marker}`,211],[`/routes?search=${marker}`,55],[`/approvals?jobId=${jobs[0].id}`,211],[`/jobs/${jobs[0].id}/activity`,105]])await walk(path,count,50);
  assert.equal((await request(`/jobs?search=${marker} shipment 210`,auth.token)).data[0].id,jobs[210].id);
  const expired=await request(`/sales-quotations?search=${marker}&status=EXPIRED`,auth.token);assert.equal(expired.total,1);assert.equal(expired.data[0].id,ids.quote210);assert.equal(expired.data[0].status,'EXPIRED');
  for(const path of ['/jobs','/sales-quotations','/approvals','/companies','/users','/routes']){await request(`${path}?page=0`,auth.token,422);await request(`${path}?limit=201`,auth.token,422);}
  const empty=await request(`/jobs?search=NO-SUCH-${marker}&page=999&limit=25`,auth.token);assert.deepEqual([empty.total,empty.page,empty.pages,empty.data.length],[0,1,1,0]);
  const beyond=await request(`/jobs?search=${marker}&page=999&limit=50`,auth.token);assert.deepEqual([beyond.page,beyond.data.length],[5,11]);
  const one=await request(`/jobs/finance?currency=IDR&search=${marker}&page=1&limit=25`,auth.token);const two=await request(`/jobs/finance?currency=IDR&search=${marker}&page=2&limit=25`,auth.token);
  assert.equal(one.pagination.total,211);assert.equal(one.jobs.length,25);assert.equal(one.counts.receivables,211);assert.deepEqual(one.groups,two.groups);assert.ok(two.jobs.every(row=>!one.jobs.some(first=>first.id===row.id)));
  const csv=await request(`/jobs/finance?currency=IDR&search=${marker}&financeTab=overview&export=1`,auth.token);assert.equal(csv.jobs.length,211);
  const receipts=await request(`/jobs/finance?currency=IDR&search=${marker}&financeTab=receivables&page=9&limit=25`,auth.token);assert.equal(receipts.invoices.length,11);assert.equal(receipts.pagination.total,211);
  const head=(await request(`/jobs/${jobs[0].id}/packing-header`,auth.token)).data;assert.equal(head.summary.packages,21);assert.equal(head.summary.grossWeightKg,'2100.000');
  const others=(await request(`/jobs/${jobs[0].id}/packing-lists`,auth.token)).data;assert.equal(others.length,21);assert.equal((await request(`/jobs/${jobs[0].id}/sea-bills`,auth.token)).data.length,21);
  console.log('PASS: all main APIs beyond old 50/200 limits; no skipped/duplicate rows with equal timestamps; all-record searches; expiry/status filters; malformed and empty pages; 105 activity records; financial KPI/export completeness; intact packing totals and BL lists.');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(context)await context.cleanup();});
