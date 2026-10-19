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

async function request(path, token, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(`${apiUrl}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  assert.ok(response.ok, `${method} ${path}: HTTP ${response.status} ${JSON.stringify(data)}`);
  return data;
}

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

  created.shipment = await request('/shipments', admin.token, { ...journey, transportSource: 'EXTERNAL', carrierId: vendor.id, quoteId: created.quote.id, freightAmount: 35000, notes: marker });
  assert.equal(created.shipment.quoteId, created.quote.id);
  await request(`/shipments/${created.shipment.id}/tracking`, admin.token, {
    eventType: 'DELIVERED', location: route.destCity, notes: marker,
  });
  const delivered = await request(`/shipments/${created.shipment.id}`, admin.token);
  assert.equal(delivered.status, 'DELIVERED');
  assert.ok(delivered.actualDelivery);
  assert.equal(delivered.trackingEvents.length, 1);

  created.invoice = await request('/invoices', admin.token, {
    shipmentId: created.shipment.id, companyId: shipper.id, freightAmount: 35000,
    gstAmount: 0, invoiceDate: new Date().toISOString(), notes: marker,
  });
  assert.equal(created.invoice.totalAmount, 35000);
  const paid = await request(`/invoices/${created.invoice.id}`, admin.token, { status: 'PAID', paidDate: new Date().toISOString() }, 'PUT');
  assert.equal(paid.status, 'PAID');
  console.log('PASS: create RFQ, transporter quote, award, create shipment, tracking delivery, create invoice, mark paid.');
}

async function cleanup() {
  // Only delete records returned by this invocation; preserve the seeded demo.
  if (created.invoice) await prisma.invoice.delete({ where: { id: created.invoice.id } });
  if (created.shipment) {
    await prisma.trackingEvent.deleteMany({ where: { shipmentId: created.shipment.id } });
    await prisma.shipment.delete({ where: { id: created.shipment.id } });
  }
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
