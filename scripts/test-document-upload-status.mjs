import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { checkPage } from './browser-check.mjs';
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client'), jwt = require('jsonwebtoken');
const fixture = require('../backend/test/fixtures/tanto');
const db = new PrismaClient({ datasources: { db: { url: 'postgresql://scmu_demo@127.0.0.1:55432/scmu_demo' } } });
const marker = 'UPLOADSTATUS-' + randomUUID(), number = 'SBY' + Date.now();
const width = Number(process.env.SCMU_QA_WIDTH || 1440), output = '.demo/upload-status-' + width;
await mkdir(output, { recursive: true });
let token;
async function request(url, body, method = body ? 'POST' : 'GET', status = 200) {
  const response = await fetch('http://localhost:5000/api' + url, { method, headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data)); return data;
}
try {
  const user = await db.user.findFirst({ where: { role: 'ADMIN', isActive: true }, select: { id: true, name: true, email: true, role: true } });
  token = jwt.sign({ userId: user.id }, await readFile('.demo/jwt-secret', 'utf8'), { expiresIn: '10m' });
  const doc = fixture.document({ number, containers: 2 }), bytes = fixture.pdf(doc);
  const form = new FormData(); form.append('file', new Blob([bytes], { type: 'application/pdf' }), marker + '.pdf');
  const upload = await fetch('http://localhost:5000/api/bl-imports/batch/file', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: form });
  assert.equal(upload.status, 201); const staged = await upload.json();
  const saved = await request('/bl-imports/batch/commit', { sessionId: staged.id, confirmed: true, documentType: 'BILL_OF_LADING', action: 'CREATE', fields: staged.fields });
  const bill = await request('/bl-register/' + saved.billIds[0]);
  assert.equal(bill.documentAvailability.billOfLading, true);
  await request('/bl-register/' + bill.id + '/files/' + saved.fileIds[0], { version: bill.version, reason: marker }, 'DELETE');
  const receipt = await request('/bl-imports/batch/' + staged.id);
  assert.equal(receipt.saved.attachmentsPresent, false); assert.deepEqual(receipt.saved.activeBillIds, []);
  await request('/bl-imports/batch/commit', { sessionId: staged.id }, 'POST', 409);
  const deleted = await request('/bl-register/' + bill.id);
  assert.equal(deleted.documentAvailability.billOfLading, false); assert.equal(deleted.files.length, 0);
  const setup = `localStorage.setItem('scmu_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('scmu_token',${JSON.stringify(token)});localStorage.setItem('scmu_language','id');sessionStorage.setItem(${JSON.stringify('scmu_document_batch_' + user.id)},${JSON.stringify(JSON.stringify([staged.id]))});
  addEventListener('load',async()=>{
    const pause=()=>new Promise(r=>setTimeout(r,100)),assert=(v,m)=>{if(!v)throw Error(m)},btn=(root,text)=>[...root.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
    const wait=async fn=>{for(let i=0;i<400;i++){if(fn())return;await pause();}throw Error('UI timeout: '+document.body.textContent.slice(-1000));};
    try {
      await wait(()=>btn(document,'Tambah pengiriman')&&!btn(document,'Tambah pengiriman').disabled);
      btn(document,'Tambah pengiriman').click();await wait(()=>document.querySelector('[data-shipment-entry] button')&&!document.querySelector('[data-shipment-entry] button').disabled);document.querySelector('[data-shipment-entry] button').click();
      await wait(()=>document.querySelector('[data-document-batch]'));const panel=document.querySelector('[data-document-batch]');
      assert(panel.textContent.includes('Lampiran telah dihapus'),'Stale saved receipt displayed');
      assert(!btn(document,'Buat rekap Packing List'),'Removed file still offered for recap');
      const input=panel.querySelector('input[type=file]'),dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob(${JSON.stringify(bytes.toString('base64'))}),c=>c.charCodeAt(0))],${JSON.stringify(marker + '-reupload.pdf')},{type:'application/pdf'}));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
      await wait(()=>[...panel.querySelectorAll('button')].some(b=>b.textContent.trim()==='Periksa'&&!b.disabled));[...panel.querySelectorAll('button')].find(b=>b.textContent.trim()==='Periksa'&&!b.disabled).click();
      await wait(()=>document.querySelector('[data-batch-review] input[type=checkbox]')&&!document.querySelector('[data-batch-review] input[type=checkbox]').disabled);const review=document.querySelector('[data-batch-review]');
      assert(review.querySelector('[data-batch-resolution]').textContent.includes('Pengiriman sudah tersedia'),'Existing destination not shown');assert(!review.querySelector('select[aria-label="Tindakan B/L"]'),'Manual technical action selector remains');
      assert(review.querySelector('input[aria-label="Pengirim pada dokumen"]').readOnly,'Existing metadata editable');review.querySelector('input[type=checkbox]').click();btn(document.querySelectorAll('[role=dialog]')[1],'Tandai sudah diperiksa').click();
      await wait(()=>!document.querySelector('[data-batch-review]'));[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Simpan yang diperiksa (1)').click();
      await wait(()=>panel.querySelector('[data-batch-outcome]').textContent.includes('1 pengiriman dilengkapi')&&btn(document,'Buat rekap Packing List')&&!btn(document,'Buat rekap Packing List').disabled);
      assert(panel.querySelector('[data-batch-outcome]').textContent.includes('0 pengiriman baru'),'Reupload created a duplicate shipment');
      document.querySelector('[role=dialog] .modal-body').scrollTop=0;assert(document.documentElement.scrollWidth<=innerWidth+1,'Horizontal page overflow');
      document.documentElement.dataset.scmuCheck=btoa(JSON.stringify({ok:true,checks:['deleted receipt refreshed','single upload through unified entry','existing BL attached without action selector','outcome distinguishes attachment from new shipment']}));
    } catch(error){document.documentElement.dataset.scmuCheck=btoa(JSON.stringify({ok:false,error:error.stack}));}
  });`;
  const result = await checkPage({ chrome: process.env.SCMU_TEST_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe', output, width, height: 1000, url: 'http://localhost:5173/bl-register', screenshot: path.join(output, 'reupload.png'), setupScript: setup });
  assert(result.ok, result.error);
  const after = await request('/bl-register/' + bill.id), list = await request('/bl-register?search=' + number);
  assert.equal(after.documentAvailability.billOfLading, true); assert.equal(after.files.length, 1); assert.equal(list.total, 1); assert.equal(list.data[0].documentAvailability.billOfLading, true);
  assert.deepEqual(after.containers, deleted.containers); assert.equal(after.shipperName, deleted.shipperName);
  console.log('PASS: ' + result.checks.join('; ') + '; list/detail B/L availability and original fields agree');
} finally {
  const bills = await db.seaBill.findMany({ where: { billNumber: number }, select: { id: true, jobId: true } }), jobs = bills.map(b => b.jobId);
  const stages = await db.bLImportSession.findMany({ where: { originalName: { startsWith: marker } }, select: { filename: true } }), files = await db.seaBillFile.findMany({ where: { billId: { in: bills.map(b => b.id) } }, select: { filename: true } });
  await db.bLImportSession.deleteMany({ where: { originalName: { startsWith: marker } } });await db.activityLog.deleteMany({ where: { entity: 'JobOrder', entityId: { in: jobs } } });
  await db.seaBill.deleteMany({ where: { id: { in: bills.map(b => b.id) } } });await db.jobDocument.deleteMany({ where: { jobId: { in: jobs } } });await db.shipment.deleteMany({ where: { jobId: { in: jobs } } });await db.jobOrder.deleteMany({ where: { id: { in: jobs } } });
  for (const name of new Set([...stages, ...files].map(file => file.filename))) if (path.basename(name) === name) await unlink(path.join('backend/uploads/job-documents', name)).catch(e => { if (e.code !== 'ENOENT') throw e; });
  await db.$disconnect();
}
