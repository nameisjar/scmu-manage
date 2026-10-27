// Disposable integration checks against the isolated SCMU demo database only.
const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');const {randomUUID}=require('node:crypto');
const {PrismaClient}=require('../backend/node_modules/@prisma/client');const jwt=require('../backend/node_modules/jsonwebtoken');
const prisma=new PrismaClient({datasources:{db:{url:'postgresql://scmu_demo@127.0.0.1:55432/scmu_demo'}}});const marker='VESSELQA-'+randomUUID().slice(0,8);const jobs=[];const ships=[];const filenames=new Set();let token,otherToken;
async function request(endpoint,body,method=body?'POST':'GET',status=200,auth=token){const response=await fetch('http://localhost:5000/api'+endpoint,{method,headers:{...(auth?{Authorization:'Bearer '+auth}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data;}
async function upload(endpoint,blob,name,fields={}){const body=new FormData();body.append('file',blob,name);for(const[k,v]of Object.entries(fields))body.append(k,String(v));const response=await fetch('http://localhost:5000/api'+endpoint,{method:'POST',headers:{Authorization:'Bearer '+token},body,signal:AbortSignal.timeout(110000)});const data=await response.json();assert.equal(response.status,201,JSON.stringify(data));return data;}
async function main(){
 const user=await prisma.user.findFirst({where:{role:'ADMIN',isActive:true}});const other=await prisma.user.findFirst({where:{role:'SUPER_ADMIN',isActive:true}});const secret=await fs.readFile(path.join(__dirname,'../.demo/jwt-secret'),'utf8');token=jwt.sign({userId:user.id},secret,{expiresIn:'20m'});otherToken=jwt.sign({userId:other.id},secret,{expiresIn:'20m'});
 await request('/vessels',null,'GET',401,null);
 let ship=await request('/vessels',{name:marker,aliases:[marker+' ALIAS'],carrierName:'SPIL'},'POST',201);ships.push(ship.id);
 await request('/vessels',{name:'KM '+marker+' ALIAS'},'POST',409);
 const v26=await request(`/vessels/${ship.id}/voyages`,{number:'04',period:'2026',portOfLoading:'Surabaya',portOfDischarge:'Merauke'},'POST',201);
 const v27=await request(`/vessels/${ship.id}/voyages`,{number:'04',period:'2027'},'POST',201);
 await request(`/vessels/${ship.id}/voyages`,{number:'04',period:'2026'},'POST',409);
 await request(`/vessels/${ship.id}/voyages`,{number:'05',period:''},'POST',422);
 const original=await fs.readFile(process.env.SCMU_TEST_BL_FILE||'C:/Users/Niko Muhamad Fajar/Downloads/referensi scmu/26- KM KSM XPLORER 135 V03 08 OKTOBER 2026 MNS-SCMU.pdf');
 const preview=await upload('/bl-imports',new Blob([original],{type:'application/pdf'}),marker+'.pdf');
 assert.equal(preview.fields.billNumber,'0126371810VZ');assert.equal(preview.fields.portOfDischarge,'MERAUKE');assert.equal(preview.fields.grossWeightKg,'27400.000');
 const session=await prisma.bLImportSession.findUnique({where:{id:preview.id}});filenames.add(session.filename);
 await request('/bl-imports/'+preview.id+'/file',null,'GET',404,otherToken);
 const create={...preview.fields,billNumber:marker+'-A',vesselName:ship.name,vesselId:ship.id,voyageNumber:'04',voyageId:v26.id,importSessionId:preview.id,importConfirmed:true,importCategory:'FINAL'};
 await request('/bl-register',{...create,importConfirmed:false},'POST',422);assert.ok(await prisma.bLImportSession.findUnique({where:{id:preview.id}}));assert.equal(await prisma.seaBill.count({where:{billNumber:marker+'-A'}}),0);
 let first=await request('/bl-register',create,'POST',201);jobs.push(first.jobId);assert.equal(first.files.length,1);assert.equal(first.documentAvailability.billOfLading,true);assert.equal(first.internalStatus,'SEA_UNCHECKED');assert.equal(await prisma.bLImportSession.count({where:{id:preview.id}}),0);
 assert.ok((await fs.readFile(path.join(__dirname,'../backend/uploads/job-documents',first.files[0].filename))).equals(original));
 await request('/bl-register',{...create,billNumber:marker+'-REPLAY'},'POST',404);assert.equal(await prisma.seaBill.count({where:{billNumber:marker+'-REPLAY'}}),0);
 let second=await request('/bl-register',{billNumber:marker+'-B',vesselId:ship.id,vesselName:ship.name,voyageNumber:'04',voyageId:v27.id,containers:[{number:'QAOTHER0001',seal:'002'}]},'POST',201);jobs.push(second.jobId);
 await request(`/vessels/${ship.id}/voyages/${v26.id}`,{...v26,number:'05'},'PUT',409);
 const scope=await request('/bl-register?voyageId='+v26.id);assert.deepEqual(scope.data.map(r=>r.id),[first.id]);const dash=await request('/bl-register?vesselId='+ship.id);assert.equal(dash.summary.byVesselVoyage.length,2);
 const pl=new Blob([Buffer.from('%PDF-1.4\n%QA source\n%%EOF')],{type:'application/pdf'});
 const a=await upload('/bl-register/'+first.id+'/files',pl,marker+'-packing.pdf',{version:first.version,category:'PACKING_LIST'});first=await request('/bl-register/'+first.id);const source=a.data.find(f=>f.category==='PACKING_LIST');filenames.add(source.filename); // filename is private; collect from DB during cleanup.
 const op=(await request('/bl-register/'+first.id+'/workspace')).operational;
 op.packing={...op.packing,status:'CONFIRMED',sourceFileIds:[source.id],groups:[{containerNumber:first.containers[0].number,sealNumber:first.containers[0].seal,sourceFileId:source.id,recipientName:'TOKO UJI',items:[{description:'Paket contoh',packages:12,volumeCbm:'1.2500'}]}]};
 await request('/bl-register/'+first.id+'/workspace',{version:first.version,operational:op},'PUT');first=await request('/bl-register/'+first.id);
 second=await request('/bl-register/'+second.id,{version:second.version,voyageId:v26.id},'PUT');
 const pl2=await upload('/bl-register/'+second.id+'/files',pl,marker+'-packing2.pdf',{version:second.version,category:'PACKING_LIST'});second=await request('/bl-register/'+second.id);const source2=pl2.data.find(f=>f.category==='PACKING_LIST');const op2=(await request('/bl-register/'+second.id+'/workspace')).operational;
 op2.packing={...op2.packing,status:'CONFIRMED',sourceFileIds:[source2.id],groups:[{containerNumber:second.containers[0].number,sealNumber:second.containers[0].seal,sourceFileId:source2.id,recipientName:'TOKO UJI LAIN',items:[{description:'Paket lain',packages:7,volumeCbm:'0.5000'}]}]};await request('/bl-register/'+second.id+'/workspace',{version:second.version,operational:op2},'PUT');second=await request('/bl-register/'+second.id);
 const selected=[{id:first.id,version:first.version},{id:second.id,version:second.version}];const recap=await request('/operations/packing-recaps/preview',{selection:selected});assert.equal(recap.totals.packages,19);assert.equal(recap.totals.volumeCbm,'1.7500');
 const response=await fetch('http://localhost:5000/api/operations/packing-recaps',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({selection:selected,recapNumber:marker+'-RPL',confirmed:true})});assert.equal(response.status,200);const book=new(require('../backend/node_modules/exceljs').Workbook)();await book.xlsx.load(Buffer.from(await response.arrayBuffer()));let exportedTotal;book.getWorksheet('Rekap internal').eachRow(row=>{if(row.getCell(1).value==='TOTAL')exportedTotal=row.getCell(7).value;});assert.equal(exportedTotal,19);
 first=await request('/bl-register/'+first.id);assert.equal(first.documentAvailability.internalPackingRecap,true);
 first=await request('/bl-register/'+first.id,{version:first.version,notes:'Catatan internal tanpa perubahan rincian PL'},'PUT');second=await request('/bl-register/'+second.id);assert.equal(second.documentAvailability.internalPackingRecap,true);
 first=await request('/bl-register/'+first.id,{version:first.version,shipperName:'Changed sender'},'PUT');assert.equal(first.documentAvailability.internalPackingRecap,false);
 second=await request('/bl-register/'+second.id);assert.equal(second.documentAvailability.internalPackingRecap,false);assert.equal(second.registerData.internalRecap.valid,false);
 const pending=await upload('/bl-imports',new Blob([original],{type:'application/pdf'}),marker+'-cancel.pdf');const toDelete=await prisma.bLImportSession.findUnique({where:{id:pending.id}});await request('/bl-imports/'+pending.id,null,'DELETE');await assert.rejects(fs.access(path.join(__dirname,'../backend/uploads/job-documents',toDelete.filename)));
 console.log('PASS master aliases, duplicate/year protection, scoped dashboard, private local PDF extraction, atomic source commit/replay rejection, confirmed internal recap Excel, stale-source invalidation, cancel cleanup.');
}
async function cleanup(){
 const created=await prisma.jobOrder.findMany({where:{OR:[{id:{in:jobs}},{title:{contains:marker}}]},select:{id:true}});const ids=created.map(r=>r.id);
 const files=await prisma.seaBillFile.findMany({where:{bill:{jobId:{in:ids}}},select:{filename:true}});files.forEach(r=>filenames.add(r.filename));
 await prisma.activityLog.deleteMany({where:{OR:[{entity:'JobOrder',entityId:{in:ids}},{entity:'Vessel',entityId:{in:ships}}]}});await prisma.seaBill.deleteMany({where:{jobId:{in:ids}}});await prisma.jobDocument.deleteMany({where:{jobId:{in:ids}}});await prisma.shipment.deleteMany({where:{jobId:{in:ids}}});await prisma.jobOrder.deleteMany({where:{id:{in:ids}}});
 await prisma.voyage.deleteMany({where:{vesselId:{in:ships}}});await prisma.vessel.deleteMany({where:{id:{in:ships}}});
 const sessions=await prisma.bLImportSession.findMany({where:{originalName:{startsWith:marker}}});sessions.forEach(s=>filenames.add(s.filename));await prisma.bLImportSession.deleteMany({where:{id:{in:sessions.map(s=>s.id)}}});
 for(const filename of filenames)if(typeof filename==='string'&&path.basename(filename)===filename)await fs.unlink(path.join(__dirname,'../backend/uploads/job-documents',filename)).catch(e=>{if(e.code!=='ENOENT')throw e;});
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await cleanup();await prisma.$disconnect();});
