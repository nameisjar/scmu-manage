const test=require('node:test'),assert=require('node:assert/strict'),service=require('../src/services/journeys');
test('journey identity separates voyage periods and destinations; drafts are never silently merged',()=>{
 const base={vesselName:'KM. TANTO SIAP',voyageNumber:'V.165',period:'2026',destination:'Merauke'};
 assert.equal(service.keyOf(base),service.keyOf({...base,vesselName:'TANTO SIAP',voyageNumber:'165'}));
 assert.notEqual(service.keyOf(base),service.keyOf({...base,period:'2027'}));assert.notEqual(service.keyOf(base),service.keyOf({...base,destination:'Jayapura'}));
 assert.equal(service.keyOf({...base,voyageNumber:null}),null);assert.throws(()=>service.normalize({period:'2026-13'}));assert.throws(()=>service.normalize({departureDate:'2026-10-30',arrivalDate:'2026-10-01'}));
});
test('parent counts physical containers and shared files once, with all B/L references retained',async()=>{
 const bill=(id,number,origin)=>({id,billNumber:number,jobId:'job-'+id,portOfLoading:origin,containers:[{number:'CONT1',seal:'S'}],registerData:{},files:[{id:'file-'+id,filename:'shared.xlsx',originalName:'rekap.xlsx',category:'INTERNAL_PACKING_RECAP'}],allocations:[]});
 const row={id:'parent',version:1,data:{},files:[{id:'note',filename:'note.txt',originalName:'note.txt',category:'SUPPORTING'}],bills:[bill('a','BL1','Surabaya'),bill('b','BL2','Makassar')]};
 const tx={shippingJourney:{findUnique:async()=>row}};const counts=service.summary(row);assert.equal(counts.billCount,2);assert.equal(counts.containerCount,1);assert.equal(counts.documentCount,2);assert.equal(counts.containers[0].billIds.length,2);
 const docs=await service.documents(tx,'parent');assert.equal(docs.data.length,2);assert.deepEqual(docs.data.find(f=>f.originalName==='rekap.xlsx').billNumbers,['BL1','BL2']);assert(docs.data.every(f=>f.filename===undefined));
});
test('B/L attachment rejects a different vessel or destination and closed parent states',async()=>{
 const row={id:'parent',vesselName:'TANTO SIAP',voyageNumber:'165',period:'2026',destination:'Merauke',data:{},files:[],bills:[]};const tx={shippingJourney:{findUnique:async()=>row,findFirst:async()=>null}};
 assert.equal((await service.forBill(tx,{id:'admin'},{journeyId:'parent',vesselName:'KM TANTO SIAP',voyageNumber:'165',portOfDischarge:'MERAUKE'})).id,'parent');
 await assert.rejects(service.forBill(tx,{}, {journeyId:'parent',vesselName:'OTHER'}),e=>e.status===409);row.deletedAt=new Date();await assert.rejects(service.forBill(tx,{}, {journeyId:'parent'}),e=>e.status===409);
});
test('cost aggregation loads each job once and keeps proposed amounts out of approved totals',async()=>{
 const row={id:'parent',data:{},files:[],bills:[{id:'a',jobId:'same',registerData:{}},{id:'b',jobId:'same',registerData:{}}],sharedJobId:'shared'};let query;
 const {Prisma}=require('@prisma/client');const tx={shippingJourney:{findUnique:async()=>row},jobCharge:{findMany:async q=>{query=q;return[{id:'c1',jobId:'shared',kind:'COST',status:'APPROVED',estimatedAmount:new Prisma.Decimal('1000'),actualAmount:new Prisma.Decimal('1000')},{id:'c2',jobId:'same',kind:'COST',status:'PROPOSED',estimatedAmount:new Prisma.Decimal('9000')}];}}};
 const result=await service.costs(tx,'parent');assert.deepEqual(query.where.jobId.in,['same','shared']);assert.equal(result.approvedCost,'1000.00');assert.equal(result.data[0].scope,'Bersama');
});
