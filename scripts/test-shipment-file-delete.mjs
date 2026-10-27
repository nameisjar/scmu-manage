import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir, unlink, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkPage } from './browser-check.mjs';
const root = fileURLToPath(new URL('..', import.meta.url)); const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client'); const jwt = require('jsonwebtoken'); const ExcelJS = require('exceljs');
const prisma = new PrismaClient({ datasources: { db: { url: 'postgresql://scmu_demo@127.0.0.1:55432/scmu_demo' } } });
const api = 'http://127.0.0.1:5000/api'; const marker = 'DELETEQA-' + randomUUID().slice(0, 8); const jobs = []; const diskFiles = new Set();
const output = path.join(root, '.demo', 'shipment-file-delete'); await mkdir(output, { recursive: true });
let token; let user;
async function request(endpoint, body, method = body ? 'POST' : 'GET', expected = 200, auth = token) {
  const response = await fetch(api + endpoint, { method, headers: { ...(auth ? { Authorization: 'Bearer ' + auth } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json(); assert.equal(response.status, expected, endpoint + ': ' + JSON.stringify(data).slice(0,500)); return data;
}
async function create(suffix, container) {
  const bill = await request('/bl-register', { billNumber: marker + '-' + suffix, vesselName: 'KM DEMO SCMU', voyageNumber: 'V01', portOfLoading: 'Surabaya', portOfDischarge: 'Merauke', containers: [{ number: container, seal: 'DEMO', size: '40' }], registerAmount: '7180000.25', register: { quantity20: 9, quantity21: 7, quantity40: 0, includeInPackingHeader: true, documentPolicy: 'BL_AND_PACKING' } }, 'POST', 201); jobs.push(bill.jobId); return bill;
}
async function upload(bill, category, name) {
  const body = new FormData(); body.append('version', bill.version); body.append('category', category); body.append('file', new Blob(['%PDF-1.4\nSCMU disposable test'], { type: 'application/pdf' }), name);
  const response = await fetch(api + '/bl-register/' + bill.id + '/files', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body }); assert.equal(response.status, 201, await (response.status === 201 ? Promise.resolve('') : response.text()));
  const current = await request('/bl-register/' + bill.id); current.files.forEach(f => diskFiles.add(f.filename)); return current;
}
const diskPath = filename => { assert.equal(path.basename(filename), filename); return path.join(root, 'backend/uploads/job-documents', filename); };
try {
  user = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, select: { id: true, role: true, name: true, email: true } }); assert(user);
  token = jwt.sign({ userId: user.id }, await readFile(path.join(root, '.demo/jwt-secret'), 'utf8'), { expiresIn: '10m' });
  let a = await create('A', 'TEST0000001'); let b = await create('B', 'TEST0000002');
  a = await upload(a, 'FINAL', 'older.pdf'); const old = a.files.find(f => f.originalName === 'older.pdf');
  a = await upload(a, 'FINAL', 'wrong-current.pdf'); const wrong = a.files.find(f => f.originalName === 'wrong-current.pdf');
  const endpoint = '/bl-register/' + a.id + '/files/' + wrong.id; const payload = { version: a.version, reason: 'Salah unggah B/L' };
  await request(endpoint, payload, 'DELETE', 401, null);
  await request('/bl-register/' + b.id + '/files/' + wrong.id, { ...payload, version: b.version }, 'DELETE', 404);
  await request(endpoint, { ...payload, reason: '' }, 'DELETE', 422);
  await request(endpoint, { ...payload, version: a.version - 1 }, 'DELETE', 409);
  assert(await stat(diskPath(wrong.filename))); assert(await stat(diskPath(old.filename)));
  await prisma.seaBill.update({ where: { id: a.id }, data: { archivedAt: new Date() } }); await request(endpoint, payload, 'DELETE', 409); await prisma.seaBill.update({ where: { id: a.id }, data: { archivedAt: null } });
  const deleted = await request(endpoint, payload, 'DELETE'); assert.equal(deleted.availability.billOfLading, false); assert.equal(deleted.cleanupPending, false);
  await assert.rejects(stat(diskPath(wrong.filename)), { code: 'ENOENT' }); assert(await stat(diskPath(old.filename)));
  await request(endpoint, undefined, 'GET', 404); a = await request('/bl-register/' + a.id);
  assert.equal(a.document.filename, null); assert.equal(a.receiptStatus, 'SEA_NOT_RECEIVED'); assert.equal(a.containers.length, 1); assert.equal(a.registerAmount, '7180000.25'); assert.equal(a.register.quantity21, 7);
  const missing = await request('/bl-register?search=' + marker + '&documents=BL_MISSING'); assert(missing.data.some(row => row.id === a.id));
  const complete = await request('/bl-register?search=' + marker + '&documents=COMPLETE'); assert(!complete.data.some(row => row.id === a.id));
  const exportResponse = await fetch(api + '/bl-register/export.xlsx?search=' + marker, { headers: { Authorization: 'Bearer ' + token } }); assert.equal(exportResponse.status, 200);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Buffer.from(await exportResponse.arrayBuffer()));
  const sheet = workbook.worksheets[0]; const numberColumn = sheet.getRow(1).values.indexOf('Nomor B/L'); const availableColumn = sheet.getRow(1).values.indexOf('B/L tersedia'); let exported;
  sheet.eachRow((row, index) => { if (index > 1 && row.getCell(numberColumn).value === a.billNumber) exported = row.getCell(availableColumn).value; }); assert.equal(exported, false);
  const audit = await prisma.activityLog.findFirst({ where: { entityId: a.jobId, action: 'SHIPMENT_FILE_DELETED' } }); assert.equal(audit.userId, user.id); assert.equal(audit.metadata.originalName, wrong.originalName); assert.equal(audit.metadata.reason, payload.reason);
  console.log('PASS owned/authorized deletion, reason, stale/archive guards, physical removal, retained older file, missing-BL filters/export and audit');
  a = await upload(a, 'FINAL', 'correct.pdf'); assert.equal(a.documentAvailability.billOfLading, true);
  a = await upload(a, 'PACKING_LIST', 'packing-source.pdf'); const source = a.files.find(f => f.originalName === 'packing-source.pdf');
  const operational = (await request('/bl-register/' + a.id + '/workspace')).operational;
  operational.packing.sourceFileIds = [source.id]; operational.packing.status = 'CONFIRMED'; operational.packing.groups = [{ containerNumber: 'TEST0000001', sealNumber: 'DEMO', sourceFileId: source.id, recipientName: 'Penerima demo', items: [{ description: 'Muatan demo', quantity: '5', packages: 5, volumeCbm: '0.03' }] }];
  await request('/bl-register/' + a.id + '/workspace', { version: a.version, operational }, 'PUT'); a = await request('/bl-register/' + a.id);
  await request('/bl-register/' + a.id + '/files/' + source.id, { version: a.version, reason: 'Salah file sumber Packing List' }, 'DELETE');
  a = await request('/bl-register/' + a.id); const after = (await request('/bl-register/' + a.id + '/workspace')).operational;
  assert.equal(after.packing.groups[0].items[0].packages, 5); assert.equal(after.packing.groups[0].sourceFileId, null); assert.equal(after.packing.status, 'DRAFT'); assert.equal(a.internalStatus, 'SEA_UNCHECKED'); await assert.rejects(stat(diskPath(source.filename)), { code: 'ENOENT' });
  console.log('PASS replacement restores availability; source deletion retains cargo data and requires another packing review');
  const selection = [a, b].map(row => ({ id: row.id, version: row.version })); const draft = await request('/operations/packing-headers/preview', { selection });
  const headerResponse = await fetch(api + '/operations/packing-headers', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ selection, headerNumber: draft.headerNumber, confirmed: true, acceptWarnings: true }) }); assert.equal(headerResponse.status, 200); await headerResponse.arrayBuffer();
  a = await request('/bl-register/' + a.id); b = await request('/bl-register/' + b.id); const ha = a.files.find(f => f.category === 'PACKING_HEADER'); const hb = b.files.find(f => f.category === 'PACKING_HEADER'); assert.equal(ha.filename, hb.filename); diskFiles.add(ha.filename);
  const correct = a.files.find(f=>f.originalName==='correct.pdf');
  await request('/bl-register/'+a.id+'/files/'+correct.id,{version:a.version,reason:'Periksa ulang sumber kepala gabungan'},'DELETE');
  a=await request('/bl-register/'+a.id);b=await request('/bl-register/'+b.id);assert.equal(b.registerData.operational.packing.headerStatus,'DRAFT');
  const shared = await request('/bl-register/' + a.id + '/files/' + ha.id, { version: a.version, reason: 'Hapus tautan kepala dari A' }, 'DELETE'); assert.equal(shared.sharedFileRetained, true); assert(await stat(diskPath(ha.filename)));
  const stillAvailable = await fetch(api + '/bl-register/' + b.id + '/files/' + hb.id, { headers: { Authorization: 'Bearer ' + token } }); assert.equal(stillAvailable.status, 200); await stillAvailable.arrayBuffer();
  await request('/bl-register/' + b.id + '/files/' + hb.id, { version: b.version, reason: 'Hapus tautan terakhir' }, 'DELETE'); await assert.rejects(stat(diskPath(ha.filename)), { code: 'ENOENT' });
  console.log('PASS related shared header requires review after source deletion; shared file survives until final reference is deleted');
  a=await request('/bl-register/'+a.id);a=await upload(a,'SUPPORTING','cost-evidence.pdf');const proof=a.files.find(f=>f.originalName==='cost-evidence.pdf');
  const proposed=await request('/bl-register/'+a.id+'/operational-costs',{version:a.version,description:'Biaya uji dengan bukti',quantity:'1',unit:'JOB',unitPrice:'1000.00',costSource:'INTERNAL',costCategory:'OTHER',evidenceFileId:proof.id},'POST',201);
  a=await request('/bl-register/'+a.id);await request('/bl-register/'+a.id+'/files/'+proof.id,{version:a.version,reason:'Bukti biaya salah unggah'},'DELETE');
  const director=await prisma.user.findFirst({where:{role:'SUPER_ADMIN',isActive:true}});assert(director&&director.id!==user.id);
  const directorToken=jwt.sign({userId:director.id},await readFile(path.join(root,'.demo/jwt-secret'),'utf8'),{expiresIn:'10m'});
  await request('/approvals/'+proposed.approval.id+'/review',{decision:'APPROVED'},'POST',409,directorToken);
  const charge=await prisma.jobCharge.findUnique({where:{id:proposed.charge.id}});assert.equal(charge.status,'PROPOSED');assert.equal(charge.estimatedAmount.toFixed(2),'1000.00');
  console.log('PASS deleting supporting evidence prevents approval of stale cost context without changing the proposed amount');
  for (const [label, width, language] of [['desktop', 1440, 'id'], ['tablet', 800, 'en']]) {
    let ui = await create('UI-' + label, 'TEST0000003'); ui = await upload(ui, 'FINAL', 'wrong-ui-' + label + '.pdf'); const file = ui.files.find(f => f.category === 'FINAL');
    const setupScript = `localStorage.setItem('scmu_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('scmu_token',${JSON.stringify(token)});localStorage.setItem('scmu_language',${JSON.stringify(language)});addEventListener('load',async()=>{const checks=[];const pause=()=>new Promise(r=>setTimeout(r,100));const wait=async fn=>{for(let i=0;i<140;i++){if(fn())return;await pause();}throw Error('UI timeout '+document.body.textContent.slice(-900));};const assert=(v,m)=>{if(!v)throw Error(m)};const button=(root,re)=>Array.from(root.querySelectorAll('button')).find(b=>re.test(b.textContent));try{
    await wait(()=>document.querySelector('[data-register-documents] tbody input[type=checkbox]'));const nav=document.querySelector('aside nav');assert(nav.textContent.includes(${JSON.stringify(language === 'id' ? 'Pengiriman' : 'Shipments')}),'Menu name missing');assert(!nav.textContent.includes('Register'),'Old menu name remains');const selectedRow=Array.from(document.querySelectorAll('[data-register-documents] tbody tr')).find(row=>row.textContent.includes(${JSON.stringify(file.originalName)}));selectedRow.querySelector('input[type=checkbox]').click();await pause();const remove=button(document.querySelector('[data-document-toolbar]'),/^Hapus lampiran$|^Delete attachment$/);remove.click();await wait(()=>document.querySelector('[role=dialog] form'));let modal=document.querySelector('[role=dialog]');assert(document.getElementById('root').inert,'Delete dialog does not lock background');assert(button(modal,/^Hapus lampiran$|^Delete attachment$/).disabled,'Deletion allows empty reason');button(modal,/^Batal$|^Cancel$/).click();await wait(()=>!document.querySelector('[role=dialog]'));assert(document.body.textContent.includes(${JSON.stringify(file.originalName)}),'Cancel removed attachment');checks.push('Pengiriman/Shipments menu, confirmation, required reason and cancel');remove.click();await wait(()=>document.querySelector('[role=dialog] textarea'));modal=document.querySelector('[role=dialog]');const field=modal.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,'Salah unggah dokumen uji');field.dispatchEvent(new Event('input',{bubbles:true}));await pause();assert(modal.getBoundingClientRect().bottom<=innerHeight,'Delete dialog overflows');button(modal,/^Hapus lampiran$|^Delete attachment$/).click();await wait(()=>!document.querySelector('[role=dialog]'));await wait(()=>!document.body.textContent.includes(${JSON.stringify(file.originalName)}));assert(document.querySelector('[data-bl-header]').textContent.match(/Menunggu file B.L|Awaiting B.L file/),'Header status did not refresh');assert(document.documentElement.scrollWidth<=innerWidth+1,'Page overflows');checks.push('confirmed deletion refreshes file table and BL status');document.documentElement.dataset.scmuCheck=btoa(unescape(encodeURIComponent(JSON.stringify({ok:true,checks}))));}catch(error){document.documentElement.dataset.scmuCheck=btoa(unescape(encodeURIComponent(JSON.stringify({ok:false,error:error.stack,checks}))));}});`;
    const result = await checkPage({ chrome: process.env.SCMU_TEST_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe', output, width, height: 1000, url: 'http://localhost:5173/bl-register/' + ui.id + '?tab=documents', screenshot: path.join(output, label + '.png'), setupScript }); assert(result.ok, label + ': ' + result.error);
    await assert.rejects(stat(diskPath(file.filename)), { code: 'ENOENT' }); assert.equal((await request('/bl-register/' + ui.id)).containers.length, 1); console.log('PASS ' + label + ': ' + result.checks.join(', '));
  }
  assert.equal(await prisma.jobCharge.count({ where: { jobId: { in: jobs } } }), 1); assert.equal(await prisma.invoice.count({ where: { jobId: { in: jobs } } }), 0);
} finally {
  if (jobs.length) {
    const remaining = await prisma.seaBillFile.findMany({ where: { bill: { jobId: { in: jobs } } }, select: { filename: true } }); remaining.forEach(f => diskFiles.add(f.filename));
    await prisma.activityLog.deleteMany({ where: { entity: 'JobOrder', entityId: { in: jobs } } });
    await prisma.directorApproval.deleteMany({where:{jobId:{in:jobs}}});await prisma.jobCharge.deleteMany({where:{jobId:{in:jobs}}});
    await prisma.seaBill.deleteMany({ where: { jobId: { in: jobs } } }); await prisma.jobDocument.deleteMany({ where: { jobId: { in: jobs } } }); await prisma.shipment.deleteMany({ where: { jobId: { in: jobs } } }); await prisma.jobOrder.deleteMany({ where: { id: { in: jobs } } });
    await prisma.documentFilePurge.deleteMany({ where: { filename: { in: [...diskFiles] } } });
    for (const filename of diskFiles) await unlink(diskPath(filename)).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
  await prisma.$disconnect();
}
