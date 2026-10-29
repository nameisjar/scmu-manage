const test=require('node:test'),assert=require('node:assert/strict'),service=require('../src/services/journeyImports');
const user={id:'admin',role:'ADMIN'};
function fixture(){
 const sessions=new Map(['a','b','c'].map(id=>[id,{id,createdById:user.id,expiresAt:new Date(Date.now()+60000),mimeType:'application/pdf',originalName:id+'.pdf',extracted:{batch:true}}]));
 const parents=[],bills=[];
 const tx={bLImportSession:{findUnique:async({where})=>sessions.get(where.id)},seaBill:{findMany:async({where})=>bills.filter(b=>b.billNumber===where.OR[0].registerIdentity)},shippingJourney:{findMany:async()=>parents,findUnique:async({where})=>parents.find(p=>p.id===where.id||p.activeKey===where.activeKey)}};
 const fields={billNumber:'BL1',vesselName:'TANTO SIAP',voyageNumber:'165',portOfDischarge:'MERAUKE',issueDate:'2026-10-02',containers:[{number:'ABC1'}]};return {tx,fields,sessions,parents,bills};
}
test('preview groups B/Ls across loading ports, isolates other voyages and never writes a shipment',async()=>{
 const {tx,fields}=fixture();const result=await service.preview(tx,user,{documents:[{sessionId:'a',fields:{...fields,portOfLoading:'Surabaya'}},{sessionId:'b',fields:{...fields,billNumber:'BL2',portOfLoading:'Makassar'}},{sessionId:'c',fields:{...fields,billNumber:'BL3',voyageNumber:'166'}}]});
 assert.equal(result.groups.length,2);assert.equal(result.groups[0].documents.length,2);assert.equal(result.groups[0].fields.period,'2026');assert.equal(result.groups[0].mode,'NEW');
 assert.equal(service.sourceFields({...fields,issueDate:null}).period,null);
});
test('preview suggests the matching journey and keeps existing B/Ls on their parent',async()=>{
 const {tx,fields,parents,bills}=fixture();const row={id:'parent',number:'PGR1',vesselName:'KM. TANTO SIAP',voyageNumber:'165',period:'2026',destination:'MERAUKE'};parents.push(row);
 let result=await service.preview(tx,user,{documents:[{sessionId:'a',fields}]});assert.equal(result.groups[0].targetId,'parent');
 bills.push({id:'bl',journeyId:'parent',billNumber:'BL1',registerData:{},job:{status:'ACTIVE'}});
 result=await service.preview(tx,user,{documents:[{sessionId:'a',fields}]});assert(result.groups[0].locked);assert.equal(result.groups[0].mode,'EXISTING');
});
test('grouping checks ownership, expiry, explicit confirmation, period and unchanged parent identity',async()=>{
 await assert.rejects(service.preview({},user,{documents:[null]}),e=>e.status===422);
 const {tx,fields,parents,sessions}=fixture();sessions.get('a').createdById='foreign';await assert.rejects(service.preview(tx,user,{documents:[{sessionId:'a',fields}]}),e=>e.status===404);
 sessions.get('a').createdById=user.id;sessions.get('a').expiresAt=new Date(0);await assert.rejects(service.preview(tx,user,{documents:[{sessionId:'a',fields}]}),e=>e.status===410);
 assert.throws(()=>service.requireIdentity(service.sourceFields({...fields,issueDate:null})));await assert.rejects(service.resolve(tx,user,{mode:'NEW',fields:{}},fields),e=>e.status===422);
 const row={id:'parent',vesselName:'TANTO SIAP',voyageNumber:'165',period:'2026',destination:'MERAUKE',files:[],bills:[],data:{}};parents.push(row);
 await assert.rejects(service.resolve(tx,user,{mode:'EXISTING',targetId:row.id,identity:'stale',confirmed:true},fields),e=>e.status===409);
 const plan={mode:'EXISTING',targetId:row.id,identity:service.identity(row),confirmed:true};assert.equal((await service.resolve(tx,user,plan,fields)).id,row.id);
 await assert.rejects(service.resolve(tx,user,plan,fields,{...fields,journeyId:'other'}),e=>e.status===409);
 await assert.rejects(service.resolve(tx,user,plan,{...fields,voyageNumber:'166'}),e=>e.status===409);
 row.archivedAt=new Date();await assert.rejects(service.resolve(tx,user,plan,fields),e=>e.status===409);
});
