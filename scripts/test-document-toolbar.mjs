import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {checkPage} from './browser-check.mjs';
const root=process.cwd(),require=createRequire(new URL('../backend/package.json',import.meta.url));
const {PrismaClient}=require('@prisma/client'),jwt=require('jsonwebtoken'),unzip=require('unzipper');
const prisma=new PrismaClient({datasources:{db:{url:'postgresql://scmu_demo@127.0.0.1:55432/scmu_demo'}}});
const marker='DOCTOOL-'+randomUUID().slice(0,8),jobs=[],output=path.join(root,'.demo/document-toolbar');
let token;
async function request(endpoint,body,method=body?'POST':'GET',expected=200){
 const r=await fetch('http://localhost:5000/api'+endpoint,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 const data=await r.json();assert.equal(r.status,expected,JSON.stringify(data));return data;
}
try{
 await mkdir(output,{recursive:true});
 const user=await prisma.user.findFirst({where:{role:'ADMIN',isActive:true},select:{id:true,name:true,email:true,role:true}});
 token=jwt.sign({userId:user.id},await readFile(path.join(root,'.demo/jwt-secret'),'utf8'),{expiresIn:'20m'});
 let bill=await request('/bl-register',{billNumber:marker,vesselName:'KM SCMU Uji',voyageNumber:'04/26',packages:10,containers:[{number:'SPNU2942265',seal:'57100563'}]},'POST',201);jobs.push(bill.jobId);
 const endpoint='/bl-register/'+bill.id;
 for(let n=0;n<10;n++){
  const form=new FormData();form.append('file',new Blob(['SCMU synthetic '+n]),n?'Lampiran-'+n+'.txt':'Sumber-PL.txt');form.append('version',bill.version);form.append('category',n?'SUPPORTING':'PACKING_LIST');
  const r=await fetch('http://localhost:5000/api'+endpoint+'/files',{method:'POST',headers:{Authorization:'Bearer '+token},body:form});assert.equal(r.status,201,await(r.ok?Promise.resolve(''):r.text()));bill=await request(endpoint);
 }
 const sourceFile=bill.files.find(f=>f.originalName==='Sumber-PL.txt');
 const source={status:'CONFIRMED',sourceFileIds:[sourceFile.id],groups:[{id:'g',sourceFileId:sourceFile.id,containerNumber:'SPNU2942265',sealNumber:'57100563',recipientName:'TOKO UJI',instructions:'AMBIL SENDIRI',items:[{id:'i',description:'Muatan dokumen asli',packages:10,packageUnit:'DUS'}]}]};
 bill=await request(endpoint+'/packing-source',{version:bill.version,sourceType:'PARTNER_PL',source},'PUT');
 const preview=await request(endpoint+'/internal-packing/preview',{version:bill.version,sourceType:'PARTNER_PL',outputMode:'BOTH'});
 const created=await fetch('http://localhost:5000/api'+endpoint+'/internal-packing',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({version:bill.version,sourceType:'PARTNER_PL',outputMode:'BOTH',documentNumber:preview.documentNumber,confirmed:true,acceptWarnings:true})});assert.equal(created.status,200);await created.arrayBuffer();bill=await request(endpoint);
 const generated=bill.files.find(f=>f.category==='INTERNAL_PACKING_LIST');
 source.groups[0].items[0].description='Muatan sumber baru';source.groups[0].items[0].packages=11;
 bill=await request(endpoint+'/packing-source',{version:bill.version,sourceType:'PARTNER_PL',source},'PUT');
 const historical=await request(endpoint+'/files/'+generated.id+'/packing-output');assert.equal(historical.groups[0].items[0].description,'Muatan dokumen asli');assert.equal(historical.groups[0].items[0].packages,10);
 const ids=bill.files.filter(f=>f.category==='SUPPORTING').slice(0,2).map(f=>f.id);
 const zipResponse=await fetch('http://localhost:5000/api'+endpoint+'/files/download',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({fileIds:ids})});assert.equal(zipResponse.status,200);
 const zipped=await unzip.Open.buffer(Buffer.from(await zipResponse.arrayBuffer()));assert.equal(zipped.files.length,2);for(const f of zipped.files){assert(!/[\\/]/.test(f.path));assert.match((await f.buffer()).toString(),/^SCMU synthetic/);}
 await request(endpoint+'/files/delete',{fileIds:[ids[0],'foreign'],version:bill.version,reason:'Test invalid selection'},'POST',404);assert.equal((await request(endpoint)).version,bill.version);
 await request(endpoint+'/files/delete',{fileIds:ids,version:bill.version-1,reason:'Test stale selection'},'POST',409);assert.equal((await request(endpoint)).files.length,bill.files.length);
 const denied=await fetch('http://localhost:5000/api'+endpoint+'/files/download',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileIds:ids})});assert.equal(denied.status,401);
 console.log('PASS private ZIP contents, historical PDF snapshot, full-selection validation, stale delete rollback and authentication');
 for(const [width,language] of [[1440,'id'],[390,'en']]){
  const setupScript=`localStorage.setItem('scmu_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('scmu_token',${JSON.stringify(token)});localStorage.setItem('scmu_language',${JSON.stringify(language)});addEventListener('load',async()=>{const checks=[];const en=${language==='en'};const pause=()=>new Promise(r=>setTimeout(r,100)),assert=(v,m)=>{if(!v)throw Error(m)},wait=async fn=>{for(let i=0;i<350;i++){if(fn())return;await pause()}throw Error('UI timeout')},btn=(r,id,eng)=>Array.from(r.querySelectorAll('button')).find(b=>b.textContent.trim()===(en?eng:id));try{
   window.__downloads=[];HTMLAnchorElement.prototype.click=function(){window.__downloads.push(this.download)};window.__prints=[];document.addEventListener('load',e=>{if(e.target.tagName==='IFRAME')try{e.target.contentWindow.print=()=>window.__prints.push(e.target.contentDocument.documentElement.outerHTML)}catch{}},true);
   await wait(()=>document.querySelector('[data-document-toolbar]'));const section=document.querySelector('[data-register-documents]'),toolbar=section.querySelector('[data-document-toolbar]'),all=toolbar.querySelector('input[type=checkbox]');await wait(()=>!all.disabled);
   assert(btn(toolbar,'Lihat','View').disabled,'View should require one selection');assert(!section.querySelector('th:last-child').textContent.includes(en?'Action':'Tindakan'),'Actions still in table');
   all.click();await pause();assert(btn(toolbar,'Unduh ZIP','Download ZIP')&&!btn(toolbar,'Unduh ZIP','Download ZIP').disabled,'Multi download unavailable');assert(btn(toolbar,'Lihat','View').disabled,'View enabled for multiple rows');btn(toolbar,'Unduh ZIP','Download ZIP').click();await wait(()=>window.__downloads.includes('dokumen-pengiriman.zip'));await wait(()=>!all.disabled);
   const next=btn(section,'Berikutnya','Next');if(next&&!next.disabled){next.click();await pause();assert(Array.from(section.querySelectorAll('td input[type=checkbox]')).every(c=>c.checked),'Cross-page selection lost');btn(section,'Sebelumnya','Previous').click();await pause();checks.push('selection across pagination');}all.click();await pause();
   const packing=Array.from(section.querySelectorAll('tbody tr')).find(r=>r.textContent.includes('INTERNAL_PACKING_LIST')||r.textContent.includes(${JSON.stringify(generated.originalName)}));assert(packing,'Generated PL missing');packing.querySelector('input[type=checkbox]').click();await pause();assert(btn(toolbar,'Unduh Excel','Download Excel'),'Excel action missing');btn(toolbar,'Cetak / Simpan PDF','Print / Save PDF').click();await wait(()=>window.__prints.length);assert(window.__prints[0].includes('Muatan dokumen asli')&&!window.__prints[0].includes('Muatan sumber baru'),'Printed current data instead of selected attachment');checks.push('PDF and Excel above table, historical content');await wait(()=>!all.disabled);all.click();await pause();all.click();await pause();
   const support=Array.from(section.querySelectorAll('tbody tr')).filter(r=>r.textContent.includes('Lampiran-')).slice(0,2);assert(support.length===2,'Support rows missing');for(const row of support)row.querySelector('input[type=checkbox]').click();await pause();btn(toolbar,'Hapus lampiran','Delete attachment').click();await wait(()=>document.querySelector('[role=dialog]'));let modal=document.querySelector('[role=dialog]');assert(modal.querySelectorAll('li').length===2,'Delete selection missing');btn(modal,'Batal','Cancel').click();await pause();assert(!document.querySelector('[role=dialog]'),'Cancel failed');checks.push('batch delete review and cancellation');
   if(!en){btn(toolbar,'Hapus lampiran','Delete attachment').click();await wait(()=>document.querySelector('[role=dialog]'));modal=document.querySelector('[role=dialog]');const reason=modal.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(reason,'Dokumen simulasi salah unggah');reason.dispatchEvent(new Event('input',{bubbles:true}));await pause();btn(modal,'Hapus lampiran','Delete attachment').click();await wait(()=>!document.querySelector('[role=dialog]'));checks.push('confirmed batch deletion');}
   assert(document.documentElement.scrollWidth<=innerWidth+1,'Page overflows');const scroll=document.querySelector('[data-page-scroll]'),header=document.querySelector('[data-bl-header]');scroll.scrollTop+=toolbar.getBoundingClientRect().top-(header?.getBoundingClientRect().bottom||0)-12;await pause();assert(toolbar.getBoundingClientRect().left>=0&&toolbar.getBoundingClientRect().right<=innerWidth+1,'Toolbar horizontally offscreen');assert(Array.from(toolbar.querySelectorAll('button')).every(b=>b.getBoundingClientRect().right<=innerWidth+1),'Action clipped');checks.push('responsive toolbar without horizontal scrolling');document.documentElement.dataset.scmuCheck=btoa(unescape(encodeURIComponent(JSON.stringify({ok:true,checks}))));
  }catch(e){document.documentElement.dataset.scmuCheck=btoa(unescape(encodeURIComponent(JSON.stringify({ok:false,error:e.stack,checks}))));}});`;
  const result=await checkPage({chrome:'C:/Program Files/Google/Chrome/Application/chrome.exe',output,width,height:1000,url:'http://localhost:5173/bl-register/'+bill.id+'?tab=documents',screenshot:path.join(output,language+'-'+width+'.png'),setupScript});assert(result.ok,result.error);console.log('PASS '+width+' '+language+': '+result.checks.join(', '));
 }
}finally{
 const ids=jobs;const files=await prisma.seaBillFile.findMany({where:{bill:{jobId:{in:ids}}},select:{filename:true}});
 await prisma.activityLog.deleteMany({where:{entity:'JobOrder',entityId:{in:ids}}});await prisma.seaBill.deleteMany({where:{jobId:{in:ids}}});await prisma.jobDocument.deleteMany({where:{jobId:{in:ids}}});await prisma.shipment.deleteMany({where:{jobId:{in:ids}}});await prisma.jobOrder.deleteMany({where:{id:{in:ids}}});
 for(const filename of new Set(files.map(f=>f.filename)))if(path.basename(filename)===filename)await unlink(path.join(root,'backend/uploads/job-documents',filename)).catch(e=>{if(e.code!=='ENOENT')throw e;});await prisma.$disconnect();
}
