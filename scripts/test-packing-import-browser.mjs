import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPage } from './browser-check.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client'); const ExcelJS = require('exceljs'); const jwt = require('jsonwebtoken');
const prisma = new PrismaClient({ datasources: { db: { url: 'postgresql://scmu_demo@127.0.0.1:55432/scmu_demo' } } });
const jobs = []; const output = path.join(root, '.demo', 'packing-import-ui'); await mkdir(output, { recursive: true });
try {
  const user = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, select: { id: true, name: true, role: true, email: true } });
  const token = jwt.sign({ userId: user.id }, await readFile(path.join(root, '.demo/jwt-secret'), 'utf8'), { expiresIn: '10m' });
  for (const [label, width, language] of [['desktop', 1440, 'en'], ['tablet', 800, 'id']]) {
    const marker = `PLUI-${randomUUID().slice(0, 8)}`;
    const response = await fetch('http://127.0.0.1:5000/api/bl-register', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ billNumber: marker, vesselName: 'KM CONTOH', voyageNumber: '03/26', shipperName: 'MITRA CONTOH', consigneeName: 'SCMU', containers: [{ number: 'SPNU2942265', seal: '123456', size: '20' }], register: { includeInPackingHeader: true } }) });
    const bill = await response.json(); assert.equal(response.status, 201); jobs.push(bill.jobId);
    const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet('PL');
    sheet.addRow([null, 'SPNU 294.226-5 / SEAL 123456']); sheet.addRow(['MERK:', 'PENERIMA CONTOH']); sheet.addRow(['TGL', 'TOKO', 'COLY', 'NAMA BARANG', 'UKURAN', null, null, 'M3/TN']); sheet.addRow(['07/09', null, 5, 'Muatan contoh', 10, 20, 30, 0.03]); sheet.addRow(['SUB TOTAL:', null, 5]);
    const form = new FormData(); form.append('version', bill.version); form.append('file', new Blob([await book.xlsx.writeBuffer()]), 'partner-contoh.xlsx');
    const upload = await fetch(`http://127.0.0.1:5000/api/bl-register/${bill.id}/packing-import/preview`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    const source = await upload.json(); assert.equal(upload.status, 201);
    const setupScript = `localStorage.setItem('scmu_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('scmu_token',${JSON.stringify(token)});localStorage.setItem('scmu_language',${JSON.stringify(language)});
    const clickAnchor=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download){window.__packingDownload=this.download;return;}return clickAnchor.call(this);};
    addEventListener('load',async()=>{const checks=[];const pause=()=>new Promise(r=>setTimeout(r,100));const assert=(v,m)=>{if(!v)throw Error(m)};const wait=async fn=>{for(let i=0;i<150;i++){if(fn())return;await pause();}throw Error('UI timeout: '+document.body.textContent.slice(-1800));};const button=(root,re)=>Array.from(root.querySelectorAll('button')).find(b=>re.test(b.textContent));const setSelect=(el,v)=>{Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('change',{bubbles:true}));};try{
      await wait(()=>document.querySelector('input[type=file][accept=".xlsx"]'));assert(new URLSearchParams(location.search).get('tab')==='packing','Deep link lost');checks.push('Packing List deep link and Excel import UI');
      const select=Array.from(document.querySelectorAll('select')).find(s=>Array.from(s.options).some(o=>o.value===${JSON.stringify(source.fileId)}));assert(select,'Uploaded XLSX selector absent');setSelect(select,${JSON.stringify(source.fileId)});await pause();button(document,/Preview import|Pratinjau impor/).click();await wait(()=>document.querySelector('[role=dialog]'));
      let modal=document.querySelector('[role=dialog]');assert(modal.textContent.includes('PENERIMA CONTOH'),'Preview missing source group');assert(modal.getBoundingClientRect().bottom<=innerHeight,'Modal below viewport');assert(document.documentElement.scrollWidth<=innerWidth+1,'Page overflows');assert(document.getElementById('root').inert,'Background not inert');checks.push('Import modal, recipient preview, viewport containment and background lock');
      const confirm=Array.from(modal.querySelectorAll('input[type=checkbox]')).at(-1);confirm.click();await pause();const apply=button(modal,/Apply as draft|Terapkan sebagai draf/);assert(!apply.disabled,'Apply remains disabled after confirmation');apply.click();await wait(()=>!document.querySelector('[role=dialog]'));await wait(()=>document.body.textContent.includes('07/09'));assert(Array.from(document.querySelectorAll('input')).some(i=>i.value==='Muatan contoh'),'Applied item absent');checks.push('Manual confirmation applies draft and retains source date');
      button(document,/Create Packing Header|Buat Kepala Packing List/).click();await wait(()=>document.querySelector('[role=dialog]'));modal=document.querySelector('[role=dialog]');await wait(()=>modal.textContent.includes('SPNU2942265'));assert(modal.getBoundingClientRect().bottom<=innerHeight,'Header modal below viewport');
      for(const checkbox of modal.querySelectorAll('input[type=checkbox]'))if(!checkbox.checked)checkbox.click();await pause();const save=button(modal,/Save and download Excel|Simpan dan unduh Excel/);assert(!save.disabled,'Header save disabled');save.click();await wait(()=>button(document.querySelector('[role=dialog]'),/Print \\/ Save PDF|Cetak \\/ Simpan PDF/));assert(window.__packingDownload?.endsWith('.xlsx'),'Excel download not requested');checks.push('Header preview, warning acknowledgement, saved Excel and print action');
      document.documentElement.dataset.scmuCheck=btoa(unescape(encodeURIComponent(JSON.stringify({ok:true,checks}))));
    }catch(error){document.documentElement.dataset.scmuCheck=btoa(unescape(encodeURIComponent(JSON.stringify({ok:false,error:error.stack,checks}))));}});`;
    const result = await checkPage({ chrome: process.env.SCMU_TEST_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe', output, width, height: 1000, url: `http://localhost:5173/bl-register/${bill.id}?tab=packing`, screenshot: path.join(output, label + '.png'), setupScript });
    assert(result.ok, `${label}: ${result.error}`); console.log(`PASS ${label}: ${result.checks.join(', ')}`);
  }
} finally {
  if (jobs.length) {
    const files = await prisma.seaBillFile.findMany({ where: { bill: { jobId: { in: jobs } } }, select: { filename: true } });
    await prisma.activityLog.deleteMany({ where: { entity: 'JobOrder', entityId: { in: jobs } } });
    await prisma.seaBill.deleteMany({ where: { jobId: { in: jobs } } }); await prisma.jobDocument.deleteMany({ where: { jobId: { in: jobs } } }); await prisma.shipment.deleteMany({ where: { jobId: { in: jobs } } }); await prisma.jobOrder.deleteMany({ where: { id: { in: jobs } } });
    for (const filename of new Set(files.map(f => f.filename))) { assert.equal(path.basename(filename), filename); await unlink(path.join(root, 'backend/uploads/job-documents', filename)); }
  }
  await prisma.$disconnect();
}
