const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const api = process.env.SCMU_API_URL || 'http://127.0.0.1:5000'; const db = process.env.SCMU_DEMO_DATABASE_URL || 'postgresql://scmu_demo@127.0.0.1:55432/scmu_demo';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(api).hostname)); assert.ok(['localhost', '127.0.0.1'].includes(new URL(db).hostname) && new URL(db).pathname === '/scmu_demo');
const prisma = new PrismaClient({ datasources: { db: { url: db } } }); const jobs = []; const marker = randomUUID();
const files = require('../backend/src/services/jobFiles'); const fileDirectory = path.dirname(files.filePath('test.png'));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1kAAAAASUVORK5CYII=', 'base64');
const request = require('./director-test-request.cjs')(api);
function upload(version, bytes = png, type = 'image/png') { const form = new FormData(); form.append('file', new Blob([bytes], { type }), 'original.png'); if (version !== undefined) form.append('version', version); return form; }
function incomingUpload(body, bytes = png, type = 'image/png') { const form = upload(undefined, bytes, type); form.append('data', typeof body === 'string' ? body : JSON.stringify(body)); return form; }
async function main() {
  const admin = (await request('/auth/login', null, { email: 'operasional@scmu.local', password: 'Ops@1234' })).token;
  const sa = (await request('/auth/login', null, { email: 'admin@scmu.local', password: 'Admin@1234' })).token;
  const cargo = { title: `Packing group test ${marker}`, originCity: 'Surabaya', destCity: 'Merauke', cargoDescription: 'Grouped originals', packages: 30, weightKg: 3600, currency: 'IDR' };
  const createJob = async body => { const job = await request('/jobs', admin, body); jobs.push(job.id); return job; };
  const sender = await createJob({ ...cargo, originCity: 'Merauke', destCity: 'Surabaya' }); assert.equal(sender.jobType, 'SENDER');
  const receiver = await createJob({ ...cargo, jobType: 'RECEIVER' }); assert.equal(receiver.recipientName, 'SCMU');
  let other = await createJob({ ...cargo, jobType: 'RECEIVER', title: `${cargo.title} other` });
  assert.equal((await request(`/jobs?jobType=RECEIVER&search=${marker}`, admin)).data.length, 2);
  await request('/jobs', admin, { ...cargo, jobType: 'CUSTOMER' }, 'POST', 422);
  other = await request(`/jobs/${other.id}`, admin, { jobType: 'SENDER' }, 'PUT'); assert.equal(other.jobType, 'SENDER');
  await request(`/jobs/${other.id}/packing-header`, admin, { packingListIds: [] }, 'POST', 409);
  await request(`/jobs/${other.id}`, admin, { jobType: 'RECEIVER' }, 'PUT');
  const base = `/jobs/${receiver.id}/packing-lists`; const outBase = `/jobs/${sender.id}/packing-lists`; const headBase = `/jobs/${receiver.id}/packing-header`;
  await request(headBase, null, null, 'GET', 401); assert.equal((await request(headBase, admin)).data, null);
  const common = { documentDate: '2026-10-19', recipientName: 'Perusahaan A Surabaya', recipientAddress: 'Gudang Surabaya', originCity: 'Surabaya', destCity: 'Merauke' };
  const item = { description: 'Equipment', quantity: 4, unit: 'UNIT', packages: 2, netWeightKg: '10.125', grossWeightKg: '12.125', lengthCm: 100, widthCm: 50, heightCm: 50, volumeCbm: 999 };
  const original = index => ({ ...common, direction: 'INBOUND', externalNumber: `PL-A-${marker}-${index}`, senderName: 'Perusahaan A Surabaya', packages: [10, 15, 5][index], netWeightKg: [1100, 1650, 550][index], grossWeightKg: [1200, 1800, 600][index], volumeCbm: [6.5, 9.75, 3.25][index], receiptStatus: 'PENDING' });
  const snapshot = async () => ({ files: (await fs.readdir(fileDirectory)).sort(), records: await prisma.packingList.count({ where: { jobId: { in: jobs } } }), headers: await prisma.packingHeader.count({ where: { jobId: { in: jobs } } }), documents: await prisma.jobDocument.count({ where: { jobId: { in: jobs } } }), audits: await prisma.activityLog.count({ where: { entity: 'JobOrder', entityId: { in: jobs } } }) });
  const unchanged = async (endpoint, body, status) => { const before = await snapshot(); await request(endpoint, admin, body, 'POST', status); assert.deepEqual(await snapshot(), before, 'Rejected create must leave no file, record, document or audit'); };
  await unchanged(base, original(0), 422);
  const missingFile = new FormData(); missingFile.append('data', JSON.stringify(original(0))); await unchanged(base, missingFile, 422);
  await unchanged(base, incomingUpload('{invalid json'), 422);
  await unchanged(base, incomingUpload(original(0), 'not a PNG'), 415);
  await unchanged(base, incomingUpload(original(0), Buffer.alloc(5 * 1024 * 1024 + 1)), 413);
  await unchanged(base, incomingUpload(original(0), 'invalid type', 'text/plain'), 415);
  await unchanged(base, incomingUpload({ ...original(0), items: [item] }), 422);
  await unchanged(base, incomingUpload({ ...original(0), destCity: 'Jayapura' }), 422);
  await unchanged(outBase, incomingUpload(original(0)), 409);
  await unchanged(base, { ...common, direction: 'OUTBOUND', items: [item] }, 409);
  await unchanged(`/jobs/${sender.id}/packing-header`, { documentDate: common.documentDate, packingListIds: [] }, 409);
  // Outgoing documents remain independent of heads and originals.
  let outgoing = await request(outBase, admin, { ...common, originCity: 'Merauke', destCity: 'Surabaya', direction: 'OUTBOUND', senderName: 'Forged issuer', packages: 999, items: [item] });
  assert.equal(outgoing.senderName, 'SCMU'); assert.equal(outgoing.packages, 2); assert.equal(outgoing.volumeCbm, '0.5'); assert.equal(outgoing.sources.length, 0);
  outgoing = await request(`${outBase}/${outgoing.id}/finalize`, sa, { version: outgoing.version }); assert.equal(outgoing.document.filename, null); assert.equal(outgoing.document.status, 'VERIFIED');
  const rows = [];
  for (let index = 0; index < 3; index++) rows.push(await request(base, admin, incomingUpload(original(index))));
  for (const row of rows) { assert.ok(row.document.filename); assert.equal(row.items.length, 0); assert.equal(row.headerId, null); assert.equal(row.document.status, 'UPLOADED'); }
  await unchanged(base, incomingUpload(original(0)), 409);
  await request(`/jobs/${receiver.id}`, sa, { jobType: 'SENDER' }, 'PUT', 409);
  await request(`/jobs/${receiver.id}/documents/${rows[0].documentId}/verify`, sa, {}, 'POST', 409);
  await request(`/jobs/${receiver.id}/documents/${rows[0].documentId}/upload`, admin, upload(), 'POST', 409);
  const otherRow = await request(`/jobs/${other.id}/packing-lists`, sa, incomingUpload({ ...original(0), externalNumber: `OTHER-${marker}` }));
  for (const ids of [[], [rows[0].id, rows[0].id], [otherRow.id], [outgoing.id]]) await request(headBase, admin, { documentDate: common.documentDate, packingListIds: ids }, 'POST', 422);
  let header = await request(headBase, admin, { documentDate: common.documentDate, packingListIds: rows.slice(0, 2).map(row => row.id), packages: 999 });
  assert.equal(header.summary.packages, 25); assert.equal(header.summary.grossWeightKg, '3000.000'); assert.equal(header.summary.volumeCbm, '16.2500'); assert.equal(header.packingLists.length, 2);
  await request(headBase, sa, { documentDate: common.documentDate, packingListIds: [rows[0].id] }, 'POST', 409);
  await request(headBase, sa, { version: header.version }, 'DELETE');
  assert.equal((await request(base, admin)).data.length, 3); await fs.access(files.filePath(rows[0].document.filename));
  header = await request(headBase, admin, { documentDate: common.documentDate, packingListIds: rows.slice(0, 2).map(row => row.id) });
  const staleHeaderVersion = header.version; const oldFile = rows[0].document.filename; const oldVersion = rows[0].version;
  await request(`${base}/${rows[0].id}/original`, admin, upload(oldVersion, 'invalid bytes'), 'POST', 415);
  rows[0] = await request(`${base}/${rows[0].id}/original`, admin, upload(oldVersion));
  await assert.rejects(fs.access(files.filePath(oldFile)), error => error.code === 'ENOENT');
  await request(`${base}/${rows[0].id}/original`, admin, upload(oldVersion), 'POST', 409);
  await request(headBase, sa, { version: staleHeaderVersion, notes: 'stale' }, 'PUT', 409);
  header = (await request(headBase, admin)).data;
  header = await request(headBase, sa, { version: header.version, packingListIds: rows.map(row => row.id) }, 'PUT');
  assert.equal(header.summary.packages, 30); assert.equal(header.summary.netWeightKg, '3300.000'); assert.equal(header.summary.volumeCbm, '19.5000');
  await request(`${headBase}/finalize`, admin, { version: header.version }, 'POST', 409);
  await request(`/jobs/${receiver.id}/close`, admin, {}, 'POST', 409);
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]; const receipt = { version: row.version, receiptStatus: 'RECEIVED', receivedAt: new Date().toISOString(), receivedBy: 'Petugas SCMU', actualPackages: row.packages, actualWeightKg: row.grossWeightKg };
    if (index === 0) {
      await request(`${base}/${row.id}`, admin, { ...receipt, actualPackages: 8 }, 'PUT', 422);
      receipt.receiptStatus = 'DISCREPANCY'; receipt.actualPackages = 8;
      await request(`${base}/${row.id}`, admin, receipt, 'PUT', 422); receipt.discrepancyNotes = 'Dua koli belum diterima';
    }
    rows[index] = await request(`${base}/${row.id}`, admin, receipt, 'PUT');
    rows[index] = await request(`${base}/${row.id}/finalize`, sa, { version: rows[index].version });
  }
  header = (await request(headBase, admin)).data;
  assert.equal(header.summary.receivedDocuments, 3); assert.equal(header.summary.pendingDocuments, 0); assert.equal(header.summary.discrepancyDocuments, 1); assert.equal(header.summary.actualPackages, 28);
  assert.equal((await request(`/jobs/${receiver.id}`, admin)).status, 'IN_PROGRESS');
  const concurrentBody = { ...original(0), externalNumber: `EXTRA-${marker}` }; const beforeConcurrent = await snapshot();
  const creates = await Promise.all([1, 2].map(() => fetch(`${api}/api${base}`, { method: 'POST', headers: { Authorization: `Bearer ${sa}` }, body: incomingUpload(concurrentBody) })));
  assert.deepEqual(creates.map(response => response.status).sort(), [201, 409]); const extra = await creates.find(response => response.status === 201).json();
  assert.equal((await snapshot()).files.length, beforeConcurrent.files.length + 1);
  header = (await request(headBase, admin)).data;
  await request(`${headBase}/finalize`, admin, { version: header.version }, 'POST', 409);
  await request(`${base}/${extra.id}`, admin, { version: extra.version }, 'DELETE'); assert.deepEqual((await snapshot()).files, beforeConcurrent.files);
  header = (await request(headBase, admin)).data;
  const edits = await Promise.all([1, 2].map(i => fetch(`${api}/api${headBase}`, { method: 'PUT', headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ version: header.version, notes: `edit ${i}` }) })));
  assert.deepEqual(edits.map(response => response.status).sort(), [200, 409]); header = (await request(headBase, admin)).data;
  const pendingHead = await request('/approvals', admin, { action: 'PACKING_HEADER_FINALIZE', entityId: header.id, payload: { version: header.version } });
  const finals = await Promise.all([1, 2].map(() => fetch(`${api}/api/approvals/${pendingHead.id}/review`, { method: 'POST', headers: { Authorization: `Bearer ${sa}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'APPROVED' }) })));
  assert.deepEqual(finals.map(response => response.status).sort(), [200, 409]); header = (await request(headBase, admin)).data; assert.equal(header.status, 'FINAL');
  for (const method of ['PUT', 'DELETE']) await request(headBase, admin, { version: header.version }, method, 409);
  for (const method of ['PUT', 'DELETE']) await request(`${base}/${rows[0].id}`, admin, { version: rows[0].version }, method, 409);
  await unchanged(base, incomingUpload({ ...original(0), externalNumber: `LOCKED-${marker}` }), 409);
  const downloaded = await fetch(`${api}/api/jobs/${receiver.id}/documents/${rows[0].documentId}/file`, { headers: { Authorization: `Bearer ${admin}` } }); assert.equal(downloaded.status, 200); assert.ok(Buffer.from(await downloaded.arrayBuffer()).equals(png));
  assert.equal((await request(`/jobs/${receiver.id}`, admin)).status, 'DELIVERED');
  assert.equal((await request(`/jobs/${receiver.id}/close`, admin, {})).status, 'CLOSED');
  assert.equal(await prisma.user.count({ where: { role: 'CUSTOMER' } }), 0);
  console.log('PASS: Sender/Receiver jobs; three originals under one selected head; exact totals and per-document receipt; file rollback/replacement; same-job/route/auth/version/concurrency guards; locked final head; receiving without owned transport; independent outgoing lists; original downloads and closing.');
}
async function cleanup() {
  await request.cleanup(prisma);
  const documents = await prisma.jobDocument.findMany({ where: { jobId: { in: jobs } } }); for (const document of documents) await files.removeFile(document.filename);
  await prisma.packingListSource.deleteMany({ where: { packingList: { jobId: { in: jobs } } } }); await prisma.packingHeader.deleteMany({ where: { jobId: { in: jobs } } });
  await prisma.packingList.deleteMany({ where: { jobId: { in: jobs } } }); await prisma.jobDocument.deleteMany({ where: { jobId: { in: jobs } } });
  await prisma.jobOrder.deleteMany({ where: { id: { in: jobs } } }); await prisma.activityLog.deleteMany({ where: { entity: 'JobOrder', entityId: { in: jobs } } });
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { try { await cleanup(); } finally { await prisma.$disconnect(); } });
