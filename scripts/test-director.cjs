const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const api = process.env.SCMU_API_URL || 'http://127.0.0.1:5000'; const db = process.env.SCMU_DEMO_DATABASE_URL || 'postgresql://scmu_demo@127.0.0.1:55432/scmu_demo';
assert.ok(['localhost','127.0.0.1'].includes(new URL(api).hostname)); assert.ok(['localhost','127.0.0.1'].includes(new URL(db).hostname) && new URL(db).pathname === '/scmu_demo');
const prisma = new PrismaClient({ datasources: { db: { url: db } } }); const marker = `Director-${randomUUID()}`; const jobs = [], quotes = [], rfqs = [], approvals = [];
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1kAAAAASUVORK5CYII=', 'base64');
function file(body) { const form = new FormData(); form.append('file', new Blob([png], { type: 'image/png' }), 'original.png'); if (body) form.append('data', JSON.stringify(body)); return form; }
async function request(path, token, body, method = body ? 'POST' : 'GET', expected) {
  const response = await fetch(`${api}/api${path}`, { method, headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(!(body instanceof FormData) && { 'Content-Type':'application/json' }) }, body: body instanceof FormData ? body : body && JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  const data = await response.json(); assert.ok(expected ? response.status === expected : response.ok, `${method} ${path} ${response.status}: ${JSON.stringify(data)}`); return data;
}
async function main() {
  const admin = (await request('/auth/login', null, { email:'operasional@scmu.local', password:'Ops@1234' })).token;
  const director = (await request('/auth/login', null, { email:'admin@scmu.local', password:'Admin@1234' })).token;
  const submit = async (action, entityId, payload = {}, actor = admin) => { const row = await request('/approvals', actor, { action, entityId, payload, note: marker }); approvals.push(row.id); return row; };
  const approve = row => request(`/approvals/${row.id}/review`, director, { decision:'APPROVED', note:'Checked by director' });
  const createJob = async jobType => { const row = await request('/jobs', admin, { title:marker, jobType, originCity:'Surabaya', destCity:'Merauke', cargoDescription:'Approval workflow test', packages:15, weightKg:1800, currency:'IDR' }); jobs.push(row.id); return row; };
  const job = await createJob('SENDER'); const base = `/jobs/${job.id}`;
  const costBody = { kind:'COST', costSource:'INTERNAL', costCategory:'FUEL', description:marker, estimatedAmount:1000 };
  const cost = await request(`${base}/charges`, admin, costBody);
  await request(`${base}/charges/${cost.id}/review`, admin, { status:'APPROVED' }, 'POST', 403);
  await request(`${base}/charges/${cost.id}/review`, director, { status:'APPROVED' }, 'POST', 403);
  let pending = await submit('CHARGE_APPROVE', cost.id, { actualAmount:700 });
  await request('/approvals', admin, { action:'CHARGE_APPROVE', entityId:cost.id, payload:{ actualAmount:700 } }, 'POST', 409);
  await request(`/approvals/${pending.id}/review`, admin, { decision:'APPROVED' }, 'POST', 403);
  await request(`/approvals/${pending.id}/review`, director, { decision:'RETURNED' }, 'POST', 422);
  await request(`/approvals/${pending.id}/review`, director, { decision:'RETURNED', note:'Correct the estimate' });
  pending = await submit('CHARGE_APPROVE', cost.id, { actualAmount:700 });
  await request(`${base}/charges/${cost.id}`, admin, { ...costBody, estimatedAmount:1100 }, 'PUT');
  await request(`/approvals/${pending.id}/review`, director, { decision:'APPROVED' }, 'POST', 409);
  await request(`/approvals/${pending.id}/withdraw`, admin, { note:'Revised estimate' });
  pending = await submit('CHARGE_APPROVE', cost.id, { actualAmount:700 });
  const reviews = await Promise.all([1,2].map(() => fetch(`${api}/api/approvals/${pending.id}/review`, { method:'POST', headers:{ Authorization:`Bearer ${director}`, 'Content-Type':'application/json' }, body:JSON.stringify({ decision:'APPROVED' }) })));
  assert.deepEqual(reviews.map(row => row.status).sort(), [200,409]);
  assert.equal((await request(base, admin)).financials.internalCost, '700.00');
  const rejectedCost = await request(`${base}/charges`, admin, { ...costBody, description:'Self review test' });
  const self = await submit('CHARGE_APPROVE', rejectedCost.id, {}, director);
  await request(`/approvals/${self.id}/review`, director, { decision:'APPROVED' }, 'POST', 403);
  await request(`/approvals/${self.id}/withdraw`, admin, { note:'Unauthorized' }, 'POST', 403);
  await request(`/approvals/${self.id}/withdraw`, director, { note:'Admin will submit' });
  const rejected = await submit('CHARGE_APPROVE', rejectedCost.id); await request(`/approvals/${rejected.id}/review`, director, { decision:'REJECTED', note:'No supporting expense' });
  assert.equal((await request(base, admin)).charges.find(row => row.id === rejectedCost.id).status, 'REJECTED');
  const pay = { direction:'INTERNAL_EXPENSE', chargeId:cost.id, amount:500, reference:`PAY-${marker}`, paidTo:'Petugas SCMU', method:'CASH', isAdvance:true };
  await request(`${base}/payments`, admin, pay, 'POST', 403);
  const authorization = await submit('PAYMENT_AUTHORIZE', job.id, pay); await approve(authorization);
  assert.equal(await prisma.jobPayment.count({ where:{ jobId:job.id } }), 0, 'Authorization must not post cash movement');
  await request(`${base}/payments`, admin, { ...pay, approvalId:authorization.id, amount:400, notes:'Proof' }, 'POST', 409);
  await request(`${base}/payments`, admin, { ...pay, approvalId:authorization.id }, 'POST', 422);
  await request(`${base}/payments`, admin, { ...pay, approvalId:authorization.id, notes:'Cash voucher 001' });
  await request(`${base}/payments`, admin, { ...pay, approvalId:authorization.id, notes:'Duplicate' }, 'POST', 409);
  const finalPay = { ...pay, amount:200, reference:`PAY2-${marker}`, isAdvance:false };
  const finalAuthorization = await submit('PAYMENT_AUTHORIZE', job.id, finalPay); await approve(finalAuthorization);
  const payments = await Promise.all([1,2].map(() => fetch(`${api}/api${base}/payments`, { method:'POST', headers:{ Authorization:`Bearer ${admin}`, 'Content-Type':'application/json' }, body:JSON.stringify({ ...finalPay, approvalId:finalAuthorization.id, notes:'Cash voucher 002' }) })));
  assert.deepEqual(payments.map(row => row.status).sort(), [201,409]); assert.equal((await request(base, admin)).financials.internalOutstanding, '0.00');
  let outgoing = await request(`${base}/packing-lists`, admin, { direction:'OUTBOUND', documentDate:'2026-10-19', originCity:'Surabaya', destCity:'Merauke', recipientName:'Penerima Merauke', recipientAddress:'Gudang Merauke', items:[{ description:marker, quantity:1, unit:'UNIT', packages:1, netWeightKg:100, grossWeightKg:120, volumeCbm:1 }] });
  await request(`${base}/packing-lists/${outgoing.id}/finalize`, admin, { version:outgoing.version }, 'POST', 403);
  await approve(await submit('PACKING_FINALIZE', outgoing.id, { version:outgoing.version }));
  outgoing = await request(`${base}/packing-lists/${outgoing.id}`, admin); assert.equal(outgoing.status, 'FINAL'); assert.equal(outgoing.finalizedById, (await prisma.user.findUnique({ where:{email:'admin@scmu.local'} })).id);
  const quoteBody = { title:marker, originCity:'Surabaya', destCity:'Merauke', cargoDescription:marker, packages:1, currency:'IDR', validUntil:new Date(Date.now()+86400000).toISOString(), items:[{ description:marker, quantity:1, unit:'JOB', sellRate:3000, buyRate:700 }] };
  const quotation = await request('/sales-quotations', admin, quoteBody); quotes.push(quotation.id);
  await request(`/sales-quotations/${quotation.id}/status`, admin, { status:'SENT' }, 'POST', 403);
  await approve(await submit('SALES_QUOTATION_APPROVE', quotation.id));
  assert.equal((await request(`/sales-quotations/${quotation.id}`, admin)).status, 'APPROVED');
  await request(`/sales-quotations/${quotation.id}`, admin, { ...quoteBody, terms:'Revised terms' }, 'PUT');
  await request(`/sales-quotations/${quotation.id}/status`, admin, { status:'SENT' }, 'POST', 403);
  await approve(await submit('SALES_QUOTATION_APPROVE', quotation.id)); await request(`/sales-quotations/${quotation.id}/status`, admin, { status:'SENT' });
  const vendors = (await request('/companies?limit=200', admin)).data.filter(row => !row.isInternal && row.type === 'TRANSPORTER');
  const rfq = await request('/rfq', admin, { title:marker, originCity:'Surabaya', originState:'Jawa Timur', destCity:'Merauke', destState:'Papua Selatan', weight:1, vehicleType:'TRUCK', loadingDate:new Date().toISOString() }); rfqs.push(rfq.id);
  const vendorQuote = await request(`/rfq/${rfq.id}/quote`, admin, { transporterId:vendors[0].id, amount:1000 });
  await request(`/rfq/${rfq.id}/award/${vendorQuote.id}`, admin, {}, 'POST', 403); await approve(await submit('VENDOR_AWARD', vendorQuote.id));
  assert.equal((await request(`/rfq/${rfq.id}`, admin)).status, 'AWARDED');
  const legBody = { mode:'SEA', transportSource:'EXTERNAL', carrierId:vendors[0].id, quoteId:vendorQuote.id, originCity:'Surabaya', destCity:'Merauke', loadingDate:new Date().toISOString() };
  await request(`${base}/shipments`, admin, legBody, 'POST', 403);
  const booking = await approve(await submit('TRANSPORT_BOOK', job.id, legBody)); const leg = await request(`/shipments/${booking.resultId}`, admin); assert.equal(leg.carrierId, vendors[0].id);
  await request(`/shipments/${leg.id}`, admin, { freightAmount:1000 }, 'PUT', 403); await approve(await submit('TRANSPORT_CHANGE', leg.id, { freightAmount:1000 }));
  const revenue = await request(`${base}/charges`, admin, { kind:'REVENUE', description:'Freight revenue', estimatedAmount:3000 }); await approve(await submit('CHARGE_APPROVE', revenue.id));
  const invoice = await request(`${base}/invoices`, admin, {}); assert.equal(invoice.status, 'PENDING');
  assert.equal((await request(base, admin)).financials.receivable, '0.00'); assert.equal((await request(base, admin)).financials.unbilled, '3000.00');
  await request(`${base}/payments`, admin, { direction:'RECEIVABLE', invoiceId:invoice.id, amount:3000, reference:'AR-1' }, 'POST', 409);
  await approve(await submit('INVOICE_ISSUE', invoice.id)); await request(`${base}/payments`, admin, { direction:'RECEIVABLE', invoiceId:invoice.id, amount:3000, reference:'AR-1' });
  const claim = await request(`${base}/operations`, admin, { kind:'CLAIM', status:'OPEN', reference:marker, notes:'Damage reported' });
  await request(`${base}/operations/${claim.id}`, admin, { status:'SETTLED' }, 'PUT', 403); await approve(await submit('CLAIM_DECISION', claim.id, { status:'SETTLED', notes:'Resolved with supporting report' }));
  await request(`/shipments/${leg.id}/tracking`, admin, { eventType:'DELIVERED', location:'Merauke' });
  for (const document of (await request(base, admin)).documents.filter(row => row.required && row.status !== 'VERIFIED')) { await request(`${base}/documents/${document.id}/upload`, admin, file()); await request(`${base}/documents/${document.id}/verify`, admin, {}); }
  await request(`${base}/close`, admin, {}, 'POST', 403); await approve(await submit('JOB_CLOSE', job.id)); assert.equal((await request(base, admin)).status, 'CLOSED');
  const receiver = await createJob('RECEIVER'); const receiving = `/jobs/${receiver.id}`; const originals=[];
  for (let index=0;index<2;index++) {
    const row = await request(`${receiving}/packing-lists`, admin, file({ direction:'INBOUND', documentDate:'2026-10-19', externalNumber:`PL-${marker}-${index}`, senderName:'Perusahaan A Surabaya', originCity:'Surabaya', destCity:'Merauke', packages:index?5:10, grossWeightKg:index?600:1200, receiptStatus:index?'DISCREPANCY':'RECEIVED', actualPackages:index?4:10, receivedAt:new Date().toISOString(), receivedBy:'Petugas SCMU', discrepancyNotes:index?'Satu koli kurang':null })); originals.push(row);
    if(index) { await request(`${receiving}/packing-lists/${row.id}/finalize`, admin, {version:row.version}, 'POST', 403); await approve(await submit('PACKING_EXCEPTION', row.id, {version:row.version})); }
    else await request(`${receiving}/packing-lists/${row.id}/finalize`, admin, {version:row.version});
  }
  const head=await request(`${receiving}/packing-header`, admin, {documentDate:'2026-10-19',packingListIds:originals.map(row=>row.id)});
  await request(`${receiving}/packing-header/finalize`, director, {version:head.version}, 'POST', 403); await approve(await submit('PACKING_HEADER_FINALIZE',head.id,{version:head.version}));
  assert.equal((await request(receiving,admin)).status,'DELIVERED'); await approve(await submit('JOB_CLOSE',receiver.id)); assert.equal((await request(receiving,admin)).status,'CLOSED');
  const history=(await request('/approvals',director)).data.filter(row=>approvals.includes(row.id)); assert.ok(history.some(row=>row.status==='RETURNED') && history.some(row=>row.status==='REJECTED')); assert.ok(history.filter(row=>row.status==='APPROVED').every(row=>row.reviewedBy?.name && row.reviewedAt)); assert.ok(!JSON.stringify(history).includes('"password"'));
  console.log('PASS: Admin/Director separation; immutable submission snapshots and stale detection; return/reject/self-review/concurrency guards; budget/vendor/transport/packing/head/claim/invoice/closure approvals; two-step payment authorization and single-use actual posting; history preserved.');
}
async function cleanup() {
  const documents=await prisma.jobDocument.findMany({where:{jobId:{in:jobs}}}); const files=require('../backend/src/services/jobFiles'); for(const row of documents) await files.removeFile(row.filename);
  await prisma.directorApproval.deleteMany({where:{id:{in:approvals}}}); await prisma.jobPayment.deleteMany({where:{jobId:{in:jobs}}}); await prisma.invoiceItem.deleteMany({where:{invoice:{jobId:{in:jobs}}}}); await prisma.invoice.deleteMany({where:{jobId:{in:jobs}}});
  await prisma.packingHeader.deleteMany({where:{jobId:{in:jobs}}}); await prisma.packingList.deleteMany({where:{jobId:{in:jobs}}}); await prisma.jobDocument.deleteMany({where:{jobId:{in:jobs}}}); await prisma.jobOperation.deleteMany({where:{jobId:{in:jobs}}}); await prisma.jobCharge.deleteMany({where:{jobId:{in:jobs}}});
  await prisma.trackingEvent.deleteMany({where:{shipment:{jobId:{in:jobs}}}}); await prisma.shipment.deleteMany({where:{jobId:{in:jobs}}}); await prisma.jobOrder.deleteMany({where:{id:{in:jobs}}}); await prisma.salesQuotation.deleteMany({where:{id:{in:quotes}}});
  for(const id of rfqs) { await prisma.rFQ.update({where:{id},data:{awardedQuoteId:null}}); await prisma.quote.deleteMany({where:{rfqId:id}}); await prisma.rFQ.delete({where:{id}}); }
  await prisma.activityLog.deleteMany({where:{OR:[{entity:'JobOrder',entityId:{in:jobs}},{entity:'SalesQuotation',entityId:{in:quotes}},{entity:'RFQ',entityId:{in:rfqs}},{entity:'DirectorApproval',entityId:{in:approvals}}]}});
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{try{await cleanup();}finally{await prisma.$disconnect();}});
