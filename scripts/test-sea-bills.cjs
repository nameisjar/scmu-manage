const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');
const {PrismaClient}=require('../backend/node_modules/@prisma/client');const files=require('../backend/src/services/jobFiles');
const api=process.env.SCMU_API_URL||'http://127.0.0.1:5000';const db=process.env.SCMU_DEMO_DATABASE_URL||'postgresql://scmu_demo@127.0.0.1:55432/scmu_demo';
assert.ok(['localhost','127.0.0.1'].includes(new URL(api).hostname));assert.ok(['localhost','127.0.0.1'].includes(new URL(db).hostname)&&new URL(db).pathname==='/scmu_demo');
const prisma=new PrismaClient({datasources:{db:{url:db}}});const jobs=[];const marker=`SCMU-BL-QA-${randomUUID()}`;let staff;let director;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1kAAAAASUVORK5CYII=','base64');
async function r(path,body,method=body?'POST':'GET',status=null,token=staff){const response=await fetch(`${api}/api${path}`,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},body:body?body instanceof FormData?body:JSON.stringify(body):undefined});const data=await response.json();if(status!==null)assert.equal(response.status,status,`${method} ${path}: ${JSON.stringify(data)}`);else assert.ok([200,201].includes(response.status),`${method} ${path}: ${response.status} ${JSON.stringify(data)}`);return data;}
async function approve(action,entityId,payload){const request=await r('/approvals',{action,entityId,payload,note:marker});return r(`/approvals/${request.id}/review`,{decision:'APPROVED'},'POST',200,director);}
function attachment(version,category,extra={}){const form=new FormData();form.append('file',new Blob([png],{type:'image/png'}),'simulasi-BL.png');for(const[key,value]of Object.entries({version,category,note:marker,...extra}))form.append(key,value);return form;}
async function main(){
  staff=(await r('/auth/login',{email:'operasional@scmu.local',password:'Ops@1234'},'POST',200,null)).token;director=(await r('/auth/login',{email:'admin@scmu.local',password:'Admin@1234'},'POST',200,null)).token;
  if(process.argv.includes('--transport-only'))return transportChecks();
  if(process.argv.includes('--upload-first'))return uploadFirstChecks();
  const vendor=(await r('/companies?limit=200')).data.find(row=>!row.isInternal&&row.type==='TRANSPORTER');
  const job=await r('/jobs',{jobType:'RECEIVER',title:marker,originCity:'Surabaya',destCity:'Merauke',cargoDescription:'Simulasi dua BL untuk satu packing list',packages:10,weightKg:1200,volumeCbm:'6.5'});jobs.push(job.id);const base=`/jobs/${job.id}`;const seaBase=`${base}/sea-bills`;
  await r(seaBase,undefined,'GET',401,null);
  await r(seaBase,{shipmentId:'missing'},'POST',422);
  const approvedLeg=await approve('TRANSPORT_BOOK',job.id,{transportSource:'EXTERNAL',mode:'SEA',carrierId:vendor.id,originCity:'Surabaya',destCity:'Merauke',loadingDate:new Date().toISOString(),vesselFlight:'Kapal Simulasi',bookingNumber:marker});
  const legId=approvedLeg.resultId;let bill=(await r(seaBase)).data[0];assert.ok(bill&&bill.shipmentId===legId,'Automatic BL checklist after sea booking approval');
  const original=new FormData();original.append('file',new Blob([png],{type:'image/png'}),'packing-list-simulasi.png');original.append('data',JSON.stringify({direction:'INBOUND',summaryConfirmed:true,externalNumber:`${marker}-PL`,documentDate:new Date().toISOString(),senderName:'Perusahaan A Surabaya (Simulasi)',originCity:'Surabaya',destCity:'Merauke',packages:10,netWeightKg:1100,grossWeightKg:1200,volumeCbm:'6.5'}));
  let packing=await r(`${base}/packing-lists`,original);const link={packingListId:packing.id,packages:6,grossWeightKg:'720',volumeCbm:'3.9',scope:'Koli 1–6'};
  const data={documentKind:'BILL_OF_LADING',billNumber:`${marker}-A`,issueDate:new Date().toISOString(),carrierName:'Pelayaran Simulasi',vesselName:'Kapal Simulasi',voyageNumber:'V-001',portOfLoading:'Tanjung Perak, Surabaya',portOfDischarge:'Merauke',shipperName:'Perusahaan A Surabaya',consigneeName:'SCMU Merauke',containers:[],packages:6,grossWeightKg:'720',volumeCbm:'3.9',allocations:[link]};
  bill=await r(`${seaBase}/${bill.id}`,{...data,version:bill.version},'PUT');
  const at=`${seaBase}/${bill.id}`;const initialCargoRevision=bill.contentVersion;const checks={parties:true,route:true,containers:true,cargo:true,finalDocument:true};
  await r(at,{...data,version:1},'PUT',409);
  await r(`${base}/documents/${bill.documentId}/verify`,{},'POST',409);
  await r(seaBase,{...data,billNumber:`${marker}-INVALID-LINKS`,shipmentId:legId,allocations:[link,link]},'POST',422);
  const foreign=(await prisma.packingList.findFirst({where:{jobId:{not:job.id}}}));assert.ok(foreign);
  await r(seaBase,{...data,billNumber:`${marker}-FOREIGN-LINK`,shipmentId:legId,allocations:[{...link,packingListId:foreign.id}]},'POST',422);
  const remaining={...data,billNumber:`marker-B`,shipmentId:legId,packages:4,grossWeightKg:'480',volumeCbm:'2.6',allocations:[{...link,packages:4,grossWeightKg:'480',volumeCbm:'2.6',scope:'Koli 7–10'}]};
  const race=await Promise.all([1,2].map(index=>fetch(`${api}/api${seaBase}`,{method:'POST',headers:{Authorization:`Bearer ${staff}`,'Content-Type':'application/json'},body:JSON.stringify({...remaining,billNumber:`${marker}-R${index}`})})));
  assert.deepEqual(race.map(response=>response.status).sort(),[201,409]);let second=await race.find(response=>response.status===201).json();
  await r(`${at}/verify`,{version:bill.version,checks},'POST',409);
  const invalid=attachment(bill.version,'FINAL');invalid.set('file',new Blob(['wrong'],{type:'image/png'}),'invalid.png');await r(`${at}/files`,invalid,'POST',415);
  bill=await r(`${at}/files`,attachment(bill.version,'DRAFT'));assert.equal(bill.receiptStatus,'SEA_DRAFT_RECEIVED');await r(`${at}/verify`,{version:bill.version,checks},'POST',409);
  bill=await r(`${at}/files`,attachment(bill.version,'FINAL'));assert.equal(bill.receiptStatus,'SEA_FINAL_RECEIVED');await r(`${at}/verify`,{version:bill.version,checks:{}},'POST',422);
  bill=await r(`${at}/verify`,{version:bill.version,checks});assert.equal(bill.internalStatus,'SEA_MATCHED');assert.equal(bill.releaseStatus,'SEA_RELEASE_PENDING');
  const oldFinal=bill.files.find(row=>row.category==='FINAL');const download=await fetch(`${api}/api${at}/files/${oldFinal.id}`,{headers:{Authorization:`Bearer ${staff}`}});assert.ok(download.ok);assert.deepEqual(Buffer.from(await download.arrayBuffer()),png);
  await r(`${at}/release`,{version:bill.version,proofId:oldFinal.id},'POST',409);
  bill=await r(`${at}/files`,attachment(bill.version,'RELEASE'));assert.equal(bill.releaseStatus,'SEA_RELEASE_PENDING');
  const release=()=>({version:bill.version,proofId:bill.files.find(row=>row.category==='RELEASE'&&row.contentVersion===bill.contentVersion)?.id||'missing',method:'TELEX',reference:'CONFIRM-SIMULASI',releasedAt:new Date().toISOString(),note:marker});
  bill=await r(`${at}/release`,release());assert.equal(bill.releaseStatus,'SEA_RELEASE_CONFIRMED');
  await r(`${at}/files`,attachment(bill.version,'DELIVERY_ORDER'),'POST',422);
  bill=await r(`${at}/files`,attachment(bill.version,'DELIVERY_ORDER',{externalNumber:'DO-SIMULASI',documentDate:new Date().toISOString()}));assert.equal(bill.internalStatus,'SEA_MATCHED');
  const existingFileVersion=bill.contentVersion;
  bill=await r(at,{...bill,consigneeName:'SCMU Gudang Merauke',revisionNote:marker},'PUT');assert.equal(bill.internalStatus,'SEA_UNCHECKED');assert.equal(bill.releaseStatus,'SEA_RELEASE_PENDING');assert.equal(bill.contentVersion,existingFileVersion);assert.ok(bill.issues.includes('SEA_MATERIAL_CHANGE'));
  await r(`${at}/verify`,{version:bill.version,checks},'POST',403);
  bill=await r(`${at}/files`,attachment(bill.version,'FINAL'));await r(`${at}/verify`,{version:bill.version,checks},'POST',403);
  let request=await r('/approvals',{action:'SEA_BILL_EXCEPTION',entityId:bill.id,payload:{version:bill.version,checks,note:marker},note:marker});
  await r(`/approvals/${request.id}/review`,{decision:'APPROVED'},'POST',403,staff);
  bill=await r(at,{...bill,notes:'Changed after submission',revisionNote:marker},'PUT');await r(`/approvals/${request.id}/review`,{decision:'APPROVED'},'POST',409,director);
  await r(`/approvals/${request.id}/withdraw`,{note:marker});
  request=await r('/approvals',{action:'SEA_BILL_EXCEPTION',entityId:bill.id,payload:{version:bill.version,checks,note:marker}});await r(`/approvals/${request.id}/review`,{decision:'RETURNED',note:marker},'POST',200,director);
  request=await r('/approvals',{action:'SEA_BILL_EXCEPTION',entityId:bill.id,payload:{version:bill.version,checks,note:marker}});await r(`/approvals/${request.id}/review`,{decision:'REJECTED',note:marker},'POST',200,director);
  await approve('SEA_BILL_EXCEPTION',bill.id,{version:bill.version,checks,note:marker});bill=(await r(seaBase)).data.find(row=>row.id===bill.id);assert.equal(bill.internalStatus,'SEA_MATCHED');assert.equal(bill.releaseStatus,'SEA_RELEASE_PENDING');
  await r(`${at}/release`,{...release(),proofId:bill.files.find(row=>row.category==='RELEASE').id},'POST',409);
  bill=await r(`${at}/files`,attachment(bill.version,'RELEASE'));bill=await r(`${at}/release`,release());
  const secondAt=`${seaBase}/${second.id}`;second=await r(`${secondAt}/files`,attachment(second.version,'FINAL'));second=await r(`${secondAt}/verify`,{version:second.version,checks});
  packing=await r(`${base}/packing-lists/${packing.id}`,{version:packing.version,senderName:'Changed party'},'PUT');
  let refreshed=(await r(seaBase)).data.find(row=>row.id===bill.id);assert.ok(refreshed.issues.includes('SEA_PACKING_CHANGED'));await r(`${at}/release`,{...release(),version:refreshed.version},'POST',409);
  packing=await r(`${base}/packing-lists/${packing.id}`,{version:packing.version,senderName:'Perusahaan A Surabaya (Simulasi)',receiptStatus:'RECEIVED',receivedAt:new Date().toISOString(),receivedBy:'Admin SCMU',actualPackages:10},'PUT');
  packing=await r(`${base}/packing-lists/${packing.id}/finalize`,{version:packing.version});
  const header=await r(`${base}/packing-header`,{documentDate:new Date().toISOString(),packingListIds:[packing.id]});await approve('PACKING_HEADER_FINALIZE',header.id,{version:header.version});
  await r(`/shipments/${legId}/tracking`,{eventType:'DELIVERED',location:'Merauke'});
  await r('/approvals',{action:'JOB_CLOSE',entityId:job.id,payload:{},note:marker},'POST',409);
  second=await r(`${secondAt}/files`,attachment(second.version,'DELIVERY_ORDER',{externalNumber:'DO-B-SIMULASI',documentDate:new Date().toISOString()}));second=await r(`${secondAt}/release`,{version:second.version,proofId:second.files.find(row=>row.category==='DELIVERY_ORDER').id,method:'ORIGINAL_SURRENDER',reference:'DO-B-SIMULASI',releasedAt:new Date().toISOString(),note:marker});
  await approve('JOB_CLOSE',job.id,{});assert.equal((await r(base)).status,'CLOSED');
  await r(at,{...bill,revisionNote:marker},'PUT',409);await r(`${at}/files`,attachment(bill.version,'FINAL'),'POST',409);
  refreshed=(await r(seaBase)).data.find(row=>row.id===bill.id);assert.ok(refreshed.history.length>=10);assert.ok(refreshed.files.some(row=>row.id===oldFinal.id));
  assert.equal((await prisma.seaBillRevision.findMany({where:{billId:bill.id},select:{version:true}})).length,refreshed.history.length);
  console.log('PASS BL API: auto checklist, roles, partial cargo and concurrent balances, cross-job protection, immutable draft/final/DO files, separate release evidence, current revision checks, director return/reject/stale approval, packing drift, receiving closure and closed-job locks.');
}
async function uploadFirstChecks(){
  const vendor=(await r('/companies?limit=200')).data.find(row=>!row.isInternal&&row.type==='TRANSPORTER');
  const job=await r('/jobs',{jobType:'SENDER',title:marker,originCity:'Surabaya',destCity:'Merauke',cargoDescription:'Upload-first BL without transcribing metadata',packages:10});jobs.push(job.id);
  const leg=await approve('TRANSPORT_BOOK',job.id,{mode:'SEA',transportSource:'EXTERNAL',carrierId:vendor.id,originCity:'Surabaya',destCity:'Merauke',loadingDate:new Date().toISOString()});
  const base=`/jobs/${job.id}/sea-bills`;let bill=(await r(base)).data[0];assert.equal(bill.billNumber,null);assert.equal(bill.vesselName,null);
  const original=new FormData();original.append('file',new Blob([png],{type:'image/png'}),'BL-pelayaran-asli.png');original.append('data',JSON.stringify({billId:bill.id,version:bill.version,category:'FINAL'}));
  bill=await r(`${base}/upload`,original);assert.equal(bill.billNumber,null);assert.equal(bill.vesselName,null);assert.equal(bill.receiptStatus,'SEA_FINAL_RECEIVED');const fileVersion=bill.contentVersion;const originalFile=bill.files[0];
  const packing=await r(`/jobs/${job.id}/packing-lists`,{direction:'OUTBOUND',documentDate:new Date().toISOString(),originCity:'Surabaya',destCity:'Merauke',recipientName:'Penerima Merauke',recipientAddress:'Merauke',items:[{description:'Peralatan simulasi',quantity:10,unit:'UNIT',packages:10,netWeightKg:1100,grossWeightKg:1200,volumeCbm:'6.5'}]});
  bill=await r(`${base}/${bill.id}`,{version:bill.version,allocations:[{packingListId:packing.id,packages:10,grossWeightKg:1200,volumeCbm:'6.5'}]},'PUT');assert.equal(bill.contentVersion,fileVersion);assert.equal(bill.receiptStatus,'SEA_FINAL_RECEIVED');assert.deepEqual(bill.issues,[]);
  const checks={parties:true,route:true,containers:true,cargo:true,finalDocument:true};bill=await r(`${base}/${bill.id}/verify`,{version:bill.version,checks});assert.equal(bill.internalStatus,'SEA_MATCHED');assert.equal(bill.billNumber,null);
  const revised=attachment(bill.version,'FINAL',{materialChange:'true',note:'Penerima pada revisi dokumen berubah'});bill=await r(`${base}/${bill.id}/files`,revised);assert.equal(bill.contentVersion,fileVersion+1);assert.equal(bill.internalStatus,'SEA_UNCHECKED');assert.ok(bill.files.some(row=>row.id===originalFile.id));await r(`${base}/${bill.id}/verify`,{version:bill.version,checks},'POST',403);
  const approval=await r('/approvals',{action:'SEA_BILL_EXCEPTION',entityId:bill.id,payload:{version:bill.version,checks,note:'Periksa revisi penerima sesuai file asli'}});assert.ok(approval.snapshot.overview.some(row=>row.label==='Original filename'));await r(`/approvals/${approval.id}/review`,{decision:'APPROVED'},'POST',200,director);
  const invalid=new FormData();invalid.append('file',new Blob(['bad'],{type:'image/png'}),'invalid.png');invalid.append('data',JSON.stringify({shipmentId:leg.resultId}));const before=await prisma.seaBill.count({where:{jobId:job.id}});await r(`${base}/upload`,invalid,'POST',415);assert.equal(await prisma.seaBill.count({where:{jobId:job.id}}),before);
  const blank=new FormData();blank.append('data',JSON.stringify({shipmentId:leg.resultId}));await r(`${base}/upload`,blank,'POST',422);
  const newFile=new FormData();newFile.append('file',new Blob([png],{type:'image/png'}),'BL-kedua.png');newFile.append('data',JSON.stringify({shipmentId:leg.resultId,category:'DRAFT'}));const second=await r(`${base}/upload`,newFile);assert.equal(second.billNumber,null);assert.equal(second.receiptStatus,'SEA_DRAFT_RECEIVED');
  console.log('PASS upload-first BL API: atomic upload/new record, blank optional metadata, packing links after upload, unchanged original file, verification without transcription, retained revisions, important-file director approval and invalid/missing-file rollback.');
}
async function transportChecks(){
  const vendor=(await r('/companies?limit=200')).data.find(row=>!row.isInternal&&row.type==='TRANSPORTER');
  const job=await r('/jobs',{title:marker,originCity:'Surabaya',destCity:'Merauke',cargoDescription:'Transport change checks',packages:1});jobs.push(job.id);
  const booking=await approve('TRANSPORT_BOOK',job.id,{mode:'SEA',transportSource:'EXTERNAL',carrierId:vendor.id,originCity:'Surabaya',destCity:'Merauke',loadingDate:new Date().toISOString()});
  const base=`/jobs/${job.id}/sea-bills`;let bill=(await r(base)).data[0];
  bill=await r(`${base}/${bill.id}`,{...bill,billNumber:'BL-DUPLICATE-CHECK'},'PUT');
  const count=await prisma.jobDocument.count({where:{jobId:job.id}});
  await r(base,{shipmentId:booking.resultId,billNumber:'bl-duplicate-check'},'POST',409);assert.equal(await prisma.jobDocument.count({where:{jobId:job.id}}),count);
  await r(`${base}/${bill.id}`,{...bill,allocations:[null]},'PUT',422);await r(`${base}/${bill.id}`,{...bill,containers:[null]},'PUT',422);
  await approve('TRANSPORT_CHANGE',booking.resultId,{mode:'AIR'});let fresh=(await r(base)).data[0];assert.equal(fresh.shipment.mode,'AIR');assert.equal((await prisma.jobDocument.findUnique({where:{id:bill.documentId}})).required,false);assert.ok(fresh.history.some(row=>row.action==='SEA_TRANSPORT_CHANGED'));
  await r(`${base}/${bill.id}`,{...fresh},'PUT',409);
  await approve('TRANSPORT_CHANGE',booking.resultId,{mode:'SEA'});fresh=(await r(base)).data[0];assert.equal(fresh.shipment.mode,'SEA');assert.equal(fresh.internalStatus,'SEA_UNCHECKED');assert.equal((await prisma.jobDocument.findUnique({where:{id:bill.documentId}})).required,true);
  console.log('PASS BL transport: approved mode changes, document lock/invalidation, required checklist restoration, malformed cargo/container rejection and duplicate-number transaction rollback.');
}
async function cleanup(){const ids=jobs;const docs=await prisma.jobDocument.findMany({where:{jobId:{in:ids}}});const uploads=await prisma.seaBillFile.findMany({where:{bill:{jobId:{in:ids}}}});for(const name of new Set([...docs.map(row=>row.filename),...uploads.map(row=>row.filename)].filter(Boolean)))await files.removeFile(name);await prisma.directorApproval.deleteMany({where:{jobId:{in:ids}}});await prisma.seaBill.deleteMany({where:{jobId:{in:ids}}});await prisma.packingHeader.deleteMany({where:{jobId:{in:ids}}});await prisma.packingList.deleteMany({where:{jobId:{in:ids}}});await prisma.jobDocument.deleteMany({where:{jobId:{in:ids}}});await prisma.trackingEvent.deleteMany({where:{shipment:{jobId:{in:ids}}}});await prisma.shipment.deleteMany({where:{jobId:{in:ids}}});await prisma.jobOrder.deleteMany({where:{id:{in:ids}}});await prisma.activityLog.deleteMany({where:{entity:'JobOrder',entityId:{in:ids}}});await prisma.$disconnect();}
main().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{try{await cleanup();}catch(error){console.error(error.stack);process.exitCode=1;}});
