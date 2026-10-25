const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');
const {PrismaClient}=require('../backend/node_modules/@prisma/client');
module.exports=async function paginationFixture(){
  const api='http://127.0.0.1:5000';const db='postgresql://scmu_demo@127.0.0.1:55432/scmu_demo';
  assert.ok(new URL(db).pathname==='/scmu_demo');const prisma=new PrismaClient({datasources:{db:{url:db}}});
  const marker=`PG-${randomUUID().slice(0,8)}`;const ids={};const id=key=>ids[key]||(ids[key]=randomUUID());const time=new Date();
  async function request(endpoint,token,expected=200){const response=await fetch(`${api}/api${endpoint}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});const data=await response.json();assert.equal(response.status,expected,`${endpoint}: ${JSON.stringify(data)}`);return data;}
  async function login(email,password){const response=await fetch(`${api}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});assert.ok(response.ok);return response.json();}
  async function cleanup(){
    const owned=Object.values(ids);const where={id:{in:owned}};
    await prisma.activityLog.deleteMany({where});await prisma.directorApproval.deleteMany({where});await prisma.seaBill.deleteMany({where});
    await prisma.packingHeader.deleteMany({where});await prisma.packingList.deleteMany({where});await prisma.jobDocument.deleteMany({where});
    await prisma.invoice.deleteMany({where});await prisma.jobCharge.deleteMany({where});await prisma.shipment.deleteMany({where});
    await prisma.jobOrder.deleteMany({where});await prisma.salesQuotation.deleteMany({where});await prisma.rFQ.deleteMany({where});
    await prisma.driver.deleteMany({where});await prisma.vehicle.deleteMany({where});await prisma.route.deleteMany({where});await prisma.user.deleteMany({where});await prisma.company.deleteMany({where});await prisma.$disconnect();
  }
  try{
    const auth=await login('admin@scmu.local','Admin@1234');const staff=await login('operasional@scmu.local','Ops@1234');
    const company=await prisma.company.findFirst({where:{isInternal:true}});assert.ok(company);
    const cargo={customerId:company.id,createdById:staff.user.id,originCity:'Surabaya',destCity:'Merauke',cargoDescription:'Pagination simulation',packages:1,createdAt:time};
    const jobs=Array.from({length:211},(_,index)=>({...cargo,id:id(`job${index}`),jobNumber:`${marker}-JOB-${String(index).padStart(3,'0')}`,title:`${marker} shipment ${index}`,jobType:index===0?'RECEIVER':'SENDER',status:index===210?'CLOSED':'BOOKED'}));
    await prisma.jobOrder.createMany({data:jobs});
    await prisma.jobCharge.createMany({data:jobs.map((job,index)=>({id:id(`charge${index}`),jobId:job.id,kind:'REVENUE',description:marker,estimatedAmount:100,actualAmount:100,status:'APPROVED',createdById:staff.user.id}))});
    await prisma.invoice.createMany({data:jobs.map((job,index)=>({id:id(`invoice${index}`),jobId:job.id,companyId:company.id,invoiceNumber:`${marker}-INV-${index}`,freightAmount:100,totalAmount:100,invoiceDate:time,status:'APPROVED',createdAt:time}))});
    await prisma.salesQuotation.createMany({data:jobs.map((job,index)=>({...cargo,id:id(`quote${index}`),quotationNumber:`${marker}-SQ-${index}`,title:`${marker} quote ${index}`,validUntil:new Date(time.getTime()+(index===210?-1:7)*86400000)}))});
    await prisma.directorApproval.createMany({data:jobs.map((job,index)=>({id:id(`approval${index}`),jobId:jobs[0].id,entityId:jobs[0].id,action:'JOB_CLOSE',status:'WITHDRAWN',scopeKey:`JOB_CLOSE:${jobs[0].id}`,fingerprint:marker,requestedById:staff.user.id,payload:{},snapshot:{view:{overview:[{label:'Job order',value:`${marker}-REQUEST-${index}`}],tables:[],targetUrl:`/jobs/${jobs[0].id}`}},createdAt:time}))});
    const many=Array.from({length:55},(_,index)=>index);
    await prisma.company.createMany({data:many.map(index=>({id:id(`company${index}`),name:`${marker} company ${index}`,type:'TRANSPORTER',city:'Merauke'}))});
    await prisma.vehicle.createMany({data:many.map(index=>({id:id(`vehicle${index}`),registrationNo:`${marker}-${index}`,type:'TRUCK',capacity:5,companyId:company.id}))});
    await prisma.driver.createMany({data:many.map(index=>({id:id(`driver${index}`),name:`${marker} driver ${index}`,phone:`${marker}-phone-${index}`,licenseNo:`${marker}-license-${index}`,companyId:company.id}))});
    await prisma.user.createMany({data:many.map(index=>({id:id(`user${index}`),name:`${marker} user ${index}`,email:`${marker}-${index}@scmu.local`,password:'QA account - login disabled',role:'ADMIN',isActive:false,companyId:company.id,createdAt:time}))});
    await prisma.route.createMany({data:many.map(index=>({id:id(`route${index}`),name:`${marker} route ${index}`,originCity:'Surabaya',originState:'Jawa Timur',destCity:'Merauke',destState:'Papua Selatan'}))});
    const transport={shipperCompanyId:company.id,createdById:staff.user.id,originCity:'Surabaya',originState:'Jawa Timur',destCity:'Merauke',destState:'Papua Selatan',loadingDate:time,createdAt:time};
    await prisma.rFQ.createMany({data:many.map(index=>({...transport,id:id(`rfq${index}`),rfqNumber:`${marker}-RFQ-${index}`,title:`${marker} request ${index}`,vehicleType:'TRUCK'}))});
    await prisma.shipment.createMany({data:many.map(index=>({...transport,id:id(`shipment${index}`),shipmentNumber:`${marker}-SHP-${index}`}))});
    // Nested tables must page independently without shrinking receiving totals.
    await prisma.jobDocument.createMany({data:Array.from({length:42},(_,index)=>({id:id(`document${index}`),jobId:jobs[0].id,type:index<21?'PACKING_LIST':'BILL_OF_LADING',title:`${marker} document ${index}`}))});
    await prisma.packingHeader.create({data:{id:id('header'),jobId:jobs[0].id,headerNumber:`${marker}-KPL`,documentDate:time,originCity:'Surabaya',destCity:'Merauke',companyName:'SCMU',createdById:staff.user.id}});
    await prisma.packingList.createMany({data:Array.from({length:21},(_,index)=>({id:id(`packing${index}`),jobId:jobs[0].id,headerId:id('header'),documentId:id(`document${index}`),recordNumber:`${marker}-PL-${String(index).padStart(2,'0')}`,externalNumber:`PL-${String(index).padStart(2,'0')}`,direction:'INBOUND',documentDate:time,senderName:'QA Sender',recipientName:'SCMU',originCity:'Surabaya',destCity:'Merauke',companyName:'SCMU',packages:1,grossWeightKg:100,netWeightKg:90,volumeCbm:1,receiptStatus:'PENDING',createdById:staff.user.id,createdAt:time}))});
    await prisma.shipment.create({data:{...transport,id:id('seaLeg'),jobId:jobs[0].id,shipmentNumber:`${marker}-SEA`,mode:'SEA'}});
    await prisma.seaBill.createMany({data:Array.from({length:21},(_,index)=>({id:id(`bill${index}`),jobId:jobs[0].id,shipmentId:id('seaLeg'),documentId:id(`document${index+21}`),billNumber:`${marker}-BL-${index}`}))});
    await prisma.activityLog.createMany({data:Array.from({length:105},(_,index)=>({id:id(`log${index}`),userId:staff.user.id,entity:'JobOrder',entityId:jobs[0].id,action:'PAGINATION_QA',metadata:{index},createdAt:time}))});
    return {api,prisma,request,auth,staff,marker,ids,jobs,cleanup};
  }catch(error){await cleanup();throw error;}
};
