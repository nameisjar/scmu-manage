import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { checkPage } from './browser-check.mjs';
const require=createRequire(new URL('../backend/package.json',import.meta.url));
const {PrismaClient}=require('@prisma/client'),jwt=require('jsonwebtoken'),ExcelJS=require('exceljs'),fixture=require('../backend/test/fixtures/tanto');
const db=new PrismaClient({datasources:{db:{url:'postgresql://scmu_demo@127.0.0.1:55432/scmu_demo'}}});
const marker='TRASHQA-'+randomUUID(),numbers=[0,1].map(i=>'SBY'+Date.now()+i),width=Number(process.env.SCMU_QA_WIDTH||1440),output='.demo/shipment-trash-'+width;
await mkdir(output,{recursive:true});let token;
async function request(url,body,method=body?'POST':'GET',status=200,auth=token){const response=await fetch('http://localhost:5000/api'+url,{method,headers:{...(auth?{Authorization:'Bearer '+auth}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data;}
try{
 const user=await db.user.findFirst({where:{role:'ADMIN',isActive:true},select:{id:true,name:true,email:true,role:true}});token=jwt.sign({userId:user.id},await readFile('.demo/jwt-secret','utf8'),{expiresIn:'15m'});
 const bytes=fixture.pdf(fixture.document({number:numbers[0],containers:2})),form=new FormData();form.append('file',new Blob([bytes],{type:'application/pdf'}),marker+'.pdf');
 const uploaded=await fetch('http://localhost:5000/api/bl-imports/batch/file',{method:'POST',headers:{Authorization:'Bearer '+token},body:form});assert.equal(uploaded.status,201);const staged=await uploaded.json();
 const saved=await request('/bl-imports/batch/commit',{sessionId:staged.id,confirmed:true,documentType:'BILL_OF_LADING',action:'CREATE',fields:staged.fields});
 const bill=await request('/bl-register/'+saved.billIds[0]),blocked=await request('/bl-register',{billNumber:numbers[1]},'POST',201);
 await db.jobCharge.create({data:{jobId:blocked.jobId,kind:'REVENUE',description:marker,estimatedAmount:'1000',status:'PROPOSED',createdById:user.id}});
 await request('/bl-register/'+bill.id,{version:bill.version,confirmed:true,reason:marker},'DELETE',401,null);
 await request('/bl-register/'+bill.id,{version:bill.version,confirmed:true,reason:''},'DELETE',422);
 const context=await request('/bl-register/'+blocked.id+'/deletion-context');assert.equal(context.canDelete,false);assert(context.blockers.some(b=>b.code==='CHARGE'));
 await request('/bl-register/'+blocked.id,{version:blocked.version,confirmed:true,reason:marker},'DELETE',409);
 const setup=`localStorage.setItem('scmu_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('scmu_token',${JSON.stringify(token)});localStorage.setItem('scmu_language','id');addEventListener('load',async()=>{
 const pause=()=>new Promise(r=>setTimeout(r,100)),assert=(v,m)=>{if(!v)throw Error(m)},btn=(root,text)=>[...root.querySelectorAll('button')].find(b=>b.textContent.trim()===text),wait=async fn=>{for(let i=0;i<400;i++){if(fn())return;await pause();}throw Error('UI timeout: '+document.body.textContent.slice(-1500));};
 const api=async(url,body,method=body?'POST':'GET',status=200)=>{const response=await fetch('/api'+url,{method,headers:{Authorization:'Bearer '+localStorage.getItem('scmu_token'),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const data=await response.json();assert(response.status===status,'API '+url+': '+JSON.stringify(data));return data;};
 try{
  await wait(()=>btn(document,'Hapus')&&!btn(document,'Hapus').disabled);const baseline=await api('/bl-register?limit=1');btn(document,'Hapus').click();await wait(()=>document.querySelector('[data-shipment-trash-dialog] textarea')&&!document.querySelector('[data-shipment-trash-dialog] textarea').disabled);
  let dialog=document.querySelector('[data-shipment-trash-dialog]'),modal=document.querySelector('[role=dialog]');assert(dialog.textContent.includes('Data terkait yang tetap disimpan'),'Dependency preview missing');assert(btn(modal,'Pindahkan ke Sampah').disabled,'Delete allowed without reason');
  const reason=dialog.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(reason,${JSON.stringify(marker)});reason.dispatchEvent(new Event('input',{bubbles:true}));await wait(()=>!dialog.querySelector('input[type=checkbox]').disabled);dialog.querySelector('input[type=checkbox]').click();btn(modal,'Pindahkan ke Sampah').click();await wait(()=>!document.querySelector('[data-shipment-trash-dialog]')&&document.body.textContent.includes('Pengiriman dipindahkan ke Sampah.'));
  const deleted=await api('/bl-register/'+${JSON.stringify(bill.id)});assert(deleted.deleted,'Record not in trash');assert(deleted.files.length===1,'File was removed');
  for(const archived of ['active','archived','all']){const list=await api('/bl-register?search='+${JSON.stringify(numbers[0])}+'&archived='+archived);assert(list.total===0,'Trash leaked into '+archived);}
  const trash=await api('/bl-register?archived=trash&search='+${JSON.stringify(numbers[0])});assert(trash.total===1,'Trash list missing shipment');
  const dashboard=await api('/bl-register?limit=1');assert(dashboard.summary.totalRegisters===baseline.summary.totalRegisters-1,'Dashboard still counts trash');
  const packing=await api('/operations/packing-lists?search='+${JSON.stringify(numbers[0])});assert(packing.total===0,'Packing list still counts trash');
  await api('/bl-register/'+deleted.id,{version:deleted.version,notes:'SHOULD NOT CHANGE'},'PUT',409);await api('/bl-register/'+deleted.id+'/archive',{version:deleted.version,archived:false},'POST',409);
  await api('/bl-register/'+deleted.id+'/driver-bons',{version:deleted.version,bon:{}},'POST',409);
  await api('/bl-register/'+deleted.id+'/files/'+${JSON.stringify(saved.fileIds[0])},{version:deleted.version,reason:'blocked edit in trash'},'DELETE',409);
  await api('/bl-register/'+deleted.id+'/restore',{version:deleted.version-1,confirmed:true},'POST',409);
  const receipt=await api('/bl-imports/batch/'+${JSON.stringify(staged.id)});assert(receipt.saved.attachmentsPresent&&receipt.saved.trashedBillIds.includes(deleted.id)&&!receipt.saved.activeBillIds.length,'Upload receipt did not reflect trash');
  await api('/bl-imports/batch/commit',{sessionId:${JSON.stringify(staged.id)}},'POST',409);
  const exported=await fetch('/api/bl-register/export.xlsx?scope=filtered&archived=all&search='+${JSON.stringify(numbers[0])},{headers:{Authorization:'Bearer '+localStorage.getItem('scmu_token')}});assert(exported.status===200,'Export failed');const exportBase64=btoa(String.fromCharCode(...new Uint8Array(await exported.arrayBuffer())));
  [...document.querySelectorAll('a')].find(a=>a.getAttribute('href')==='/bl-register/trash').click();await wait(()=>location.pathname==='/bl-register/trash'&&[...document.querySelectorAll('tr')].some(r=>r.textContent.includes(${JSON.stringify(numbers[0])})&&btn(r,'Pulihkan')));
  const row=[...document.querySelectorAll('tr')].find(r=>r.textContent.includes(${JSON.stringify(numbers[0])}));assert(row.textContent.includes(${JSON.stringify(marker)}),'Reason missing from trash');btn(row,'Pulihkan').click();await wait(()=>document.querySelector('[data-shipment-trash-dialog] input[type=checkbox]'));dialog=document.querySelector('[data-shipment-trash-dialog]');modal=document.querySelector('[role=dialog]');dialog.querySelector('input[type=checkbox]').click();btn(modal,'Pulihkan pengiriman').click();await wait(()=>!document.querySelector('[data-shipment-trash-dialog]')&&document.body.textContent.includes('Pengiriman dipulihkan ke daftar aktif.'));
  assert(document.documentElement.scrollWidth<=innerWidth+1,'Page overflow');document.documentElement.dataset.scmuCheck=btoa(JSON.stringify({ok:true,exportBase64,checks:['delete requires reason and dependency review','trash excluded from lists/dashboard/packing/export','trashed mutations and import replay blocked','restore through Trash preserves the same record']}));
 }catch(error){document.documentElement.dataset.scmuCheck=btoa(JSON.stringify({ok:false,error:error.stack}));}
});`;
 const result=await checkPage({chrome:process.env.SCMU_TEST_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',output,width,height:1000,url:'http://localhost:5173/bl-register?search='+numbers[0],screenshot:path.join(output,'restore-result.png'),setupScript:setup});assert(result.ok,result.error);
 const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(result.exportBase64,'base64'));assert.equal(book.getWorksheet('Register').rowCount,1);
 const restored=await request('/bl-register/'+bill.id);assert.equal(restored.deleted,false);assert.equal(restored.archived,false);assert.equal(restored.id,bill.id);assert.deepEqual(restored.containers,bill.containers);assert.equal(restored.files[0].id,bill.files[0].id);
 const file=await fetch('http://localhost:5000/api/bl-register/'+bill.id+'/files/'+saved.fileIds[0],{headers:{Authorization:'Bearer '+token}});assert.equal(file.status,200);assert.equal(createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex'),createHash('sha256').update(bytes).digest('hex'));
 const history=await db.activityLog.findMany({where:{entityId:bill.jobId,action:{in:['SHIPMENT_TRASHED','SHIPMENT_RESTORED']}}});assert.equal(history.length,2);
 const archived=await request('/bl-register/'+bill.id+'/archive',{version:restored.version,archived:true});
 const trashedArchive=await request('/bl-register/'+bill.id,{version:archived.version,reason:marker,confirmed:true},'DELETE');
 const replacement=await request('/bl-register',{billNumber:numbers[0]},'POST',201);
 await request('/bl-register/'+bill.id+'/restore',{version:trashedArchive.version,confirmed:true},'POST',409);
 await request('/bl-register/'+replacement.id,{version:replacement.version,reason:marker,confirmed:true},'DELETE');
 const director=await db.user.findFirst({where:{role:'SUPER_ADMIN',isActive:true}}),directorToken=jwt.sign({userId:director.id},await readFile('.demo/jwt-secret','utf8'),{expiresIn:'5m'});
 const restoredArchive=await request('/bl-register/'+bill.id+'/restore',{version:trashedArchive.version,confirmed:true},'POST',200,directorToken);
 assert.equal(restoredArchive.archived,true);assert.equal(restoredArchive.deleted,false);assert.equal(new Date(restoredArchive.archivedAt).toISOString(),new Date(archived.archivedAt).toISOString());
 assert.equal((await request('/bl-register?archived=archived&search='+numbers[0])).total,1);assert.equal((await request('/bl-register?archived=trash&search='+numbers[0])).total,1);
 const blockedSetup=`localStorage.setItem('scmu_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('scmu_token',${JSON.stringify(token)});localStorage.setItem('scmu_language','id');addEventListener('load',async()=>{try{for(let i=0;i<300;i++){const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Hapus'&&!b.disabled);if(button){button.click();break;}await new Promise(r=>setTimeout(r,100));}for(let i=0;i<300;i++){const dialog=document.querySelector('[data-shipment-trash-dialog]');if(dialog?.textContent.includes('Pengiriman belum bisa dihapus')){const button=[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.trim()==='Pindahkan ke Sampah');document.documentElement.dataset.scmuCheck=btoa(JSON.stringify({ok:button.disabled&&dialog.textContent.includes('biaya atau pendapatan')}));return;}await new Promise(r=>setTimeout(r,100));}throw Error('Dependency blocker was not shown');}catch(error){document.documentElement.dataset.scmuCheck=btoa(JSON.stringify({ok:false,error:error.stack}));}});`;
 const blockedUI=await checkPage({chrome:process.env.SCMU_TEST_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',output,width,height:1000,url:'http://localhost:5173/bl-register?search='+numbers[1],screenshot:path.join(output,'blocked-delete.png'),setupScript:blockedSetup});assert(blockedUI.ok,blockedUI.error);
 console.log('PASS: '+result.checks.join('; ')+'; Excel excludes trash; original file hash unchanged; financial blocker shown; audit retained');
}finally{
 const bills=await db.seaBill.findMany({where:{billNumber:{in:numbers}},select:{id:true,jobId:true}}),jobs=bills.map(b=>b.jobId),stages=await db.bLImportSession.findMany({where:{originalName:{startsWith:marker}},select:{filename:true}}),files=await db.seaBillFile.findMany({where:{billId:{in:bills.map(b=>b.id)}},select:{filename:true}});
 await db.bLImportSession.deleteMany({where:{originalName:{startsWith:marker}}});await db.activityLog.deleteMany({where:{entity:'JobOrder',entityId:{in:jobs}}});await db.seaBill.deleteMany({where:{id:{in:bills.map(b=>b.id)}}});await db.jobDocument.deleteMany({where:{jobId:{in:jobs}}});await db.shipment.deleteMany({where:{jobId:{in:jobs}}});await db.jobOrder.deleteMany({where:{id:{in:jobs}}});
 for(const name of new Set([...stages,...files].map(f=>f.filename)))if(path.basename(name)===name)await unlink(path.join('backend/uploads/job-documents',name)).catch(e=>{if(e.code!=='ENOENT')throw e;});await db.$disconnect();
}
