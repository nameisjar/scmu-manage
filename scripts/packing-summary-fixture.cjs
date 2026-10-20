const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const files = require('../backend/src/services/jobFiles');
const seaTest = require('./sea-test-support.cjs');

function pdfFixture(lines) {
  const stream = lines.map((line,index) => `${index ? '0 -35 Td ' : ''}(${line.replace(/[\\()]/g,'\\$&')}) Tj`).join('\n');
  const body = `BT /F1 13 Tf 30 450 Td ${stream} ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 500] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(body)} >>\nstream\n${body}\nendstream`];
  let result='%PDF-1.4\n'; const offsets=[];
  objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(result));result+=`${index+1} 0 obj\n${object}\nendobj\n`;});
  const xref=Buffer.byteLength(result);
  result+=`xref\n0 6\n0000000000 65535 f \n${offsets.map(value=>`${String(value).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(result);
}
module.exports = async function fixture() {
  const api='http://127.0.0.1:5000';
  const db=process.env.SCMU_DEMO_DATABASE_URL || 'postgresql://scmu_demo@127.0.0.1:55432/scmu_demo';
  assert.ok(['localhost','127.0.0.1'].includes(new URL(db).hostname) && new URL(db).pathname==='/scmu_demo');
  const prisma=new PrismaClient({datasources:{db:{url:db}}}); const jobs=[];
  const marker=`SCMU-PACKING-SUMMARY-QA-${randomUUID()}`;
  async function cleanup() {
    const documents=await prisma.jobDocument.findMany({where:{jobId:{in:jobs}}});
    await seaTest.cleanup(prisma,jobs); await prisma.directorApproval.deleteMany({where:{jobId:{in:jobs}}});
    await prisma.packingHeader.deleteMany({where:{jobId:{in:jobs}}}); await prisma.packingList.deleteMany({where:{jobId:{in:jobs}}});
    await prisma.jobDocument.deleteMany({where:{jobId:{in:jobs}}}); await prisma.shipment.deleteMany({where:{jobId:{in:jobs}}});
    await prisma.jobOrder.deleteMany({where:{id:{in:jobs}}}); await prisma.activityLog.deleteMany({where:{entity:'JobOrder',entityId:{in:jobs}}});
    for(const document of documents) await files.removeFile(document.filename);
    await prisma.$disconnect();
  }
  async function request(endpoint,body,token,method=body?'POST':'GET',expected) {
    const response=await fetch(`${api}/api${endpoint}`,{method,headers:{...(token&&{Authorization:`Bearer ${token}`}),...(!(body instanceof FormData)&&{'Content-Type':'application/json'})},body:body instanceof FormData?body:body&&JSON.stringify(body)});
    const data=await response.json(); assert.ok(expected?response.status===expected:response.ok,`${method} ${endpoint}: ${response.status} ${JSON.stringify(data)}`); return data;
  }
  try {
  const staff=await request('/auth/login',{email:'operasional@scmu.local',password:'Ops@1234'});
  const director=await request('/auth/login',{email:'admin@scmu.local',password:'Admin@1234'});
  const job=await request('/jobs',{title:marker,jobType:'RECEIVER',originCity:'Surabaya',destCity:'Merauke',cargoDescription:'Simulasi format dokumen pengirim',packages:15,weightKg:1800},staff.token); jobs.push(job.id);
  function upload(data,bytes=pdfFixture(['SIMULATION - PACKING LIST','Original sender document'])) {const form=new FormData();form.append('file',new Blob([bytes],{type:'application/pdf'}),'packing-original.pdf');form.append('data',JSON.stringify(data));return form;}
  const common={direction:'INBOUND',documentDate:'2026-10-20',externalNumber:'PL-001',originCity:'Surabaya',destCity:'Merauke',receiptStatus:'PENDING'};
  const originals=[pdfFixture(['SIMULATION - COMPANY A','PACKING LIST PL-001','10 COLLY - 1,200 KG','Volume: 6.5 CBM']),pdfFixture(['SIMULATION - COMPANY B','PL-001 | Surabaya - Merauke','100 PCS INSIDE 5 CARTONS','Gross: 0.6 TON','Volume: not stated'])];
  const rows=[];
  rows.push(await request(`/jobs/${job.id}/packing-lists`,upload({...common,senderName:'Company A (Simulation)',packages:10,grossWeightKg:1200,volumeCbm:'6.5',summaryConfirmed:true},originals[0]),staff.token));
  rows.push(await request(`/jobs/${job.id}/packing-lists`,upload({...common,senderName:'Company B (Simulation)',packages:5,grossWeightKg:'0.6',grossWeightUnit:'TON',volumeCbm:'',netWeightKg:'',summaryConfirmed:false},originals[1]),staff.token));
  let header=await request(`/jobs/${job.id}/packing-header`,{documentDate:common.documentDate,packingListIds:rows.map(row=>row.id)},staff.token);
  return {api,request,prisma,job,staff,director,rows,originals,header,upload,common,cleanup};
  } catch(error) { await cleanup(); throw error; }
};
module.exports.pdfFixture=pdfFixture;
