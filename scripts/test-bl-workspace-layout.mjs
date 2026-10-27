// Real-browser checks using disposable records in the isolated SCMU demo database.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPage } from './browser-check.mjs';
const root = fileURLToPath(new URL('..', import.meta.url)); const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client'); const jwt = require('jsonwebtoken');
const prisma = new PrismaClient({ datasources: { db: { url: 'postgresql://scmu_demo@127.0.0.1:55432/scmu_demo' } } });
const output = path.join(root, '.demo', 'bl-workspace-layout'); await mkdir(output, { recursive: true }); const jobs = [];
try {
  const user = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, select: { id: true, name: true, email: true, role: true } });
  assert(user); const token = jwt.sign({ userId: user.id }, await readFile(path.join(root, '.demo/jwt-secret'), 'utf8'), { expiresIn: '10m' });
  const marker = 'LAYOUT-' + randomUUID().slice(0, 8);
  const response = await fetch('http://127.0.0.1:5000/api/bl-register', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ billNumber: marker, vesselName: 'KM SPIL Hasya (Demo)', voyageNumber: 'V.04/26', shipperName: 'Gudang SCMU Surabaya', consigneeName: 'Gudang SCMU Merauke', carrierName: 'Pelayaran SCMU (Demo)', portOfLoading: 'Surabaya', portOfDischarge: 'Merauke', containers: [{ number: 'TEST0000001', seal: 'DEMO-001', size: '40' }, { number: 'TEST0000002', seal: 'DEMO-002', size: '40' }], registerAmount: '7180000.25', register: { dateMeaning: 'UNCONFIRMED', departureDate: '2026-05-04', arrivalDate: '2026-05-19', documentPolicy: 'BL_AND_PACKING', quantity20: 9, quantity21: 7, quantity40: 0, partyName: 'Mitra SCMU (Demo)', partyText: 'SCMU', reference1: '000245', reference2: 'INV-DEMO-001', additionalDate1: '2026-05-20', additionalDate2: '2026-06-20', additionalNotes: 'Catatan referensi demo', cargoDescription: 'Peralatan operasional dan barang kebutuhan gudang' } }) });
  const bill = await response.json(); assert.equal(response.status, 201, JSON.stringify(bill)); jobs.push(bill.jobId);
  for (const [label, width, language, mode] of [['desktop-summary', 1440, 'id', 'workflow'], ['desktop-editor', 1440, 'en', 'editor'], ['tablet-summary', 800, 'id', 'summary'], ['mobile-summary', 390, 'id', 'summary']]) {
    const setupScript = `localStorage.setItem('scmu_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('scmu_token',${JSON.stringify(token)});localStorage.setItem('scmu_language',${JSON.stringify(language)});
    addEventListener('load',async()=>{const checks=[];const pause=()=>new Promise(r=>setTimeout(r,100));const assert=(v,m)=>{if(!v)throw Error(m)};const wait=async fn=>{for(let i=0;i<140;i++){if(fn())return;await pause();}throw Error('UI timeout '+document.body.textContent.slice(-900));};const button=(root,re)=>Array.from(root.querySelectorAll('button')).find(b=>re.test(b.textContent));const tabs=()=>Array.from(document.querySelectorAll('[data-bl-tabs] button'));const setValue=(el,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));};try{
      await wait(()=>document.querySelector('[data-bl-summary]'));assert(document.querySelectorAll('[data-page-navigation]').length===1,'Repeated header');assert(document.querySelectorAll('[data-page-back]').length===1,'Repeated back button');assert(!document.querySelector('[data-bl-form]'),'Summary defaults to a form');assert(tabs().length===5,'Primary sections not grouped');
      assert(document.documentElement.scrollWidth<=innerWidth+1,'Whole page overflows horizontally');assert(getComputedStyle(document.querySelector('[data-page-scroll]')).backgroundColor==='rgb(244, 247, 251)','Workspace is not light');assert(getComputedStyle(document.querySelector('aside')).backgroundColor==='rgb(16, 28, 51)','Sidebar lost navy palette');assert(getComputedStyle(document.querySelector('.bl-section')).backgroundColor==='rgb(255, 255, 255)','Cards are not white');checks.push('one header/back, read-only summary, five sections and light/navy palette');
      if(${JSON.stringify(mode)}==='workflow'){
        tabs()[1].click();await wait(()=>document.body.textContent.includes('Kontainer pada B/L'));button(document,/Pemeriksaan bongkar/).click();await wait(()=>document.body.textContent.includes('Pemeriksaan pembongkaran'));assert(tabs()[1].getAttribute('aria-selected')==='true','Unloading parent section inactive');checks.push('container and unloading navigation');
        tabs()[3].click();await wait(()=>document.querySelector('[data-register-documents]'));button(document,/^Pemeriksaan dokumen$/).click();await wait(()=>document.body.textContent.includes('Rekonsiliasi B/L'));assert(new URLSearchParams(location.search).get('tab')==='checks','Checks deep link lost');
        const scroller=document.querySelector('[data-page-scroll]');scroller.scrollTop=600;await pause();assert(document.querySelector('[data-bl-header]').getBoundingClientRect().top>=-1,'Header leaves viewport');checks.push('document checks and sticky back/edit header');
        tabs()[4].click();await wait(()=>document.body.textContent.includes('Rekap biaya operasional'));button(document,/^Riwayat perubahan$/).click();await wait(()=>new URLSearchParams(location.search).get('tab')==='history');assert(tabs()[4].getAttribute('aria-selected')==='true','History parent section inactive');
        tabs()[0].click();await wait(()=>document.querySelector('[data-bl-summary]'));button(document,/^Ubah data$/).click();await wait(()=>document.querySelector('[role=dialog] [data-bl-form]'));let modal=document.querySelector('[role=dialog]');assert(document.getElementById('root').inert,'Editor background not locked');
        const vendor=modal.querySelector('input[aria-label="Vendor/JPT"]');setValue(vendor,'Mitra SCMU Revisi');await pause();button(modal,/^Simpan perubahan$/).click();await wait(()=>!document.querySelector('[role=dialog]'));await wait(()=>document.querySelector('[data-bl-summary]').textContent.includes('Mitra SCMU Revisi'));
        const saved=await fetch('http://localhost:5000/api/bl-register/${bill.id}',{headers:{Authorization:'Bearer '+localStorage.getItem('scmu_token')}}).then(r=>r.json());assert(saved.register.quantity20===9&&saved.register.quantity21===7&&saved.register.quantity40===0,'Manual quantities were recalculated');assert(saved.registerAmount==='7180000.25'&&saved.register.reference1==='000245'&&saved.register.reference2==='INV-DEMO-001','Editing lost invoice data or exact amount');assert(saved.containers.length===2,'Editing changed containers');checks.push('modal edit saves and preserves manual quantities, invoice data, amount and containers');
      }
      if(${JSON.stringify(mode)}==='editor'){
        button(document,/^Edit data$/).click();await wait(()=>document.querySelector('[role=dialog] [data-bl-form]'));const modal=document.querySelector('[role=dialog]');const footer=modal.querySelector('.modal-footer');modal.querySelector('.modal-body').scrollTop=10000;await pause();assert(footer.getBoundingClientRect().bottom<=innerHeight,'Editor actions outside viewport');assert(modal.getBoundingClientRect().top>=0,'Modal clipped at top');assert(modal.textContent.includes('Related parties')&&modal.textContent.includes('Shipment dates'),'Editor not translated');checks.push('English grouped editor, scrolling body and visible save/cancel footer');
      }
      assert(document.documentElement.scrollWidth<=innerWidth+1,'Final viewport overflows');document.documentElement.dataset.scmuCheck=btoa(unescape(encodeURIComponent(JSON.stringify({ok:true,checks}))));
    }catch(error){document.documentElement.dataset.scmuCheck=btoa(unescape(encodeURIComponent(JSON.stringify({ok:false,error:error.stack,checks}))));}});`;
    const result = await checkPage({ chrome: process.env.SCMU_TEST_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe', output, width, height: 1000, url: 'http://localhost:5173/bl-register/' + bill.id, screenshot: path.join(output, label + '.png'), setupScript });
    assert(result.ok, label + ': ' + result.error); console.log('PASS ' + label + ': ' + result.checks.join(', '));
  }
} finally {
  if (jobs.length) {
    await prisma.activityLog.deleteMany({ where: { entity: 'JobOrder', entityId: { in: jobs } } });
    await prisma.seaBill.deleteMany({ where: { jobId: { in: jobs } } }); await prisma.jobDocument.deleteMany({ where: { jobId: { in: jobs } } }); await prisma.shipment.deleteMany({ where: { jobId: { in: jobs } } }); await prisma.jobOrder.deleteMany({ where: { id: { in: jobs } } });
  }
  await prisma.$disconnect();
}
