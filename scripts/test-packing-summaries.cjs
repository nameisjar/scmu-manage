const assert=require('node:assert/strict');
const fixture=require('./packing-summary-fixture.cjs');
let context;
async function main() {
  context=await fixture(); const {api,request,job,staff,director,rows,originals,upload,common}=context;
  const base=`/jobs/${job.id}/packing-lists`; const head=`/jobs/${job.id}/packing-header`;
  assert.equal(rows[1].grossWeightKg,'600'); assert.equal(rows[1].volumeCbm,null); assert.equal(rows[1].netWeightKg,null);
  assert.equal(context.header.summary.packages,15); assert.equal(context.header.summary.grossWeightKg,'1800.000');
  assert.equal(context.header.summary.volumeCbm,null); assert.equal(context.header.summary.knownTotals.volumeCbm,'6.5000');
  for(let i=0;i<rows.length;i++) {
    const response=await fetch(`${api}/api/jobs/${job.id}/documents/${rows[i].documentId}/file`,{headers:{Authorization:`Bearer ${staff.token}`}});
    assert.equal(response.status,200); assert.ok(Buffer.from(await response.arrayBuffer()).equals(originals[i]));
  }
  await request(base,upload({...common,senderName:rows[0].senderName,packages:1}),staff.token,'POST',409);
  await request(base,upload({...common,externalNumber:'pl-001',senderName:rows[0].senderName.toLowerCase(),packages:1}),staff.token,'POST',409);
  rows[1]=await request(`${base}/${rows[1].id}`,{version:rows[1].version,receiptStatus:'RECEIVED',actualPackages:5,actualWeightKg:600,receivedAt:new Date().toISOString(),receivedBy:'Staff simulation'},staff.token,'PUT');
  await request(`${base}/${rows[1].id}/finalize`,{version:rows[1].version},staff.token,'POST',409);
  rows[1]=await request(`${base}/${rows[1].id}`,{version:rows[1].version,summaryConfirmed:true},staff.token,'PUT');
  assert.equal(rows[1].summaryCheckedById,staff.user.id);
  // Any change to transcribed values removes the check; receipt-only edits do not.
  rows[1]=await request(`${base}/${rows[1].id}`,{version:rows[1].version,netWeightKg:590},staff.token,'PUT'); assert.equal(rows[1].summaryCheckedAt,null);
  rows[1]=await request(`${base}/${rows[1].id}`,{version:rows[1].version,summaryConfirmed:true},staff.token,'PUT');
  rows[1]=await request(`${base}/${rows[1].id}/finalize`,{version:rows[1].version},staff.token);
  rows[0]=await request(`${base}/${rows[0].id}`,{version:rows[0].version,receiptStatus:'RECEIVED',actualPackages:10,receivedAt:new Date().toISOString(),receivedBy:'Staff simulation'},staff.token,'PUT');
  rows[0]=await request(`${base}/${rows[0].id}/finalize`,{version:rows[0].version},staff.token);
  context.header=(await request(head,null,staff.token)).data;
  const approval=await request('/approvals',{action:'PACKING_HEADER_FINALIZE',entityId:context.header.id,payload:{version:context.header.version}},staff.token);
  await request(`/approvals/${approval.id}/review`,{decision:'APPROVED'},director.token);
  assert.equal((await request(head,null,staff.token)).data.status,'FINAL');
  // Unknown source volume stays unknown in BL allocations and enters the existing
  // director exception workflow rather than being invented or trapping the job.
  const vendor=(await request('/companies?limit=200',null,staff.token)).data.find(row=>!row.isInternal&&row.type==='TRANSPORTER');
  const transport=await request('/approvals',{action:'TRANSPORT_BOOK',entityId:job.id,payload:{transportSource:'EXTERNAL',mode:'SEA',carrierId:vendor.id,originCity:'Surabaya',destCity:'Merauke',loadingDate:new Date().toISOString()}},staff.token);
  await request(`/approvals/${transport.id}/review`,{decision:'APPROVED'},director.token);
  let bill=(await request(`/jobs/${job.id}/sea-bills`,null,staff.token)).data[0];
  bill=await request(`/jobs/${job.id}/sea-bills/upload`,upload({billId:bill.id,version:bill.version,category:'FINAL'}),staff.token);
  bill=await request(`/jobs/${job.id}/sea-bills/${bill.id}`,{version:bill.version,allocations:rows.map(row=>({packingListId:row.id,packages:row.packages,grossWeightKg:row.grossWeightKg,volumeCbm:row.volumeCbm}))},staff.token,'PUT');
  assert.equal(bill.allocations.find(row=>row.packingListId===rows[1].id).volumeCbm,null); assert.equal(bill.totals.volumeCbm,null);
  const checks=Object.fromEntries(['parties','route','containers','cargo','finalDocument'].map(key=>[key,true]));
  await request(`/jobs/${job.id}/sea-bills/${bill.id}/verify`,{version:bill.version,checks},staff.token,'POST',403);
  const exception=await request('/approvals',{action:'SEA_BILL_EXCEPTION',entityId:bill.id,payload:{version:bill.version,checks,note:'Original Company B does not state volume; director reviewed original and BL.'}},staff.token);
  await request(`/approvals/${exception.id}/review`,{decision:'APPROVED'},director.token);
  assert.equal((await request(`/jobs/${job.id}/sea-bills`,null,staff.token)).data[0].internalStatus,'SEA_MATCHED');
  console.log('PASS: mixed sender layouts, same document number across senders, original bytes preserved, tonne conversion, nullable values and partial totals, review invalidation/finalization, director header approval, unknown BL cargo exception.');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(context)await context.cleanup();});
