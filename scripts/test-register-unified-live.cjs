// Live disposable local-demo regression checks. Never prints credentials.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID,createHash} = require('node:crypto');
const {PrismaClient} = require('../backend/node_modules/@prisma/client');
const jwt = require('../backend/node_modules/jsonwebtoken');
const api = process.env.SCMU_API_URL || 'http://localhost:5000';
const url = process.env.SCMU_DEMO_DATABASE_URL || 'postgresql://scmu_demo@127.0.0.1:55432/scmu_demo';
assert.ok(['localhost','127.0.0.1'].includes(new URL(api).hostname));
assert.equal(new URL(url).hostname,'127.0.0.1');
assert.equal(new URL(url).pathname,'/scmu_demo');
const prisma = new PrismaClient({datasources:{db:{url}}});
const marker = `REGQA-${randomUUID().slice(0,8)}`;
const ids = new Set();
const files = new Set();
let token;
async function request(route,body,method=body?'POST':'GET',status=200,auth=token) {
 const response=await fetch(`${api}/api/bl-register${route}`,{method,headers:{...(auth?{Authorization:`Bearer ${auth}`} : {}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
 const result=await response.json();assert.equal(response.status,status,`${method} ${route}: ${JSON.stringify(result)}`);return result;
}
async function snapshot(){const rows={};for(const model of ['seaBill','seaBillFile','seaBillRevision','jobOrder','jobDocument','shipment','jobCharge','invoice','jobPayment','directorApproval'])rows[model]=await prisma[model].findMany({orderBy:{id:'asc'}});return createHash('sha256').update(JSON.stringify(rows)).digest('hex');}
async function cleanup(){
 const jobs=await prisma.jobOrder.findMany({where:{OR:[{id:{in:[...ids]}},{title:{contains:marker}}]},select:{id:true}});const jobIds=jobs.map(row=>row.id);
 if(jobIds.length){
  const attached=await prisma.seaBillFile.findMany({where:{bill:{jobId:{in:jobIds}}},select:{filename:true}});attached.forEach(row=>files.add(row.filename));
  await prisma.activityLog.deleteMany({where:{entity:'JobOrder',entityId:{in:jobIds}}});
  await prisma.directorApproval.deleteMany({where:{jobId:{in:jobIds}}});
  await prisma.jobCharge.deleteMany({where:{jobId:{in:jobIds}}});
  await prisma.seaBill.deleteMany({where:{jobId:{in:jobIds}}});
  await prisma.jobDocument.deleteMany({where:{jobId:{in:jobIds}}});
  await prisma.shipment.deleteMany({where:{jobId:{in:jobIds}}});
  await prisma.jobOrder.deleteMany({where:{id:{in:jobIds}}});
 }
 for(const filename of files)if(path.basename(filename)===filename)await fs.unlink(path.join(__dirname,'../backend/uploads/job-documents',filename)).catch(error=>{if(error.code!=='ENOENT')throw error;});
}
const pdf=Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
async function upload(bill,category,status=201,auth=token){
 const body=new FormData();body.set('file',new Blob([pdf],{type:'application/pdf'}),`${marker}-${category}.pdf`);body.set('version',String(bill.version));body.set('category',category);
 const response=await fetch(`${api}/api/bl-register/${bill.id}/files`,{method:'POST',headers:auth?{Authorization:`Bearer ${auth}`}:{},body,signal:AbortSignal.timeout(20000)});
 const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data;
}
async function main(){
 const before=await snapshot();const user=await prisma.user.findFirst({where:{role:'ADMIN',isActive:true},select:{id:true}});assert.ok(user);
 const secret=await fs.readFile(path.join(__dirname,'../.demo/jwt-secret'),'utf8');token=jwt.sign({userId:user.id},secret,{expiresIn:'15m'});
 await request('',undefined,'GET',401,null);
 let bill=await request('',{billNumber:marker,registerAmount:'7180000.25',register:{partyName:`${marker} company`,partyText:'SCMU',reference1:'000245',reference2:'202300245',additionalDate1:'2023-10-20',additionalDate2:'2023-11-18',additionalNotes:'Meaning not confirmed',quantity20:2,quantity21:null,quantity40:0,departureDate:'2023-10-25',arrivalDate:'2023-10-20',dateMeaning:'UNCONFIRMED'}},'POST',201);ids.add(bill.jobId);
 assert.equal(bill.registerAmount,'7180000.25');assert.equal(bill.register.reference1,'000245');assert.equal(bill.register.quantity21,null);assert.equal(bill.register.quantity40,0);
 let saved=await prisma.seaBill.findUnique({where:{id:bill.id}});assert.equal(saved.registerAmount.toFixed(2),'7180000.25');assert.equal(saved.registerData.register.partyName,`${marker} company`);
 assert.equal(await prisma.jobCharge.count({where:{jobId:bill.jobId}}),0);assert.equal(await prisma.invoice.count({where:{jobId:bill.jobId}}),0);
 console.log('PASS one atomic record, optional blanks, unknown independent book dates, exact neutral Decimal, no financial writes');
 const oldVersion=bill.version;
 bill=await request(`/${bill.id}`,{version:bill.version,vesselName:`${marker} vessel`,voyageNumber:'VOY-001',portOfLoading:'Surabaya',register:{additionalNotes:'Updated without second register'}},'PUT');
 await request(`/${bill.id}`,{version:oldVersion,register:{reference1:'stale'}},'PUT',409);
 await request(`/${bill.id}`,{version:bill.version,registerAmount:'1.001'},'PUT',422);
 bill=await request(`/${bill.id}`);assert.equal(bill.register.reference1,'000245');assert.equal(bill.registerAmount,'7180000.25');
 for(const search of [marker,`${marker} vessel`,'VOY-001','Surabaya','000245']){const found=await request(`?search=${encodeURIComponent(search)}`);assert.ok(found.data.some(row=>row.id===bill.id),`Search ${search}`);}
 const filtered=await request(`?company=${encodeURIComponent(marker)}&voyage=VOY-001&documents=BL_MISSING&sort=billNumber&direction=asc`);assert.equal(filtered.total,1);assert.equal(filtered.data[0].id,bill.id);
 console.log('PASS edit/readback, input validation, stale conflicts, ship/voyage/origin/reference search and combined filters');
 const initialFiles=await request(`/${bill.id}/files`);assert.ok(Array.isArray(initialFiles.data||initialFiles));
 await upload(bill,'FINAL');bill=await request(`/${bill.id}`);
 let fileRows=await prisma.seaBillFile.findMany({where:{billId:bill.id}});assert.ok(fileRows.some(row=>row.category==='FINAL'));assert.ok(!fileRows.some(row=>row.category==='PACKING_LIST'));
 const contentVersion=bill.contentVersion;
 await upload(bill,'PACKING_LIST');bill=await request(`/${bill.id}`);assert.equal(bill.contentVersion,contentVersion,'Packing file must not replace BL revision');
 fileRows=await prisma.seaBillFile.findMany({where:{billId:bill.id}});const packing=fileRows.find(row=>row.category==='PACKING_LIST');assert.ok(packing);
 const downloaded=await fetch(`${api}/api/bl-register/${bill.id}/files/${packing.id}`,{headers:{Authorization:`Bearer ${token}`}});assert.equal(downloaded.status,200);assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),pdf);
 const denied=await fetch(`${api}/api/bl-register/${bill.id}/files/${packing.id}`);assert.equal(denied.status,401);
 await request(`/${bill.id}/files/not-owned`,undefined,'GET',404);
 console.log('PASS upload BL, save without Packing List, attach Packing List later, secure exact download');
 const exportUrl=`${api}/api/bl-register/export.xlsx?scope=filtered&search=${encodeURIComponent(marker)}&limit=1`;
 const exported=await fetch(exportUrl,{headers:{Authorization:`Bearer ${token}`}});assert.equal(exported.status,200);assert.match(exported.headers.get('content-type'),/spreadsheetml/);
 const ExcelJS=require('../backend/node_modules/exceljs');const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.from(await exported.arrayBuffer()));
 const sheet=workbook.worksheets[0];assert.equal(sheet.rowCount,2,'One row per register not per attached file/container');
 const values=sheet.getRow(2).values;assert.ok(values.includes('000245'));assert.ok(values.includes(marker));assert.ok(values.includes(7180000.25),'Neutral amount exported numerically');
 const exportedAll=await fetch(`${api}/api/bl-register/export.xlsx?scope=all`,{headers:{Authorization:`Bearer ${token}`}});assert.equal(exportedAll.status,200);
 console.log('PASS genuine XLSX roundtrip, text IDs/leading zero, numeric rupiah, active filters and no duplicate rows');
 bill=await request(`/${bill.id}/archive`,{version:bill.version,archived:true});assert.ok(bill.archivedAt);
 let found=await request(`?search=${encodeURIComponent(marker)}`);assert.equal(found.total,0);
 found=await request(`?search=${encodeURIComponent(marker)}&archived=archived`);assert.equal(found.total,1);
 await request(`/${bill.id}`,{version:bill.version,notes:'archived edit'},'PUT',409);await upload(bill,'SUPPORTING',409);
 bill=await request(`/${bill.id}/archive`,{version:bill.version,archived:false});assert.equal(bill.archivedAt,null);
 const history=await prisma.activityLog.findMany({where:{entity:'JobOrder',entityId:bill.jobId}});assert.ok(history.length>=5);
 console.log('PASS authorized reversible archive, archived write protection, readback and audit trail');
 await cleanup();assert.equal(await snapshot(),before,'Historical business records unchanged after fixture cleanup');console.log('PASS all disposable data/files cleaned and historical records unchanged');
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{try{await cleanup();}catch(error){console.error('Cleanup failed',error.message);process.exitCode=1;}await prisma.$disconnect();});
