const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('../backend/node_modules/@prisma/client');

const apiUrl = process.env.SCMU_API_URL || 'http://localhost:5000';
const databaseUrl = process.env.SCMU_DEMO_DATABASE_URL || 'postgresql://scmu_demo@127.0.0.1:55432/scmu_demo';
const target = new URL(databaseUrl);
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname) && target.pathname === '/scmu_demo', 'This workflow check only supports the local scmu_demo database.');
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const created = {};
const marker = `SCMU workflow check ${randomUUID()}`;

const request = require('./director-test-request.cjs')(apiUrl);
async function main() {
  const admin = await request('/auth/login', null, { email: 'admin@scmu.local', password: 'Admin@1234' });
  const operator = await request('/auth/login', null, { email: 'operasional@scmu.local', password: 'Ops@1234' });
  const companies = await request('/companies?limit=100', admin.token);
  const shipper = companies.data.find(company => company.email === 'info@scmu.local');
  assert.ok(shipper);
  const vendor = companies.data.find(company => company.type === 'TRANSPORTER');
  const route = (await request('/routes', admin.token))[0];
  const journey = {
    shipperCompanyId: shipper.id, originCity: route.originCity, originState: route.originState,
    destCity: route.destCity, destState: route.destState,
    loadingDate: new Date(Date.now() + 86400000).toISOString(),
  };

  created.rfq = await request('/rfq', admin.token, { ...journey, title: marker, vehicleType: 'TRUCK', quantity: 1 });
  created.quote = await request(`/rfq/${created.rfq.id}/quote`, operator.token, { transporterId: vendor.id, amount: '35000', notes: marker });
  await request(`/rfq/${created.rfq.id}/award/${created.quote.id}`, admin.token, {});
  const awarded = await request(`/rfq/${created.rfq.id}`, admin.token);
  assert.equal(awarded.status, 'AWARDED');
  assert.equal(awarded.awardedQuoteId, created.quote.id);

  // Also exercise the seeded OPEN RFQ UUID through the validator without adding
  // a quote or changing its status: invalid amount must be the only error.
  const sampleRfqs = await request('/rfq?limit=100', admin.token);
  const seededOpen = sampleRfqs.data.find(rfq => rfq.rfqNumber === 'SCMU-RFQ-001');
  const invalidQuote = await fetch(`${apiUrl}/api/rfq/${seededOpen.id}/quote`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${operator.token}` },
    body: JSON.stringify({ transporterId: vendor.id, amount: -1 }), signal: AbortSignal.timeout(15000),
  });
  assert.equal(invalidQuote.status, 422);
  const validation = await invalidQuote.json();
  assert.ok(validation.errors.every(error => error.path === 'amount'));

  created.job = await request('/jobs', operator.token, { title: marker, originCity: journey.originCity, destCity: journey.destCity, cargoDescription: marker, packages: 1, currency: 'IDR' });
  created.shipment = await request(`/jobs/${created.job.id}/shipments`, admin.token, { ...journey, transportSource: 'EXTERNAL', carrierId: vendor.id, quoteId: created.quote.id, notes: marker });
  assert.equal(created.shipment.quoteId, created.quote.id);
  await request(`/shipments/${created.shipment.id}/tracking`, admin.token, {
    eventType: 'DELIVERED', location: route.destCity, notes: marker,
  });
  const delivered = await request(`/shipments/${created.shipment.id}`, admin.token);
  assert.equal(delivered.status, 'DELIVERED');
  assert.ok(delivered.actualDelivery);
  assert.equal(delivered.trackingEvents.length, 1);

  const charge = await request(`/jobs/${created.job.id}/charges`, operator.token, { kind: 'REVENUE', description: marker, estimatedAmount: 35000 });
  await request(`/jobs/${created.job.id}/charges/${charge.id}/review`, admin.token, { status: 'APPROVED' });
  created.invoice = await request(`/jobs/${created.job.id}/invoices`, admin.token, { taxAmount: 0, notes: marker });
  assert.equal(created.invoice.totalAmount, 35000);
  await request(`/jobs/${created.job.id}/payments`, operator.token, { direction: 'RECEIVABLE', invoiceId: created.invoice.id, amount: 35000, reference: marker });
  assert.equal((await request(`/jobs/${created.job.id}`, operator.token)).invoices[0].status, 'PAID');
  console.log('PASS: RFQ and director vendor selection; job and approved vendor booking; tracking; approved revenue/invoice; receipt recording.');
}

async function cleanup() {
  await request.cleanup(prisma);
  // Only delete records returned by this invocation; preserve the seeded demo.
  if (created.job) { await prisma.jobPayment.deleteMany({ where: { jobId: created.job.id } }); await prisma.invoiceItem.deleteMany({ where: { invoice: { jobId: created.job.id } } }); }
  if (created.invoice) await prisma.invoice.delete({ where: { id: created.invoice.id } });
  if (created.shipment) {
    await prisma.trackingEvent.deleteMany({ where: { shipmentId: created.shipment.id } });
    await prisma.shipment.delete({ where: { id: created.shipment.id } });
  }
  if (created.job) { await prisma.jobDocument.deleteMany({ where: { jobId: created.job.id } }); await prisma.jobCharge.deleteMany({ where: { jobId: created.job.id } }); await prisma.jobOrder.delete({ where: { id: created.job.id } }); await prisma.activityLog.deleteMany({ where: { entity: 'JobOrder', entityId: created.job.id } }); }
  if (created.rfq) {
    await prisma.rFQ.update({ where: { id: created.rfq.id }, data: { awardedQuoteId: null } });
    await prisma.quote.deleteMany({ where: { rfqId: created.rfq.id } });
    await prisma.rFQ.delete({ where: { id: created.rfq.id } });
    await prisma.activityLog.deleteMany({ where: { entity: 'RFQ', entityId: created.rfq.id } });
  }
  await prisma.$disconnect();
}

main().catch(error => {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
}).finally(async () => {
  try { await cleanup(); } catch (error) {
    console.error(`Workflow cleanup failed: ${error.message}`);
    process.exitCode = 1;
  }
});
