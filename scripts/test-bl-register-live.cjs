// Authorized local demo integration checks; never logs secrets or tokens.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const jwt = require('../backend/node_modules/jsonwebtoken');
const api = process.env.SCMU_API_URL || 'http://localhost:5000';
// localhost uses the SCMU IPv6 listener; another local app may own IPv4 port 5000.
const databaseUrl = process.env.SCMU_DEMO_DATABASE_URL || 'postgresql://scmu_demo@127.0.0.1:55432/scmu_demo';
assert.ok(['127.0.0.1','localhost'].includes(new URL(api).hostname));
assert.ok(['127.0.0.1','localhost'].includes(new URL(databaseUrl).hostname) && new URL(databaseUrl).pathname === '/scmu_demo');
const prisma = new PrismaClient({datasources:{db:{url:databaseUrl}}});
const marker = `BLQA-${randomUUID().slice(0,8)}`;
const jobIds = new Set(); const tariffIds = new Set();
async function request(route, token, body, method = body ? 'POST' : 'GET', expected = 200) {
  const response = await fetch(`${api}/api${route}`,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
  const data = await response.json();
  assert.equal(response.status,expected,`${method} ${route}: ${JSON.stringify(data)}`);
  return data;
}
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function legacySnapshot() {
  const data = {};
  for (const model of ['seaBill','seaBillFile','seaBillRevision','jobOrder','jobDocument','shipment','jobCharge','invoice','jobPayment','directorApproval']) data[model] = await prisma[model].findMany({orderBy:{id:'asc'}});
  return data;
}
async function cleanup() {
  const owned = await prisma.jobOrder.findMany({where:{OR:[{id:{in:[...jobIds]}},{title:{contains:marker}}]},select:{id:true}});
  const ids = owned.map(row=>row.id);
  if(ids.length) {
    const bills = await prisma.seaBill.findMany({where:{jobId:{in:ids}},select:{id:true}});
    await prisma.activityLog.deleteMany({where:{OR:[{entity:'JobOrder',entityId:{in:ids}},{entityId:{in:bills.map(row=>row.id)}}]}});
    await prisma.directorApproval.deleteMany({where:{jobId:{in:ids}}});
    await prisma.jobPayment.deleteMany({where:{jobId:{in:ids}}});
    await prisma.invoice.deleteMany({where:{jobId:{in:ids}}});
    await prisma.jobCharge.deleteMany({where:{jobId:{in:ids}}});
    await prisma.seaBill.deleteMany({where:{jobId:{in:ids}}});
    await prisma.packingList.deleteMany({where:{jobId:{in:ids}}});
    await prisma.packingHeader.deleteMany({where:{jobId:{in:ids}}});
    await prisma.jobDocument.deleteMany({where:{jobId:{in:ids}}});
    await prisma.shipment.deleteMany({where:{jobId:{in:ids}}});
    await prisma.jobOrder.deleteMany({where:{id:{in:ids}}});
  }
  if(tariffIds.size) {
    // The implementation's tariff model is checked at runtime; never delete a reference tariff.
    const model = prisma.jptTariff;
    if(model) await model.deleteMany({where:{id:{in:[...tariffIds]}}});
    await prisma.activityLog.deleteMany({where:{entityId:{in:[...tariffIds]}}});
  }
}
async function main() {
  const before = await legacySnapshot();
  const secret = await fs.readFile(path.join(__dirname,'../.demo/jwt-secret'),'utf8');
  const users = await prisma.user.findMany({where:{isActive:true,role:{in:['SUPER_ADMIN','ADMIN']}},select:{id:true,role:true}});
  const token = role => { const user=users.find(row=>row.role===role); assert.ok(user,`${role} demo identity required`); return jwt.sign({userId:user.id},secret,{expiresIn:'15m'}); };
  const admin=token('ADMIN'), director=token('SUPER_ADMIN');
  await request('/bl-register',null,undefined,'GET',401);
  const reference = await request('/jpt-tariffs',admin);
  assert.ok(Array.isArray(reference.data));
  const findRate = (price,size,unit='CONTAINER') => reference.data.find(row=>Number(row.unitPrice)===price && String(row.size)===size && row.unit===unit);
  const door20=findRate(3750000,'20'); const door21=findRate(3850000,'21'); const door40=findRate(6750000,'40');
  assert.ok(door20&&door21&&door40,'All three supplied dooring sizes must exist');
  assert.equal(door20.vatIncluded,true); assert.equal(Number(door20.vatRate),1.1);
  const ambiguous=reference.data.filter(row=>[3485000,5256000].includes(Number(row.unitPrice)));
  assert.equal(ambiguous.length,3); assert.ok(ambiguous.every(row=>row.confirmationRequired && !row.enabled));
  await request(`/jpt-tariffs/${door20.id}`,admin,{unitPrice:'1'},'PUT',403);
  console.log('PASS reference tariffs, inclusive VAT, ambiguous rates disabled, admin mutation denied');
  const containers=[{number:`${marker}-20`,seal:'QA-SEAL-20',size:'20',goodsDescription:'Integration test cargo',status:'REGISTERED'},{number:`${marker}-40`,seal:'QA-SEAL-40',size:'40',goodsDescription:'Integration test cargo',status:'REGISTERED'}];
  const input={billNumber:marker,carrierName:'SPIL',vesselName:`${marker} vessel`,voyageNumber:'QA-VOY',portOfLoading:'Surabaya',portOfDischarge:'Merauke',shipperName:'QA sender',consigneeName:'QA receiver',register:{customerName:'QA customer',billingPartyName:'QA billing',departureDate:'2026-10-20',arrivalDate:'2026-10-25',dateMeaning:'UNCONFIRMED',cargoDescription:`${marker} integration cargo`},containers,notes:`${marker}: disposable test, not a real shipment`};
  let bill=await request('/bl-register',admin,input,'POST',201); jobIds.add(bill.jobId); assert.ok(bill.id&&bill.jobId&&bill.shipmentId&&bill.registerNumber);
  const graph=await prisma.jobOrder.findUnique({where:{id:bill.jobId},include:{shipments:true,seaBills:true,documents:true}});
  assert.equal(graph.jobType,'RECEIVER');assert.equal(graph.currency,'IDR'); assert.equal(graph.shipments.length,1);assert.equal(graph.shipments[0].mode,'SEA');assert.equal(graph.seaBills.length,1); assert.ok(graph.documents.some(row=>row.type==='BILL_OF_LADING'&&row.customerVisible===false&&row.status==='PENDING'));
  assert.equal(bill.register.dateMeaning,'UNCONFIRMED'); assert.equal(bill.containers.length,2);
  let reload=await request(`/bl-register/${bill.id}`,admin); assert.equal(reload.billNumber,marker);assert.equal(reload.containers.length,2);
  const duplicate=await fetch(`${api}/api/bl-register`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${admin}`},body:JSON.stringify(input)});assert.equal(duplicate.status,409,'Duplicate B/L rejected');
  assert.equal(await prisma.seaBill.count({where:{billNumber:marker}}),1,'Duplicate request must roll back all graph records');
  console.log('PASS B/L-first atomic graph, private pending document, persisted reload, duplicate rollback');
  const list=await request(`/bl-register?search=${encodeURIComponent(marker)}&page=1&limit=10`,admin);assert.equal(list.total,1);assert.equal(list.data[0].id,bill.id);assert.ok(list.summary);
  const byContainer=await request(`/bl-register?search=${encodeURIComponent(containers[1].number)}`,admin);assert.ok(byContainer.data.some(row=>row.id===bill.id));
  console.log('PASS register pagination, B/L and container search, summary response');
  const estimate=await request(`/bl-register/${bill.id}/estimate`,admin,{tariffIds:[door20.id,door40.id],version:reload.version});assert.equal(Number(estimate.total),10500000);assert.equal(estimate.lines.length,2);assert.ok(estimate.lines.every(row=>Number(row.quantity)===1));
  const doFee=reference.data.find(row=>row.unit==='BL'&&Number(row.unitPrice)===200000&&String(row.carrierName).toUpperCase()==='SPIL');assert.ok(doFee,'SPIL DO fee exists');
  const doEstimate=await request(`/bl-register/${bill.id}/estimate`,admin,{tariffIds:[doFee.id],version:reload.version});assert.equal(Number(doEstimate.total),200000);assert.equal(Number(doEstimate.lines[0].quantity),1);
  const denied=await fetch(`${api}/api/bl-register/${bill.id}/estimate`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${admin}`},body:JSON.stringify({tariffIds:[ambiguous[0].id],version:reload.version})});assert.ok([409,422,400].includes(denied.status));
  console.log('PASS size-based estimator, no VAT double-add, per-B/L fee once, unconfirmed selection rejected');
  const previousVersion=reload.version;
  const changed=reload.containers.map((row,index)=>({...row,...(index===0?{status:'GATE_OUT',gateOutAt:'2026-10-25T01:00:00.000Z'}:{})}));
  await request(`/bl-register/${bill.id}`,admin,{version:previousVersion,containers:changed},'PUT');
  reload=await request(`/bl-register/${bill.id}`,admin);assert.equal(reload.containers[0].status,'GATE_OUT');assert.equal(reload.containers[1].status,'REGISTERED');assert.ok(reload.version>previousVersion);
  await request(`/bl-register/${bill.id}`,admin,{version:previousVersion,notes:'stale'},'PUT',409);
  console.log('PASS independent container state, persisted update, stale-save conflict');
  const proposal=await request(`/bl-register/${bill.id}/charges`,admin,{version:reload.version,tariffIds:[door20.id,door40.id]},'POST',201);
  assert.equal(proposal.charges.length,2); assert.ok(proposal.charges.every(row=>row.status==='PROPOSED'&&row.tariffSnapshot));
  assert.equal(proposal.approvals.length,2);assert.ok(proposal.approvals.every(row=>row.status==='SUBMITTED'));
  for(const approval of proposal.approvals) {
    await request(`/approvals/${approval.id}/review`,director,{decision:'APPROVED',note:'Disposable integration verification'});
    const saved=await prisma.directorApproval.findUnique({where:{id:approval.id}});assert.equal(saved.status,'APPROVED');
  }
  const approved=await prisma.jobCharge.findMany({where:{jobId:bill.jobId}});assert.equal(approved.length,2);assert.ok(approved.every(row=>row.status==='APPROVED'));
  reload=await request(`/bl-register/${bill.id}`,admin);
  await request(`/bl-register/${bill.id}/charges`,admin,{version:reload.version,tariffIds:[door20.id]},'POST',409);
  console.log('PASS multi-line tariff proposal, separate director approvals, persisted decisions and duplicate prevention');
  await request(`/jobs/${bill.jobId}/invoices`,admin,{taxAmount:115500},'POST',422);
  const invoice=await request(`/jobs/${bill.jobId}/invoices`,admin,{taxAmount:0},'POST',201);
  assert.equal(Number(invoice.totalAmount),10500000);
  await request(`/jobs/${bill.jobId}/invoices/${invoice.id}`,admin,{taxAmount:115500},'PUT',422);
  const persistedInvoice=await prisma.invoice.findUnique({where:{id:invoice.id}});assert.equal(Number(persistedInvoice.totalAmount),10500000);assert.equal(Number(persistedInvoice.gstAmount),0);
  console.log('PASS invoice creation/edit cannot add VAT again to inclusive tariff charges');
  const custom=await request('/jpt-tariffs',director,{code:marker,description:'Disposable integration tariff',category:'TEST',unit:'CONTAINER',unitPrice:'12345',currency:'IDR',vatIncluded:false,enabled:false,confirmationRequired:true},'POST',201);tariffIds.add(custom.id);
  await request(`/jpt-tariffs/${custom.id}`,director,{unitPrice:'23456'},'PUT');
  const master=await request('/jpt-tariffs',admin);assert.equal(Number(master.data.find(row=>row.id===custom.id).unitPrice),23456);
  console.log('PASS actual tariff master create/update and authenticated readback');
  await cleanup();
  const after = await legacySnapshot();
  for(const model of Object.keys(before)) assert.equal(digest(after[model]),digest(before[model]),`Existing ${model} rows must remain unchanged after fixture cleanup`);
  console.log('PASS original business records unchanged and disposable B/L graph removed');
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{try{await cleanup();}catch(error){console.error('Fixture cleanup failed:',error.message);process.exitCode=1;}await prisma.$disconnect();});
