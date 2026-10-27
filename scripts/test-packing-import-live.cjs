// Disposable local-demo integration test. Synthetic cargo only; never changes existing records.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const ExcelJS = require('../backend/node_modules/exceljs');
const jwt = require('../backend/node_modules/jsonwebtoken');
const api = 'http://127.0.0.1:5000/api';
const prisma = new PrismaClient({ datasources: { db: { url: 'postgresql://scmu_demo@127.0.0.1:55432/scmu_demo' } } });
const marker = `PLQA-${randomUUID().slice(0, 8)}`; const jobs = []; const uploaded = new Set();
let token;
async function request(route, body, expected = 200, method = body ? 'POST' : 'GET') {
  const response = await fetch(api + route, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json(); assert.equal(response.status, expected, `${route}: ${JSON.stringify(result)}`); return result;
}
async function upload(bill, buffer, status = 201) {
  const body = new FormData(); body.append('version', String(bill.version)); body.append('file', new Blob([buffer]), 'partner.xlsx');
  const response = await fetch(`${api}/bl-register/${bill.id}/packing-import/preview`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body });
  const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data)); return data;
}
async function create(number, container) {
  const result = await request('/bl-register', { billNumber: `${marker}-${number}`, vesselName: `${marker} vessel`, voyageNumber: '03/26', shipperName: 'Mitra contoh', consigneeName: 'SCMU', containers: [{ number: container, seal: '123456', size: '20' }], register: { includeInPackingHeader: true, documentPolicy: 'BL_AND_PACKING' } }, 201);
  jobs.push(result.jobId); return result;
}
(async () => {
  try {
    const user = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true } }); assert(user);
    token = jwt.sign({ userId: user.id }, await fs.readFile(path.join(__dirname, '../.demo/jwt-secret'), 'utf8'), { expiresIn: '10m' });
    let bill = await create('A', 'SPNU2942265'); let second = await create('B', 'SPNU2832083');
    const book = new ExcelJS.Workbook(); const s = book.addWorksheet('PL');
    s.addRow([null, 'KM CONTOH V.03/26']); s.addRow([null, 'SPNU 294.226-5 / SEAL 123456']); s.addRow(['MERK:', 'PENERIMA CONTOH']);
    s.addRow(['TGL', 'TOKO', 'COLY', 'NAMA BARANG', 'UKURAN', null, null, 'M3/TN']); s.addRow(['07/09', null, 5, 'Muatan demo', 10, 20, 30, 0.03]); s.addRow(['SUB TOTAL:', null, 5]);
    const buffer = Buffer.from(await book.xlsx.writeBuffer());
    await upload(bill, Buffer.from('invalid'), 415);
    const custom = new ExcelJS.Workbook(); custom.addWorksheet('Custom').addRow(['Custom partner layout']);
    const manual = await upload(bill, Buffer.from(await custom.xlsx.writeBuffer()));
    assert.equal(manual.parser,'MANUAL_ONLY'); assert.equal(manual.groups.length,0);
    bill = await request(`/bl-register/${bill.id}`); assert(bill.files.some(file=>file.id===manual.fileId&&file.category==='PACKING_LIST'));
    const preview = await upload(bill, buffer); assert.equal(preview.totals.packages, 5); assert(preview.groups[0].sealMatches);
    const payload = { version: preview.version, fileId: preview.fileId, hash: preview.hash, groupIds: preview.groups.map(g => g.id), volumeUnit: 'UNCONFIRMED', confirmed: true };
    await request(`/bl-register/${second.id}/packing-import/${preview.fileId}/preview`, {}, 404);
    await request(`/bl-register/${bill.id}/packing-import/apply`, { ...payload, version: bill.version }, 409);
    await request(`/bl-register/${bill.id}/packing-import/apply`, { ...payload, confirmed: false }, 422);
    const applied = await request(`/bl-register/${bill.id}/packing-import/apply`, payload);
    assert.equal(applied.operational.packing.status, 'DRAFT'); assert.equal(applied.operational.packing.groups[0].items[0].itemDate, null); assert.equal(applied.operational.packing.groups[0].items[0].itemDateText, '07/09'); assert.equal(applied.reconciliation.totals.volumeCbm, null);
    await request(`/bl-register/${bill.id}/packing-import/apply`, { ...payload, version: applied.version }, 409);
    bill = await request(`/bl-register/${bill.id}`); assert.equal(bill.vesselName, `${marker} vessel`); assert.equal(bill.contentVersion, 1);
    console.log('PASS upload/preview/apply, unknown-layout manual fallback, original retained, partial dates, unknown units, duplicate protection, stale version and source ownership');
    const download = await fetch(`${api}/bl-register/${bill.id}/files/${preview.fileId}`, { headers: { Authorization: `Bearer ${token}` } }); assert.equal(download.status, 200); assert.deepEqual(Buffer.from(await download.arrayBuffer()), buffer);
    assert.equal((await fetch(`${api}/bl-register/${bill.id}/files/${preview.fileId}`)).status, 401);
    const selection = [bill, second].map(b => ({ id: b.id, version: b.version }));
    const draft = await request('/operations/packing-headers/preview', { selection }); assert.equal(draft.counts.containers, 2); assert.equal(draft.records.length, 2); assert(draft.warnings.length);
    await request('/operations/packing-headers', { selection, headerNumber: draft.headerNumber, confirmed: true, acceptWarnings: false }, 422);
    const generated = await fetch(`${api}/operations/packing-headers`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ selection, headerNumber: draft.headerNumber, confirmed: true, acceptWarnings: true }) });
    assert.equal(generated.status, 200, await (generated.status === 200 ? Promise.resolve('') : generated.text()));
    const output = new ExcelJS.Workbook(); await output.xlsx.load(Buffer.from(await generated.arrayBuffer())); assert.equal(output.worksheets[0].name, 'Kepala Packing List'); assert.equal(output.worksheets[1].rowCount, 2);
    const headerFiles = await prisma.seaBillFile.findMany({ where: { billId: { in: [bill.id, second.id] }, category: 'PACKING_HEADER' } }); assert.equal(headerFiles.length, 2); assert.equal(headerFiles[0].filename, headerFiles[1].filename);
    await request('/operations/packing-headers', { selection, headerNumber: draft.headerNumber, confirmed: true, acceptWarnings: true }, 409);
    const after = await request(`/bl-register/${bill.id}`); assert.equal(after.contentVersion, bill.contentVersion); assert.equal(after.releaseStatus, bill.releaseStatus);
    const op = (await request(`/bl-register/${bill.id}/workspace`)).operational; op.packing.groups[0].recipientName = 'PENERIMA REVISI';
    await request(`/bl-register/${bill.id}/workspace`, { version: after.version, operational: op }, 200, 'PUT');
    const revised = await request(`/bl-register/${bill.id}`); assert.equal(revised.registerData.operational.packing.headerStatus, 'DRAFT');
    assert.equal(await prisma.jobCharge.count({ where: { jobId: { in: jobs } } }), 0); assert.equal(await prisma.invoice.count({ where: { jobId: { in: jobs } } }), 0);
    console.log('PASS multi-B/L header saved/downloaded, Excel detail/provenance, stale guards, revision invalidation and unchanged BL release/finance');
  } finally {
    if (jobs.length) {
      const attachments = await prisma.seaBillFile.findMany({ where: { bill: { jobId: { in: jobs } } }, select: { filename: true } }); attachments.forEach(f => uploaded.add(f.filename));
      await prisma.activityLog.deleteMany({ where: { entity: 'JobOrder', entityId: { in: jobs } } });
      await prisma.seaBill.deleteMany({ where: { jobId: { in: jobs } } }); await prisma.jobDocument.deleteMany({ where: { jobId: { in: jobs } } }); await prisma.shipment.deleteMany({ where: { jobId: { in: jobs } } }); await prisma.jobOrder.deleteMany({ where: { id: { in: jobs } } });
      for (const filename of uploaded) { assert.equal(path.basename(filename), filename); await fs.unlink(path.join(__dirname, '../backend/uploads/job-documents', filename)); }
    }
    await prisma.$disconnect();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
