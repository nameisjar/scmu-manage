const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const { companies, routes, jptId } = require('../backend/prisma/demo-indonesia');
const databaseUrl = process.env.SCMU_DEMO_DATABASE_URL || 'postgresql://scmu_demo@127.0.0.1:55432/scmu_demo';
const target = new URL(databaseUrl);
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname) && target.pathname === '/scmu_demo', 'Only the local demo database is supported');
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const models = ['company', 'route', 'vehicle', 'driver', 'shipment', 'trackingEvent', 'rFQ', 'quote', 'invoice', 'invoiceItem', 'salesQuotation', 'jobOrder', 'jobCharge', 'jobDocument', 'jobPayment', 'packingList', 'packingListItem', 'packingListSource', 'packingHeader', 'directorApproval'];
async function snapshot() {
  return JSON.stringify(await Promise.all(models.map(async model => [model, await prisma[model].findMany({ orderBy: model === 'packingListSource' ? [{ packingListId: 'asc' }, { sourceId: 'asc' }] : { id: 'asc' } })])));
}
async function main() {
  const base = await prisma.shipment.findMany({ where: { shipmentNumber: { in: Array.from({ length: 6 }, (_, i) => `SCMU-SHP-${String(i + 1).padStart(3, '0')}`) } }, include: { route: true, trackingEvents: true } });
  assert.equal(base.length, 6);
  for (const shipment of base) {
    assert.equal(shipment.destCity, 'Merauke'); assert.equal(shipment.destState, 'Papua Selatan'); assert.equal(shipment.currency, 'IDR');
    assert.equal(shipment.route.destCity, 'Merauke');
    assert.ok(!/Mumbai|Delhi|Bangalore|Maharashtra|Karnataka/i.test(JSON.stringify(shipment)));
  }
  const seededRoutes = await prisma.route.findMany({ where: { id: { in: routes.map(route => route.id) } } });
  assert.equal(seededRoutes.length, 4); assert.ok(seededRoutes.every(route => route.destCity === 'Merauke'));
  for (const company of companies) assert.equal((await prisma.company.findUnique({ where: { id: company.id } })).state, company.state);
  const job = await prisma.jobOrder.findUnique({ where: { id: jptId('job') }, include: { shipments: { orderBy: { sequence: 'asc' } }, invoices: true } });
  assert.equal(job.destCity, 'Merauke'); assert.equal(job.currency, 'IDR'); assert.equal(job.shipments[1].destCity, 'Pelabuhan Merauke'); assert.equal(job.shipments[2].destCity, 'Merauke');
  assert.ok(job.invoices.every(invoice => invoice.currency === 'IDR'));
  const before = await snapshot();
  await promisify(execFile)(process.execPath, [path.join(__dirname, '../backend/prisma/seed.js')], { cwd: path.join(__dirname, '..'), env: { ...process.env, DATABASE_URL: databaseUrl }, windowsHide: true, timeout: 30000 });
  assert.equal(await snapshot(), before, 'Re-running seed must not duplicate records or overwrite existing edits/statuses/payments');
  console.log('PASS: known demo routes/shipments/tracking/companies/job use Indonesia, Merauke and IDR; repeated seed preserves every existing business record.');
}
main().catch(error => { console.error(`FAIL: ${error.message}`); process.exitCode = 1; }).finally(() => prisma.$disconnect());
